\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('33333333-3333-3333-3333-333333333333','sup@x'),
  ('44444444-4444-4444-4444-444444444444','ana@x'), ('66666666-6666-6666-6666-666666666666','beto@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','operador',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true),
  ('66666666-6666-6666-6666-666666666666','beto','Beto','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
delete from public.usuarios_historial;

do $prueba$
declare v_falla text := ''; n bigint; r record;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP constant text := '33333333-3333-3333-3333-333333333333';
begin
  /* 1 · QUIEN NO ADMINISTRA no ve el historial ni anota */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  if exists (select 1 from public.v_usuarios_historial) then v_falla := v_falla || ' 1(uno que no administra ve el historial)'; end if;
  begin perform public.usuarios_historial_anotar(SUP::uuid, '[{"accion":"creado"}]'); v_falla := v_falla || ' 1b(un usuario normal anota en el historial)'; exception when others then null; end;
  begin perform public.admin_existe(array['tabla:public.perfiles']); v_falla := v_falla || ' 1c(uno que no administra pregunta por la base)'; exception when others then null; end;
  reset role;

  /* 2 · CAMBIAR ROL A DOS, uno ya lo tenía: una sola fila, con de→a y quién */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  n := public.usuarios_lote(array['44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666']::uuid[], 'rol', 'supervisor');
  if n <> 2 then v_falla := v_falla || ' 2(el lote no cambió a los dos)'; end if;
  select * into r from public.v_usuarios_historial where accion = 'rol';
  if (select count(*) from public.v_usuarios_historial where accion = 'rol') <> 1 then v_falla := v_falla || ' 2b(anota a quien ya tenía el rol)'; end if;
  if r.a_quien_nombre is distinct from 'Ana' or r.detalle->>'de' <> 'operador' or r.detalle->>'a' <> 'supervisor' or r.hecho_por::text <> JEFE or r.hecho_nombre <> 'Jefe' then
    v_falla := v_falla || ' 2c(la fila del rol no dice a quién, de qué a qué o quién: ' || coalesce(row_to_json(r)::text, 'nada') || ')'; end if;

  /* 3 · DESACTIVAR Y ACTIVAR */
  n := public.usuarios_lote(array['44444444-4444-4444-4444-444444444444']::uuid[], 'desactivar');
  n := public.usuarios_lote(array['44444444-4444-4444-4444-444444444444']::uuid[], 'desactivar');
  n := public.usuarios_lote(array['44444444-4444-4444-4444-444444444444']::uuid[], 'activar');
  if (select count(*) from public.v_usuarios_historial where accion = 'desactivado') <> 1 then v_falla := v_falla || ' 3(desactivar dos veces anota dos)'; end if;
  if (select count(*) from public.v_usuarios_historial where accion = 'activado') <> 1 then v_falla := v_falla || ' 3b(no anota el activar)'; end if;

  /* 4 · QUÉ PARTES DE LA BASE ESTÁN */
  if (select existe from public.admin_existe(array['tabla:public.usuarios_historial']) ) is not true then v_falla := v_falla || ' 4(no ve una tabla que está)'; end if;
  if (select existe from public.admin_existe(array['tabla:public.no_existe_x']) ) is not false then v_falla := v_falla || ' 4b(ve una tabla que no está)'; end if;
  if (select existe from public.admin_existe(array['fn:public.usuarios_lote']) ) is not true then v_falla := v_falla || ' 4c(no ve una función que está)'; end if;
  reset role;

  /* 5 · LA LLAVE DE SERVICIO anota lo del servidor */
  n := public.usuarios_historial_anotar(JEFE::uuid, '[{"a_quien":"","nombre":"Nuevo","usuario":"nuevo","accion":"creado","detalle":{"rol":"operador"}}]');
  if n <> 1 or not exists (select 1 from public.usuarios_historial where accion = 'creado' and a_quien is null and a_quien_usuario = 'nuevo') then
    v_falla := v_falla || ' 5(la ruta del servidor no anota)'; end if;
  begin perform public.usuarios_historial_anotar(JEFE::uuid, '[{"accion":"inventada"}]'); v_falla := v_falla || ' 5b(anota una acción que no existe)'; exception when others then null; end;

  if v_falla <> '' then raise exception 'HISTORIAL:%', v_falla; end if;
  raise notice 'HISTORIAL ok';
end $prueba$;
