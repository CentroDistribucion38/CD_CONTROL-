\set ON_ERROR_STOP on
set client_min_messages = warning;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

delete from public.rotlinea_firmas  where fecha = date '2026-09-05';
delete from public.rotlinea_registro where fecha = date '2026-09-05';

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare f date := date '2026-09-05'; v_falla text := ''; n int; v bigint; b boolean;
begin
  -- 1. Se registra un turno.
  perform public.rotlinea_guardar(f, 1::smallint, 2::smallint, '3500005',
    '[{"maquina":9,"kg":31},{"maquina":1,"kg":25}]'::jsonb);

  -- 2. EL LIDER FIRMA, y la firma guarda el total del momento.
  n := public.rotlinea_firmar(f, 1::smallint, 2::smallint, 'turno sin novedad');
  if n <> 318 then v_falla := v_falla || ' 2(firmo ' || n || ', se esperaban 318)'; end if;
  select firmadas into v from public.v_rotlinea_firmas
   where fecha = f and linea = 1 and turno = 2;
  if v <> 318 then v_falla := v_falla || ' 2b(la foto dice ' || v || ')'; end if;

  -- 3. FIRMAR CIERRA EL TURNO: no entran pesadas nuevas.
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 2::smallint, '3500005',
      '[{"maquina":6,"kg":10}]'::jsonb);
    v_falla := v_falla || ' 3(dejo registrar en un turno firmado)';
  exception when others then
    if sqlerrm not like '%ya está firmado por el líder%' then
      v_falla := v_falla || ' 3(' || sqlerrm || ')'; end if;
  end;

  -- 4. Ni correcciones.
  begin
    perform public.rotlinea_guardar(f, 1::smallint, 2::smallint, '3500005',
      '[{"maquina":9,"kg":99}]'::jsonb, 1::smallint);
    v_falla := v_falla || ' 4(dejo corregir un turno firmado)';
  exception when others then
    if sqlerrm not like '%ya está firmado%' then v_falla := v_falla || ' 4(' || sqlerrm || ')'; end if;
  end;

  -- 5. Y no se firma dos veces.
  begin
    perform public.rotlinea_firmar(f, 1::smallint, 2::smallint);
    v_falla := v_falla || ' 5(firmo dos veces)';
  exception when others then
    if sqlerrm not like '%ya está firmado%' then v_falla := v_falla || ' 5(' || sqlerrm || ')'; end if;
  end;

  -- 6. OTRO TURNO DE LA MISMA LINEA SIGUE ABIERTO: la firma es por turno.
  n := public.rotlinea_guardar(f, 1::smallint, 3::smallint, '3500005',
    '[{"maquina":9,"kg":5}]'::jsonb);
  if n <> 1 then v_falla := v_falla || ' 6(la firma cerro el turno de al lado)'; end if;

  -- 7. UN TURNO EN CERO SE PUEDE FIRMAR. Es la diferencia entre "no se
  --    rompio nada" y "nadie peso", que es todo el punto de esto.
  n := public.rotlinea_firmar(f, 2::smallint, 1::smallint);
  if n <> 0 then v_falla := v_falla || ' 7(devolvio ' || n || ')'; end if;

  -- 8. LA FIRMA NO SE PUEDE FABRICAR desde el navegador: la tabla no
  --    tiene politica de escritura, solo las funciones.
  begin
    insert into public.rotlinea_firmas (fecha, linea, turno) values (f, 4, 1);
    v_falla := v_falla || ' 8(dejo insertar una firma a mano)';
  exception when insufficient_privilege then null;
    when others then
      if sqlerrm not like '%row-level security%' and sqlerrm not like '%permission denied%' then
        v_falla := v_falla || ' 8(' || sqlerrm || ')'; end if;
  end;

  -- 9. Si alguien mueve algo despues, la vista lo canta.
  select cambio_despues into b from public.v_rotlinea_firmas
   where fecha = f and linea = 1 and turno = 2;
  if b then v_falla := v_falla || ' 9(dijo que cambio sin haber cambiado)'; end if;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'firma: 9 de 9';
end $$;

-- 10. QUITAR LA FIRMA ES SOLO DEL ADMINISTRADOR.
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
begin
  perform public.rotlinea_quitar_firma(date '2026-09-05', 1::smallint, 2::smallint);
  raise exception '10 FALLO: el supervisor quito una firma';
exception when others then
  if sqlerrm like '%solo del administrador%' then raise warning 'supervisor rechazado: 10 de 10';
  else raise; end if;
end $$;

-- 11. Y el administrador si puede, y eso REABRE el turno.
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_falla text := '';
begin
  perform public.rotlinea_quitar_firma(date '2026-09-05', 1::smallint, 2::smallint);
  if exists (select 1 from public.rotlinea_firmas
              where fecha = date '2026-09-05' and linea = 1 and turno = 2) then
    v_falla := v_falla || ' 11(la firma sigue ahi)'; end if;
  if public.rotlinea_guardar(date '2026-09-05', 1::smallint, 2::smallint, '3500005',
       '[{"maquina":6,"kg":10}]'::jsonb) <> 1 then
    v_falla := v_falla || ' 11b(no reabrio el turno)'; end if;
  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'administrador: 11 de 11';
end $$;

-- 12. Y QUIEN NO TIENE PERFIL TAMPOCO PASA. Es el caso que abrió el
--     hueco: mi_rol() devuelve NULL y `null <> 'admin'` no es cierto ni
--     falso, así que el if no disparaba y la función seguía de largo.
reset role;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set role probador;
do $$
begin
  perform public.rotlinea_quitar_firma(date '2026-09-05', 2::smallint, 1::smallint);
  raise exception '12 FALLO: alguien sin perfil quito una firma';
exception when others then
  if sqlerrm like '%solo del administrador%' then raise warning 'sin perfil rechazado: 12 de 12';
  else raise; end if;
end $$;

reset role;
reset request.jwt.claim.sub;
