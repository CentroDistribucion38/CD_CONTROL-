-- =====================================================================
-- TRASPASOS · EL PLAN COMO REJILLA, Y LO QUE HACE FALTA PARA REGISTRAR
-- RÁPIDO
--
-- Correr DESPUÉS de supabase/modulos/traspasos.sql.
-- Es idempotente: se puede correr las veces que sea.
--
-- 1. EL ORDEN DE LOS TURNOS CAMBIA A A, B, C.
--
--    La primera versión los puso C, A, B, deducido del orden en que
--    aparecían en la lista desplegable de la hoja. El diseño nuevo trae
--    los HORARIOS escritos —A 06:00-14:00, B 14:00-22:00, C 22:00-06:00—
--    y con eso no hay nada que deducir: A es el que abre el día.
--    Un horario explícito le gana siempre a un orden inferido.
--
-- 2. EL PLAN SE ARMA ENTERO Y DESPUÉS SE PUBLICA.
--
--    Antes se guardaba línea por línea, y cada línea quedaba viva en el
--    momento en que se tecleaba. Eso significa que mientras alguien
--    arma el plan del día —nueve tipos por tres turnos—, los
--    supervisores ya están viendo un plan a medias y el porcentaje de
--    cumplimiento da saltos sin sentido.
--
--    Ahora el plan del día se guarda como BORRADOR y solo cuenta
--    cuando se publica. Un plan sin publicar no aparece en Control.
--
-- 3. LOS VACÍOS PLANEADOS SON POR TURNO, NO POR TIPO.
--
--    Un viaje vacío no mueve un material, así que "3 vacíos de casco
--    vidrio" no quiere decir nada. Estaban como columna de la línea de
--    plan —que sí lleva tipo— y eso obligaba a repartirlos entre tipos
--    a ojo. Se mudan a su propia tabla, con la llave que de verdad
--    tienen: fecha y turno.
--
-- 4. LO QUE HACE FALTA PARA REGISTRAR DE UN TOQUE: las placas que se
--    usaron hoy, las rutas que más se repiten, y el promedio de lo que
--    DE VERDAD salió los últimos cuatro días de la misma semana. Las
--    tres salen de los datos que ya hay; ninguna es un campo nuevo que
--    alguien tenga que llenar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EL ORDEN DE LOS TURNOS
-- ---------------------------------------------------------------------
create or replace function public.traspaso_orden_turno(p_turno text)
returns smallint
language sql
immutable
as $$ select case upper(btrim(p_turno))
              when 'A' then 1 when 'B' then 2 when 'C' then 3
              else 9 end::smallint $$;

/* Los horarios viven en la base y no en la pantalla: el día que cambien
   —o que entre un cuarto turno— se cambian aquí y las tres pantallas se
   enteran solas. */
create or replace function public.traspaso_horario_turno(p_turno text)
returns text
language sql
immutable
as $$ select case upper(btrim(p_turno))
              when 'A' then '06:00 · 14:00'
              when 'B' then '14:00 · 22:00'
              when 'C' then '22:00 · 06:00'
              else '' end $$;

