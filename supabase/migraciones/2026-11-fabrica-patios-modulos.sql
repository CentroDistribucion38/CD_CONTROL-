-- =====================================================================
-- INVENTARIO · FÁBRICA · PATIO 1 Y PATIO 2 CON MÓDULOS DEL 01 AL 30
--
-- «En las ubicaciones de fábrica en patio 1 y patio 2 agrega los módulos del 1 al 30.»
--
-- En la calle FABRICA se agregan 60 sitios: «PATIO 1-01» … «PATIO 1-30» y «PATIO 2-01» … «PATIO 2-30».
-- Sin lado ni capacidad (cada uno es una sola posición, como SORTING L2). Quedan en la misma bodega que
-- ya tienen PATIO 1 y PATIO 2, y no se toca ninguno que ya exista. Las ubicaciones «PATIO 1» y «PATIO 2»
-- generales se quedan como están. Entran solas a la regla de estado de fábrica (clave FABRICA_…).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b.bodega_id,
       'FABRICA_PATIO_' || p || '_' || lpad(n::text, 2, '0'),
       'FABRICA', 'PATIO ' || p || '-' || lpad(n::text, 2, '0'), null, null, null, true
  from (select bodega_id from public.ubicaciones where calle = 'FABRICA' order by (modulo = 'PATIO 1') desc limit 1) b
 cross join generate_series(1, 2) as p
 cross join generate_series(1, 30) as n
on conflict (bodega_id, clave) do nothing;

do $$
declare v int;
begin
  select count(*) into v from public.ubicaciones where calle = 'FABRICA' and modulo ~ '^PATIO [12]-\d\d$';
  if v < 60 then
    raise exception 'Esperaba 60 módulos de patio y hay %: ¿existe ya la calle FABRICA en el maestro de ubicaciones?', v;
  end if;
  raise notice 'OK · % módulos de patio en FABRICA', v;
end $$;

commit;
-- LISTO · PATIO 1-01…30 y PATIO 2-01…30 en FABRICA
