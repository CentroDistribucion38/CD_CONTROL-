-- =====================================================================
-- ROTURAS EN SITIO · EL DESCARGO DEL OPERADOR LOGÍSTICO
-- ---------------------------------------------------------------------
-- HASTA HOY la cadena tenía dos eslabones y se acababa en el que cobra:
--
--   alguien registra en sitio  →  ABI dice si cuenta  →  se acabó
--
-- Es decir: una de las dos partes decide sola cuánto le cobra a la otra
-- y la otra se entera cuando le llega la cuenta. Eso no se concilia: se
-- discute, al final del mes, sobre una lista que nadie objetó a tiempo
-- porque nadie tuvo dónde objetarla.
--
-- DESDE HOY hay un tercer eslabón:
--
--   registro  →  ABI dice que cuenta  →  EL OL RESPONDE  →  (si no está
--   de acuerdo) ABI resuelve
--
-- ---------------------------------------------------------------------
-- POR QUÉ `estado` NO SE TOCA
-- ---------------------------------------------------------------------
-- Lo evidente sería meterle estados nuevos al enum `rotura_estado`
-- —«en_disputa», «aceptada»— y sería un error caro: `estado = 'cuenta'`
-- lo leen hoy la vista, las cifras, tres índices y toda pantalla que
-- pregunte si una rotura se cobra. Agregarle significados reinterpreta
-- TODO lo ya decidido, hacia atrás y en silencio.
--
-- `estado` sigue queriendo decir exactamente lo que quiere decir hoy:
-- LO QUE ABI DECIDIÓ. La conversación con el OL es otra cosa y va en su
-- propia columna, `cobro`, que solo existe cuando estado = 'cuenta'.
-- Una rotura que ABI no cobra no tiene nada que responder.
--
-- ---------------------------------------------------------------------
-- LAS CINCO SITUACIONES DEL COBRO
-- ---------------------------------------------------------------------
--   por_responder  ABI cobró; el OL todavía no contesta. Corre el plazo.
--   aceptado       el OL dijo que sí — o se le venció el plazo.
--   en_disputa     el OL dijo que no, con nota y con evidencia.
--   sostenido      hubo disputa y ABI la sostuvo. Se cobra.
--   retirado       hubo disputa y ABI le dio la razón al OL. No se cobra.
--
-- `aceptado` Y `sostenido` LOS DOS SE COBRAN, y aun así son dos cosas
-- distintas: en uno las partes estuvieron de acuerdo y en el otro una
-- le ganó a la otra. El acta del mes tiene que poder decir cuál fue
-- cuál; un solo estado «se cobra» borraría justo el dato por el que se
-- hace una conciliación.
--
-- ---------------------------------------------------------------------
-- EL PLAZO SE MIDE EN LA VISTA, NO EN UN RELOJ
-- ---------------------------------------------------------------------
-- «Si no contesta en N días se da por aceptada» necesita que algo pase
-- a las 00:00. Este proyecto NO TIENE nada corriendo solo —ni cron, ni
-- una tarea de fondo—, y montar uno para esto sería poner la verdad de
-- la plata a depender de que un trabajo no se caiga un domingo.
--
-- Así que el vencimiento SE CALCULA AL LEER: la vista devuelve
-- `cobro_efectivo`, que es `aceptado` en cuanto pasa la fecha aunque la
-- fila todavía diga `por_responder`. Nunca hay un rato en que la
-- pantalla y la base digan cosas distintas.
--
-- Y para que eso no sea una mentira a medias, LAS FUNCIONES QUE
-- ESCRIBEN RESPETAN LO MISMO: `rotura_responder` rechaza una rotura
-- vencida aunque en la fila siga diciendo `por_responder`. Sin esa
-- guarda, al OL le bastaría con abrir la pantalla tarde para seguir
-- objetando lo que ya se dio por aceptado.
--
-- `roturas_vencer_plazos()` existe para CONGELAR lo vencido cuando se
-- cierre un acta. No hace falta llamarla para que las cifras estén
-- bien; hace falta para que queden escritas.
--
-- ---------------------------------------------------------------------
-- QUIÉN ES EL OL
-- ---------------------------------------------------------------------
-- No se crea ningún rol. Desde «roles-supervisor-borrable», quien firma
-- es QUIEN TIENE «EDITAR» EN LA PANTALLA DE ESA FIRMA. El OL es quien
-- tenga «Editar» en /roturas/en-sitio/descargo, y eso se asigna desde
-- Roles sin tocar código ni volver a desplegar.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. EL PLAZO, COMO DATO
-- ---------------------------------------------------------------------
-- Mismo patrón que `acciones_parametros`: un número que se cambia desde
-- la base sin desplegar. Tres días es el arranque, no una ley.
create table if not exists public.roturas_parametros (
  clave text primary key,
  valor numeric not null,
  nota  text
);

