-- =====================================================================
-- INVENTARIO · BAHÍAS 1 A 6, FÁBRICA (SORTING) Y LÍNEA 5 DEL CORTE
--
-- «Agregar de la bahía 1 a la 6, porque solo está la 6» y «en corte de línea agregar
--  la línea 5».
--
--   BAHÍAS: en el maestro de ubicaciones solo existía BAHIA_6. Se agregan BAHIA_1 a BAHIA_5
--           con la misma forma de la 6 (misma bodega, calle BAHIA, familia y capacidad que
--           ya tenga) y el módulo en dos cifras (01…06), como el resto del maestro.
--           No toca la BAHIA_6 ni ninguna que ya exista (si alguna ya está, se deja como está).
--
--   FÁBRICA: es la CALLE, y comprende varios módulos, cada uno aparte: «SORTING L2», «SORTING L4»,
--           «SORTING L6», «PATIO 1» y «PATIO 2» (cinco ubicaciones en la calle FABRICA, en la misma
--           bodega que la BAHIA_6). Sin lado y sin capacidad: son sitios con nombre, como EST07 o JAULA_PNC.
--           Si ya se había corrido una versión anterior que creó el módulo junto «SORTING L2-L4-L6»,
--           se elimina (o, si ya tiene movimiento, se desactiva).
--
--   LÍNEA 5: el corte de líneas lee `inv_lineas`; una fila nueva y la pantalla ya la ofrece.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b6.bodega_id, 'BAHIA_' || n, b6.calle, lpad(n::text, 2, '0'), b6.lado, b6.familia, b6.capacidad, true
  from public.ubicaciones b6
 cross join generate_series(1, 5) as n
 where b6.clave = 'BAHIA_6'
on conflict (bodega_id, clave) do nothing;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b6.bodega_id, 'FABRICA_' || replace(m, ' ', '_'), 'FABRICA', m, null, null, null, true
  from public.ubicaciones b6
 cross join (values ('SORTING L2'), ('SORTING L4'), ('SORTING L6'), ('PATIO 1'), ('PATIO 2')) as v(m)
 where b6.clave = 'BAHIA_6'
on conflict (bodega_id, clave) do nothing;

-- Limpieza del módulo junto de la versión anterior.
do $$
begin
  begin
    delete from public.ubicaciones where calle = 'FABRICA' and modulo = 'SORTING L2-L4-L6';
  exception when foreign_key_violation then
    update public.ubicaciones set activa = false where calle = 'FABRICA' and modulo = 'SORTING L2-L4-L6';
  end;
end $$;

insert into public.inv_lineas (clave, nombre, orden, activa)
values ('L5', 'Línea 5', 5, true)
on conflict (clave) do nothing;

commit;
-- LISTO · bahías 1 a 6, fábrica (sorting L2, L4, L6, patio 1 y patio 2) y línea 5
