-- =====================================================================
-- TRASPASOS · EL PLAN SE PUEDE ESCRIBIR «GENERAL DEL DÍA», SIN REPARTIR
-- POR TURNO
--
-- «En Traspasos, si no lo quiero manejar por turno, sino que quiero
--  poner el general, que también se pueda.»
--
-- ---------------------------------------------------------------------
-- LA REGLA
-- ---------------------------------------------------------------------
-- Cada TIPO de viaje se planea de UNA de dos maneras, nunca de las dos:
--
--   · POR TURNO  (como hasta hoy): 6 en el C, 4 en el A, 2 en el B.
--   · GENERAL    : 12 en el día, sin decir en qué turno.
--
-- Un tipo puede ir general mientras otro va por turno: el PET se reparte
-- y el casco se deja suelto. Lo que no se permite es el MISMO tipo en
-- las dos formas a la vez —doce generales y además seis en el C—,
-- porque no se sabría si son 12 o 18 y el cumplido dejaría de tener
-- un techo claro. La base lo rechaza con un mensaje que dice cuál tipo.
--
-- ---------------------------------------------------------------------
-- CÓMO SE GUARDA
-- ---------------------------------------------------------------------
-- Como una línea más del plan, con turno «D» (de DÍA). No hay tabla
-- nueva: la línea general se publica, se borra, se copia a otros días y
-- se cuenta exactamente igual que las demás. Los vacíos previstos
-- también pueden ser generales (turno «D»), con la misma regla.
--
-- ---------------------------------------------------------------------
-- CÓMO SE CUENTA EL CUMPLIDO
-- ---------------------------------------------------------------------
-- Los viajes SIGUEN registrándose por turno —el patio no cambia nada—,
-- pero en el control, para un tipo con plan general ese día, todo lo
-- que salió cuenta contra el plan del día: el viaje del turno A y el
-- del B suman al mismo «12». Si no se hiciera así, el plan general
-- (turno D) y lo real (turnos A, B…) quedarían en filas distintas y
-- el tablero diría «12 planeados, 0 cumplidos» y «0 planeados, 12
-- adicionales» a la vez.
--
-- Un tipo SIN plan general sigue contándose por turno, como siempre.
-- Solo cuenta el plan general PUBLICADO: un borrador no cambia cómo se
-- ve el día mientras alguien lo arma.
--
-- Va DESPUÉS de 2026-09-traspasos-plan-crear-no-cambiar.sql y de
-- 2026-09-traspasos-cuenta-lo-que-salio.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_plan_vacios') is null then
    v_falta := v_falta || ' 2026-09-traspasos-plan-rejilla.sql'; end if;
  if to_regprocedure('public.traspaso_plan_exige(date)') is null then
    v_falta := v_falta || ' 2026-09-traspasos-plan-crear-no-cambiar.sql'; end if;
  if to_regclass('public.v_traspasos_control') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'v_traspasos_control'
                       and column_name = 'por_salir') then
    v_falta := v_falta || ' 2026-09-traspasos-cuenta-lo-que-salio.sql'; end if;
  if v_falta <> '' then
    raise exception 'Falta correr antes:%', v_falta;
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- 1. EL TURNO «D» EXISTE EN EL PLAN
-- ---------------------------------------------------------------------
alter table public.traspasos_plan
  drop constraint if exists traspasos_plan_turno_valido;
alter table public.traspasos_plan
  add constraint traspasos_plan_turno_valido check (turno in ('A', 'B', 'C', 'D'));

alter table public.traspasos_plan_vacios
  drop constraint if exists traspasos_plan_vacios_turno_valido;
alter table public.traspasos_plan_vacios
  add constraint traspasos_plan_vacios_turno_valido check (turno in ('A', 'B', 'C', 'D'));

/* LOS VIAJES NO CAMBIAN: siguen siendo A, B o C. «D» es del plan. */