insert into public.roturas_parametros (clave, valor, nota) values
  ('plazo_descargo_dias', 3,
   'Días que tiene el operador logístico para responder un cobro antes de que se dé por aceptado.')
on conflict (clave) do nothing;

grant select on public.roturas_parametros to authenticated;

create or replace function public.roturas_plazo_dias()
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.roturas_parametros
                    where clave = 'plazo_descargo_dias'), 3)
$$;
grant execute on function public.roturas_plazo_dias() to authenticated;

-- ---------------------------------------------------------------------
-- 2. LAS COLUMNAS DEL COBRO
-- ---------------------------------------------------------------------
do $$ begin
  create type rotura_cobro as enum
    ('por_responder', 'aceptado', 'en_disputa', 'sostenido', 'retirado');
exception when duplicate_object then null; end $$;

alter table public.roturas
  add column if not exists cobro              rotura_cobro,
  add column if not exists cobro_vence_en     timestamptz,
  /* Aceptado por no contestar NO ES aceptado. Se cobra igual, pero el
     acta tiene que poder decir cuántas pasaron por silencio: un mes con
     cuarenta silencios no es un mes conciliado, es un mes sin leer. */
  add column if not exists cobro_por_silencio boolean not null default false,
  add column if not exists respondida_por  uuid references public.perfiles(id) on delete set null,
  add column if not exists respondida_en   timestamptz,
  add column if not exists respuesta_nota  text,
  add column if not exists resuelta_por    uuid references public.perfiles(id) on delete set null,
  add column if not exists resuelta_en     timestamptz,
  add column if not exists resolucion_nota text;

/* LO QUE YA ESTABA COBRADO ENTRA A LA COLA, con el plazo contado DESDE
   HOY y no desde el día en que ABI lo decidió. Contarlo desde entonces
   dejaría vencido de entrada todo el histórico —el OL nunca tuvo esa
   pantalla— y la primera conciliación arrancaría con cientos de
   «aceptadas por silencio» que nadie calló. */
update public.roturas
   set cobro = 'por_responder',
       cobro_vence_en = now() + make_interval(days => public.roturas_plazo_dias()::int)
 where estado = 'cuenta' and cobro is null;

/* Y lo que no se cobra no tiene conversación que tener. */
update public.roturas set cobro = null where estado <> 'cuenta' and cobro is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'roturas_cobro_solo_si_cuenta') then
    alter table public.roturas add constraint roturas_cobro_solo_si_cuenta
      check ((estado = 'cuenta') = (cobro is not null));
  end if;
end $$;

create index if not exists roturas_por_responder_idx
  on public.roturas (cobro_vence_en) where cobro = 'por_responder';
create index if not exists roturas_en_disputa_idx
  on public.roturas (decidida_en desc) where cobro = 'en_disputa';

-- ---------------------------------------------------------------------
-- 3. LA EVIDENCIA DEL DESCARGO
-- ---------------------------------------------------------------------
-- Va en la MISMA tabla de fotos, con un papel, y no en una tabla nueva:
-- el bucket, las políticas de storage, las urls firmadas y el borrado
-- en cascada ya están resueltos ahí y duplicarlos es duplicar cuatro
-- sitios donde equivocarse.
--
-- PERO NO SON LA MISMA FOTO, y esto es lo único delicado de toda la
-- migración: `exige_foto` dice que ciertas causas no se pueden cobrar
-- sin foto, «porque es la que sostiene que la rotura no fue del OL».
-- Si la foto que sube el OL PARA DEFENDERSE contara para eso, el OL
-- estaría cumpliendo el requisito que existe para cobrarle. Por eso
-- todo lo que cuenta fotos —la vista y el visto bueno— filtra
-- papel = 'rotura'.
do $$ begin
  create type rotura_foto_papel as enum ('rotura', 'descargo');
