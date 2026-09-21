\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- FACTURACIÓN DE TRASPASOS — lo que se comprueba y por qué
--
--   · LO DE ANTES SE TRAE: el número de SAP que el patio escribía pasa a
--     facturación, marcado histórico; el vacío no; un día cerrado tampoco
--     frena la migración.
--   · SOLO FACTURACIÓN CONFIRMA; el patio no.
--   · EL NÚMERO: solo cifras, diez como máximo, sin repetir, y el
--     repetido dice en qué viaje está.
--   · UN VIAJE SALE UNA VEZ; un vacío o un anulado no salen.
--   · UN VIAJE DE AYER SE CONFIRMA aunque el día esté cerrado — y el
--     candado del día sigue cerrando todo lo demás.
--   · LO QUE SALIÓ NO SE TOCA EN EL PATIO, ni siquiera el administrador,
--     hasta que se reabre.
--   · REABRIR: solo el administrador, con motivo, y deja como antes.
--   · EL RASTRO: confirmar y reabrir quedan en las ediciones.
--   · EL CRUCE CON SAP VA CONTRA EL NÚMERO DE FACTURACIÓN, no contra la
--     orden de cargue.
-- =====================================================================

do $prueba$
declare
  v_falla text := '';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  FAC  constant text := '55555555-5555-5555-5555-555555555555';
  v_hoy date := public.traspaso_hoy();
  v_old uuid; v_cerrado uuid; v_vacio uuid; v_nuevo uuid; v_ayer uuid; v_sap uuid; v_anul uuid;
  v_n int; t text; r record;
