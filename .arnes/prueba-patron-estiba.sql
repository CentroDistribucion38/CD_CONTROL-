-- =====================================================================
-- EL PATRÓN DE ESTIBA — lo que la migración tiene que dejar cierto.
--
-- La base de prueba trae CUATRO materiales (los que siembra el .sh), así
-- que lo que se comprueba no es «se sembraron 123» —eso depende de qué
-- maestro tenga cada base— sino: los que están, quedaron con el patrón
-- del archivo; el patrón cuadra con el factor de estiba; un cero no
-- entra; y volver a correr no pisa lo corregido a mano.
-- =====================================================================
do $prueba$
declare n int; v record;
begin
  -- 1 · LAS TRES COLUMNAS EXISTEN
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='productos'
     and column_name in ('pat_largo','pat_ancho','pat_nivel');
  if n <> 3 then raise exception 'FALLA: faltan columnas del patron (hay %)', n; end if;

  -- 2 · NO SE PUEDE METER UN CERO. Un cero daría cero cajas por estiba
  --     y eso se imprimiría en el papel pegado a la estiba.
  begin
    insert into public.productos (sku, nombre, pat_largo, pat_ancho, pat_nivel)
    values ('ZZZ-CERO', 'prueba', 0, 3, 5);
    raise exception 'FALLA: dejo guardar un patron con un cero';
  exception when check_violation then null;
  end;

  -- 3 · LOS CUATRO QUE ESTÁN EN LA BASE QUEDARON SEMBRADOS
  select count(*) into n from public.productos where pat_largo is not null;
  raise notice '  · materiales con patron: %', n;
  if n <> 4 then raise exception 'FALLA: quedaron % materiales con patron y son 4', n; end if;

  -- 4 · Y CON EL PATRÓN DEL ARCHIVO, uno por uno. El 2154 va 3×5×5 = 75
  --     y los otros tres 3×3×5 = 45: son los números del maestro.
  for v in select * from (values
      ('2154', 3, 5, 5), ('2182', 3, 3, 5), ('3128', 3, 3, 5), ('9845', 3, 3, 5)
    ) as e(sku, l, a, nv)
  loop
    if not exists (select 1 from public.productos p
                    where p.sku = v.sku and p.pat_largo = v.l
                      and p.pat_ancho = v.a and p.pat_nivel = v.nv) then
      raise exception 'FALLA: el % no quedo %x%x%', v.sku, v.l, v.a, v.nv;
    end if;
  end loop;
  raise notice '  · 2154 = 3x5x5 = 75 cajas; 2182, 3128 y 9845 = 3x3x5 = 45 ✓';

  -- 5 · EL PATRÓN CUADRA CON EL FACTOR DE ESTIBA. Es la comprobación que
  --     de verdad importa: si no cuadra, la tarjeta imprime unas cajas
  --     por estiba y la pantalla cuenta con otras.
  select count(*) into n from public.productos
   where pat_largo is not null and cajas_por_estiba is not null
     and pat_largo * pat_ancho * pat_nivel <> cajas_por_estiba;
  if n > 0 then raise exception 'FALLA: % materiales con el patron peleado con el factor', n; end if;
  raise notice '  · ninguno peleado con el factor de estiba ✓';

  -- 6 · Y EL DESACUERDO SE VE CUANDO LO HAY. Si esta consulta no cazara
  --     nada nunca, la de arriba estaría pasando por no mirar.
  update public.productos set cajas_por_estiba = 99 where sku = '2154';
  select count(*) into n from public.productos
   where pat_largo is not null and cajas_por_estiba is not null
     and pat_largo * pat_ancho * pat_nivel <> cajas_por_estiba;
  if n <> 1 then raise exception 'FALLA: con un factor cambiado a mano el desacuerdo no se ve (%)', n; end if;
  update public.productos set cajas_por_estiba = 75 where sku = '2154';
  raise notice '  · el aviso de desacuerdo suena cuando hay desacuerdo ✓';

  -- 7 · LO PUESTO A MANO NO SE PISA AL VOLVER A CORRER (lo comprueba el .sh)
  update public.productos set pat_largo=9, pat_ancho=9, pat_nivel=9 where sku='2154';
  raise notice '  · (2154 queda en 9x9x9 para probar la segunda corrida)';
end $prueba$;
