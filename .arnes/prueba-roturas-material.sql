\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- «ESE MATERIAL NO EXISTE O ESTÁ DESACTIVADO»
--
-- LO QUE PASABA: el desplegable lee el maestro de INVENTARIO
-- (`v_roturas_materiales_maestro` → `productos`) y la base comprobaba
-- contra `roturas_materiales`, la tabla vieja del módulo. Escoger
-- cualquier producto del maestro daba ese error, de pie en la bodega y
-- con la estiba rota al lado.
--
--  1. QUE UN MATERIAL DEL MAESTRO DE INVENTARIO SIGA SIENDO RECHAZADO.
--  2. QUE SE PRENDA SOLO UNO QUE ALGUIEN APAGÓ a propósito: apagarlo
--     fue una decisión, y deshacerla por la puerta de atrás la anula en
--     silencio.
--  3. QUE EL ERROR NO DIGA CUÁL DE LAS DOS COSAS PASA. Se arreglan en
--     sitios distintos.
--  4. QUE UNO QUE NO ESTÁ EN NINGÚN MAESTRO pase.
--  5. QUE UN ENVASE SIN COLOR DE VIDRIO TUMBE EL ARCHIVO ENTERO, o que
--     se copie con un color inventado.
--
--     ESTA LA ENCONTRÓ ÉL CORRIENDO EL SQL, no yo. La restricción
--     `roturas_mat_color` exige color a los EER; la vi al escribir las
--     mutaciones y NO la contemplé en la copia masiva, así que el
--     archivo reventaba con «ENVASE MARRON 330NR CERVEZAS» —un envase
--     real de su maestro sin color puesto—. Queda probada para que no
--     vuelva a pasar.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local')
on conflict do nothing;

do $prueba$
declare
  ROOT constant text := '44444444-4444-4444-4444-444444444444';
  v_falla text := ''; v_id uuid; v_n int; v_txt text;
