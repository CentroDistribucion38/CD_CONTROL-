-- =====================================================================
-- CASCO · CONTROL DE HOY «COMO AYER»
--
-- Deja las tablas de Control de HOY (las 4: AG22, AG18, AG07, CA22) iguales al último día
-- anterior que tenga registros en cada sitio (saldo y cuenta), y encima vuelve a aplicar los
-- MOVIMIENTOS y AJUSTES que hoy sí están registrados en Movimiento (esos no se pierden).
-- Las bajas de hoy quedan en cero (también se limpia el libro de bajas y el historial de
-- archivos de hoy, por si algo quedó). Lo que se haya tecleado a mano en Control hoy SÍ se pierde.
--
-- Seguridad: antes copia TODO Control de hoy en la tabla casco_respaldo_hoy_completo.
-- Un sitio sin día anterior no se toca. Se corre completo, una sola vez.
-- Para volver atrás: ver el final del archivo.
-- =====================================================================
create table if not exists public.casco_respaldo_hoy_completo as
  select now() as respaldado_en, r.* from public.casco_registros r where false;

do $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  u record; m record; v_prev date; v_n int := 0;
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

  -- 4. LOS MOVIMIENTOS Y AJUSTES DE HOY se vuelven a aplicar, en el orden en que se registraron
  for m in select * from public.casco_movimientos where fecha = v_hoy and afecta order by creado_en, id loop
    if m.ubic_destino is not null then
      perform public.casco_aplicar_delta_col(v_hoy, m.ubic_destino, m.sku, m.estibas, m.columna);
    end if;
    if m.ubic_origen is not null then
      perform public.casco_aplicar_delta_col(v_hoy, m.ubic_origen, m.sku, -m.estibas, m.columna);
    end if;
  end loop;
end $$;

-- RESULTADO: lo que cambió respecto a antes (copia) — debe ser solo lo de las bajas.
select r.ubicacion, r.sku, z.inventario as antes, r.inventario as ahora,
       coalesce(z.baja, 0) as baja_antes, coalesce(r.baja, 0) as baja_ahora
  from public.casco_registros r
  left join public.casco_respaldo_hoy_completo z on z.fecha = r.fecha and z.ubicacion = r.ubicacion and z.sku = r.sku
 where r.fecha = (now() at time zone 'America/Bogota')::date
   and (z.id is null or z.inventario is distinct from r.inventario or z.baja is distinct from r.baja)
 order by r.ubicacion, r.sku;

-- PARA VOLVER ATRÁS (deja Control de hoy como estaba antes de este archivo):
-- delete from public.casco_registros where fecha = (now() at time zone 'America/Bogota')::date;
-- insert into public.casco_registros
--   select id, fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, nota,
--          creado_por, creado_en, actualizado_en, puesto, calidad
--     from public.casco_respaldo_hoy_completo;
