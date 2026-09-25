-- =====================================================================
-- EL TEMA DE ENTRADA PASA A SER «GRIS CLARO Y ÁMBAR»
--
-- Requiere: supabase/01-perfil.sql
--
-- Hasta hoy, quien entraba sin haber escogido nada veía el azul marino
-- y rojo. El tema de la casa pasa a ser el gris claro con ámbar: barra
-- clara con puntos, filo ámbar, el menú de la izquierda sigue oscuro.
--
-- No se borra ningún tema: los siete siguen ahí y cada quien puede
-- cambiarse el suyo en Perfil cuando quiera. Lo único que cambia es CON
-- CUÁL SE ENTRA.
--
-- SE PUEDE CORRER DOS VECES SIN DESHACERLE EL TEMA A NADIE, y eso hay
-- que cuidarlo: la segunda corrida no puede volver a arrastrar a gris a
-- quien, después de la primera, escogió Oficial a propósito. Por eso el
-- arrastre se hace UNA sola vez, y lo que dice si ya se hizo es el
-- propio valor por defecto de la columna: si todavía dice 'oficial', es
-- que esto no ha corrido.
-- =====================================================================

-- EL ORDEN NO ES CAPRICHO: PRIMERO EL DEFECTO, DESPUÉS EL ARRASTRE.
-- Al revés, Postgres rechaza el ALTER con «cannot ALTER TABLE
-- "perfiles" because it has pending trigger events»: el update de la
-- misma transacción deja disparadores pendientes sobre la tabla y el
-- ALTER no puede pasar por encima de ellos. Con el ALTER de primero no
-- hay nada pendiente todavía.
do $$
declare v_def text; v_n int;
begin
  select column_default into v_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'perfiles' and column_name = 'tema';

  execute 'alter table public.perfiles alter column tema set default ''gris''';

  if v_def is null or v_def like '%oficial%' then
    /* Todos los que están en 'oficial' están ahí porque nunca tocaron
       nada — hasta este momento no había forma de escogerlo queriendo y
       que se notara la diferencia. */
    update public.perfiles set tema = 'gris' where tema = 'oficial';
    get diagnostics v_n = row_count;
    raise notice 'perfiles que pasaron a gris: %', v_n;
  else
    raise notice 'ya estaba puesto: no se le toca el tema a nadie';
  end if;
end $$;

do $$
declare v_def text;
begin
  select column_default into v_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'perfiles' and column_name = 'tema';
  if v_def is null or v_def not like '%gris%' then
    raise exception 'FALTÓ: el tema por defecto quedó en %', v_def;
  end if;
  raise notice 'Listo: se entra en gris claro y ámbar.';
end $$;