begin
  insert into public.roles (clave, nombre, manda) values ('mando_general','Mando', true)
  on conflict (clave) do update set manda = true;
  update public.perfiles set rol = 'mando_general', activo = true where id = ROOT::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', ROOT)::text, true);

  -- UN PRODUCTO QUE SOLO ESTÁ EN EL MAESTRO DE INVENTARIO: es el caso
  -- exacto que reventaba.
  insert into public.productos (sku, nombre, activo, tipo_material, unidades_x_caja)
  values ('SKU-NUEVO-1','Aguila Lta 355Cc X 24', true, 'PRODUCTO', 24)
  on conflict (sku) do update set activo = true;
  delete from public.roturas_materiales where clave = 'SKU-NUEVO-1';

  -- Y UNO APAGADO A PROPÓSITO en el maestro de Roturas.
  insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, activo)
  values ('APAGADO','Envase apagado','eer','ambar', 30, false)
  on conflict (clave) do update set activo = false;

  insert into public.roturas_procesos (clave, nombre, activo) values ('cargue','Cargue', true)
  on conflict (clave) do update set activo = true;
  insert into public.roturas_areas (clave, nombre, activo) values ('bodega','Bodega', true)
  on conflict (clave) do update set activo = true;
  insert into public.roturas_causas (clave, nombre, grupo, exige_foto, activo)
  values ('pallet','Falla del pallet DEPA','no_asumida', false, true)
  on conflict (clave) do update set activo = true;

  -- ===================================================================
  -- 1. UN MATERIAL DEL MAESTRO DE INVENTARIO SE PUEDE REGISTRAR
  -- ===================================================================
  begin
    select id into v_id from public.rotura_registrar(
      'SKU-NUEVO-1', 3, null, null, 'cargue', 'pallet', 'Se cayó del montacargas',
      null, null, null, 'bodega', null);
    if v_id is null then
      v_falla := v_falla || E'\n · no se registró la rotura con un material del maestro de Inventario';
    end if;
  exception when others then
    v_falla := v_falla || E'\n · un material del maestro de Inventario SIGUE siendo rechazado: ' || sqlerrm;
  end;

  -- Y QUEDÓ COPIADO EN EL MAESTRO DE ROTURAS, que es lo que sostiene la
  -- llave foránea del histórico.
  select count(*) into v_n from public.roturas_materiales where clave = 'SKU-NUEVO-1';
  if v_n <> 1 then
    v_falla := v_falla || E'\n · el material no quedó copiado en el maestro de Roturas';
  end if;
  select tipo::text into v_txt from public.roturas_materiales where clave = 'SKU-NUEVO-1';
  if v_txt is distinct from 'producto_terminado' then
    v_falla := v_falla || E'\n · se copió con el tipo equivocado: «' || coalesce(v_txt,'(nulo)') || '»';
  end if;

  -- ===================================================================
  -- 2 y 3. EL APAGADO NO SE PRENDE SOLO, Y SE DICE QUE ESTÁ APAGADO
  -- ===================================================================
  begin
    perform public.rotura_registrar('APAGADO', 3, null, null, 'cargue', 'pallet', null,
                                    null, null, null, 'bodega', null);
    v_falla := v_falla || E'\n · se registró con un material APAGADO a propósito';
  exception when others then
    if sqlerrm !~* 'apagado' then
      v_falla := v_falla || E'\n · el error no dice que el material está apagado: ' || sqlerrm;
    end if;
  end;
  select activo::text into v_txt from public.roturas_materiales where clave = 'APAGADO';
  if v_txt <> 'false' then
    v_falla := v_falla || E'\n · el material apagado se PRENDIÓ solo: eso anula en silencio lo que alguien decidió';
  end if;

  -- ===================================================================
  -- 4. UNO QUE NO ESTÁ EN NINGÚN MAESTRO
  -- ===================================================================
  begin
    perform public.rotura_registrar('NO-EXISTE-EN-NADA', 3, null, null, 'cargue', 'pallet', null,
                                    null, null, null, 'bodega', null);
    v_falla := v_falla || E'\n · se registró con un material que no está en ningún maestro';
  exception when others then
    if sqlerrm !~* 'Inventario' then
      v_falla := v_falla || E'\n · el error no dice dónde falta el material: ' || sqlerrm;
    end if;
  end;
  /* Y NO SE INVENTÓ LA FILA. Un material que no está en ningún maestro
     no puede aparecer en el de Roturas por el hecho de teclearlo: eso
     convertiría cada error de dedo en un material nuevo. */
  select count(*) into v_n from public.roturas_materiales where clave = 'NO-EXISTE-EN-NADA';
  if v_n <> 0 then
    v_falla := v_falla || E'\n · se inventó en el maestro un material que no está en ningún maestro';
  end if;

  -- ===================================================================
  -- 5. UN ENVASE SIN COLOR DE VIDRIO
  -- ===================================================================
  insert into public.productos (sku, nombre, activo, tipo_material, color_vidrio)
  values ('SKU-SIN-COLOR','ENVASE MARRON 330NR CERVEZAS', true, 'ENVASE', null)
  on conflict (sku) do update set activo = true, color_vidrio = null;
  delete from public.roturas_materiales where clave = 'SKU-SIN-COLOR';

  -- NO SE COPIA, Y NO SE INVENTA EL COLOR. Poner «ámbar» por defecto
  -- haría pasar el registro y ensuciaría el análisis de salida por
  -- color en silencio, que es peor que un error a la cara.
  begin
    perform public.rotura_material_asegurar('SKU-SIN-COLOR');
  exception when others then
    v_falla := v_falla || E'\n · copiar un envase sin color TUMBA la función: ' || sqlerrm;
  end;
  select count(*) into v_n from public.roturas_materiales where clave = 'SKU-SIN-COLOR';
  if v_n <> 0 then
    select coalesce(color::text, '(nulo)') into v_txt
      from public.roturas_materiales where clave = 'SKU-SIN-COLOR';
    v_falla := v_falla || E'\n · se copió un envase SIN color con el color «' || v_txt || '»';
  end if;

  -- Y AL REGISTRAR SE DICE QUÉ LE FALTA Y DÓNDE SE ARREGLA. «No está en
  -- el maestro» sería mentira: está, y lo único que le falta es un dato
  -- que se pone en Inventario.
  begin
    perform public.rotura_registrar('SKU-SIN-COLOR', 3, null, null, 'cargue', 'pallet', null,
                                    null, null, null, 'bodega', null);
    v_falla := v_falla || E'\n · se registró una rotura con un envase sin color de vidrio';
  exception when others then
    if sqlerrm !~* 'color del vidrio' then
      v_falla := v_falla || E'\n · el error no dice que al envase le falta el color: ' || sqlerrm;
    end if;
  end;

  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: Roturas — un material del maestro de Inventario ya se puede registrar y '
               'queda copiado en el maestro de Roturas, uno apagado NO se prende solo y el '
               'error dice cual de las tres cosas pasa, y un envase sin color de vidrio ni tumba '
               'el archivo ni se copia con un color inventado.';
exception when others then
  set role postgres;
  raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
end $prueba$;
