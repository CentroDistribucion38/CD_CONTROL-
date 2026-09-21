\set ON_ERROR_STOP on
set client_min_messages = notice;
-- SUPERVISOR BORRABLE Y FIRMAS POR PERMISO
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('33333333-3333-3333-3333-333333333333','sup@x'),
  ('77777777-7777-7777-7777-777777777777','pesa@x'), ('88888888-8888-8888-8888-888888888888','mira@x') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('77777777-7777-7777-7777-777777777777','pesa','Pesa','operador',true),
  ('88888888-8888-8888-8888-888888888888','mira','Mira','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre, permisos_extra = '{}'::jsonb;
insert into public.roles (clave, nombre) values ('bascula','Báscula') on conflict do nothing;
delete from public.rol_permisos where rol in ('bascula','operador','supervisor');
insert into public.rol_permisos (rol, seccion, nivel) values
  ('bascula','/roturas/salida','editar'), ('operador','/roturas/salida','ver'), ('supervisor','/roturas/salida','ver');
update public.perfiles set rol = 'bascula' where id = '77777777-7777-7777-7777-777777777777';

do $prueba$
declare v_falla text := '';
begin
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
  if not public.rotura_puede('supervisora') then v_falla := v_falla || ' 1(quien tiene Editar en Pesar no firma como supervisor)'; end if;
  if public.rotura_puede('verificador') then v_falla := v_falla || ' 1b(firma una etapa de otra pantalla)'; end if;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  if public.rotura_puede('supervisora') then v_falla := v_falla || ' 2(el rol Supervisor firma con solo Ver: sigue amarrado al nombre)'; end if;
  perform set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
  if public.rotura_puede('supervisora') then v_falla := v_falla || ' 3(con Ver se puede firmar)'; end if;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.perfiles set permisos_extra = '{"/roturas/salida/verificacion":"editar"}' where id = '88888888-8888-8888-8888-888888888888';
  perform set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
  if not public.rotura_puede('verificador') then v_falla := v_falla || ' 4(lo puesto a la persona no cuenta)'; end if;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.perfiles set permisos_extra = '{"/roturas/salida":"ninguno"}' where id = '77777777-7777-7777-7777-777777777777';
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
  if public.rotura_puede('supervisora') then v_falla := v_falla || ' 5(quitarle la pantalla a la persona no le quita la firma)'; end if;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  if not (public.rotura_puede('visto_bueno') and public.rotura_puede('validador')) then v_falla := v_falla || ' 6(el administrador no firma)'; end if;
  if public.rotura_puede('otra') then v_falla := v_falla || ' 6b(una firma desconocida pasa)'; end if;

  /* SUPERVISOR SE BORRA, pasando a su gente */
  if (select sistema from public.roles where clave = 'supervisor') then v_falla := v_falla || ' 7(Supervisor sigue de sistema)'; end if;
  if not (select sistema from public.roles where clave = 'operador') or not (select sistema from public.roles where clave = 'admin') then
    v_falla := v_falla || ' 7b(Operador o Administrador dejaron de ser fijos)'; end if;
  begin
    perform public.rol_borrar('supervisor', 'operador');
  exception when others then v_falla := v_falla || ' 8(no se pudo borrar Supervisor: ' || sqlerrm || ')'; end;
  if exists (select 1 from public.roles where clave = 'supervisor') then v_falla := v_falla || ' 8b(Supervisor sigue ahí)'; end if;
  if (select rol from public.perfiles where id = '33333333-3333-3333-3333-333333333333') <> 'operador' then v_falla := v_falla || ' 8c(su gente no pasó)'; end if;

  if v_falla <> '' then raise exception 'SUPERVISOR:%', v_falla; end if;
  raise notice 'SUPERVISOR ok';
end $prueba$;