begin
  /* ---- 0 · LO DE ANTES ---- */
  select id into v_old     from public.traspasos_viajes where placa = 'OLD111';
  select id into v_cerrado from public.traspasos_viajes where placa = 'OLD222';
  select id into v_vacio   from public.traspasos_viajes where vacio limit 1;

  select * into r from public.v_traspasos_viajes where id = v_old;
  if r.factura_documento is distinct from '7687000001' or not r.salida_historica or r.salida_en is null then
    v_falla := v_falla || ' 0(el número de SAP de antes no pasó a facturación como histórico)'; end if;
  if r.por_facturar then v_falla := v_falla || ' 0b(un viaje de antes quedó por facturar)'; end if;
  if (select salida_en from public.traspasos_viajes where id = v_cerrado) is null then
    v_falla := v_falla || ' 0c(el viaje de un día cerrado no se trajo: el candado frenó la migración)'; end if;
  if (select salida_en from public.traspasos_viajes where id = v_vacio) is not null then
    v_falla := v_falla || ' 0d(un vacío quedó como salido: no lleva documento)'; end if;
  if (select por_facturar from public.v_traspasos_viajes where id = v_vacio) then
    v_falla := v_falla || ' 0e(un vacío salió por facturar)'; end if;

  /* ---- VIAJES NUEVOS, registrados por el supervisor con orden de cargue ---- */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  select id into v_nuevo from public.traspaso_registrar(v_hoy, 'B', 'pet', 'NEW111', 'ag01', 'planta', 1,
    false, 30, null, null, '5000000001');
  select id into v_sap from public.traspaso_registrar(v_hoy, 'B', 'pet', 'NEW222', 'ag01', 'planta', 1,
    false, 30, null, null, '5000000002');
  select id into v_anul from public.traspaso_registrar(v_hoy, 'B', 'pet', 'NEW333', 'ag01', 'planta', 1,
    false, 30, null, null, '5000000003');
  perform public.traspaso_anular_viaje(v_anul, 'Se registró dos veces');
  reset role;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select id into v_ayer from public.traspaso_registrar(v_hoy - 3, 'C', 'pet', 'AYE111', 'ag01', 'planta', 1,
    false, 30, null, null, '5000000004');
  reset role;

  if not (select por_facturar from public.v_traspasos_viajes where id = v_nuevo) then
    v_falla := v_falla || ' 1(un viaje nuevo con carga no sale por facturar)'; end if;

  /* ---- 2 · EL PATIO NO CONFIRMA ---- */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '8000000001');
    v_falla := v_falla || ' 2(el supervisor del patio confirmó una salida)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* ---- 3 · EL NÚMERO ---- */
  perform set_config('request.jwt.claim.sub', FAC, true);
  set local role probador;
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '80A0001');
    v_falla := v_falla || ' 3(aceptó un número con letras)';
  exception when others then
    if sqlerrm not like '%en cifras%' then v_falla := v_falla || ' 3b(letras: ' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '12345678901');
    v_falla := v_falla || ' 3c(aceptó un número de once cifras)';
  exception when others then
    if sqlerrm not like '%diez como máximo%' then v_falla := v_falla || ' 3d(once: ' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '   ');
    v_falla := v_falla || ' 3e(confirmó sin número)';
  exception when others then
    if sqlerrm not like 'Falta el número%' then v_falla := v_falla || ' 3f(vacío: ' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '7687-000001');
    v_falla := v_falla || ' 4(aceptó un número que ya está en otro viaje)';
  exception when others then
    if sqlerrm not like '%ya está en el viaje%OLD111%' then
      v_falla := v_falla || ' 4b(el repetido no dice en qué viaje está: ' || sqlerrm || ')'; end if;
  end;

  /* ---- 5 · CONFIRMA ---- */
  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '8000000001');
  exception when others then
    v_falla := v_falla || ' 5(facturación no pudo confirmar: ' || sqlerrm || ')';
  end;
  select * into r from public.v_traspasos_viajes where id = v_nuevo;
  if r.factura_documento is distinct from '8000000001' or r.salida_en is null
     or r.salida_nombre is distinct from 'Fanny Factura' or r.salida_historica or r.por_facturar then
    v_falla := v_falla || ' 5b(la salida no quedó con número, hora y quién: ' || coalesce(r.factura_documento,'∅') || ' · ' || coalesce(r.salida_nombre,'∅') || ' · ' || r.salida_historica || ' · ' || r.por_facturar || ')'; end if;
  if r.documento is distinct from '5000000001' then
    v_falla := v_falla || ' 5c(confirmar le cambió la orden de cargue)'; end if;

  begin
    perform public.traspaso_confirmar_salida(v_nuevo, '8000000099');
    v_falla := v_falla || ' 6(un viaje salió dos veces)';
  exception when others then
    if sqlerrm not like '%ya salió%' then v_falla := v_falla || ' 6b(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_confirmar_salida(v_vacio, '8000000098');
    v_falla := v_falla || ' 7(un vacío salió con documento)';
  exception when others then null;
  end;
  begin
    perform public.traspaso_confirmar_salida(v_anul, '8000000097');
    v_falla := v_falla || ' 7b(un viaje anulado salió)';
  exception when others then null;
  end;

  /* ---- 8 · EL DE UN DÍA CERRADO SE CONFIRMA ---- */
  begin
    perform public.traspaso_confirmar_salida(v_ayer, '8000000004');
  exception when others then
    v_falla := v_falla || ' 8(no se pudo confirmar un viaje de un día cerrado: ' || sqlerrm || ')';
  end;
  reset role;

  /* ...y el candado del día sigue cerrando lo demás. */
  update public.traspasos_viajes set salida_en = null, factura_documento = null where id = v_ayer;
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    perform public.traspaso_anular_viaje(v_ayer, 'Prueba del candado');
  exception when others then null;
  end;
  reset role;
  if (select estado::text from public.traspasos_viajes where id = v_ayer) <> 'registrado' then
    v_falla := v_falla || ' 8b(el candado del día dejó anular un viaje de un día cerrado)'; end if;

  /* ---- 9 · LO QUE SALIÓ NO SE TOCA ---- */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    perform public.traspaso_anular_viaje(v_nuevo, 'Quiero anularlo');
    v_falla := v_falla || ' 9(el patio anuló un viaje que ya salió)';
  exception when others then
    if sqlerrm not like '%ya salió%' then v_falla := v_falla || ' 9b(' || sqlerrm || ')'; end if;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    perform public.traspaso_anular_viaje(v_nuevo, 'Quiero anularlo');
    v_falla := v_falla || ' 9c(el administrador anuló un viaje que ya salió sin reabrirlo)';
  exception when others then
    if sqlerrm not like '%ya salió%' then v_falla := v_falla || ' 9d(' || sqlerrm || ')'; end if;
  end;
  reset role;

  /* ---- 10 · REABRIR ---- */
  perform set_config('request.jwt.claim.sub', FAC, true);
  set local role probador;
  begin
    perform public.traspaso_reabrir_salida(v_nuevo, 'Me equivoqué de número');
    v_falla := v_falla || ' 10(facturación reabrió una salida: solo el administrador)';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    perform public.traspaso_reabrir_salida(v_nuevo, 'no');
    v_falla := v_falla || ' 10b(se reabrió sin motivo)';
  exception when others then null;
  end;
  begin
    perform public.traspaso_reabrir_salida(v_nuevo, 'Placa equivocada en el patio');
  exception when others then
    v_falla := v_falla || ' 10c(el administrador no pudo reabrir: ' || sqlerrm || ')';
  end;
  reset role;
  select * into r from public.v_traspasos_viajes where id = v_nuevo;
  if r.salida_en is not null or r.factura_documento is not null or not r.por_facturar then
    v_falla := v_falla || ' 10d(reabrir no lo dejó por facturar otra vez)'; end if;
  select count(*) into v_n from public.traspasos_viajes_ediciones where viaje = v_nuevo;
  if v_n < 2 then v_falla := v_falla || ' 11(confirmar y reabrir no quedaron en el rastro: hay ' || v_n || ')'; end if;
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    perform public.traspaso_anular_viaje(v_nuevo, 'Ahora sí, reabierto');
  exception when others then
    v_falla := v_falla || ' 10e(reabierto, el patio sigue sin poder tocarlo: ' || sqlerrm || ')';
  end;
  reset role;

  /* ---- 12 · EL CRUCE, CONTRA EL NÚMERO DE FACTURACIÓN ---- */
  perform set_config('request.jwt.claim.sub', FAC, true);
  set local role probador;
  perform public.traspaso_confirmar_salida(v_sap, '8000000002');
  reset role;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  perform public.traspaso_sap_importar(jsonb_build_array(
    jsonb_build_object('referencia','8000000002','fecha',v_hoy::text,'hora','10:00:00','cantidad','-30','descripcion','PET'),
    /* LA ORDEN DE CARGUE DE OTRO VIAJE, en SAP: no tiene que emparejar. */
    jsonb_build_object('referencia','5000000004','fecha',v_hoy::text,'hora','11:00:00','cantidad','-30','descripcion','PET'),
    /* LA ORDEN DE CARGUE DEL MISMO VIAJE que ya tiene su número: tampoco. */
    jsonb_build_object('referencia','5000000002','fecha',v_hoy::text,'hora','12:00:00','cantidad','-30','descripcion','PET')));
  reset role;
  if not exists (select 1 from public.v_traspasos_cruce where documento = '8000000002' and estado = 'cuadra') then
    v_falla := v_falla || ' 12(el número de facturación no cuadra con SAP)'; end if;
  if exists (select 1 from public.v_traspasos_cruce
              where documento in ('5000000004', '5000000002') and estado <> 'falta') then
    v_falla := v_falla || ' 12b(el cruce emparejó por la orden de cargue y no por el número de facturación)'; end if;
  /* 8000000002 lo tiene un viaje; las dos órdenes de cargue no son números de SAP de nadie. */
  if (select sin_registrar from public.v_traspasos_sap_importaciones order by cuando desc limit 1) <> 2 then
    v_falla := v_falla || ' 12c(las importaciones no cuentan los sin facturar contra el número de facturación)'; end if;

  if v_falla <> '' then raise exception 'FACTURACION:%', v_falla; end if;
  raise notice 'FACTURACION ok';
end $prueba$;

do $fin$ begin raise notice 'FACTURACIÓN CONFIRMA LA SALIDA Y EL CRUCE VA CONTRA SU NÚMERO: todo en orden'; end $fin$;
