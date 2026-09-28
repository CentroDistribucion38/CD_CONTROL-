-- =====================================================================
-- EL COLOR DEL VIDRIO DE LOS 13 ENVASES
--
-- «porq no me deja ver los envases si son estos 13»
--
-- El desplegable de EER en Quiebra en sitio FILTRA POR COLOR, y el color
-- sale de productos.color_vidrio. Un envase sin color --o con el color
-- de otro-- no aparece en su lista y el registro se traba, sin que la
-- pantalla pueda decir mas que «no hay envase retornable ambar».
--
-- EL COLOR SE LEE DEL NOMBRE, que es lo unico que trae el MM60:
--
--     ...MARRON...   ->  ambar    (marron y ambar son el mismo vidrio)
--     ...FLINT...    ->  flint
--
-- ONCE DE LOS TRECE LO DICEN EN EL NOMBRE. Los otros dos los dijo
-- Cristian, y por eso ya estan aqui:
--
--     3500005   Envase Costenita 175R           ->  green
--     3501430   ENVASE COSTENA BACANA 320CC R   ->  green
--
-- Esos dos no llevan el vidrio en el nombre, asi que en la primera
-- version de este archivo se quedaron VACIOS a proposito: ponerles un
-- color a ojo los habria mandado a la columna equivocada del analisis
-- por color sin que nadie lo note. Ahora entran porque hay quien lo
-- sepa, no porque se haya adivinado -- que es la diferencia que
-- importa.
--
-- NO SE PISA UN COLOR YA PUESTO. Si alguien ya lo corrigio a mano, manda
-- lo suyo; lo que si se hace es AVISAR cuando el color guardado no
-- coincide con lo que dice el nombre, que es como se descubre un dedazo.
--
-- Se puede correr varias veces.
-- =====================================================================

do $bloque$
declare v_n int; v_falta text; v_pelea text;
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla public.productos: corre antes las migraciones de inventario.';
  end if;

  create temp table _color (sku text primary key, color text) on commit drop;
  insert into _color (sku, color) values
    ('3500162', 'ambar'),   -- Envase Marron 330R
    ('3500373', 'ambar'),   -- Envase Marron 750R
    ('3500446', 'ambar'),   -- Envase Marron Club Col 330R
    ('3500888', 'ambar'),   -- BOTELLA MARRON 1000CC
    ('3501226', 'ambar'),   -- BOTELLA MARRON 250 CC
    ('3501539', 'ambar'),   -- BOTELLA MARRON 850 ML R
    ('3500213', 'flint'),   -- Envase Flint 330R
    ('3500383', 'flint'),   -- Envase Flint 750R
    ('3500887', 'flint'),   -- BOTELLA FLINT 1000R
    ('3501225', 'flint'),   -- BOTELLA FLINT 250 CC
    ('412375',  'flint'),   -- Envase Flint 210NR Coronita
    /* LOS DOS DE LA FAMILIA COSTENA: el nombre no dice el vidrio y lo
       dijo Cristian. Van juntos porque son la misma botella. */
    ('3500005', 'green'),   -- Envase Costenita 175R
    ('3501430', 'green')    -- ENVASE COSTENA BACANA 320CC R
  ;

  -- 1 · SOLO LO QUE ESTA VACIO
  update public.productos p
     set color_vidrio = c.color
    from _color c
   where p.sku = c.sku and p.color_vidrio is null;
  get diagnostics v_n = row_count;
  raise notice 'Color puesto a % envases.', v_n;

  -- 2 · LO QUE NO CUADRA CON SU NOMBRE: se dice, no se pisa.
  select string_agg(p.sku || ' (guardado ' || p.color_vidrio || ', el nombre dice ' || c.color || ')', '; ')
    into v_pelea
    from public.productos p join _color c on c.sku = p.sku
   where p.color_vidrio is not null and p.color_vidrio <> c.color;
  if v_pelea is not null then
    raise warning 'Estos envases tienen un color distinto del que dice su nombre, y NO se tocaron: %', v_pelea;
  end if;

  -- 3 · LOS QUE SIGUEN SIN COLOR, de los trece.
  select string_agg(l.sku, ', ') into v_falta
    from (values
      ('3500005'),('3500162'),('3500213'),('3500373'),('3500383'),('3500446'),('3500887'),
      ('3500888'),('3501225'),('3501226'),('3501430'),('3501539'),('412375')
    ) as l(sku)
    join public.productos p on p.sku = l.sku
   where p.color_vidrio is null;
  if v_falta is not null then
    raise warning 'Sin color todavia: %. Son los que el nombre no dice; ponlos en Inventario -> Maestro.', v_falta;
  else
    raise notice 'Los trece envases ya tienen color: el desplegable de EER los va a mostrar.';
  end if;

  -- 4 · Y QUE NINGUNO SE QUEDE APAGADO. Un envase activo = false no sale
  --     en la vista del maestro, y desde la pantalla se ve igual que si
  --     no existiera.
  select count(*) into v_n from public.productos
   where sku in ('3500005','3500162','3500213','3500373','3500383','3500446','3500887',
                 '3500888','3501225','3501226','3501430','3501539','412375')
     and not activo;
  if v_n > 0 then
    raise warning 'Hay % de los trece envases APAGADOS (activo = false): no salen en ninguna lista.', v_n;
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 5. LA FOTO DE COMO QUEDARON LOS TRECE
--
-- Esta consulta SI devuelve filas en el panel de resultados de Supabase
-- (los `raise notice` de arriba van a los logs). Es lo que hay que
-- mirar despues de correr el archivo.
-- ---------------------------------------------------------------------
select p.sku, p.nombre, p.tipo_material, p.color_vidrio, p.activo, p.en_sitio
  from public.productos p
 where p.sku in ('3500005','3500162','3500213','3500373','3500383','3500446','3500887',
                 '3500888','3501225','3501226','3501430','3501539','412375')
 order by p.color_vidrio nulls first, p.sku;

-- ---------------------------------------------------------------------
-- SI ALGUNO QUEDO CON EL COLOR EQUIVOCADO
--
-- Este archivo solo rellena lo que esta VACIO, asi que para cambiar uno
-- ya puesto hay que decirlo a mano (o hacerlo en Inventario -> Maestro):
--
--   update public.productos set color_vidrio = 'green'   -- o 'ambar' / 'flint'
--    where sku in ('3500005', '3501430');
-- ---------------------------------------------------------------------