grant execute on function public.traspaso_horario_turno(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. BORRADOR Y PUBLICACIÓN
-- ---------------------------------------------------------------------
alter table public.traspasos_plan
  add column if not exists publicado    boolean not null default true,
  add column if not exists publicado_en timestamptz,
  add column if not exists publicado_por uuid references public.perfiles(id) on delete set null;

/* Lo que ya existía se da por publicado: estaba contando desde el
   primer día y ponerlo en borrador ahora escondería un plan que la
   gente ya vio. Lo que se arme de aquí en adelante nace en borrador. */
update public.traspasos_plan set publicado = true where publicado_en is null and publicado;

create index if not exists traspasos_plan_publicado_idx
  on public.traspasos_plan (fecha, publicado) where estado = 'registrado';

/* EL ÍNDICE ÚNICO AHORA INCLUYE `publicado`.
   Sin eso, guardar el borrador de un día que YA tiene plan publicado
   choca contra la línea publicada —misma fecha, turno y tipo— y no deja
   armar el borrador, que es justo lo que el borrador vino a permitir.
   Cada día puede tener a lo sumo una línea publicada y una en borrador
   por (turno, tipo), y eso es exactamente lo que se quiere. */
drop index if exists public.traspasos_plan_unico;
create unique index if not exists traspasos_plan_unico
  on public.traspasos_plan (fecha, turno, tipo, publicado)
  where estado = 'registrado';

/* LA FUNCIÓN VIEJA DE PLANEAR UNA LÍNEA SE BOTA, y no solo por
   ordenada: escribía en la columna `vacios` que esta migración acaba de
   quitar, así que a partir de aquí falla. Dejarla ahí sería dejar una
   puerta que revienta. La rejilla la reemplaza entera. */
drop function if exists public.traspaso_planear(date, text, text, integer, integer, text);
drop function if exists public.traspaso_planear(date, smallint, text, integer, integer, boolean, text);

-- ---------------------------------------------------------------------
-- 3. LOS VACÍOS PLANEADOS, POR TURNO
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_plan_vacios (
  fecha      date not null,
  turno      text not null,
  vacios     integer not null default 0,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en  timestamptz not null default now(),
  primary key (fecha, turno),
  constraint traspasos_plan_vacios_turno_valido check (turno in ('A','B','C')),
  constraint traspasos_plan_vacios_valido check (vacios >= 0)
);

/* Se traen los que estaban repartidos por tipo. Sumarlos por turno es
   lo correcto: eran el mismo número partido a ojo entre los tipos. */
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='traspasos_plan'
                and column_name='vacios') then
    /* La vista de control mira esa columna, y una vista que mira una
       columna impide botarla. Se bota aquí y se vuelve a crear abajo
       —ya sin vacíos— en la misma transacción: entre las dos cosas no
       hay un instante en que la vista no exista para nadie. */
    drop view if exists public.v_traspasos_control;

    insert into public.traspasos_plan_vacios (fecha, turno, vacios)
    select fecha, turno, sum(vacios)::int
      from public.traspasos_plan
     where estado = 'registrado' and vacios > 0
     group by fecha, turno
    on conflict (fecha, turno) do nothing;

    alter table public.traspasos_plan drop column vacios;
    raise notice 'los vacíos planeados pasaron de la línea de tipo a su propia tabla, por turno';
  end if;
end $$;

alter table public.traspasos_plan_vacios enable row level security;

drop policy if exists traspasos_plan_vacios_select on public.traspasos_plan_vacios;
create policy traspasos_plan_vacios_select on public.traspasos_plan_vacios
  for select to authenticated using (true);

grant select on public.traspasos_plan_vacios to authenticated;