/* D va de último dentro del día, después de C, A y B. */
create or replace function public.traspaso_orden_turno(p_turno text)
returns smallint
language sql
immutable
as $$ select case upper(btrim(p_turno))
              when 'C' then 1 when 'A' then 2 when 'B' then 3 when 'D' then 4
              else 9 end::smallint $$;

create or replace function public.traspaso_horario_turno(p_turno text)
returns text
language sql
immutable
as $$ select case upper(btrim(p_turno))
              when 'A' then '06:00 · 14:00'
              when 'B' then '14:00 · 22:00'
              when 'C' then '22:00 · 06:00'
              when 'D' then 'Todo el día'
              else '' end $$;

grant execute on function public.traspaso_orden_turno(text) to authenticated;
grant execute on function public.traspaso_horario_turno(text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. REVISAR LO QUE LLEGA — UNA SOLA VEZ PARA LAS DOS PUERTAS
--
-- Guardar el borrador de un día y repetir el plan en varios días
-- aceptan lo mismo, y la regla «general o por turno, no las dos» tiene
-- que ser exactamente la misma en ambas: escrita dos veces, el día que
-- cambie una se queda con la vieja.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_plan_revisar(
  p_lineas jsonb,
  p_vacios jsonb default '[]'::jsonb
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  r       jsonb;
  v_turno text;
  v_mixto text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    if v_turno not in ('A','B','C','D') then
      raise exception 'El turno % no existe: son A, B, C o D (el día completo)', r->>'turno';
    end if;
    if not exists (select 1 from public.traspasos_tipos
                    where clave = r->>'tipo' and activo) then
      raise exception 'El tipo % no existe o está desactivado', r->>'tipo';
    end if;
  end loop;

  /* UN TIPO, UNA FORMA. Solo cuentan las líneas con algo: un cero no se
     guarda y no puede hacer que un tipo «esté» en las dos formas. */
  select string_agg(distinct t.nombre, ', ') into v_mixto
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
    join public.traspasos_tipos t on t.clave = x.value->>'tipo'
   where coalesce((x.value->>'planeado')::int, 0) > 0
     and upper(btrim(x.value->>'turno')) = 'D'
     and exists (
       select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) y
        where y.value->>'tipo' = x.value->>'tipo'
          and upper(btrim(y.value->>'turno')) in ('A','B','C')
          and coalesce((y.value->>'planeado')::int, 0) > 0);
  if v_mixto is not null then
    raise exception 'Estos tipos están planeados en general y también por turno: %. Deja una sola forma por tipo', v_mixto;
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb)) x
     where upper(btrim(x.value->>'turno')) = 'D'
       and coalesce((x.value->>'vacios')::int, 0) > 0
  ) and exists (
    select 1 from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb)) y
     where upper(btrim(y.value->>'turno')) in ('A','B','C')
       and coalesce((y.value->>'vacios')::int, 0) > 0
  ) then
    raise exception 'Los viajes vacíos están en general y también por turno. Deja una sola forma';
  end if;
end $$;

