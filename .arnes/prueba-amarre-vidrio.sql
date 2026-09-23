\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL VIDRIO SE AMARRA AL REGISTRAR
--
-- «Que la cantidad se llene sola» y «que en facturación ya venga
--  resuelto».
--
-- Lo que puede romperse al mover el amarre del final al principio:
--   1. Una cédula ya cargada se sigue ofreciendo para otro viaje →
--      el mismo vidrio se carga dos veces.
--   2. La placa deja de comprobarse porque «la pantalla ya filtra».
--      Una pantalla es una sugerencia; una función es una regla.
--   3. Facturación vuelve a pedir contar las tolvas → el doble trabajo
--      que esto vino a quitar.
--   4. Se pierde la regla de las dos personas: quien pesó no da la
--      salida. Es la razón de ser de la cadena.
--   5. Anular el viaje deja el vidrio colgado de un viaje que ya no
--      existe, y no vuelve a aparecer en ninguna lista.
--   6. Reabrir la salida DESCARGA el camión. Reabrir es corregir un
--      documento, no descargar nada.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('77777777-7777-7777-7777-777777777777','fac@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('77777777-7777-7777-7777-777777777777','fac','Facturo','facturacion',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.roturas_tolvas (codigo, modelo, tara_kg, orden) values
  ('TOLVA-AM1','Tolva estándar',111,95), ('TOLVA-AM2','Tolva estándar',111,96)
on conflict (codigo) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo)
values ('CD38','CD38',true), ('PELDAR','Peldar',true)
on conflict (clave) do update set activo = true;

delete from public.traspasos_viajes where codigo in ('AM-1','AM-2','AM-3');
insert into public.traspasos_viajes
  (id, codigo, fecha, turno, tipo, placa, origen, destino, viajes, vacio, estado, registrado_por)
values
  ('cccccccc-0000-0000-0000-000000000001','AM-1', current_date,'A','casco_vidrio','AMA111','CD38','PELDAR',1,false,'registrado','11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002','AM-2', current_date,'A','casco_vidrio','AMA111','CD38','PELDAR',1,false,'registrado','11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000003','AM-3', current_date,'A','casco_vidrio','OTRA22','CD38','PELDAR',1,false,'registrado','11111111-1111-1111-1111-111111111111');

-- EL PESAJE, CERRADO: ahí nace la cédula.
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_id uuid; v_falla text := ''; n int;
begin
  select a.id into v_id from public.salida_abrir('AMA111') a;
  perform public.salida_pesar(v_id, 'TOLVA-AM1', 'ambar', 900);
  perform public.salida_pesar(v_id, 'TOLVA-AM2', 'ambar', 880);
  perform public.salida_firmar(v_id, 'supervisora');

  select count(*) into n from public.v_salidas_por_despachar where id = v_id;
  if n <> 1 then v_falla := v_falla || ' 0(la cedula no quedo disponible)'; end if;

  if v_falla <> '' then raise exception 'PESAR FALLA:%', v_falla; end if;
  raise notice 'PESAR: bien. La cedula quedo disponible con 2 tolvas.';
end $$;
reset role; reset request.jwt.claim.sub;

-- EL PATIO LA AMARRA AL VIAJE
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_ced uuid; v_falla text := ''; n int; v_cod text;
begin
  select id into v_ced from public.roturas_salidas where placa = 'AMA111' and viaje is null;

  -- 2. LA PLACA SE COMPRUEBA EN LA BASE, no solo en la pantalla.
  begin
    perform public.traspaso_amarrar_cedula('cccccccc-0000-0000-0000-000000000003', v_ced);
    v_falla := v_falla || ' 2(amarro vidrio de otra placa)';
  exception when others then
    if sqlerrm not like '%es de la placa%' then
      v_falla := v_falla || ' 2(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- Y con la placa buena, sí.
  v_cod := public.traspaso_amarrar_cedula('cccccccc-0000-0000-0000-000000000001', v_ced);
  if v_cod is null then v_falla := v_falla || ' 2b(no devolvio el codigo)'; end if;

  -- 1. YA CARGADA NO SE OFRECE PARA OTRO VIAJE.
  select count(*) into n from public.v_salidas_por_despachar where id = v_ced;
  if n <> 0 then v_falla := v_falla || ' 1(la cedula cargada se sigue ofreciendo)'; end if;
  select count(*) into n from public.v_salidas_reservadas
   where id = v_ced and viaje = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 1 then v_falla := v_falla || ' 1b(no quedo como reservada de ese viaje)'; end if;

  begin
    perform public.traspaso_amarrar_cedula('cccccccc-0000-0000-0000-000000000002', v_ced);
    v_falla := v_falla || ' 1c(la amarro a un segundo viaje: el mismo vidrio dos veces)';
  exception when others then
    if sqlerrm not like '%otro viaje%' then
      v_falla := v_falla || ' 1c(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla = '' then
    raise notice 'AMARRAR: bien. La placa se comprueba en la base y una cedula cargada no se ofrece ni se carga dos veces.';
  else
    raise exception 'AMARRAR FALLA:%', v_falla;
  end if;
