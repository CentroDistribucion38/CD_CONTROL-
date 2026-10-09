-- =====================================================================
-- CASCO DE VIDRIO · QUE EL TABLERO VUELVA A ABRIR
--
-- «No se pudo leer el casco: canceling statement due to statement timeout»
--
-- POR QUÉ: la regla de lectura de casco_registros (RLS) llamaba a
-- mi_nivel_pantalla() DOS VECES POR CADA RENGLÓN. Esa función a su vez
-- lee perfiles y rol_permisos. Con miles de renglones (el historial de
-- PARTIR) y el tablero leyendo por páginas de 1.000, la base se pasaba
-- del tiempo límite y cortaba la lectura.
--
-- EL ARREGLO: la misma regla, pero con cada llamada envuelta en
-- (select …). Así Postgres pregunta el permiso UNA vez por lectura y no
-- una por renglón. Quién puede ver es EXACTAMENTE lo mismo que antes.
--
-- Se puede correr las veces que sea.
-- =====================================================================
begin;

drop policy if exists casco_ver on public.casco_registros;
create policy casco_ver on public.casco_registros
  for select to authenticated
  using ((select public.mi_nivel_pantalla('/inventario/casco')) in ('ver', 'editar')
      or (select public.mi_nivel_pantalla('/inventario/casco/tablero')) in ('ver', 'editar'));

/* El tablero lee en este orden (fecha, ubicación, material): el índice
   único ya lo cubre; este es por si la restricción tiene otro nombre. */
create index if not exists casco_orden_tablero_idx
  on public.casco_registros (fecha, ubicacion, sku);

analyze public.casco_registros;

commit;

-- Para confirmar: cuántos renglones hay y cuánto tarda leerlos todos.
select count(*) as renglones, min(fecha) as desde, max(fecha) as hasta
  from public.casco_registros;
