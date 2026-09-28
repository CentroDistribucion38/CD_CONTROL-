-- =====================================================================
-- EL COLOR DE LOS 13 ENVASES — lo que tiene que quedar cierto.
-- =====================================================================
do $prueba$
declare n int; v record;
begin
  -- 1 · LOS ONCE DEL NOMBRE QUEDARON CON SU COLOR
  select count(*) into n from public.productos
   where sku in ('3500162','3500373','3500446','3500888','3501226','3501539') and color_vidrio = 'ambar';
  if n <> 6 then raise exception 'FALLA: los marrones quedaron % de 6 en ambar', n; end if;
  select count(*) into n from public.productos
   where sku in ('3500213','3500383','3500887','3501225','412375') and color_vidrio = 'flint';
  if n <> 5 then raise exception 'FALLA: los flint quedaron % de 5', n; end if;
  raise notice '  · 6 marrones en ambar y 5 flint ✓';

  -- 2 · LOS DOS QUE EL NOMBRE NO DICE SIGUEN SIN COLOR. Inventarles uno
  --     los manda a la columna equivocada del analisis y nadie lo nota.
  select count(*) into n from public.productos
   where sku in ('3500005','3501430') and color_vidrio is not null;
  if n > 0 then raise exception 'FALLA: a % de los dos ambiguos se le invento un color', n; end if;
  raise notice '  · 3500005 y 3501430 siguen sin color, como debe ser ✓';

  -- 3 · Y AHORA SI SALEN EN EL DESPLEGABLE DE EER. Es la prueba de
  --     verdad: la pantalla no lee `productos`, lee la vista del
  --     maestro, y filtra por color.
  select count(*) into n from public.v_roturas_materiales_maestro
   where tipo = 'eer' and color = 'ambar';
  raise notice '  · envases ambar que ve la pantalla: %', n;
  if n < 6 then raise exception 'FALLA: la pantalla solo ve % envases ambar y son 6', n; end if;
  select count(*) into n from public.v_roturas_materiales_maestro
   where tipo = 'eer' and color = 'flint';
  if n < 5 then raise exception 'FALLA: la pantalla solo ve % envases flint y son 5', n; end if;

  -- 4 · NO SE PISA UN COLOR PUESTO A MANO
  update public.productos set color_vidrio = 'green' where sku = '3500162';
  raise notice '  · (se deja el 3500162 en green para probar que no lo pisa)';
end $prueba$;
