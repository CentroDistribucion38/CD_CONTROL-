-- =====================================================================
-- INVENTARIO · FÁBRICA · MÓDULOS P1_01…P1_30 Y P2_01…P2_30 (60 UBICACIONES)
--
-- En la calle FABRICA se agregan 60 sitios: «P1_01» … «P1_30» y «P2_01» … «P2_30».
-- Sin lado ni capacidad (cada uno es una sola posición). Quedan en la misma bodega de la calle FABRICA y
-- no se toca ninguno que ya exista. Entran solas a la regla de estado de fábrica (clave FABRICA_…).
--
-- Si ya habías corrido la versión anterior (nombres «PATIO 1-01»…), esas se RENOMBRAN a P1_01…
-- en vez de quedar duplicadas.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- 1 · Renombrar las de la versión anterior (PATIO 1-01 → P1_01), si existen.
update public.ubicaciones u
   set modulo = 'P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2),
       clave  = 'FABRICA_P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2)
 where u.calle = 'FABRICA' and u.modulo ~ '^PATIO [12]-\d\d$'
   and not exists (select 1 from public.ubicaciones x
                    where x.bodega_id = u.bodega_id
                      and x.clave = 'FABRICA_P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2));

-- 2 · Crear las que falten.
insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b.bodega_id,
       'FABRICA_P' || p || '_' || lpad(n::text, 2, '0'),
       'FABRICA', 'P' || p || '_' || lpad(n::text, 2, '0'), null, null, null, true
  from (select bodega_id from public.ubicaciones where calle = 'FABRICA' limit 1) b
 cross join generate_series(1, 2) as p
 cross join generate_series(1, 30) as n
on conflict (bodega_id, clave) do nothing;

do $$
declare v int;
begin
  select count(*) into v from public.ubicaciones where calle = 'FABRICA' and modulo ~ '^P[12]_\d\d$';
  if v < 60 then
    raise exception 'Esperaba 60 módulos (P1_01…P2_30) y hay %: ¿existe ya la calle FABRICA en el maestro de ubicaciones?', v;
  end if;
  raise notice 'OK · % módulos P1_/P2_ en FABRICA', v;
end $$;

commit;
-- LISTO · P1_01…P1_30 y P2_01…P2_30 en FABRICA
