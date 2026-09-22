\set ON_ERROR_STOP on
set client_min_messages = notice;
-- DEPURAR VIAJES: solo quien administra; motivo obligatorio; anular,
-- no se factura y eliminar; lo que ya salió no se toca; queda escrito.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1) on conflict (clave) do update set activo = true;
insert into public.traspasos_viajes (id, codigo, fecha, turno, tipo, placa, origen_texto, destino_texto, viajes, vacio, carga, hora, registrado_por, estado)
select ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'DP-' || n, date '2026-09-01', 'A', 'pet', 'XYZ00' || n, 'a', 'b', 1, false, 10,
       now(), '33333333-3333-3333-3333-333333333333', 'registrado' from generate_series(1, 6) n;
insert into public.traspasos_viaje_tipos (viaje_id, tipo, cantidad) select id, 'pet', 10 from public.traspasos_viajes where codigo like 'DP-%';
-- el 6 ya salió
update public.traspasos_viajes set factura_documento = '123', salida_en = now(), salida_por = '11111111-1111-1111-1111-111111111111' where codigo = 'DP-6';

do $p$
declare f text := ''; n int;
  V1 uuid := '00000000-0000-0000-0000-000000000001'; V2 uuid := '00000000-0000-0000-0000-000000000002';
  V3 uuid := '00000000-0000-0000-0000-000000000003'; V4 uuid := '00000000-0000-0000-0000-000000000004';
  V5 uuid := '00000000-0000-0000-0000-000000000005'; V6 uuid := '00000000-0000-0000-0000-000000000006';
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  set local role probador;
  begin perform public.traspaso_depurar(array[V1], 'eliminar', 'x'); f := f || ' 1(supervisor eliminó)'; exception when others then null; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role probador;
  begin perform public.traspaso_depurar(array[V1], 'anular', '  '); f := f || ' 2(sin motivo)'; exception when others then null; end;
  n := public.traspaso_depurar(array[V1, V2], 'anular', 'Duplicado');
  if n <> 2 then f := f || ' 4(anuló ' || n || ')'; end if;
  n := public.traspaso_depurar(array[V3], 'sin_factura', 'viaje interno');
  if (select motivo_anulacion from public.traspasos_viajes where id = V3) <> 'No se factura: viaje interno' then f := f || ' 5(motivo sin factura)'; end if;
  n := public.traspaso_depurar(array[V4, V5], 'eliminar', 'Prueba del patio');
  if n <> 2 or exists (select 1 from public.traspasos_viajes where id in (V4, V5)) then f := f || ' 6(no eliminó)'; end if;
  if exists (select 1 from public.traspasos_viaje_tipos where viaje_id in (V4, V5)) then f := f || ' 7(quedaron sus tipos)'; end if;
  reset role;
  if not exists (select 1 from public.admin_borrados where clave = 'traspasos_depurar' and filas = 2 and nombre like '%Prueba del patio') then f := f || ' 8(no quedó escrito)'; end if;
  set local role probador;
  n := public.traspaso_depurar(array[V6], 'anular', 'Facturado por error');
  reset role;
  if n <> 1 or (select estado::text || coalesce(factura_documento, '-') || coalesce(salida_en::text, '-') from public.traspasos_viajes where id = V6) <> 'anulado--'
    then f := f || ' 9(no anuló el facturado o le dejó la salida)'; end if;
  if not exists (select 1 from public.traspasos_viajes_ediciones where viaje = V6 and motivo like 'Depurado%' and antes->>'factura_documento' = '123')
    then f := f || ' 10(no quedó el documento en el rastro)'; end if;
  if f <> '' then raise exception 'FALLA:%', f; end if;
  raise notice 'DEPURAR ok';
end $p$;
