-- FÁBRICA · MÓDULOS P1_01…P1_30 Y P2_01…P2_30 (60 UBICACIONES)
-- Si ya existían las de la versión anterior (PATIO 1-01…), se RENOMBRAN. Se puede correr dos veces.
begin;

update public.ubicaciones u
   set modulo = 'P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2),
       clave  = 'FABRICA_P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2)
 where u.calle = 'FABRICA' and u.modulo ~ '^PATIO [12]-\d\d$'
   and not exists (select 1 from public.ubicaciones x
                    where x.bodega_id = u.bodega_id
                      and x.clave = 'FABRICA_P' || substr(u.modulo, 7, 1) || '_' || right(u.modulo, 2));

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
select 'OK · P1_01…P2_30 en FABRICA' as resultado;
