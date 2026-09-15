-- =====================================================================
-- ROTURA DE LÍNEA · LAS CUENTAS DEL TABLERO
--
-- Requiere: supabase/modulos/rotura-linea.sql
--           supabase/migraciones/2026-09-rotura-linea-firma.sql
--
-- POR QUÉ VISTAS Y NO TRAER LAS FILAS.
--
-- El tablero pregunta cosas de un mes o de un año: «cuál máquina se
-- come el envase», «cómo viene la semana», «cuál línea». Contestarlas
-- bajando los registros al navegador serían 24.000 filas por la red
-- para pintar quince barras. Se agrupa en la base, que es donde están
-- los datos, y viaja lo que se dibuja.
--
-- TODO AL GRANO DIARIO, a propósito. Una vista por mes y otra por
-- semana y otra por año serían tres cosas que se pueden desincronizar;
-- con el día, cualquier rango se suma encima y siempre cuadra con el
-- detalle porque sale del mismo sitio.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

/* EL DÍA, por línea. Es la serie del tablero y la base de todo lo demás. */
create or replace view public.v_rotlinea_dia as
select r.fecha, r.linea,
       sum(r.und)::bigint as und,
       sum(r.kg)          as kg,
       count(distinct (r.turno, r.envase, r.toma))::int as pesadas,
       count(distinct r.turno)::int as turnos,
       count(*) filter (where not r.baja)::int as sin_baja
from public.rotlinea_registro r
group by r.fecha, r.linea;

grant select on public.v_rotlinea_dia to authenticated;


/* POR ENVASE. Cuál vidrio es el que se está yendo. */
create or replace view public.v_rotlinea_envase as
select r.fecha, r.linea, r.envase, e.descripcion as envase_nombre,
       sum(r.und)::bigint as und, sum(r.kg) as kg
from public.rotlinea_registro r
join public.rotlinea_envases e on e.material = r.envase
group by r.fecha, r.linea, r.envase, e.descripcion;

grant select on public.v_rotlinea_envase to authenticated;


/* LOS TURNOS QUE FALTAN POR FIRMAR.
   Una fila por (día, línea, turno) que tiene rotura registrada y NO
   tiene firma. Es la lista de lo que quedó a medias, que en el Excel no
   existía porque no había con qué compararla. */
create or replace view public.v_rotlinea_sin_firma as
select t.fecha, t.linea, t.turno, t.und, t.kg
from (
  select fecha, linea, turno, sum(und)::bigint as und, sum(kg) as kg
    from public.rotlinea_registro group by fecha, linea, turno
) t
left join public.rotlinea_firmas f
  on f.fecha = t.fecha and f.linea = t.linea and f.turno = t.turno
where f.fecha is null;

grant select on public.v_rotlinea_sin_firma to authenticated;


/* LA PRODUCCIÓN POR DÍA Y LÍNEA, para el porcentaje del tablero.
   v_rotlinea_indicador ya cruza por ENVASE; esto es lo mismo un escalón
   más arriba, que es como se lee un tablero: primero el total del día y
   después, si hace falta, por envase. */
create or replace view public.v_rotlinea_prod_dia as
select p.fecha, p.linea, sum(p.cantidad)::bigint as producidas, sum(p.hl) as hl
from public.rotlinea_produccion p
group by p.fecha, p.linea;

grant select on public.v_rotlinea_prod_dia to authenticated;


do $$
declare v_falta text := '';
begin
  if to_regclass('public.v_rotlinea_dia') is null then v_falta := v_falta || ' v_rotlinea_dia'; end if;
  if to_regclass('public.v_rotlinea_envase') is null then v_falta := v_falta || ' v_rotlinea_envase'; end if;
  if to_regclass('public.v_rotlinea_sin_firma') is null then v_falta := v_falta || ' v_rotlinea_sin_firma'; end if;
  if to_regclass('public.v_rotlinea_prod_dia') is null then v_falta := v_falta || ' v_rotlinea_prod_dia'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;
  raise notice 'Listo: el tablero ya tiene de dónde leer.';
end $$;
