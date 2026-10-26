-- =====================================================================
-- CASCO · REGISTRAR MOVIMIENTO: todos los almacenes también como RECEPTOR
--
-- «De AG18 puedo mandar a AG22 y no sale en receptor.»
-- El desplegable «Alm receptor // cliente» solo traía AG07 y el cliente. Aquí cada almacén que ya
-- sale como ORIGEN (AG18, AG22, …) queda también como RECEPTOR, con la misma tabla de Control:
-- lo que sale del origen se resta y lo que llega al receptor se suma en su Inventario.
-- Se puede correr varias veces: no repite los que ya están.
-- =====================================================================
insert into public.casco_mov_maestro (tipo, codigo, nombre, ubicacion, orden, descuenta)
select 'receptor', o.codigo, o.nombre, o.ubicacion, o.orden, true
  from public.casco_mov_maestro o
 where o.tipo = 'origen' and o.activo
on conflict (tipo, nombre) do nothing;

-- Verificación: los receptores que quedan
select tipo, codigo, nombre, ubicacion from public.casco_mov_maestro
 where tipo = 'receptor' and activo order by orden nulls last, nombre;
