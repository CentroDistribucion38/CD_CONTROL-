-- =====================================================================
-- CASCO · CONTROL DE HOY EXACTAMENTE COMO AYER (versión 4, sin nada de hoy)
--
-- Deja las 4 tablas de Control de HOY (AG22, AG18, AG07, CA22) idénticas al último día anterior
-- con registros en cada sitio (saldo y cuenta). NO vuelve a aplicar nada de hoy:
--   · las bajas de hoy se borran del libro y del historial de archivos;
--   · los MOVIMIENTOS y AJUSTES de hoy que afectaban Control también se borran
--     (hay que volver a registrarlos si eran buenos);
--   · lo tecleado a mano en Control hoy se pierde.
-- Es para correr DESPUÉS (o en vez) del archivo 3. Un sitio sin día anterior no se toca.
--
-- Seguridad: antes copia Control de hoy en casco_respaldo_hoy_completo y los movimientos de hoy
-- en casco_respaldo_movimientos_hoy. Se corre completo, una sola vez.
-- =====================================================================
create table if not exists public.casco_respaldo_hoy_completo as
  select now() as respaldado_en, r.* from public.casco_registros r where false;
create table if not exists public.casco_respaldo_movimientos_hoy as
  select now() as respaldado_en, m.* from public.casco_movimientos m where false;

do $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  u record; v_prev date; v_n int := 0;
begin
  -- 1. COPIA DE SEGURIDAD de lo que hay hoy
  insert into public.casco_respaldo_hoy_completo
  select now(), r.* from public.casco_registros r
   where r.fecha = v_hoy
     and not exists (select 1 from public.casco_respaldo_hoy_completo z where z.id = r.id);

  -- 2. LAS BAJAS DE HOY: fuera del libro (sus efectos se van con el reinicio de abajo)
  delete from public.casco_bajas where fecha = v_hoy or (creado_en at time zone 'America/Bogota')::date = v_hoy;
  delete from public.casco_archivos where (creado_en at time zone 'America/Bogota')::date = v_hoy;

  -- 3. CADA SITIO: hoy = último día anterior
  for u in select distinct ubicacion from public.casco_registros where fecha = v_hoy loop
    select max(fecha) into v_prev from public.casco_registros where ubicacion = u.ubicacion and fecha < v_hoy;
    if v_prev is null then
      raise notice '% no tiene día anterior: no se toca.', u.ubicacion;
      continue;
    end if;
    delete from public.casco_registros where fecha = v_hoy and ubicacion = u.ubicacion;
    insert into public.casco_registros
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad)
    select v_hoy, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, 'registro', puesto, calidad
      from public.casco_registros where ubicacion = u.ubicacion and fecha = v_prev;
    v_n := v_n + 1;
    raise notice '% quedó como el %.', u.ubicacion, v_prev;
  end loop;

  -- 4. LOS MOVIMIENTOS Y AJUSTES DE HOY que afectaban Control: copia y fuera
  insert into public.casco_respaldo_movimientos_hoy
  select now(), mv.* from public.casco_movimientos mv
   where mv.fecha = v_hoy and mv.afecta
     and not exists (select 1 from public.casco_respaldo_movimientos_hoy z where z.id = mv.id);
  delete from public.casco_movimientos where fecha = v_hoy and afecta;
end $$;

-- RESULTADO: lo que cambió respecto a antes (copia).
select r.ubicacion, r.sku, z.inventario as antes, r.inventario as ahora,
       coalesce(z.baja, 0) as baja_antes, coalesce(r.baja, 0) as baja_ahora
  from public.casco_registros r
  left join public.casco_respaldo_hoy_completo z on z.fecha = r.fecha and z.ubicacion = r.ubicacion and z.sku = r.sku
 where r.fecha = (now() at time zone 'America/Bogota')::date
   and (z.id is null or z.inventario is distinct from r.inventario or z.baja is distinct from r.baja)
 order by r.ubicacion, r.sku;

-- PARA VOLVER ATRÁS (Control de hoy y los movimientos de hoy como estaban antes de este archivo;
-- usa la copia MÁS ANTIGUA de cada celda si corriste el archivo 3 antes):
-- delete from public.casco_registros where fecha = (now() at time zone 'America/Bogota')::date;
-- insert into public.casco_registros
--   select id, fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, nota,
--          creado_por, creado_en, actualizado_en, puesto, calidad
--     from public.casco_respaldo_hoy_completo;
-- Los movimientos y ajustes de hoy quedan guardados con todas sus columnas en casco_respaldo_movimientos_hoy;
-- si hace falta recuperar alguno, se vuelve a registrar en Movimiento (o se me pide el SQL).