revoke all on function public.traspaso_plan_revisar(jsonb, jsonb) from public;
grant execute on function public.traspaso_plan_revisar(jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. GUARDAR EL BORRADOR
--    (el cuerpo es el de 2026-09-traspasos-plan-crear-no-cambiar.sql;
--     cambia el turno aceptado y la revisión)
-- ---------------------------------------------------------------------
create or replace function public.traspaso_guardar_plan(
  p_fecha   date,
  p_lineas  jsonb,            -- [{"turno":"A","tipo":"pet","planeado":6}, …]  (turno D = general)
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
  perform public.traspaso_plan_exige(p_fecha);
  perform public.traspaso_plan_revisar(p_lineas, p_vacios);

  delete from public.traspasos_plan
   where fecha = p_fecha and not publicado and estado = 'registrado';

  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
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
    continue when v_turno not in ('A','B','C','D');
    continue when coalesce((r->>'vacios')::int, 0) <= 0;
    insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
    values (p_fecha, v_turno, (r->>'vacios')::int, auth.uid());
  end loop;

  return v_n;
end $$;

grant execute on function public.traspaso_guardar_plan(date, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 4. PLANEAR VARIOS DÍAS
--    (mismo cuerpo que en 2026-09-traspasos-plan-crear-no-cambiar.sql;
--     cambia el turno aceptado y la revisión)
-- ---------------------------------------------------------------------
create or replace function public.traspaso_plan_a_varios(
  p_fechas  date[],
  p_lineas  jsonb,
  p_vacios  jsonb default '[]'::jsonb
)
returns table (fecha date, resultado text, lineas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  f       date;
  r       jsonb;
  v_turno text;
  v_n     integer;
  v_total integer := 0;
begin
  perform public.traspaso_plan_exige();

  if coalesce(array_length(p_fechas, 1), 0) = 0 then
    raise exception 'No se escogió ningún día';
  end if;

  if array_length(p_fechas, 1) > 366 then
    raise exception 'Son % días. De una sola vez se pueden planear hasta 366',
      array_length(p_fechas, 1);
  end if;

  perform public.traspaso_plan_revisar(p_lineas, p_vacios);

  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
     where coalesce((x.value->>'planeado')::int, 0) > 0
  ) then
    raise exception 'La rejilla está vacía: no hay nada que aplicar';
  end if;

  foreach f in array p_fechas
  loop
    if exists (select 1 from public.traspasos_plan p
                where p.fecha = f and p.publicado
                  and p.estado = 'registrado' and p.planeado > 0) then
      fecha := f; resultado := 'ya_tenia'; lineas := 0;
      return next;
      continue;
    end if;

    /* CON ALIAS: esta función devuelve una columna `fecha`. */
    delete from public.traspasos_plan p
     where p.fecha = f and p.estado = 'registrado';

    v_n := 0;
    for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
    loop
      continue when coalesce((r->>'planeado')::int, 0) <= 0;
      insert into public.traspasos_plan
        (fecha, turno, tipo, planeado, publicado, publicado_en, publicado_por, creado_por)
      values
        (f, upper(btrim(r->>'turno')), r->>'tipo', (r->>'planeado')::int,
         true, now(), auth.uid(), auth.uid());
      v_n := v_n + 1;
    end loop;

    delete from public.traspasos_plan_vacios where traspasos_plan_vacios.fecha = f;
    for r in select * from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb))
    loop
      v_turno := upper(btrim(r->>'turno'));
      continue when v_turno not in ('A','B','C','D');
      continue when coalesce((r->>'vacios')::int, 0) <= 0;
      insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
      values (f, v_turno, (r->>'vacios')::int, auth.uid());
    end loop;

    v_total := v_total + 1;
    fecha := f; resultado := 'planeado'; lineas := v_n;
    return next;
  end loop;

  if v_total = 0 then
    raise exception 'Los % días escogidos ya tenían plan publicado. Ninguno se cambió',
      array_length(p_fechas, 1);
  end if;
end $$;

revoke all on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) from public;
grant execute on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 5. EL CONTROL
--    (la definición de 2026-09-traspasos-cuenta-lo-que-salio.sql; lo
--     único que cambia está marcado con «PLAN GENERAL»)
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_control;

