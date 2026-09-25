-- =====================================================================
-- UN VIAJE ANULADO NO ESTÁ ESPERANDO QUE NADIE CUENTE SU MUESTRA
--
-- «Pero no se quita.» El vehículo se anulaba y seguía saliendo en En
-- tránsito, porque salía por la lista de revisiones pendientes y esa
-- nunca preguntó en qué estado estaba el viaje.
--
-- Lo que se prueba aquí es la vista, que es donde vive la definición
-- de «pendiente»:
--
--   1. Uno marcado y sin revisar SÍ sale. Si no saliera, el arreglo
--      habría apagado la lista entera en vez de quitar los anulados, y
--      se perderían las revisiones que de verdad hacen falta.
--   2. Uno marcado, sin revisar y ANULADO no sale.
--   3. Devolverlo lo trae de vuelta. Anular se puede deshacer, y la
--      lista tiene que enterarse.
--   4. Uno ya revisado no sale, esté como esté: eso ya funcionaba y no
--      se puede haber roto de paso.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

do $prueba$
declare
  v_ok    int;
  v_placa text;
  v_id    uuid;
  v_otro  uuid;
  v_rev   uuid;
  v_falla text := '';
  v_n     int;
begin
  -- LOS DATOS DE PRUEBA SE CUELGAN DE UN ORIGEN Y UN SKU QUE EXISTAN.
  -- Inventar las claves haría fallar las llaves foráneas y el arnés
  -- diría «FALLA» por un dato de mentira mal armado, no por la vista.
  insert into public.sider_origenes (planta, cd_origen)
  values ('ZZPRUEBA', 'CD DE PRUEBA') on conflict (planta) do nothing;
  insert into public.sider_skus (sku, descripcion, clase)
  values ('ZZ-SKU-1', 'ENVASE DE PRUEBA', 'EER') on conflict (sku) do nothing;

  insert into public.sider_viajes (placa, planta, sku, estibas, estado, requiere_ai)
  values ('ZZA111', 'ZZPRUEBA', 'ZZ-SKU-1', 10, 'recibido', true)
  returning id into v_id;
  insert into public.sider_viajes (placa, planta, sku, estibas, estado, requiere_ai)
  values ('ZZB222', 'ZZPRUEBA', 'ZZ-SKU-1', 10, 'recibido', true)
  returning id into v_otro;
  insert into public.sider_viajes (placa, planta, sku, estibas, estado, requiere_ai)
  values ('ZZC333', 'ZZPRUEBA', 'ZZ-SKU-1', 10, 'recibido', true)
  returning id into v_rev;

  -- 1 · EL MARCADO Y SIN REVISAR SALE
  select count(*) into v_n from public.v_sider_ai_pendientes where viaje_id = v_id;
  if v_n <> 1 then
    v_falla := v_falla || E'\n   · un viaje marcado y sin revisar NO sale como pendiente: el '
      || 'arreglo apagó la lista en vez de quitar los anulados, y se pierden las revisiones '
      || 'que de verdad hacen falta';
  end if;

  -- 2 · EL ANULADO NO SALE
  -- EL MOTIVO VA JUNTO CON EL ESTADO, y no es un detalle del arnés: la
  -- tabla tiene `sider_viajes_anulado_con_motivo`, que impide dejar un
  -- anulado sin explicación. Anular a pelo aquí reventaba la prueba con
  -- un error de restricción que no tenía nada que ver con la vista.
  update public.sider_viajes
     set estado = 'anulado', motivo_anulacion = 'Prueba del arnés', anulado_en = now()
   where id = v_otro;
  select count(*) into v_n from public.v_sider_ai_pendientes where viaje_id = v_otro;
  if v_n <> 0 then
    v_falla := v_falla || E'\n   · un viaje ANULADO sigue saliendo como pendiente de revisión: '
      || 'en la pantalla de En tránsito se queda para siempre y el botón de Anular parece '
      || 'no hacer nada';
  end if;

  -- 3 · DEVOLVERLO LO TRAE DE VUELTA
  update public.sider_viajes
     set estado = 'recibido', motivo_anulacion = null, anulado_en = null
   where id = v_otro;
  select count(*) into v_n from public.v_sider_ai_pendientes where viaje_id = v_otro;
  if v_n <> 1 then
    v_falla := v_falla || E'\n   · al devolver un viaje anulado no vuelve a la lista de '
      || 'pendientes: anular se puede deshacer y la revisión sigue haciendo falta';
  end if;

  -- 4 · EL YA REVISADO NO SALE, Y ESO NO SE PUDO ROMPER DE PASO
  -- LA REVISIÓN LLEVA SUS DATOS OBLIGATORIOS. Insertarla pelada
  -- reventaba por `fecha` y el arnés acusaba a la vista de un fallo que
  -- era del dato de mentira.
  insert into public.sider_ai_revisiones
    (viaje_id, fecha, planta, placa, turno, canal, envase, recibidas, revisadas)
  values (v_rev, current_date, 'ZZPRUEBA', 'ZZC333', 'T1', 'socios', (select clave from public.sider_ai_envases limit 1), 100, 100);
  select count(*) into v_n from public.v_sider_ai_pendientes where viaje_id = v_rev;
  if v_n <> 0 then
    v_falla := v_falla || E'\n   · un viaje YA REVISADO sale como pendiente: el arreglo se '
      || 'llevó por delante el filtro que ya había';
  end if;

  -- Se limpia lo de mentira para no dejar basura en la base de pruebas.
  delete from public.sider_ai_revisiones where viaje_id = v_rev;
  delete from public.sider_viajes where id in (v_id, v_otro, v_rev);

  if v_falla <> '' then
    raise notice 'FALLA:%', v_falla;
  else
    raise notice 'BIEN: el anulado no sale como pendiente, el marcado sí, devolverlo lo trae de vuelta y el revisado sigue fuera.';
  end if;
end $prueba$;