-- ---------------------------------------------------------------------
-- 4. GUARDAR LA REJILLA ENTERA DE UNA
--
-- Antes había una función que guardaba UNA línea, y la pantalla la
-- llamaba veintisiete veces. Eso son veintisiete viajes a la base para
-- guardar una sola decisión, y si el número trece falla el plan queda a
-- medias sin que nadie sepa cuál faltó.
--
-- Aquí entra la rejilla completa en un jsonb y se guarda en una sola
-- transacción: o queda todo el plan, o no queda nada.
--
-- UN CERO BORRA LA LÍNEA en vez de guardarla con planeado = 0. Una
-- línea "casco vidrio, turno B, 0 viajes" y la ausencia de esa línea
-- dicen lo mismo, y tener las dos formas obliga a todas las consultas a
-- acordarse de filtrar los ceros.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_guardar_plan(
  p_fecha   date,
  p_lineas  jsonb,            -- [{"turno":"A","tipo":"pet","planeado":6}, …]
  p_vacios  jsonb default '[]'::jsonb  -- [{"turno":"A","vacios":2}, …]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       jsonb;
  v_turno text;
  v_n     integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Armar el plan requiere rol de supervisor o administrador';
  end if;

  /* Se borra el borrador anterior del día y se vuelve a escribir. Es
     más simple y más seguro que ir comparando línea por línea: lo que
     manda es la rejilla que la persona está viendo.
     LO YA PUBLICADO NO SE TOCA aquí —se reemplaza al publicar—, así
     que mientras alguien arma el borrador, el turno sigue viendo el
     plan que estaba vigente. */
  delete from public.traspasos_plan
   where fecha = p_fecha and not publicado and estado = 'registrado';

  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    if v_turno not in ('A','B','C') then
      raise exception 'El turno % no existe: son A, B o C', r->>'turno';
    end if;
    if not exists (select 1 from public.traspasos_tipos
                    where clave = r->>'tipo' and activo) then
      raise exception 'El tipo % no existe o está desactivado', r->>'tipo';
    end if;
    /* El cero no se guarda: la ausencia de la línea dice lo mismo. */
    continue when coalesce((r->>'planeado')::int, 0) <= 0;

    insert into public.traspasos_plan
      (fecha, turno, tipo, planeado, publicado, creado_por)
    values
      (p_fecha, v_turno, r->>'tipo', (r->>'planeado')::int, false, auth.uid());
    v_n := v_n + 1;
  end loop;

  delete from public.traspasos_plan_vacios where fecha = p_fecha;
  for r in select * from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    continue when v_turno not in ('A','B','C');
    continue when coalesce((r->>'vacios')::int, 0) <= 0;
    insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
    values (p_fecha, v_turno, (r->>'vacios')::int, auth.uid());
  end loop;

  return v_n;
end $$;

grant execute on function public.traspaso_guardar_plan(date, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. PUBLICAR
--
-- El borrador reemplaza a lo que estuviera publicado de ese día. Va en
-- una transacción: nunca existe un momento en que el día se quede sin
-- plan porque el viejo ya se borró y el nuevo no ha entrado.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_publicar_plan(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_editor() then
    raise exception 'Publicar el plan requiere rol de supervisor o administrador';
  end if;

  select count(*) into v_n from public.traspasos_plan
   where fecha = p_fecha and not publicado and estado = 'registrado';
  if v_n = 0 then
    raise exception 'No hay nada sin publicar en ese día';
  end if;

  delete from public.traspasos_plan
   where fecha = p_fecha and publicado and estado = 'registrado';

  update public.traspasos_plan
     set publicado = true, publicado_en = now(), publicado_por = auth.uid()
   where fecha = p_fecha and not publicado and estado = 'registrado';

  return v_n;
end $$;

grant execute on function public.traspaso_publicar_plan(date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. LA VISTA DE CONTROL, SOLO CON LO PUBLICADO
--
-- Un borrador no es un plan: si contara, el cumplimiento del turno daría
-- saltos mientras alguien arma la rejilla del día siguiente.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from public.traspasos_viajes
   where estado = 'registrado' and not vacio
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha)   as fecha,
  coalesce(p.turno, r.turno)   as turno,
  public.traspaso_orden_turno(coalesce(p.turno, r.turno)) as turno_orden,
  coalesce(p.tipo,  r.tipo)    as tipo,
  t.nombre                     as tipo_nombre,
  t.orden                      as tipo_orden,
  p.plan_id,
  coalesce(p.planeado, 0)      as planeado,
  coalesce(pv.vacios, 0)       as vacios_planeados,
  p.nota,
  coalesce(r.cumplido, 0)      as cumplido,
  coalesce(r.registros, 0)     as registros,
  coalesce(r.carga, 0)         as carga,
  coalesce(r.placas, 0)        as placas,
  least(coalesce(r.cumplido, 0), coalesce(p.planeado, 0))          as adheridos,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0)   as adicionales,
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0)   as faltan,
  (p.plan_id is null)          as sin_planear,
  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * least(coalesce(r.cumplido, 0), p.planeado) / p.planeado)::int, 100)
  end                          as adherencia,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int
  end                          as cumplimiento
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo)
left join public.traspasos_plan_vacios pv
  on pv.fecha = coalesce(p.fecha, r.fecha) and pv.turno = coalesce(p.turno, r.turno);

grant select on public.v_traspasos_control to authenticated;