create view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
lineas as (
  select v.id, v.fecha,
         /* PLAN GENERAL: si ese día el tipo tiene plan general publicado,
            lo que salió cuenta contra el plan del día (turno D) y no
            contra el turno en que se registró. */
         case when exists (select 1 from public.traspasos_plan g
                            where g.fecha = v.fecha
                              and g.turno = 'D'
                              and g.tipo = coalesce(vt.tipo, v.tipo)
                              and g.estado = 'registrado' and g.publicado)
              then 'D' else v.turno end                 as turno,
         v.placa, v.viajes,
         v.salida_en,
         coalesce(vt.tipo, v.tipo)          as tipo,
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
    join public.traspasos_tipos t on t.clave = coalesce(vt.tipo, v.tipo)
   where v.estado = 'registrado' and not v.vacio
     and t.cuenta_plan
     and (not t.pregunta_arenosa or v.arenosa)
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from lineas
   where salida_en is not null
   group by fecha, turno, tipo
),
esperando as (
  select fecha, turno, tipo,
         sum(viajes)::int             as por_salir,
         count(*)::int                as registros_por_salir,
         coalesce(sum(carga), 0)::int as carga_por_salir,
         count(distinct placa)::int   as placas_por_salir
    from lineas
   where salida_en is null
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha, e.fecha)   as fecha,
  coalesce(p.turno, r.turno, e.turno)   as turno,
  public.traspaso_orden_turno(coalesce(p.turno, r.turno, e.turno)) as turno_orden,
  coalesce(p.tipo,  r.tipo,  e.tipo)    as tipo,
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

  coalesce(e.por_salir, 0)             as por_salir,
  coalesce(e.registros_por_salir, 0)   as registros_por_salir,
  coalesce(e.carga_por_salir, 0)       as carga_por_salir,
  coalesce(e.placas_por_salir, 0)      as placas_por_salir,

  least(coalesce(r.cumplido, 0), coalesce(p.planeado, 0))          as adheridos,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0)   as adicionales,
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0)   as faltan,
  (p.plan_id is null)          as sin_planear,
  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * least(coalesce(r.cumplido, 0), p.planeado) / p.planeado)::int, 100)
  end                          as adherencia,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int
  end                          as cumplimiento,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * (coalesce(r.cumplido, 0) + coalesce(e.por_salir, 0)) / p.planeado)::int
  end                          as cumplimiento_con_pendientes
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
full join esperando e
  on e.fecha = coalesce(p.fecha, r.fecha)
 and e.turno = coalesce(p.turno, r.turno)
 and e.tipo  = coalesce(p.tipo,  r.tipo)
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo, e.tipo)
left join public.traspasos_plan_vacios pv
  on pv.fecha = coalesce(p.fecha, r.fecha, e.fecha)
 and pv.turno = coalesce(p.turno, r.turno, e.turno)
where t.cuenta_plan;

grant select on public.v_traspasos_control to authenticated;


-- ---------------------------------------------------------------------
-- 6. QUE QUEDE DICHO SI QUEDÓ
-- ---------------------------------------------------------------------
do $bloque$
declare f text; n int;
begin
  select pg_get_viewdef('public.v_traspasos_control'::regclass, true) into f;
  if f not like '%salida_en IS NOT NULL%' then
    raise exception 'NO QUEDÓ: el control perdió la regla de la salida confirmada.';
  end if;
  if f not like '%''D''%' then
    raise exception 'NO QUEDÓ: el control no sabe contar contra el plan general.';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'v_traspasos_control'
     and column_name in ('por_salir', 'carga_por_salir', 'placas_por_salir',
                         'registros_por_salir', 'cumplimiento_con_pendientes');
  if n <> 5 then
    raise exception 'NO QUEDÓ: faltan columnas del control (hay % de 5).', n;
  end if;

  if public.traspaso_horario_turno('D') <> 'Todo el día'
     or public.traspaso_orden_turno('D') <> 4 then
    raise exception 'NO QUEDÓ: el turno D no está definido.';
  end if;

  select count(*) into n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname in ('traspaso_guardar_plan', 'traspaso_plan_a_varios',
                       'traspaso_plan_revisar')
     and p.prosrc like '%traspaso_plan_revisar%';
  if n <> 2 then
    raise exception 'NO QUEDÓ: las dos puertas del plan no pasan por la misma revisión (hay % de 2).', n;
  end if;

  raise notice 'Listo: el plan se puede escribir general del día (turno D) o por turno, un tipo en una sola forma.';
end $bloque$;

commit;
