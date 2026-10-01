\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x.local'),
  ('22222222-2222-2222-2222-222222222222','suelto@x.local'),
  ('33333333-3333-3333-3333-333333333333','quitado@x.local'),
  ('44444444-4444-4444-4444-444444444444','solorol@x.local'),
  ('55555555-5555-5555-5555-555555555555','inactivo@x.local'),
  ('66666666-6666-6666-6666-666666666666','soloVer@x.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo, permisos_extra) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true,'{}'),
  ('22222222-2222-2222-2222-222222222222','suelto','Suelto','operador',true,'{"/sider/sorting/nuevo":"editar"}'),
  ('33333333-3333-3333-3333-333333333333','quitado','Quitado','supervisor',true,'{"/sider/transito":"ninguno","/zzmod/a":"ninguno"}'),
  ('44444444-4444-4444-4444-444444444444','solorol','Solo rol','supervisor',true,'{}'),
  ('55555555-5555-5555-5555-555555555555','inactivo','Inactivo','operador',false,'{"/sider/sorting/nuevo":"editar"}'),
  ('66666666-6666-6666-6666-666666666666','solover','Solo ver','supervisor',true,'{"/sider/transito":"ver","/zzmod/a":"ver"}')
on conflict (id) do update set rol = excluded.rol, activo = excluded.activo, permisos_extra = excluded.permisos_extra;
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor','/sider/transito','editar'), ('supervisor','/zzmod/a','editar'), ('supervisor','/sider/sorting/nuevo','ninguno'),
  ('operador','/sider/transito','ver'), ('operador','/sider/sorting/nuevo','ninguno')
on conflict (rol, seccion) do update set nivel = excluded.nivel;
grant probador to postgres; grant authenticated to probador;

create or replace function public.q(p_uid text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role probador;
  execute p_sql into r;
  reset role;
  return r;
end $$;
grant execute on function public.q(text, text) to public;

do $$
declare f text := ''; v text;
begin
  /* 1. Lo puesto a mano a una persona vale en la base (era el fallo). */
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.puede_editar('/sider/sorting/nuevo')::text$s$);
  if v <> 'true' then f := f || ' 1(lo puesto a mano no se respeta: ' || v || ')'; end if;
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.mi_nivel('/sider/sorting/nuevo')$s$);
  if v <> 'editar' then f := f || ' 1b(nivel ' || v || ')'; end if;
  /* 2. Y no se le regala nada más: lo demás sigue siendo de su rol. */
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.mi_nivel('/sider/transito')$s$);
  if v <> 'ver' then f := f || ' 2(lo demas debia seguir el rol: ' || v || ')'; end if;
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.mi_nivel('/otra/cosa')$s$);
  if v <> 'ninguno' then f := f || ' 2b(lo no dado debia ser ninguno: ' || v || ')'; end if;
  /* 3. «Sin acceso» a mano le quita una pantalla que su rol sí da. */
  v := public.q('33333333-3333-3333-3333-333333333333', $s$select public.puede_ver('/sider/transito')::text$s$);
  if v <> 'false' then f := f || ' 3(el sin acceso a mano no cierra: ' || v || ')'; end if;
  /* 4. Sin nada suelto, manda el rol. */
  v := public.q('44444444-4444-4444-4444-444444444444', $s$select public.mi_nivel('/sider/transito')$s$);
  if v <> 'editar' then f := f || ' 4(sin nada suelto debia valer el rol: ' || v || ')'; end if;
  v := public.q('44444444-4444-4444-4444-444444444444', $s$select public.puede_editar('/sider/sorting/nuevo')::text$s$);
  if v <> 'false' then f := f || ' 4b(el rol sin permiso no debia poder: ' || v || ')'; end if;
  /* 5. Quien manda siempre edita, aunque tenga algo suelto en contra. */
  v := public.q('11111111-1111-1111-1111-111111111111', $s$select public.mi_nivel('/lo/que/sea')$s$);
  if v <> 'editar' then f := f || ' 5(quien manda debia editar: ' || v || ')'; end if;
  /* 6. Una persona desactivada no gana nada por lo suelto. */
  v := public.q('55555555-5555-5555-5555-555555555555', $s$select public.puede_editar('/sider/sorting/nuevo')::text$s$);
  if v <> 'false' then f := f || ' 6(una persona inactiva puede editar: ' || v || ')'; end if;
  /* 7. Bajar a «Ver» a mano también baja en la base. */
  v := public.q('66666666-6666-6666-6666-666666666666', $s$select public.puede_editar('/sider/transito')::text$s$);
  if v <> 'false' then f := f || ' 7(bajarle a Ver a mano no la baja en la base: ' || v || ')'; end if;
  /* 8. puede_editar_modulo cuenta lo suelto... */
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.puede_editar_modulo('sider')::text$s$);
  if v <> 'true' then f := f || ' 8(el modulo no cuenta lo suelto: ' || v || ')'; end if;
  /* 9. ...no se confunde con otro módulo con nombre parecido... */
  v := public.q('22222222-2222-2222-2222-222222222222', $s$select public.puede_editar_modulo('sid')::text$s$);
  if v <> 'false' then f := f || ' 9(modulo con nombre parecido: ' || v || ')'; end if;
  /* 10. ...ni sigue contando lo del rol que se le cerró a mano. */
  v := public.q('33333333-3333-3333-3333-333333333333', $s$select public.puede_editar_modulo('zzmod')::text$s$);
  if v <> 'false' then f := f || ' 10(el modulo cuenta lo que se le cerro a mano: ' || v || ')'; end if;
  v := public.q('66666666-6666-6666-6666-666666666666', $s$select public.puede_editar_modulo('zzmod')::text$s$);
  if v <> 'false' then f := f || ' 10b(el modulo cuenta el Editar del rol aunque se le bajo a Ver: ' || v || ')'; end if;
  /* 11. Sin nada suelto, el módulo sigue el rol. */
  v := public.q('44444444-4444-4444-4444-444444444444', $s$select public.puede_editar_modulo('zzmod')::text$s$);
  if v <> 'true' then f := f || ' 11(el modulo no sigue al rol: ' || v || ')'; end if;
  v := public.q('11111111-1111-1111-1111-111111111111', $s$select public.puede_editar_modulo('lo-que-sea')::text$s$);
  if v <> 'true' then f := f || ' 12(quien manda en el modulo: ' || v || ')'; end if;
  if f <> '' then raise exception 'FALLA:%', f; end if;
  raise notice 'P1-P12 · lo puesto a mano vale en la base, lo cerrado a mano cierra, el rol sigue donde no se toco, y quien manda siempre edita';
end $$;
