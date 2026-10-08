-- =====================================================================
-- INVENTARIO · MAESTRO DE UBICACIONES: LA CALLE H, MÓDULOS 01 A 04
--
-- «En el maestro del conteo, calle, hay que crear la de la H y en módulo
--  1 - 2 - 3 - 4.»
--
-- Calle H con los módulos 01, 02, 03 y 04, cada uno con sus dos lados
-- (IZQ y DER) como el resto de las calles numeradas (A, B, C…): ocho
-- ubicaciones, H01_IZQ … H04_DER. Sin familia ni capacidad (se pueden
-- fijar después desde el Maestro). La clave sigue la forma de siempre
-- —calle + módulo + _lado—, la misma que genera Contar al anotar, así que
-- no se duplican.
--
-- No toca nada que ya exista (si alguna está, se deja como está y se
-- activa). Se crean en cada bodega que ya tenga ubicaciones.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b.bodega_id, 'H' || m || '_' || l, 'H', m, l, null, null, true
  from (select distinct bodega_id from public.ubicaciones) b
 cross join (values ('01'), ('02'), ('03'), ('04')) as v(m)
 cross join (values ('IZQ'), ('DER')) as w(l)
on conflict (bodega_id, clave) do update set activa = true;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.ubicaciones where calle = 'H' and modulo in ('01', '02', '03', '04') and activa;
  if v_n = 0 then raise exception 'No quedó ninguna: no hay bodega con ubicaciones cargadas.'; end if;
  raise notice 'LISTO · calle H, módulos 01 a 04, izquierdo y derecho (% filas).', v_n;
end $$;

commit;
