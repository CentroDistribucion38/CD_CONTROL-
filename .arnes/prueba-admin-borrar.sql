\set ON_ERROR_STOP on
set client_min_messages = notice;
-- =====================================================================
-- BORRAR DATOS PUNTUALES — lo que se comprueba
--   · solo quien administra cuenta, exporta o borra;
--   · la lista es cerrada: una clave inventada no toca nada;
--   · cuenta bien con rango y sin rango;
--   · pide BORRAR y el conteo que se vio;
--   · borra SOLO el rango, lo que cuelga se va con lo suyo, y lo demás
--     queda intacto;
--   · devuelve las rutas de los archivos para borrarlos de Storage;
--   · deja escrito quién borró qué.
-- =====================================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- Datos: viajes de traspaso en tres días, con tipos y ediciones colgando;
-- plan y vacíos; hojas de rotura con PDF.
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1) on conflict (clave) do update set activo = true;
insert into public.traspasos_viajes (id, codigo, fecha, turno, tipo, placa, origen_texto, destino_texto, viajes, vacio, carga, hora, registrado_por, estado)
select gen_random_uuid(), 'TP-' || d || '-' || n, date '2026-09-01' + d, 'A', 'pet', 'ABC' || d || n, 'a', 'b', 1, false, 10,
       now(), '33333333-3333-3333-3333-333333333333', 'registrado'
  from generate_series(0, 2) d, generate_series(1, 4) n;
insert into public.traspasos_viaje_tipos (viaje_id, tipo, cantidad)
select id, 'pet', 10 from public.traspasos_viajes;
insert into public.traspasos_plan (fecha, turno, tipo, planeado) values
  ('2026-09-01','A','pet',3), ('2026-09-02','A','pet',3), ('2026-09-05','A','pet',3);
insert into public.traspasos_plan_vacios (fecha, turno, vacios) values ('2026-09-01','A',2), ('2026-09-05','A',2);
insert into public.rotlinea_hojas (fecha, ruta, unidades, kg, lineas, elaboro, generado_por)
values ('2026-09-01','2026-09-01/a.pdf',10,1,1,'x','33333333-3333-3333-3333-333333333333'),
       ('2026-09-02','2026-09-02/b.pdf',10,1,1,'x','33333333-3333-3333-3333-333333333333'),
       ('2026-09-03','2026-09-03/c.pdf',10,1,1,'x','33333333-3333-3333-3333-333333333333');

do $prueba$
declare
  v_falla text := '';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  r record; n bigint;