end $$;
reset role; reset request.jwt.claim.sub;

-- 4. QUIEN PESÓ NO DA LA SALIDA, tampoco con cédula amarrada.
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor', '/traspasos/facturacion', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_falla text := '';
begin
  begin
    perform public.traspaso_confirmar_salida('cccccccc-0000-0000-0000-000000000001', '7700000001');
    v_falla := v_falla || ' 4(quien peso pudo dar la salida)';
  exception when others then
    if sqlerrm not like '%quien pesó el vidrio no le da la salida%' then
      v_falla := v_falla || ' 4(error raro: ' || sqlerrm || ')'; end if;
  end;
  if v_falla = '' then
    raise notice 'DOS PERSONAS: bien. Quien peso no da la salida, tampoco con la cedula ya amarrada.';
  else raise exception 'DOS PERSONAS FALLA:%', v_falla; end if;
end $$;
reset role; reset request.jwt.claim.sub;

-- 3. FACTURACIÓN NO VUELVE A CONTAR
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role probador;
do $$
declare v_ced uuid; v_falla text := ''; v_desp timestamptz; v_cont int;
begin
  select id into v_ced from public.roturas_salidas where placa = 'AMA111';

  -- SIN p_cedula NI p_tolvas: el viaje ya la trae.
  perform public.traspaso_confirmar_salida('cccccccc-0000-0000-0000-000000000001', '7700000001');

  select despachada_en, tolvas_contadas into v_desp, v_cont
    from public.roturas_salidas where id = v_ced;
  if v_desp is null then v_falla := v_falla || ' 3(no se despacho sola)'; end if;
  if v_cont <> 2 then
    v_falla := v_falla || ' 3b(las tolvas contadas quedaron en ' || coalesce(v_cont::text,'null') || ' y son 2)'; end if;

  if v_falla = '' then
    raise notice 'FACTURACION: bien. Con la cedula amarrada solo hace falta el documento: se despacho sola con sus 2 tolvas.';
  else raise exception 'FACTURACION FALLA:%', v_falla; end if;
end $$;
reset role; reset request.jwt.claim.sub;

-- 6. REABRIR NO DESCARGA EL CAMIÓN · 5. ANULAR SÍ SUELTA
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_ced uuid; v_falla text := ''; n int; v_viaje uuid;
begin
  select id into v_ced from public.roturas_salidas where placa = 'AMA111';

  perform public.traspaso_reabrir_salida('cccccccc-0000-0000-0000-000000000001', 'documento equivocado');
  select viaje into v_viaje from public.roturas_salidas where id = v_ced;
  if v_viaje is null then
    v_falla := v_falla || ' 6(reabrir descargo el camion: el amarre del patio se borro)'; end if;
  select count(*) into n from public.v_salidas_reservadas where id = v_ced;
  if n <> 1 then v_falla := v_falla || ' 6b(no volvio a quedar reservada)'; end if;
  select count(*) into n from public.roturas_salidas where id = v_ced and despachada_en is not null;
  if n <> 0 then v_falla := v_falla || ' 6c(sigue despachada despues de reabrir)'; end if;

  if v_falla = '' then
    raise notice 'REABRIR: bien. Reabrir corrige el documento y NO descarga el camion.';
  else raise exception 'REABRIR FALLA:%', v_falla; end if;
end $$;
reset role; reset request.jwt.claim.sub;

/* 5. ANULAR EL VIAJE SÍ SUELTA EL VIDRIO.

   La anulación se hace SIN el rol de prueba: lo que se mide es el
   disparador, no quién tiene permiso para anular —eso ya lo miden las
   pruebas de traspasos—. Con `set role probador` la tabla se defiende
   y la prueba fallaría por un permiso, no por la conducta. */
do $$
declare v_ced uuid; v_falla text := ''; n int; v_viaje uuid;
begin
  select id into v_ced from public.roturas_salidas where placa = 'AMA111';

  update public.traspasos_viajes set estado = 'anulado', motivo_anulacion = 'prueba'
   where id = 'cccccccc-0000-0000-0000-000000000001';

  select viaje into v_viaje from public.roturas_salidas where id = v_ced;
  if v_viaje is not null then
    v_falla := v_falla || ' 5(al anular el viaje el vidrio quedo colgado de un viaje que ya no existe)'; end if;
  select count(*) into n from public.v_salidas_por_despachar where id = v_ced;
  if n <> 1 then v_falla := v_falla || ' 5b(no volvio a la lista de disponibles)'; end if;

  if v_falla = '' then
    raise notice 'ANULAR: bien. El vidrio se suelta y vuelve a estar disponible.';
  else raise exception 'ANULAR FALLA:%', v_falla; end if;
end $$;

do $$ begin raise notice 'AMARRE ok'; end $$;
