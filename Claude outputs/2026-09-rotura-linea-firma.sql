-- =====================================================================
-- ROTURA DE LÍNEA · LA FIRMA DEL LÍDER DE TURNO
--
-- Requiere: supabase/modulos/rotura-linea.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- Hasta hoy, un turno registrado y un turno OLVIDADO se ven igual: los
-- dos son cero filas o unas cuantas, y no hay forma de saber si el
-- número está en cero porque no se rompió nada o porque nadie pesó. Un
-- dato sin firmar no es un dato: es un espacio en blanco con suerte.
--
-- La firma dice tres cosas que la rotura sola no dice:
--   · alguien MIRÓ este turno y lo dio por bueno
--   · quién fue, con nombre y hora
--   · cuánto decía EN EL MOMENTO de firmarlo
--
-- SE GUARDA EL TOTAL FIRMADO, no se calcula al leer. Es la diferencia
-- entre "el líder firmó 4.812 unidades" y "el líder firmó, y hoy la
-- tabla dice 5.900". Si alguien agrega una pesada después de la firma,
-- las dos cifras dejan de coincidir y ESO es exactamente lo que hay que
-- poder ver.
--
-- FIRMAR CIERRA EL TURNO. Después de la firma no entran pesadas nuevas
-- ni correcciones; para eso, un administrador quita la firma y queda
-- escrito que la quitó. Una firma que no cierra nada no valida nada.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

create table if not exists public.rotlinea_firmas (
  fecha  date not null,
  linea  smallint not null references public.rotlinea_lineas(linea),
  turno  smallint not null check (turno in (1, 2, 3)),

  firmado_por uuid references public.perfiles(id) on delete set null,
  firmado_en  timestamptz not null default now(),
  /* Lo que decía el turno al firmarlo. La foto, no el vivo. */
  unidades    bigint not null default 0,
  kg          numeric(12, 2) not null default 0,
  pesadas     smallint not null default 0,
  nota        text,

  primary key (fecha, linea, turno)
);

create index if not exists rotlinea_firmas_fecha_idx on public.rotlinea_firmas (fecha desc);