exception when duplicate_object then null; end $$;

alter table public.roturas_fotos
  add column if not exists papel rotura_foto_papel not null default 'rotura';

create index if not exists roturas_fotos_papel_idx
  on public.roturas_fotos (rotura_id, papel);

-- ---------------------------------------------------------------------
-- 4. QUIÉN PUEDE QUÉ
-- ---------------------------------------------------------------------
create or replace function public.rotura_puede(p_papel text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_papel in ('visto_bueno', 'supervisora', 'verificador', 'validador', 'descargo')
     and public.mi_nivel_pantalla(case p_papel
    when 'visto_bueno' then '/roturas/en-sitio/visto-bueno'
    when 'supervisora' then '/roturas/salida'
    when 'verificador' then '/roturas/salida/verificacion'
    when 'validador'   then '/roturas/salida/validacion'
    when 'descargo'    then '/roturas/en-sitio/descargo'
  end) = 'editar'
$$;
grant execute on function public.rotura_puede(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. EL VISTO BUENO, QUE AHORA ABRE EL PLAZO
-- ---------------------------------------------------------------------
create or replace function public.rotura_visto_bueno(
  p_id    uuid,
  p_cuenta boolean,
  p_nota  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado rotura_estado;
  v_causa  text;
  v_foto   boolean;
  v_tiene  boolean;
begin
  if not public.rotura_puede('visto_bueno') then
    raise exception 'El visto bueno de las roturas es de ABI';
  end if;

  select r.estado, r.causa into v_estado, v_causa from public.roturas r where r.id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v_estado <> 'esperando' then
    raise exception 'Esa rotura ya fue decidida';
  end if;

  select c.exige_foto into v_foto from public.roturas_causas c where c.clave = v_causa;
  /* SOLO LAS FOTOS DE LA ROTURA. Ver el bloque 3. */
  select exists (select 1 from public.roturas_fotos f
                  where f.rotura_id = p_id and f.papel = 'rotura') into v_tiene;

  if p_cuenta and v_foto and not v_tiene then
    raise exception
      'Esta causa exige foto y la rotura no tiene: es la que sostiene que la rotura no fue del OL';
  end if;

  if not p_cuenta and btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Si no cuenta, hay que decir por qué';
  end if;

  update public.roturas
     set estado = case when p_cuenta then 'cuenta'::rotura_estado
                       else 'no_cuenta'::rotura_estado end,
         nota_decision = nullif(btrim(coalesce(p_nota, '')), ''),
         decidida_por = auth.uid(),
         decidida_en  = now(),
         /* Cobrar es abrir la conversación, y la conversación tiene
            reloj desde el minuto en que se abre. */
         cobro = case when p_cuenta then 'por_responder'::rotura_cobro else null end,
         cobro_vence_en = case when p_cuenta
           then now() + make_interval(days => public.roturas_plazo_dias()::int) end
   where id = p_id;
end $$;
grant execute on function public.rotura_visto_bueno(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. LA RESPUESTA DEL OL
-- ---------------------------------------------------------------------
create or replace function public.rotura_responder(
  p_id          uuid,
  p_de_acuerdo  boolean,
  p_nota        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.roturas%rowtype;
  v_fotos  boolean;
begin
  if not public.rotura_puede('descargo') then
    raise exception 'Responder un cobro es del operador logístico';
  end if;

  select * into r from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if r.estado <> 'cuenta' then
    raise exception 'Esa rotura no está cobrada: no hay nada que responder';
  end if;
  if r.cobro <> 'por_responder' then
    raise exception 'Esa rotura ya fue respondida';
  end if;

  /* LA MISMA REGLA QUE APLICA LA VISTA. Sin esto, abrir la pantalla
     tarde sería la forma de seguir objetando lo ya aceptado. */
  if r.cobro_vence_en is not null and now() > r.cobro_vence_en then
    raise exception
      'Se venció el plazo para responder esta rotura: quedó aceptada el %',
      to_char(r.cobro_vence_en, 'DD/MM/YYYY HH24:MI');
  end if;

  /* DOS PARTES, DOS PERSONAS. Quien cobra no se responde a sí mismo.
     Un administrador tiene los dos permisos, y sin esta línea podría
     cerrar solo una conciliación entre dos empresas. */
  if r.decidida_por is not null and r.decidida_por = auth.uid() then
    raise exception 'Quien dio el visto bueno no puede responder el descargo: son las dos partes';
  end if;

  if not p_de_acuerdo then
    if btrim(coalesce(p_nota, '')) = '' then
      raise exception 'Si no está de acuerdo, hay que decir por qué';
    end if;
    /* UNA OBJECIÓN SIN EVIDENCIA NO ES UNA OBJECIÓN. Es lo único que
       hace que la disputa sirva de algo en la reunión del mes. */
    select exists (select 1 from public.roturas_fotos f
                    where f.rotura_id = p_id and f.papel = 'descargo') into v_fotos;
    if not v_fotos then
      raise exception 'Para no estar de acuerdo hay que adjuntar la evidencia';
    end if;
  end if;

  update public.roturas
     set cobro = case when p_de_acuerdo then 'aceptado'::rotura_cobro
                      else 'en_disputa'::rotura_cobro end,
         respuesta_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         respondida_por = auth.uid(),
         respondida_en  = now()
   where id = p_id;
end $$;
grant execute on function public.rotura_responder(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. ABI RESUELVE LA DISPUTA
-- ---------------------------------------------------------------------
create or replace function public.rotura_resolver(
  p_id       uuid,
  p_sostiene boolean,
  p_nota     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.roturas%rowtype;
begin
  if not public.rotura_puede('visto_bueno') then
    raise exception 'Resolver una disputa es de ABI';
  end if;

  select * into r from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if r.cobro is distinct from 'en_disputa' then
    raise exception 'Esa rotura no está en disputa';
  end if;

  /* AQUÍ LA NOTA ES OBLIGATORIA SIEMPRE, sostenga o retire. Es la
     última palabra de un pleito entre dos empresas: «sostenido» a
     secas, tres meses después, no lo puede defender nadie. */
  if btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Hay que decir en qué se basa la decisión';
  end if;

  update public.roturas
     set cobro = case when p_sostiene then 'sostenido'::rotura_cobro
                      else 'retirado'::rotura_cobro end,
         resolucion_nota = btrim(p_nota),
         resuelta_por = auth.uid(),
         resuelta_en  = now()
   where id = p_id;
end $$;
grant execute on function public.rotura_resolver(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. CONGELAR LO VENCIDO
-- ---------------------------------------------------------------------
-- No hace falta para que las cifras estén bien —la vista ya lo calcula—
-- sino para que queden ESCRITAS antes de cerrar un acta. `respondida_por`
-- queda en nulo a propósito: nadie respondió.
create or replace function public.roturas_vencer_plazos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.roturas
     set cobro = 'aceptado',
         cobro_por_silencio = true,
         respondida_en = coalesce(respondida_en, cobro_vence_en)
   where cobro = 'por_responder'
     and cobro_vence_en is not null
     and now() > cobro_vence_en;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.roturas_vencer_plazos() to authenticated;

-- ---------------------------------------------------------------------
-- 9. ANULAR TAMBIÉN BORRA LA CONVERSACIÓN
-- ---------------------------------------------------------------------
-- Anular es decir «esto no pasó». Dejarle el cobro puesto la mandaría a
-- la bandeja del OL a responder por algo que ya no existe — y además
-- rompería el check del bloque 2.
create or replace function public.rotura_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() <> 'admin' then
    raise exception 'Anular una rotura es de administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;
  update public.roturas
     set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = auth.uid(), anulada_en = now(),
         cobro = null, cobro_vence_en = null, cobro_por_silencio = false
   where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
end $$;
grant execute on function public.rotura_anular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. LA VISTA
-- ---------------------------------------------------------------------
-- Las columnas nuevas van AL FINAL. `create or replace view` no deja
-- meter una columna en la mitad —ni renombrar, ni cambiar de tipo—, y
-- la única salida sería `drop view`, que se lleva por delante a
-- v_roturas_salidas y a cualquier vista que cuelgue de esta.
--
-- Lo que SÍ cambia en su sitio es `fotos`: ahora cuenta solo las de la
-- rotura. Eso está permitido —mismo nombre, misma posición, mismo
-- tipo— y es justo lo que evita que el descargo del OL cumpla el
-- requisito que existe para cobrarle.
create or replace view public.v_roturas as
with cnt_fotos as (
  select rotura_id, count(*) n from public.roturas_fotos
   where papel = 'rotura' group by rotura_id),
cnt_desc as (
  select rotura_id, count(*) n from public.roturas_fotos
   where papel = 'descargo' group by rotura_id)
select
  r.id,
  r.codigo,
  r.material,
  m.nombre                       as material_nombre,
  r.tipo::text                   as tipo,
  r.color::text                  as color,
  r.unidades,
  r.contaminadas,
  r.botellas,
  case when r.tipo = 'producto_terminado'
       then r.unidades + coalesce(r.contaminadas, 0)
       else 0 end                as unidades_liquido,
  case when r.tipo = 'producto_terminado' then coalesce(r.botellas, 0)
       else r.unidades end       as unidades_vidrio,
  r.proceso,
  p.nombre                       as proceso_nombre,
  r.causa,
  c.nombre                       as causa_nombre,
  r.grupo::text                  as grupo,
  c.exige_foto,
  r.descripcion,
  r.lat, r.lng, r.precision_m,
  r.estado::text                 as estado,
  (r.estado = 'esperando')       as esperando,
  (r.estado = 'cuenta')          as cuenta,
  r.reportada_por, r.reportada_en,
  r.decidida_por, r.decidida_en, r.nota_decision,
  r.motivo_anulacion, r.anulada_en, r.anulada_por,
  coalesce(cf.n, 0)              as fotos,
  (c.exige_foto and coalesce(cf.n, 0) = 0)
                                 as le_falta_foto,
  round(extract(epoch from (now() - r.reportada_en)) / 60)::int as minutos,
  r.area,
  a.nombre                       as area_nombre,

  /* ------------------------ EL COBRO ------------------------------ */
  r.cobro::text                  as cobro,
  /* LO QUE MANDA. Ver el encabezado: el plazo se mide al leer. */
  e.ef::text                     as cobro_efectivo,
  r.cobro_vence_en,
  (r.cobro = 'por_responder' and r.cobro_vence_en is not null
   and now() > r.cobro_vence_en)                        as vencido,
  case when r.cobro = 'por_responder' and r.cobro_vence_en is not null
       then floor(extract(epoch from (r.cobro_vence_en - now())) / 86400)::int
  end                                                   as dias_para_vencer,
  r.cobro_por_silencio,
  r.respondida_por, r.respondida_en, r.respuesta_nota,
  r.resuelta_por, r.resuelta_en, r.resolucion_nota,
  coalesce(cd.n, 0)              as descargo_fotos,

  /* LAS TRES CIFRAS DE LA CONCILIACIÓN, para que ninguna pantalla las
     tenga que volver a deducir —y las deduzca distinto. Son excluyentes
     y entre las tres cubren todo lo que ABI cobró. */
  (r.estado = 'cuenta' and e.ef in ('aceptado', 'sostenido'))  as se_cobra,
  (r.estado = 'cuenta' and e.ef = 'en_disputa')                as en_disputa,
  (r.estado = 'cuenta' and e.ef = 'por_responder')             as por_responder,
  (r.estado = 'cuenta' and e.ef = 'retirado')                  as retirado
from public.roturas r
join public.roturas_materiales m on m.clave = r.material
join public.roturas_procesos   p on p.clave = r.proceso
join public.roturas_causas     c on c.clave = r.causa
left join public.roturas_areas a on a.clave = r.area
left join cnt_fotos cf on cf.rotura_id = r.id
left join cnt_desc  cd on cd.rotura_id = r.id
cross join lateral (
  select case when r.cobro = 'por_responder'
               and r.cobro_vence_en is not null
               and now() > r.cobro_vence_en
              then 'aceptado'::rotura_cobro
              else r.cobro end as ef) e;

grant select on public.v_roturas to authenticated;

-- ---------------------------------------------------------------------
-- 11. LAS DOS BANDEJAS
-- ---------------------------------------------------------------------
-- LA DEL OL: lo más cerca de vencer, arriba. Ordenar por fecha de
-- reporte pondría primero lo más viejo, que es justo lo que ya no se
-- puede salvar; lo urgente es lo que se vence mañana.
create or replace view public.v_roturas_por_responder as
  select * from public.v_roturas
   where por_responder
   order by cobro_vence_en asc;
grant select on public.v_roturas_por_responder to authenticated;

-- LA DE ABI: las disputas, la más vieja arriba — aquí sí, porque una
-- disputa vieja es una conciliación que no cierra.
create or replace view public.v_roturas_en_disputa as
  select * from public.v_roturas
   where en_disputa
   order by respondida_en asc;
grant select on public.v_roturas_en_disputa to authenticated;

-- ---------------------------------------------------------------------
-- 12. EL RESUMEN POR DÍA, QUE ES CON LO QUE SE CONCILIA
-- ---------------------------------------------------------------------
-- POR DÍA Y NO POR SEMANA O MES: el día es el único período que no hay
-- que escoger. Semana y mes se arman sumando días; al revés no se puede.
-- La fecha que manda es la del VISTO BUENO —el día en que se cobró—,
-- no la del reporte: un cobro pertenece al período en que se cobró.
create or replace view public.v_roturas_cobro_dia as
  select
    (decidida_en at time zone 'America/Bogota')::date as dia,
    count(*)                                          as cobradas,
    count(*) filter (where por_responder)             as por_responder,
    count(*) filter (where en_disputa)                as en_disputa,
    count(*) filter (where se_cobra)                  as se_cobra,
    count(*) filter (where retirado)                  as retirado,
    count(*) filter (where se_cobra and cobro_por_silencio) as por_silencio,
    sum(unidades_vidrio) filter (where se_cobra)      as unidades_se_cobra,
    sum(unidades_vidrio) filter (where en_disputa)    as unidades_en_disputa,
    sum(unidades_vidrio) filter (where por_responder) as unidades_por_responder
  from public.v_roturas
 where cuenta
 group by 1;
grant select on public.v_roturas_cobro_dia to authenticated;

-- ---------------------------------------------------------------------
-- 13. QUE CUADRE, ANTES DE DAR ESTO POR BUENO
-- ---------------------------------------------------------------------
do $$
declare
  v_cuenta int; v_suma int; v_rotas int;
begin
  select count(*) into v_cuenta from public.v_roturas where cuenta;
  select count(*) into v_suma   from public.v_roturas
   where se_cobra or en_disputa or por_responder or retirado;
  if v_cuenta <> v_suma then
    raise exception 'Las cuatro cifras del cobro no suman: cobradas=% y clasificadas=%',
      v_cuenta, v_suma;
  end if;

  /* Y que ninguna rotura caiga en dos cifras a la vez. */
  select count(*) into v_rotas from public.v_roturas
   where (se_cobra::int + en_disputa::int + por_responder::int + retirado::int) > 1;
  if v_rotas > 0 then
    raise exception '% rotura(s) caen en dos cifras del cobro a la vez', v_rotas;
  end if;

  raise notice 'Cobros clasificados: % (por responder, en disputa, se cobra, retirado)', v_cuenta;
  raise notice 'Plazo del descargo: % días. Se cambia en roturas_parametros.',
    public.roturas_plazo_dias();
  raise notice 'Falta UNA COSA POR FUERA DEL SQL: darle «Editar» en /roturas/en-sitio/descargo';
  raise notice 'al rol del operador logistico, en Admin -> Roles. Sin eso nadie puede responder.';
end $$;

commit;
