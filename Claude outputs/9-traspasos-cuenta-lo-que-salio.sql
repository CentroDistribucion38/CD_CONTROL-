-- =====================================================================
-- TRASPASOS · EL CUMPLIDO CUENTA SOLO LO QUE FACTURACIÓN DIO POR SALIDO
-- ---------------------------------------------------------------------
-- «En traspasos, la validación de que cuenten si facturación le dio la
--  salida. Porque ahora está contando hasta con los que facturación no
--  le ha dado salida, y así no funciona.»
--
-- ---------------------------------------------------------------------
-- QUÉ PASABA
-- ---------------------------------------------------------------------
-- El cumplido se contaba sobre los viajes REGISTRADOS. Registrar es lo
-- que hace el patio cuando el camión se carga; la salida la confirma
-- facturación cuando el Vh se va de verdad. Entre una cosa y la otra
-- pueden pasar horas —o un turno entero si el documento se atrasa—, y
-- en ese rato el tablero decía que el plan estaba cumplido con camiones
-- que seguían parados en el patio.
--
-- Un cumplimiento así no sirve para lo que sirve un cumplimiento: no se
-- puede llamar a nadie con él, porque el número de la tarde se
-- desdecía solo.
--
-- ---------------------------------------------------------------------
-- LA REGLA NUEVA, EN UNA LÍNEA
-- ---------------------------------------------------------------------
-- Cuenta el viaje que SALIÓ. Registrado y sin salida confirmada no
-- cuenta todavía.
--
-- ---------------------------------------------------------------------
-- Y LO QUE FALTA NO SE ESCONDE — ESTO ES LA MITAD DEL ARREGLO
-- ---------------------------------------------------------------------
-- Bajar el número a secas habría cambiado un problema por otro: el
-- patio vería «3 de 8» sin saber por qué, cuando cargó ocho camiones.
-- Parecería que el tablero perdió viajes.
--
-- Por eso la vista trae además POR_SALIR: cuántos viajes están
-- registrados y esperando a que facturación confirme, con su carga y
-- sus placas. La pantalla puede decir «5 esperando a facturación» al
-- lado del cumplido, que es la verdad completa: el patio hizo su
-- trabajo y el número va a subir cuando el papel salga.
--
-- LO HISTÓRICO SIGUE CONTANDO. Los viajes de antes de que existiera
-- facturación quedaron con su salida puesta y marcados como históricos
-- (salida_historica). Tienen salida_en, así que entran. Si se hubieran
-- dejado fuera, todos los informes de los meses pasados se habrían
-- vaciado de un día para otro.
--
-- Va DESPUÉS de 2026-09-traspasos-cumplimiento.sql y de
-- 2026-09-traspasos-facturacion.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================
begin;

do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_viajes') is null then
    v_falta := v_falta || ' supabase/modulos/traspasos.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'salida_en') then
    v_falta := v_falta || ' 2026-09-traspasos-facturacion.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_tipos'
                    and column_name = 'cuenta_plan') then
    v_falta := v_falta || ' 2026-09-traspasos-cumplimiento.sql'; end if;
  if v_falta <> '' then
    raise exception 'Falta correr antes:%', v_falta;
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- EL CONTROL
--
-- Se borra y se vuelve a crear, no se reemplaza: las columnas nuevas
-- tendrían que ir al final para que «create or replace» las acepte, y
-- `por_salir` va al lado de `cumplido` porque es su contracara — leerlas
-- separadas por doce columnas es leer dos cosas distintas. Nada cuelga
-- de esta vista, así que borrarla no se lleva nada por delante.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_control;

create view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
/* TODAS LAS LÍNEAS, salidas o no. Se parte en dos más abajo. Contarlas
   dos veces con dos filtros distintos deja la puerta abierta a que un
   día una se toque y la otra no, y entonces el cumplido y lo que falta
   dejarían de sumar el total. */
lineas as (
  select v.id, v.fecha, v.turno, v.placa, v.viajes,
         v.salida_en,
         coalesce(vt.tipo, v.tipo)          as tipo,
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
    join public.traspasos_tipos t on t.clave = coalesce(vt.tipo, v.tipo)
   where v.estado = 'registrado' and not v.vacio
     and t.cuenta_plan                                   -- tolvas de vidrio, fuera
     and (not t.pregunta_arenosa or v.arenosa)           -- estibas, solo Arenosa
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from lineas
   where salida_en is not null      -- ← LA REGLA: solo lo que de verdad salió
   group by fecha, turno, tipo
),
/* LO QUE ESTÁ ESPERANDO EL PAPEL. No es un error ni una falta del
   patio: es trabajo hecho que todavía no tiene documento. */
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

  /* LA CONTRACARA DEL CUMPLIDO: cargado y esperando el documento. */
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

  /* Y EL TECHO AL QUE LLEGARÍA si facturación diera salida a todo lo
     que hay esperando. Es lo que contesta «¿vamos mal, o vamos bien y
     el papel está atrasado?», que son dos conversaciones muy distintas
     y hoy se veían igual. */
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
-- QUE QUEDE DICHO SI QUEDÓ
--
-- Esto mira el estado DESPUÉS, que es lo único que una migración puede
-- afirmar de sí misma. Una comprobación sobre el estado ANTERIOR de la
-- base no se puede escribir desde adentro: ya tumbó una migración
-- entera en la base de la bodega.
-- ---------------------------------------------------------------------
do $bloque$
declare f text; n int;
begin
  select pg_get_viewdef('public.v_traspasos_control'::regclass, true) into f;
  if f not like '%salida_en IS NOT NULL%' then
    raise exception 'NO QUEDÓ: el cumplido sigue contando viajes sin salida confirmada.';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'v_traspasos_control'
     and column_name in ('por_salir', 'carga_por_salir', 'placas_por_salir',
                         'registros_por_salir', 'cumplimiento_con_pendientes');
  if n <> 5 then
    raise exception 'NO QUEDÓ: faltan columnas de lo que espera a facturación (hay % de 5).', n;
  end if;
end $bloque$;

do $bloque$
declare n int;
begin
  select coalesce(sum(por_salir), 0) into n from public.v_traspasos_control;
  raise notice 'LISTO: el cumplido cuenta solo lo que salió. Hoy hay % viaje(s) esperando a facturación.', n;
end $bloque$;
commit;