-- ---------------------------------------------------------------------
-- FIRMAR
--
-- No se pasa el total por parámetro: se MIDE aquí, en la misma
-- transacción. Si la pantalla mandara la cifra, firmaría lo que tenía
-- en el navegador, que puede ser de hace diez minutos y de antes de que
-- el otro turno agregara una pesada.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_firmar(
  p_fecha date, p_linea smallint, p_turno smallint, p_nota text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_u bigint; v_k numeric; v_p int;
begin
  if not public.es_editor() then
    raise exception 'Firmar el turno requiere rol de supervisor o administrador';
  end if;
  if p_turno not in (1, 2, 3) then
    raise exception 'El turno tiene que ser 1, 2 o 3';
  end if;
  if exists (select 1 from public.rotlinea_firmas
              where fecha = p_fecha and linea = p_linea and turno = p_turno) then
    raise exception 'Ese turno ya está firmado';
  end if;

  select coalesce(sum(und), 0), coalesce(sum(kg), 0), count(distinct (envase, toma))
    into v_u, v_k, v_p
    from public.rotlinea_registro
   where fecha = p_fecha and linea = p_linea and turno = p_turno;

  /* SE PUEDE FIRMAR UN TURNO EN CERO, y es importante que se pueda: un
     turno sin rotura es una noticia buena y hay que poder declararla.
     Lo que no se puede es dejarlo sin firmar y que nadie sepa si fue
     cero o fue olvido. */
  insert into public.rotlinea_firmas
    (fecha, linea, turno, firmado_por, unidades, kg, pesadas, nota)
  values
    (p_fecha, p_linea, p_turno, auth.uid(), v_u, v_k, v_p,
     nullif(btrim(coalesce(p_nota, '')), ''));

  return v_u::int;
end $$;

grant execute on function public.rotlinea_firmar(date, smallint, smallint, text) to authenticated;


-- ---------------------------------------------------------------------
-- QUITAR LA FIRMA — solo el administrador
--
-- Es lo que reabre el turno. Va aparte y con otro permiso porque
-- deshacer una validación no es lo mismo que hacerla: quien firma es el
-- líder del turno; quien puede desfirmar lo que otro firmó tiene que
-- ser alguien más.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_quitar_firma(
  p_fecha date, p_linea smallint, p_turno smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /* COALESCE, Y NO ES ADORNO. mi_rol() devuelve NULL para quien no
     tiene perfil —una cuenta recién creada, un perfil borrado—, y en SQL
     `null <> 'admin'` no es cierto NI falso: es NULL, así que el `if` no
     dispara y la función SIGUE DE LARGO. El candado se abría justo para
     el caso que menos se conoce. Lo cazó la prueba, no el ojo. */
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Quitar una firma es solo del administrador. Si hay que corregir algo, pídeselo';
  end if;
  delete from public.rotlinea_firmas
   where fecha = p_fecha and linea = p_linea and turno = p_turno;
end $$;

grant execute on function public.rotlinea_quitar_firma(date, smallint, smallint) to authenticated;


-- ---------------------------------------------------------------------
-- UN TURNO FIRMADO NO SE TOCA
--
-- El candado va DENTRO de rotlinea_guardar y no en la pantalla: una
-- pantalla que esconde el botón no impide nada a quien llame la función
-- de otra forma.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_guardar(
  p_fecha  date,
  p_linea  smallint,
  p_turno  smallint,
  p_envase text,
  p_kilos  jsonb,
  p_toma   smallint default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb; v_kg numeric; v_maq smallint; v_peso numeric; v_n integer := 0;
  v_toma smallint;
begin
  if not public.es_editor() then
    raise exception 'Registrar rotura de línea requiere rol de supervisor o administrador';
  end if;
  if p_fecha is null then raise exception 'Hay que decir de qué día'; end if;
  if p_turno not in (1, 2, 3) then
    raise exception 'El turno tiene que ser 1, 2 o 3';
  end if;
  if not exists (select 1 from public.rotlinea_lineas where linea = p_linea and activo) then
    raise exception 'La línea % no existe o está apagada', p_linea;
  end if;

  /* EL CANDADO DE LA FIRMA. Va antes que todo lo demás: si el turno ya
     lo dio por bueno un líder, no hay nada que discutir sobre el
     contenido. */
  if exists (select 1 from public.rotlinea_firmas
              where fecha = p_fecha and linea = p_linea and turno = p_turno) then
    raise exception 'Ese turno ya está firmado por el líder. Para cambiarlo, un administrador tiene que quitar la firma';
  end if;

  select peso_kg into v_peso from public.rotlinea_envases
   where material = p_envase and activo;
  if v_peso is null then
    raise exception 'El envase % no existe o está apagado', p_envase;
  end if;

  if p_toma is null then
    select coalesce(max(toma), 0) + 1 into v_toma
      from public.rotlinea_registro
     where fecha = p_fecha and linea = p_linea and turno = p_turno and envase = p_envase;
  else
    v_toma := p_toma;
    if not exists (select 1 from public.rotlinea_registro
                    where fecha = p_fecha and linea = p_linea and turno = p_turno
                      and envase = p_envase and toma = v_toma) then
      raise exception 'Ese turno no tiene una pesada %. Para agregar una nueva, no mandes el número', v_toma;
    end if;
  end if;

  if p_toma is not null and exists (
       select 1 from public.rotlinea_registro
        where fecha = p_fecha and linea = p_linea and turno = p_turno
          and envase = p_envase and toma = v_toma and baja) then
    raise exception 'Esa pesada ya está dada de baja en SAP. No se puede reescribir';
  end if;

  delete from public.rotlinea_registro
   where fecha = p_fecha and linea = p_linea and turno = p_turno
     and envase = p_envase and toma = v_toma;

  for r in select * from jsonb_array_elements(coalesce(p_kilos, '[]'::jsonb))
  loop
    v_maq := (r->>'maquina')::smallint;
    v_kg  := coalesce((r->>'kg')::numeric, 0);
    continue when v_kg <= 0;
    if not exists (select 1 from public.rotlinea_maquinas where item = v_maq and activo) then
      raise exception 'La máquina % no existe o está apagada', v_maq;
    end if;

    insert into public.rotlinea_registro
      (fecha, linea, turno, envase, maquina, toma, kg, und, registrado_por)
    values
      (p_fecha, p_linea, p_turno, p_envase, v_maq, v_toma, v_kg,
       ceil(v_kg / v_peso)::integer, auth.uid());
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

grant execute on function public.rotlinea_guardar(date, smallint, smallint, text, jsonb, smallint) to authenticated;


-- ---------------------------------------------------------------------
-- LAS FIRMAS DEL DÍA, con lo que dice la tabla HOY al lado
--
-- Las dos cifras juntas, siempre. Una firma que dice 4.812 sobre un
-- turno que hoy suma 5.900 es la única forma de enterarse de que
-- alguien movió algo después de validarlo.
-- ---------------------------------------------------------------------
create or replace view public.v_rotlinea_firmas as
select
  f.fecha, f.linea, f.turno,
  f.firmado_por, p.nombre as firmado_nombre, p.usuario as firmado_usuario,
  f.firmado_en, f.nota,
  f.unidades as firmadas, f.kg as kg_firmados, f.pesadas,
  coalesce(r.und, 0)  as unidades_hoy,
  coalesce(r.kg, 0)   as kg_hoy,
  (coalesce(r.und, 0) <> f.unidades) as cambio_despues
from public.rotlinea_firmas f
left join public.perfiles p on p.id = f.firmado_por
left join (
  select fecha, linea, turno, sum(und)::bigint as und, sum(kg) as kg
    from public.rotlinea_registro group by fecha, linea, turno
) r on r.fecha = f.fecha and r.linea = f.linea and r.turno = f.turno;

grant select on public.v_rotlinea_firmas to authenticated;


-- ---------------------------------------------------------------------
-- LA SEGURIDAD
-- ---------------------------------------------------------------------
alter table public.rotlinea_firmas enable row level security;

drop policy if exists rotlinea_firmas_select on public.rotlinea_firmas;
create policy rotlinea_firmas_select on public.rotlinea_firmas
  for select to authenticated using (true);

/* SIN POLÍTICA DE ESCRITURA, a propósito. La única forma de que entre o
   salga una firma es por las dos funciones de arriba, que son security
   definer: así una firma no se puede fabricar ni borrar desde el
   navegador, que es lo único que le da valor a una firma. */
grant select on public.rotlinea_firmas to authenticated;


do $$
declare v_falta text := '';
begin
  if to_regclass('public.rotlinea_firmas') is null then
    v_falta := v_falta || ' rotlinea_firmas'; end if;
  if to_regprocedure('public.rotlinea_firmar(date, smallint, smallint, text)') is null then
    v_falta := v_falta || ' rotlinea_firmar'; end if;
  if to_regclass('public.v_rotlinea_firmas') is null then
    v_falta := v_falta || ' v_rotlinea_firmas'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;
  raise notice 'Listo: el líder de turno ya puede firmar, y un turno firmado queda cerrado.';
end $$;
