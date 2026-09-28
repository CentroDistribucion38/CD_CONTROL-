-- =====================================================================
-- EL ENVASE QUE EL ARCHIVO DE PRECIOS NOMBRA Y EL MAESTRO NO TIENE
--
-- 2026-09-roturas-precios.sql se para en seco si algun codigo de la
-- lista no esta en el maestro, y esta bien que se pare: un codigo que
-- falta deja sin la parte del envase a todos los productos que lo
-- senalan, y eso son cobros cortos que nadie nota. Al correrlo salio
-- uno solo:
--
--     412375   Envase Flint 210NR Coronita    $ 390,30
--
-- Este archivo lo da de alta y nada mas. Va ANTES del de precios.
--
-- ---------------------------------------------------------------------
-- DE DONDE SALE CADA DATO, para que nadie tenga que confiar:
--
--   sku            412375                        del archivo MM60
--   nombre         Envase Flint 210NR Coronita   del archivo MM60
--   tipo_material  ENVASE                        esta en el bloque ENVASE
--   color_vidrio   flint                         lo dice el nombre
--   en_sitio       false                         lo enciende el de precios
--
-- EL COLOR ES LO UNICO QUE NO VIENE EN UNA COLUMNA: se lee del nombre.
-- Se pone porque sin color un envase no llega a Quiebra en sitio --la
-- restriccion roturas_mat_color lo exige-- y ahi se quedaria fuera sin
-- que nadie se entere. Si esta mal, se corrige en Inventario -> Maestro
-- y este archivo no hay que volver a correrlo.
--
-- NO SE TOCA SI YA EXISTE. Se puede correr varias veces.
-- =====================================================================

do $bloque$
declare v_n int; v_hay boolean;
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla public.productos: corre antes las migraciones de inventario.';
  end if;

  select exists (select 1 from public.productos where sku = '412375') into v_hay;

  insert into public.productos (sku, nombre, tipo_material, color_vidrio, activo, en_sitio)
  values ('412375', 'Envase Flint 210NR Coronita', 'ENVASE', 'flint', true, false)
  on conflict (sku) do nothing;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    raise notice 'Se dio de alta 412375 Envase Flint 210NR Coronita (ENVASE, vidrio flint). Revisalo en Inventario -> Maestro.';
  elsif v_hay then
    raise notice '412375 ya estaba en el maestro: no se toco nada.';
  end if;

  -- Y SI FALTA ALGUN OTRO, SE DICE AHORA Y NO EN LA MITAD DEL SIGUIENTE
  -- ARCHIVO. Son los 45 codigos del MM60.
  select count(*) into v_n from (values
    ('2182'),('2511'),('2512'),('3128'),('3583'),('3617'),('3659'),('3664'),('3751'),
    ('3759'),('3787'),('9139'),('9150'),('9480'),('9482'),('9494'),('9508'),('9798'),
    ('9845'),('9856'),('13451'),('14779'),('15781'),('20050'),('20463'),('20546'),
    ('20867'),('20877'),('21156'),('22613'),('23204'),('23224'),
    ('3500005'),('3500162'),('3500213'),('3500373'),('3500383'),('3500446'),('3500887'),
    ('3500888'),('3501225'),('3501226'),('3501430'),('3501539'),('412375')
  ) as l(sku)
  where not exists (select 1 from public.productos p where p.sku = l.sku);

  if v_n > 0 then
    raise warning 'Todavia faltan % codigos del archivo de precios en el maestro. Para verlos, corre la consulta que va al final de este archivo.', v_n;
  else
    raise notice 'Los 45 codigos del archivo de precios estan en el maestro: ya se puede correr 2026-09-roturas-precios.sql.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- PARA VER CUALES FALTAN, SI FALTARA ALGUNO
--
--   select l.sku
--     from (values
--       ('2182'),('2511'),('2512'),('3128'),('3583'),('3617'),('3659'),('3664'),('3751'),
--       ('3759'),('3787'),('9139'),('9150'),('9480'),('9482'),('9494'),('9508'),('9798'),
--       ('9845'),('9856'),('13451'),('14779'),('15781'),('20050'),('20463'),('20546'),
--       ('20867'),('20877'),('21156'),('22613'),('23204'),('23224'),
--       ('3500005'),('3500162'),('3500213'),('3500373'),('3500383'),('3500446'),('3500887'),
--       ('3500888'),('3501225'),('3501226'),('3501430'),('3501539'),('412375')
--     ) as l(sku)
--    where not exists (select 1 from public.productos p where p.sku = l.sku);
-- ---------------------------------------------------------------------
