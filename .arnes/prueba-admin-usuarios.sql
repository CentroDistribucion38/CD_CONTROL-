\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email, last_sign_in_at) values
  ('11111111-1111-1111-1111-111111111111','jefe@x', now() - interval '1 hour'),
  ('33333333-3333-3333-3333-333333333333','sup@x', null),
  ('44444444-4444-4444-4444-444444444444','ana@x', now() - interval '3 days'),
  ('66666666-6666-6666-6666-666666666666','beto@x', null),
  ('99999999-9999-9999-9999-999999999999','otroadmin@x', null) on conflict (id) do update set last_sign_in_at = excluded.last_sign_in_at;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','operador',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true),
  ('66666666-6666-6666-6666-666666666666','beto','Beto','operador',true),
  ('99999999-9999-9999-9999-999999999999','otroadmin','Otro admin','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- Rastro: Ana registra 2 viajes y firma una hoja (columna sin llave: generado_por)
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1) on conflict (clave) do update set activo = true;
insert into public.traspasos_viajes (codigo, fecha, turno, tipo, placa, origen_texto, destino_texto, viajes, vacio, carga, hora, registrado_por, estado)
select 'TP-U-' || n, current_date, 'A', 'pet', 'ANA' || n, 'a', 'b', 1, false, 1, now(), '44444444-4444-4444-4444-444444444444', 'registrado' from generate_series(1,2) n;
insert into public.rotlinea_hojas (fecha, ruta, unidades, kg, lineas, generado_por)
values (current_date, current_date::text || '/u.pdf', 1, 1, 1, '44444444-4444-4444-4444-444444444444');
reset request.jwt.claim.sub;

do $prueba$
declare v_falla text := ''; n bigint; r record;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP constant text := '33333333-3333-3333-3333-333333333333';
begin
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin perform public.usuarios_ingreso(); v_falla := v_falla || ' 1(uno que no administra ve los ingresos)'; exception when others then null; end;
  begin perform public.usuarios_rastro(); v_falla := v_falla || ' 1b(uno que no administra ve el rastro)'; exception when others then null; end;
  begin perform public.usuarios_lote(array['44444444-4444-4444-4444-444444444444']::uuid[], 'desactivar'); v_falla := v_falla || ' 1c(uno que no administra desactiva)'; exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  /* INGRESO */
  if (select ultimo_ingreso from public.usuarios_ingreso() where id = '44444444-4444-4444-4444-444444444444') is null then
    v_falla := v_falla || ' 2(no trae el último ingreso)'; end if;
  if (select ultimo_ingreso from public.usuarios_ingreso() where id = '66666666-6666-6666-6666-666666666666') is not null then
    v_falla := v_falla || ' 2b(inventa un ingreso a quien nunca entró)'; end if;
  /* RASTRO */
  select registros into n from public.usuarios_rastro() where id = '44444444-4444-4444-4444-444444444444';
  if n <> 3 then v_falla := v_falla || ' 3(el rastro de Ana no suma viajes y hoja: ' || n || ')'; end if;
  select registros into n from public.usuarios_rastro(array['66666666-6666-6666-6666-666666666666']::uuid[]) where id = '66666666-6666-6666-6666-666666666666';
  if n <> 0 then v_falla := v_falla || ' 3b(Beto no ha hecho nada y tiene rastro)'; end if;
  if (select count(*) from public.usuarios_rastro(array['66666666-6666-6666-6666-666666666666']::uuid[])) <> 1 then
    v_falla := v_falla || ' 3c(pedir el rastro de uno trae a todos)'; end if;
  /* LOTE */
  n := public.usuarios_lote(array['44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666']::uuid[], 'rol', 'supervisor');
  if n <> 2 or (select count(*) from public.perfiles where rol = 'supervisor' and id in ('44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666')) <> 2 then
    v_falla := v_falla || ' 4(cambiar el rol a dos no cambió a los dos)'; end if;
  n := public.usuarios_lote(array['66666666-6666-6666-6666-666666666666']::uuid[], 'desactivar');
  if (select activo from public.perfiles where id = '66666666-6666-6666-6666-666666666666') then v_falla := v_falla || ' 5(no desactivó)'; end if;
  n := public.usuarios_lote(array['66666666-6666-6666-6666-666666666666']::uuid[], 'activar');
  if not (select activo from public.perfiles where id = '66666666-6666-6666-6666-666666666666') then v_falla := v_falla || ' 5b(no activó)'; end if;
  begin perform public.usuarios_lote(array[JEFE::uuid], 'desactivar');
    v_falla := v_falla || ' 6(se desactivó a sí mismo)'; exception when others then null; end;
  if not (select activo from public.perfiles where id = '66666666-6666-6666-6666-666666666666') then v_falla := v_falla || ' 6b(el intento fallido desactivó a otro)'; end if;
  begin perform public.usuarios_lote(array['66666666-6666-6666-6666-666666666666']::uuid[], 'rol', 'no_existe');
    v_falla := v_falla || ' 7(pasó a un rol que no existe)'; exception when others then null; end;
  reset role;
  if v_falla <> '' then raise exception 'USUARIOS:%', v_falla; end if;
  raise notice 'USUARIOS ok';
end $prueba$;
