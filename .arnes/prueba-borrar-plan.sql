\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Un admin y un operador de verdad.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('22222222-2222-2222-2222-222222222222','peon@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('22222222-2222-2222-2222-222222222222','peon','Peon','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.traspasos_tipos (clave, nombre, activo, orden) values
  ('pet','PET',true,1), ('casco','Casco vidrio',true,2)
on conflict (clave) do update set activo = true;

insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2)
on conflict (clave) do update set activo = true;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  f date := public.traspaso_hoy() - 6;
  g date := public.traspaso_hoy() - 5;
  n int; v_falla text := '';
  v_viajes int;
begin
  -- ---------- se arma y se publica un plan ----------
  perform public.traspaso_guardar_plan(f,
    '[{"turno":"A","tipo":"pet","planeado":6},{"turno":"B","tipo":"casco","planeado":4}]'::jsonb,
    '[{"turno":"A","vacios":3}]'::jsonb);
  perform public.traspaso_publicar_plan(f);

  if (select count(*) from public.traspasos_plan where fecha = f and publicado) <> 2 then
    v_falla := v_falla || ' 1(no quedo publicado)'; end if;

  -- 2. EL HUECO QUE ESTO VIENE A TAPAR: publicar una rejilla vacía NO borraba.
  begin
    perform public.traspaso_guardar_plan(f, '[]'::jsonb, '[]'::jsonb);
    perform public.traspaso_publicar_plan(f);
    v_falla := v_falla || ' 2(publicar vacio no deberia pasar)';
  exception when others then
    if sqlerrm not like '%No hay nada sin publicar%' then
      v_falla := v_falla || ' 2(error raro: ' || sqlerrm || ')'; end if;
  end;
  if (select count(*) from public.traspasos_plan where fecha = f and publicado) <> 2 then
    v_falla := v_falla || ' 2b(se perdio el plan publicado)'; end if;

  -- 3. Un viaje registrado de ese día, para comprobar que no se toca.
  perform public.traspaso_registrar(f, 'A', 'pet', 'ABC123', 'ag01', 'planta', 1);
  select count(*) into v_viajes from public.traspasos_viajes where fecha = f;

  -- 4. BORRAR. Devuelve cuántas líneas se llevó.
  n := public.traspaso_borrar_plan(f);
  if n <> 2 then v_falla := v_falla || ' 4(devolvio ' || n || ', se esperaban 2)'; end if;
  if (select count(*) from public.traspasos_plan where fecha = f) <> 0 then
    v_falla := v_falla || ' 4b(quedaron lineas)'; end if;

  -- 5. Los vacíos del día se van con el plan.
  if (select count(*) from public.traspasos_plan_vacios where fecha = f) <> 0 then
    v_falla := v_falla || ' 5(quedaron vacios)'; end if;

  -- 6. LOS VIAJES NO SE TOCAN.
  if (select count(*) from public.traspasos_viajes where fecha = f) <> v_viajes then
    v_falla := v_falla || ' 6(se perdieron viajes)'; end if;

  -- 7. Borrar un día que no tiene plan no revienta: devuelve 0.
  n := public.traspaso_borrar_plan(g);
  if n <> 0 then v_falla := v_falla || ' 7(devolvio ' || n || ')'; end if;

  -- 8. Se lleva también el borrador, no solo lo publicado.
  perform public.traspaso_guardar_plan(f,
    '[{"turno":"C","tipo":"pet","planeado":9}]'::jsonb, '[]'::jsonb);
  if (select count(*) from public.traspasos_plan where fecha = f and not publicado) <> 1 then
    v_falla := v_falla || ' 8(no se guardo el borrador)'; end if;
  n := public.traspaso_borrar_plan(f);
  if n <> 1 or (select count(*) from public.traspasos_plan where fecha = f) <> 0 then
    v_falla := v_falla || ' 8b(quedo el borrador)'; end if;

  -- 9. Sin fecha, se queja.
  begin
    perform public.traspaso_borrar_plan(null);
    v_falla := v_falla || ' 9(acepto null)';
  exception when others then
    if sqlerrm not like '%de qué día%' then
      v_falla := v_falla || ' 9(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 10. Después de borrar, el día ya no sale como planeado en el calendario.
  if exists (select 1 from public.traspaso_dias_con_plan(f - 5, f + 5) d where d.fecha = f) then
    v_falla := v_falla || ' 10(el calendario sigue marcandolo)'; end if;

  -- 11. El control del día deja de contar plan: todo pasa a adicional.
  if (select coalesce(sum(c.planeado), 0) from public.v_traspasos_control c where c.fecha = f) <> 0 then
    v_falla := v_falla || ' 11(el control sigue contando plan)'; end if;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'editor: 10 de 10';
end $$;

-- 12. UN OPERADOR NO PUEDE BORRAR EL PLAN DE NADIE.
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role probador;
do $$
begin
  perform public.traspaso_guardar_plan((public.traspaso_hoy() - 4), '[]'::jsonb, '[]'::jsonb);
  raise exception '12 FALLO: el operador pudo guardar';
exception when others then
  if sqlerrm like '%requiere rol%' then null; else raise; end if;
end $$;
do $$
begin
  perform public.traspaso_borrar_plan((public.traspaso_hoy() - 6));
  raise exception '12 FALLO: el operador pudo borrar';
exception when others then
  if sqlerrm like '%requiere rol de supervisor%' then
    raise warning 'operador rechazado: 12 de 12';
  else raise; end if;
end $$;

reset role;
reset request.jwt.claim.sub;