-- ---------------------------------------------------------------------
-- 7. LO QUE HACE RÁPIDO EL REGISTRO
--
-- Las tres cosas salen de lo que ya está registrado. Ninguna es un
-- campo nuevo que alguien tenga que llenar, y por eso funcionan desde
-- el primer día sin configurar nada.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_placas;
drop view if exists public.v_traspasos_rutas;
drop view if exists public.v_traspasos_promedio;

/* LAS PLACAS DE LOS ÚLTIMOS DÍAS, la más reciente primero. Es lo que
   convierte teclear "WGX418" en tocar un botón: casi siempre el
   vehículo que está en la puerta ya pasó esta semana. */
create view public.v_traspasos_placas as
select placa, max(hora) as ultima, count(*)::int as veces
  from public.traspasos_viajes
 where estado = 'registrado' and placa is not null
   and fecha >= current_date - 7
 group by placa;

grant select on public.v_traspasos_placas to authenticated;

/* LAS RUTAS QUE MÁS SE REPITEN. Se guardan resueltas contra el maestro
   cuando se puede, y con el texto suelto cuando no: las dos formas
   sirven para proponerla de vuelta. */
create view public.v_traspasos_rutas as
select coalesce(o.nombre, v.origen_texto)  as origen,
       coalesce(d.nombre, v.destino_texto) as destino,
       count(*)::int as veces,
       max(v.hora)   as ultima
  from public.traspasos_viajes v
  left join public.traspasos_puntos o on o.clave = v.origen
  left join public.traspasos_puntos d on d.clave = v.destino
 where v.estado = 'registrado' and not v.vacio
   and v.fecha >= current_date - 30
   and coalesce(o.nombre, v.origen_texto)  is not null
   and coalesce(d.nombre, v.destino_texto) is not null
 group by 1, 2;

grant select on public.v_traspasos_rutas to authenticated;

/* EL PROMEDIO DE LO QUE DE VERDAD SALIÓ, por día de la semana y tipo,
   sobre las últimas cuatro semanas.
   Es lo REAL y no lo planeado a propósito: el plan de los lunes
   anteriores puede haber estado mal, y copiar un plan malo cuatro veces
   es como se institucionaliza un error. Lo que salió es lo que pasó. */
create view public.v_traspasos_promedio as
select extract(isodow from fecha)::int as dia_semana,
       turno,
       tipo,
       round(sum(viajes)::numeric / greatest(count(distinct fecha), 1))::int as promedio,
       count(distinct fecha)::int as dias
  from public.traspasos_viajes
 where estado = 'registrado' and not vacio and tipo is not null
   and fecha >= current_date - 28 and fecha < current_date
 group by 1, 2, 3;

grant select on public.v_traspasos_promedio to authenticated;

-- =====================================================================
-- 8. COMPROBACIÓN
-- =====================================================================
do $$
declare v_fun integer; v_vistas integer; v_orden text;
begin
  select count(*) into v_fun from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('traspaso_guardar_plan','traspaso_publicar_plan','traspaso_horario_turno');

  select count(*) into v_vistas from information_schema.views
   where table_schema = 'public'
     and table_name in ('v_traspasos_placas','v_traspasos_rutas','v_traspasos_promedio');

  v_orden := public.traspaso_orden_turno('A')::text || public.traspaso_orden_turno('B')::text
          || public.traspaso_orden_turno('C')::text;

  raise notice 'las tres funciones nuevas .. %', case when v_fun = 3 then 'ok' else 'MAL (' || v_fun || ')' end;
  raise notice 'las tres vistas nuevas ..... %', case when v_vistas = 3 then 'ok' else 'MAL (' || v_vistas || ')' end;
  raise notice 'tabla de vacíos por turno .. %',
    case when to_regclass('public.traspasos_plan_vacios') is not null then 'ok' else 'MAL' end;
  raise notice 'orden de turnos A,B,C ...... %', case when v_orden = '123' then 'ok' else 'MAL (' || v_orden || ')' end;
  raise notice 'horarios ................... A % · B % · C %',
    public.traspaso_horario_turno('A'), public.traspaso_horario_turno('B'),
    public.traspaso_horario_turno('C');
end $$;
