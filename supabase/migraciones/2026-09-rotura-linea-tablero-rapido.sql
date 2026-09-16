-- =====================================================================
-- ROTURA DE LÍNEA · QUE EL TABLERO CAMBIE DE PERÍODO RÁPIDO
-- ---------------------------------------------------------------------
-- EL PROBLEMA, MEDIDO. Con «Lo que va de 2026» puesto, el tablero se
-- traía 12.171 filas en cada clic:
--
--     v_rotlinea_dia         806 filas
--     v_rotlinea_maquina  10.477 filas   ← aquí estaba todo
--     v_rotlinea_envase      888 filas
--
-- Diez mil de esas doce mil eran el desglose por máquina, al grano
-- DIARIO, para dibujar quince barras. O sea: la base agrupaba 24.245
-- registros en 10.477 filas, las mandaba a Vercel, y Vercel las volvía
-- a agrupar en quince. El trabajo se hacía dos veces y el viaje era el
-- de diez mil filas.
--
-- POR QUÉ ESTABAN AL GRANO DIARIO, que no fue un descuido: una vista
-- ya sumada por rango no existe —el rango lo escoge quien mira—, y al
-- grano diario cualquier rango se puede sumar encima. Lo que faltaba
-- era poder pasarle el rango A LA BASE, y eso una vista no lo hace:
-- lo hace una función.
--
-- LA VISTA SE QUEDA. v_rotlinea_maquina sigue existiendo y sigue
-- sirviendo para lo que sirve —mirar una máquina día por día—. Esto no
-- la reemplaza: le pone al lado la versión que el tablero necesitaba.
--
-- RESULTADO, contado contra los 24.245 registros de 2026:
-- 12.171 filas → 806 + 13 + 12 = 831. Casi quince veces menos.
--
-- SEGURIDAD: las dos funciones son `security invoker` a propósito —sin
-- `security definer`—, así que leen la tabla con los permisos de quien
-- llama y el RLS de rotlinea_registro sigue mandando. Una función que
-- solo suma no tiene por qué saltarse nada.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- POR MÁQUINA, ya sumado por el rango
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_tablero_maquina(
  p_desde date,
  p_hasta date,
  p_linea smallint default null
)
returns table (
  maquina smallint,
  maquina_nombre text,
  orden integer,
  rotas bigint,
  kg numeric
)
language sql
stable
set search_path = public
as $$
  select r.maquina, m.nombre, m.orden,
         sum(r.und)::bigint, sum(r.kg)
    from public.rotlinea_registro r
    join public.rotlinea_maquinas m on m.item = r.maquina
   where r.fecha between p_desde and p_hasta
     and (p_linea is null or r.linea = p_linea)
   group by r.maquina, m.nombre, m.orden
$$;

grant execute on function public.rotlinea_tablero_maquina(date, date, smallint)
  to authenticated;


-- ---------------------------------------------------------------------
-- POR ENVASE, igual
--
-- Son 888 filas y no 10.477, así que el ahorro es chico. Va de todas
-- formas: el tablero pide las dos cosas en la misma tanda y de nada
-- sirve que una llegue rápido si la otra no.
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_tablero_envase(
  p_desde date,
  p_hasta date,
  p_linea smallint default null
)
returns table (
  envase text,
  envase_nombre text,
  und bigint,
  kg numeric
)
language sql
stable
set search_path = public
as $$
  select r.envase, e.descripcion,
         sum(r.und)::bigint, sum(r.kg)
    from public.rotlinea_registro r
    join public.rotlinea_envases e on e.material = r.envase
   where r.fecha between p_desde and p_hasta
     and (p_linea is null or r.linea = p_linea)
   group by r.envase, e.descripcion
$$;

grant execute on function public.rotlinea_tablero_envase(date, date, smallint)
  to authenticated;


-- ---------------------------------------------------------------------
-- NO SE CREA NINGÚN ÍNDICE, Y ESO SE MIDIÓ
--
-- La primera versión de este archivo creaba (fecha, linea), que parecía
-- lo obvio. Al mirar qué hay ya en la tabla, sobraba: la llave única
-- (fecha, linea, turno, envase, maquina, toma) EMPIEZA por esas dos
-- columnas, y un índice compuesto sirve para cualquier prefijo suyo.
-- Habría sido una copia del que ya está, pagando escrituras y disco en
-- una instancia NANO a cambio de nada.
--
-- Lo que dijo EXPLAIN ANALYZE sobre los 24.245 registros:
--   · Últimos 7 días, todas las líneas → Index Scan, 0,14 ms
--   · Año entero, una sola línea       → Seq Scan, 3,8 ms, y está BIEN:
--     esa línea es el 29 % de la tabla y leerla de corrido es más
--     rápido que ir saltando por un índice. El planificador tenía razón
--     y el índice no lo habría cambiado.
--
-- El índice que sí faltaba no existe porque no falta.

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_n integer;
begin
  if to_regprocedure('public.rotlinea_tablero_maquina(date, date, smallint)') is null then
    v_falta := v_falta || ' rotlinea_tablero_maquina'; end if;
  if to_regprocedure('public.rotlinea_tablero_envase(date, date, smallint)') is null then
    v_falta := v_falta || ' rotlinea_tablero_envase'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  /* Que además devuelvan algo: una función que existe y contesta vacío
     se ve igual de bien en una comprobación y igual de mal en pantalla. */
  select count(*) into v_n
    from public.rotlinea_tablero_maquina('2026-01-01', '2026-12-31', null);
  raise notice 'Listo: el tablero suma en la base. Máquinas con dato en 2026: %', v_n;
end $$;
