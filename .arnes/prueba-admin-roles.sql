\set ON_ERROR_STOP on
set client_min_messages = notice;
-- ROLES: borrar pasando usuarios, duplicar, historial — y los candados de siempre.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','ana@cdcontrol.local'),
  ('66666666-6666-6666-6666-666666666666','beto@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;

do $prueba$
declare
  v_falla text := '';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  n int; t text;
begin
  /* ---- 1 · SOLO QUIEN ADMINISTRA ---- */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin perform public.rol_crear('x_sup', 'X sup'); v_falla := v_falla || ' 1(un supervisor creó un rol)'; exception when others then null; end;
  begin perform public.rol_borrar('operador', 'supervisor'); v_falla := v_falla || ' 1b(un supervisor borró un rol)'; exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;

  /* ---- 2 · CREAR Y DUPLICAR ---- */
  perform public.rol_permisos_guardar('supervisor', '[{"seccion":"/traspasos","nivel":"editar"},{"seccion":"/sider","nivel":"ver"}]'::jsonb);
  t := public.rol_crear('portero', 'Portero', 'Ve la entrada', 'supervisor');
  if t <> 'portero' then v_falla := v_falla || ' 2(no devolvió la clave)'; end if;
  if (select count(*) from public.rol_permisos where rol = 'portero') <> 2
     or (select nivel::text from public.rol_permisos where rol = 'portero' and seccion = '/traspasos') <> 'editar' then
    v_falla := v_falla || ' 2b(el duplicado no trae los permisos del original)'; end if;
  begin perform public.rol_crear('portero2', 'portero'); v_falla := v_falla || ' 2c(dejó dos roles con el mismo nombre)'; exception when others then null; end;
  begin perform public.rol_crear('Mal Clave', 'Otro'); v_falla := v_falla || ' 2d(aceptó una clave con mayúsculas y espacios)'; exception when others then null; end;
  perform public.rol_crear('vacio', 'Vacío');
  if exists (select 1 from public.rol_permisos where rol = 'vacio') then v_falla := v_falla || ' 2e(un rol nuevo nace con permisos)'; end if;

  /* ---- 3 · HISTORIAL DE PERMISOS: solo lo que cambió ---- */
  perform public.rol_permisos_guardar('portero', '[{"seccion":"/traspasos","nivel":"ver"},{"seccion":"/sider","nivel":"ver"},{"seccion":"/acciones","nivel":"editar"}]'::jsonb);
  select count(*) into n from public.v_roles_historial where rol = 'portero' and accion = 'permisos';
  if n <> 1 then v_falla := v_falla || ' 3(guardar no dejó una fila de historial: ' || n || ')'; end if;
  if (select detalle->'cambios' from public.v_roles_historial where rol = 'portero' and accion = 'permisos')
     <> '[{"antes":"ninguno","despues":"editar","seccion":"/acciones"},{"antes":"editar","despues":"ver","seccion":"/traspasos"}]'::jsonb then
    v_falla := v_falla || ' 3b(el historial no dice qué cambió de qué a qué: ' ||
      (select (detalle->'cambios')::text from public.v_roles_historial where rol = 'portero' and accion = 'permisos') || ')'; end if;
  perform public.rol_permisos_guardar('portero', '[{"seccion":"/traspasos","nivel":"ver"},{"seccion":"/sider","nivel":"ver"},{"seccion":"/acciones","nivel":"editar"}]'::jsonb);
  if (select count(*) from public.roles_historial where rol = 'portero' and accion = 'permisos') <> 1 then
    v_falla := v_falla || ' 3c(guardar sin cambios llenó el historial)'; end if;
  if not exists (select 1 from public.v_roles_historial where rol = 'portero' and accion = 'duplicado'
                   and detalle->>'de' = 'supervisor' and hecho_nombre = 'Jefe Admin') then
    v_falla := v_falla || ' 3d(el duplicado no quedó en el historial con quién lo hizo)'; end if;
  reset role;

  /* usuarios en portero */
  insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444','ana@x'), ('66666666-6666-6666-6666-666666666666','beto@x') on conflict do nothing;
  insert into public.perfiles (id, usuario, nombre, rol, activo) values
    ('44444444-4444-4444-4444-444444444444','ana','Ana','portero',true),
    ('66666666-6666-6666-6666-666666666666','beto','Beto','portero',true)
  on conflict (id) do update set rol = 'portero', nombre = excluded.nombre;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;

  /* ---- 4 · BORRAR ---- */
  begin perform public.rol_borrar('operador', 'supervisor'); v_falla := v_falla || ' 4(borró un rol de sistema)';
  exception when others then if sqlerrm !~ 'de sistema' then v_falla := v_falla || ' 4b(' || sqlerrm || ')'; end if; end;
  begin perform public.rol_borrar('portero', null); v_falla := v_falla || ' 4c(borró un rol con usuarios sin decir a dónde pasarlos)';
  exception when others then if sqlerrm !~ 'a qué rol pasarlos' then v_falla := v_falla || ' 4d(' || sqlerrm || ')'; end if; end;
  begin perform public.rol_borrar('portero', 'portero'); v_falla := v_falla || ' 4e(pasó los usuarios al mismo rol que se borra)'; exception when others then null; end;
  begin perform public.rol_borrar('portero', 'no_existe'); v_falla := v_falla || ' 4f(pasó los usuarios a un rol que no existe)'; exception when others then null; end;
  if (select count(*) from public.perfiles where rol = 'portero') <> 2 then v_falla := v_falla || ' 4g(un intento fallido movió usuarios)'; end if;

  n := public.rol_borrar('portero', 'vacio');
  if n <> 2 then v_falla := v_falla || ' 5(dice que pasó ' || n || ' usuarios)'; end if;
  if exists (select 1 from public.roles where clave = 'portero') then v_falla := v_falla || ' 5b(el rol sigue ahí)'; end if;
  if (select count(*) from public.perfiles where rol = 'vacio') <> 2 then v_falla := v_falla || ' 5c(los usuarios no quedaron en el rol escogido)'; end if;
  if exists (select 1 from public.rol_permisos where rol = 'portero') then v_falla := v_falla || ' 5d(quedaron permisos del rol borrado)'; end if;
  if not exists (select 1 from public.v_roles_historial where rol = 'portero' and accion = 'borrado'
                   and (detalle->>'usuarios')::int = 2 and detalle->>'a_nombre' = 'Vacío' and detalle->'quienes' ? 'Ana') then
    v_falla := v_falla || ' 5e(el borrado no dejó en el historial a quiénes pasó y a dónde)'; end if;

  t := public.rol_crear('sin_gente', 'Sin gente');
  n := public.rol_borrar('sin_gente');
  if n <> 0 or exists (select 1 from public.roles where clave = 'sin_gente') then v_falla := v_falla || ' 5f(un rol sin usuarios no se borra sin destino)'; end if;

  /* ---- 6 · EL HISTORIAL NO SE TOCA A MANO ---- */
  begin
    delete from public.roles_historial;
    if (select count(*) from public.roles_historial) = 0 then v_falla := v_falla || ' 6(el historial se pudo borrar a mano)'; end if;
  exception when others then null; end;
  reset role;

  if v_falla <> '' then raise exception 'ROLES:%', v_falla; end if;
  raise notice 'ROLES ok';
end $prueba$;
