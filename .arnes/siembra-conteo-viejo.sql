\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- RENGLONES COMO ERAN ANTES DE LA FECHA DE FABRICACIÓN.
--
-- Se escriben DIRECTO en la tabla y no por `conteo_fefo_agregar`: esa
-- función ya despeja la fabricación sola, así que sembrar con ella daría
-- filas NUEVAS y la migración no tendría nada que convertir. Una
-- migración de datos que no encuentra datos pasa en verde sin haber
-- hecho nada, y eso es lo que hay que evitar.
--
-- En Postgres pelado `authenticated` no trae los privilegios que Supabase
-- da por defecto. Sin esto la prueba falla con «permission denied» y lo
-- que estaría midiendo es un agujero del banco de pruebas.
-- =====================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  v_bod uuid; v_con uuid; v_ubi uuid; v_ubi2 uuid;
  v_prod uuid; v_envase uuid; v_sinvida uuid;
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  select id into v_ubi from public.ubicaciones
   where bodega_id = v_bod and clave = 'E01_DER';
  /* OTRA UBICACIÓN PARA EL QUE YA TRAE FABRICACIÓN. La llave única del
     renglón es (conteo, producto, ubicación, vencimiento, avería, pnc):
     dos renglones del mismo material, en el mismo módulo y con el mismo
     vencimiento son el mismo renglón, y la base tiene razón en no
     dejarlos. Se siembra en otro módulo, que es lo que pasa de verdad. */
  select id into v_ubi2 from public.ubicaciones
   where bodega_id = v_bod and clave = 'E08_DER';

  /* 3128 · Aguila RN 330cc X 30 · vida útil 180 días, del maestro de
     verdad. Es el mismo material con el que se comprobó la cuenta hacia
     adelante: fabricado el 10/05/27 vence el 06/11/27. */
  select id into v_prod from public.productos where sku = '3128';
  if v_prod is null then raise exception 'Falta el maestro: no está el 3128'; end if;

  select id into v_envase from public.productos
   where tipo_material = 'ENVASE' and activo limit 1;

  /* UN MATERIAL SIN VIDA ÚTIL Y QUE NO ES ENVASE. No existe en el
     maestro —los 462 productos activos la tienen—, así que se fabrica
     uno para la prueba: es el caso que la migración NO puede convertir y
     que tiene que quedar dicho en voz alta en vez de en silencio. */
  insert into public.productos (sku, nombre, tipo_material, vida_util, activo, cajas_por_estiba)
  values ('ZZZ-SIN-VIDA', 'PRUEBA sin vida útil', 'PRODUCTO', null, true, 40)
  on conflict (sku) do update set vida_util = null, activo = true
  returning id into v_sinvida;

  insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en)
  values ('FEFO-VIEJO-01', v_bod, 'fefo', 'en_proceso',
          '11111111-1111-1111-1111-111111111111', now())
  on conflict (codigo) do update set estado = 'en_proceso'
  returning id into v_con;

  delete from public.conteo_lineas where conteo_id = v_con;

  /* 1. EL CASO NORMAL. Vencimiento tecleado, sin fabricación.
        06/11/27 menos 180 días tiene que dar 10/05/27. */
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, rotacion,
     venc_dia, venc_mes, venc_anio, cantidad_teorica)
  values (v_con, v_prod, v_ubi, 40, false, 6, 11, 27, 0);

  /* 1b. OTRO, con una resta que cruza el año hacia atrás: 01/03/27
         menos 180 días cae en 2026. Es donde un año de dos cifras mal
         armado se rompe, y por eso se prueba aparte. */
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, cajas, rotacion,
     venc_dia, venc_mes, venc_anio, cantidad_teorica)
  values (v_con, v_prod, v_ubi, 12, true, 1, 3, 27, 0);

  /* 2. VENCIMIENTO SIN VIDA ÚTIL: no hay con qué despejar. */
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, rotacion,
     venc_dia, venc_mes, venc_anio, cantidad_teorica)
  values (v_con, v_sinvida, v_ubi, 3, false, 20, 12, 27, 0);

  /* 3. ENVASE SIN NINGUNA FECHA: no le falta, es que no lleva. */
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, rotacion, cantidad_teorica)
  values (v_con, v_envase, v_ubi, 9, false, 0);

  /* 4. UNO QUE YA TRAE FABRICACIÓN, Y ADEMÁS NO CUADRA.
        Fabricado el 01/01/27, con vencimiento 06/11/27: 309 días, no
        180. No es un dato malo — es un renglón de cuando ese material
        tenía otra vida útil en el maestro, que es lo que pasa cuando
        alguien la corrige después de haber contado.

        ES EL CASO QUE MÁS IMPORTA DE ESTA SIEMBRA. La primera versión
        de la migración comprobaba la cuenta en TODOS los renglones, y
        con esta fila se habría negado a correr por una fila que ella no
        tocó. Un conteo es la foto de su día: ni se reescribe ni hace
        reventar una migración. */
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, rotacion,
     venc_dia, venc_mes, venc_anio, fab_dia, fab_mes, fab_anio, cantidad_teorica)
  values (v_con, v_prod, v_ubi2, 7, false, 6, 11, 27, 1, 1, 27, 0);

  raise notice 'Sembrados 5 renglones como eran antes.';
end $$;