begin
  /* ---- 1 · SOLO QUIEN ADMINISTRA ---- */
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    perform public.admin_borrado_contar('traspasos.viajes', null, null);
    v_falla := v_falla || ' 1(un supervisor pudo contar)';
  exception when others then null; end;
  begin
    perform public.admin_borrar('traspasos.viajes', null, null, 'BORRAR', 12);
    v_falla := v_falla || ' 1b(un supervisor pudo borrar)';
  exception when others then null; end;
  begin
    perform public.admin_borrado_filas('traspasos.viajes', null, null);
    v_falla := v_falla || ' 1c(un supervisor pudo exportar)';
  exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;

  /* ---- 2 · LA LISTA ES CERRADA ---- */
  begin
    perform public.admin_borrado_contar('perfiles', null, null);
    v_falla := v_falla || ' 2(se pudo apuntar a una tabla fuera de la lista)';
  exception when others then
    if sqlerrm !~ 'no está en la lista' then v_falla := v_falla || ' 2b(' || sqlerrm || ')'; end if;
  end;
  if exists (select 1 from public.admin_borrado_catalogo() where tabla in ('perfiles','roles','traspasos_tipos','traspasos_puntos','rotlinea_maquinas')) then
    v_falla := v_falla || ' 2c(la lista trae un maestro, usuarios o roles)'; end if;

  /* ---- 2d · CADA PUNTO DE LA LISTA FUNCIONA en la base completa: su
     tabla, su fecha y su select de archivos están bien escritos. ---- */
  for r in select clave from public.admin_borrado_catalogo() loop
    begin
      perform public.admin_borrado_contar(r.clave, '2026-01-01', '2026-12-31');
      perform public.admin_borrado_contar(r.clave, null, null);
      perform public.admin_borrado_filas(r.clave, '2026-01-01', '2026-01-02');
    exception when others then v_falla := v_falla || ' 2d(' || r.clave || ': ' || sqlerrm || ')'; end;
  end loop;
  if (select count(*) from public.admin_borrado_catalogo()) < 15 then
    v_falla := v_falla || ' 2e(la lista salió corta en la base completa)'; end if;

  /* ---- 3 · CUENTA ---- */
  select * into r from public.admin_borrado_contar('traspasos.viajes', null, null);
  if r.filas <> 12 then v_falla := v_falla || ' 3(sin rango no cuenta todo: ' || r.filas || ')'; end if;
  select * into r from public.admin_borrado_contar('traspasos.viajes', '2026-09-02', '2026-09-03');
  if r.filas <> 8 or r.primera <> '2026-09-02' or r.ultima <> '2026-09-03' then
    v_falla := v_falla || ' 3b(con rango no cuenta el rango)'; end if;
  select * into r from public.admin_borrado_contar('traspasos.plan', '2026-09-01', '2026-09-02');
  if r.filas <> 3 then v_falla := v_falla || ' 3c(el plan no cuenta sus vacíos: ' || r.filas || ')'; end if;
  select * into r from public.admin_borrado_contar('rotlinea.hojas', '2026-09-01', '2026-09-02');
  if r.archivos <> 2 then v_falla := v_falla || ' 3d(no cuenta los PDF)'; end if;
  begin
    perform public.admin_borrado_contar('traspasos.viajes', '2026-09-05', '2026-09-01');
    v_falla := v_falla || ' 3e(aceptó un rango al revés)';
  exception when others then null; end;

  /* ---- 4 · EXPORTA ---- */
  select count(*) into n from public.admin_borrado_filas('traspasos.plan', '2026-09-01', '2026-09-02');
  if n <> 3 then v_falla := v_falla || ' 4(el Excel no trae lo que se va a borrar: ' || n || ')'; end if;

  /* ---- 5 · PIDE BORRAR Y EL CONTEO QUE SE VIO ---- */
  begin
    perform public.admin_borrar('traspasos.viajes', '2026-09-02', '2026-09-03', 'borrar', 8);
    v_falla := v_falla || ' 5(borró sin escribir BORRAR)';
  exception when others then null; end;
  begin
    perform public.admin_borrar('traspasos.viajes', '2026-09-02', '2026-09-03', 'BORRAR', 7);
    v_falla := v_falla || ' 5b(borró con un conteo distinto al que se vio)';
  exception when others then
    if sqlerrm !~ 'Vuelve a contar' then v_falla := v_falla || ' 5c(' || sqlerrm || ')'; end if;
  end;
  if (select count(*) from public.traspasos_viajes) <> 12 then v_falla := v_falla || ' 5d(algo se borró sin confirmar)'; end if;

  /* ---- 6 · BORRA SOLO EL RANGO ---- */
  begin select * into r from public.admin_borrar('traspasos.viajes', '2026-09-02', '2026-09-03', 'BORRAR', 8); exception when others then v_falla := v_falla || ' X(un borrado que debía pasar falló: ' || sqlerrm || ')'; select null::bigint as filas, null::text as bucket, null::text[] as rutas into r; end;
  if r.filas <> 8 then v_falla := v_falla || ' 6(dice que borró ' || r.filas || ')'; end if;
  if (select count(*) from public.traspasos_viajes) <> 4 or exists (select 1 from public.traspasos_viajes where fecha <> '2026-09-01') then
    v_falla := v_falla || ' 6b(no quedó solo el día de fuera del rango)'; end if;
  if (select count(*) from public.traspasos_viaje_tipos) <> 4 then v_falla := v_falla || ' 6c(los tipos de los viajes borrados quedaron sueltos)'; end if;

  begin select * into r from public.admin_borrar('traspasos.plan', '2026-09-01', '2026-09-02', 'BORRAR', 3); exception when others then v_falla := v_falla || ' X(un borrado que debía pasar falló: ' || sqlerrm || ')'; select null::bigint as filas, null::text as bucket, null::text[] as rutas into r; end;
  if (select count(*) from public.traspasos_plan) <> 1 or (select count(*) from public.traspasos_plan_vacios) <> 1 then
    v_falla := v_falla || ' 6d(el plan y sus vacíos no se borraron por el rango)'; end if;

  /* ---- 7 · LOS ARCHIVOS ---- */
  begin select * into r from public.admin_borrar('rotlinea.hojas', '2026-09-01', '2026-09-02', 'BORRAR', 2); exception when others then v_falla := v_falla || ' X(un borrado que debía pasar falló: ' || sqlerrm || ')'; select null::bigint as filas, null::text as bucket, null::text[] as rutas into r; end;
  if r.bucket is distinct from 'rotlinea-hojas' or r.rutas is distinct from array['2026-09-01/a.pdf','2026-09-02/b.pdf']
     and r.rutas is distinct from array['2026-09-02/b.pdf','2026-09-01/a.pdf'] then
    v_falla := v_falla || ' 7(no devuelve las rutas de los PDF para borrarlos de Storage)'; end if;
  if (select count(*) from public.rotlinea_hojas) <> 1 then v_falla := v_falla || ' 7b(no quedó la hoja de fuera del rango)'; end if;

  /* ---- 8 · SIN RANGO, TODO ---- */
  begin select * into r from public.admin_borrar('traspasos.viajes', null, null, 'BORRAR', 4); exception when others then v_falla := v_falla || ' X(un borrado que debía pasar falló: ' || sqlerrm || ')'; select null::bigint as filas, null::text as bucket, null::text[] as rutas into r; end;
  if exists (select 1 from public.traspasos_viajes) then v_falla := v_falla || ' 8(sin rango no borró todo)'; end if;

  /* ---- 9 · QUEDA ESCRITO ---- */
  if (select count(*) from public.v_admin_borrados where borrado_nombre = 'Jefe Admin') <> 4 then
    v_falla := v_falla || ' 9(el registro no tiene los cuatro borrados con quién los hizo)'; end if;
  if not exists (select 1 from public.admin_borrados where clave = 'rotlinea.hojas' and archivos = 2 and desde = '2026-09-01') then
    v_falla := v_falla || ' 9b(el registro no dice el rango ni los archivos)'; end if;
  reset role;

  /* Y NADIE ESCRIBE EL REGISTRO A MANO. */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    delete from public.admin_borrados;
    if (select count(*) from public.admin_borrados) < 4 then v_falla := v_falla || ' 10(el registro se pudo borrar a mano)'; end if;
  exception when others then null; end;
  reset role;

  if v_falla <> '' then raise exception 'BORRAR DATOS:%', v_falla; end if;
  raise notice 'BORRAR DATOS ok';
end $prueba$;
