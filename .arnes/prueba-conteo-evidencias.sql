\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('44444444-4444-4444-4444-444444444444','ana@x'),
  ('55555555-5555-5555-5555-555555555555','luis@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true),
  ('55555555-5555-5555-5555-555555555555','luis','Luis','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba') on conflict do nothing;
insert into public.productos (id, sku, nombre, tipo_material, cajas_por_estiba) values
  ('cccccccc-0000-0000-0000-000000000001','P1','Uno','PRODUCTO',10),('cccccccc-0000-0000-0000-000000000002','P2','Dos','PRODUCTO',10) on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER'),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','A01_IZQ','A','01','IZQ'),
  ('dddddddd-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000001','B02_DER','B','02','DER') on conflict do nothing;
/* Día 1 (30-sep, hora Colombia): conteo de Ana. Día 2 (1-oct): conteo de Luis. Un conteo ANULADO que no debe contar. */
insert into public.conteos (id, codigo, bodega_id, estado, tipo, responsable_id, iniciado_en, cerrado_en, enviado_en, enviado_por) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-D1','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo','44444444-4444-4444-4444-444444444444','2026-09-30 13:00+00','2026-09-30 15:00+00','2026-09-30 15:00+00','44444444-4444-4444-4444-444444444444'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-D2','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo','55555555-5555-5555-5555-555555555555','2026-10-01 13:00+00',null,null,null),
  ('eeeeeeee-0000-0000-0000-000000000003','FEFO-ANU','bbbbbbbb-0000-0000-0000-000000000001','anulado','fefo','44444444-4444-4444-4444-444444444444','2026-09-30 13:00+00',null,null,null);
insert into public.conteo_lineas (id, conteo_id, producto_id, ubicacion_id, cajas, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico, contado_por, contado_en, registrado_en) values
  /* D1: avería en A01_DER · PNC en B02_DER (rótulo sí, bloqueo no) · A01_IZQ contada limpia */
  ('ffffffff-0000-0000-0000-0000000000a1','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 10, true,  false, null, null, '44444444-4444-4444-4444-444444444444','2026-09-30 13:10+00','2026-09-30 13:10+00'),
  ('ffffffff-0000-0000-0000-0000000000a2','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003', 5,  false, true,  true, false, '44444444-4444-4444-4444-444444444444','2026-09-30 13:20+00','2026-09-30 13:20+00'),
  ('ffffffff-0000-0000-0000-0000000000a3','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000002', 8,  false, false, null, null, '44444444-4444-4444-4444-444444444444','2026-09-30 13:30+00','2026-09-30 13:30+00'),
  /* D2: A01_DER contada limpia (ya no hay novedad) · A01_IZQ avería Y PNC con política completa */
  ('ffffffff-0000-0000-0000-0000000000b1','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 10, false, false, null, null, '55555555-5555-5555-5555-555555555555','2026-10-01 14:00+00','2026-10-01 14:00+00'),
  ('ffffffff-0000-0000-0000-0000000000b2','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000002', 3,  true,  true,  true, true, '55555555-5555-5555-5555-555555555555','2026-10-01 14:10+00','2026-10-01 14:10+00'),
  /* anulado: no debe salir */
  ('ffffffff-0000-0000-0000-0000000000c1','eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 1,  true,  false, null, null, '44444444-4444-4444-4444-444444444444','2026-09-30 13:40+00','2026-09-30 13:40+00');
insert into public.conteo_fotos (linea_id, conteo_id, ruta, tomada_en) values
  ('ffffffff-0000-0000-0000-0000000000a1','eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001/ffffffff-0000-0000-0000-0000000000a1.jpg','2026-09-30 13:10+00');
/* Módulo B02_DER marcado MEZCLADO el día 1; A01_DER SIN ACCESO el día 2. */
insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, marcado_por, marcado_en) values
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000003', true, false, 'ruta-mod.jpg','44444444-4444-4444-4444-444444444444','2026-09-30 13:25+00'),
  ('eeeeeeee-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003', false, true, null,'55555555-5555-5555-5555-555555555555','2026-10-01 14:30+00');

do $p$
declare v_falla text := ''; r record; n int;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
begin
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;

  /* E1 · el día 1 trae 3 novedades de renglón/módulo: avería A01_DER, PNC B02_DER, mezclado B02_DER (y NO el anulado) */
  select count(*) into n from public.conteo_evidencias('2026-09-30', '2026-09-30');
  if n <> 3 then v_falla := v_falla || ' E1a(día 1 trae ' || n || ' y debían ser 3)'; end if;
  select count(*) into n from public.conteo_evidencias('2026-09-30', '2026-09-30') where conteo = 'FEFO-ANU';
  if n <> 0 then v_falla := v_falla || ' E1b(salió el conteo anulado)'; end if;
  select * into r from public.conteo_evidencias('2026-09-30', '2026-09-30') where tipo = 'averia';
  if r.ubicacion is distinct from 'A01_DER' or r.cajas <> 10 or r.persona is distinct from 'Ana' or r.ruta is null or r.codigo is distinct from 'P1'
    then v_falla := v_falla || ' E1c(avería mal armada)'; end if;
  if v_falla = '' then raise notice 'E1 · el día trae su avería con ubicación, material, cajas, persona y foto, y no cuenta lo anulado'; end if;

  /* E2 · PNC con la política: día 1 rótulo sí + bloqueo no = NO cumple; día 2 las dos sí = cumple */
  select * into r from public.conteo_evidencias('2026-09-30', '2026-09-30') where tipo = 'pnc';
  if r.cumple is distinct from false or r.pnc_rotulo is distinct from true or r.pnc_bloqueo_mecanico is distinct from false then v_falla := v_falla || ' E2a'; end if;
  select * into r from public.conteo_evidencias('2026-10-01', '2026-10-01') where tipo = 'pnc';
  if r.cumple is distinct from true then v_falla := v_falla || ' E2b'; end if;
  if v_falla = '' then raise notice 'E2 · el PNC dice si cumple la política de bloqueo (rótulo y bloqueo mecánico)'; end if;

  /* E3 · avería + PNC en el mismo renglón: cuentan las dos; módulos mezclado y sin acceso */
  select count(*) into n from public.conteo_evidencias('2026-10-01', '2026-10-01') where ubicacion = 'A01_IZQ' and tipo in ('averia','pnc');
  if n <> 2 then v_falla := v_falla || ' E3a(avería+PNC dan ' || n || ')'; end if;
  select count(*) into n from public.conteo_evidencias('2026-09-30', '2026-10-01') where tipo = 'mezclado' and dia = '2026-09-30';
  if n <> 1 then v_falla := v_falla || ' E3b(mezclado)'; end if;
  select count(*) into n from public.conteo_evidencias('2026-09-30', '2026-10-01') where tipo = 'sin_acceso' and dia = '2026-10-01' and ubicacion = 'B02_DER';
  if n <> 1 then v_falla := v_falla || ' E3c(sin acceso)'; end if;
  if v_falla = '' then raise notice 'E3 · avería y PNC del mismo renglón cuentan las dos; mezclado y sin acceso salen por módulo'; end if;

  /* E4 · cobertura: día 1 = A01_DER, A01_IZQ, B02_DER; día 2 = A01_DER, A01_IZQ, B02_DER(solo por estado del módulo, 0 renglones) */
  select count(*) into n from public.conteo_cobertura('2026-09-30', '2026-09-30');
  if n <> 3 then v_falla := v_falla || ' E4a(cobertura día 1 = ' || n || ')'; end if;
  select * into r from public.conteo_cobertura('2026-10-01', '2026-10-01') where ubicacion = 'B02_DER';
  if r.renglones is distinct from 0 or r.conteos <> 1 then v_falla := v_falla || ' E4b(módulo sin renglones no cuenta como visitado)'; end if;
  select count(*) into n from public.conteo_cobertura('2026-09-30', '2026-10-01');
  if n <> 6 then v_falla := v_falla || ' E4c(rango = ' || n || ')'; end if;
  if v_falla = '' then raise notice 'E4 · la cobertura dice qué ubicaciones se contaron cada día (también las que solo tienen el estado del módulo)'; end if;

  /* E5 · sin permiso no se ve nada */
  reset role;
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  update public.perfiles set rol = 'sin-rol-xx' where id = '55555555-5555-5555-5555-555555555555' and false;
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  set local role probador;
  begin perform * from public.conteo_evidencias('2026-09-01', '2026-10-30'); v_falla := v_falla || ' E5a(vio evidencias sin permiso)'; exception when others then null; end;
  begin perform * from public.conteo_cobertura('2026-09-01', '2026-10-30'); v_falla := v_falla || ' E5b(vio cobertura sin permiso)'; exception when others then null; end;
  reset role;
  if v_falla = '' then raise notice 'E5 · sin permiso no se ven las evidencias'; end if;

  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
end $p$;
