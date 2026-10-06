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
  ('cccccccc-0000-0000-0000-000000000001','P1','Uno','PRODUCTO',10),('cccccccc-0000-0000-0000-000000000002','P2','Dos','PRODUCTO',10),
  ('cccccccc-0000-0000-0000-000000000003','P3','Tres','PRODUCTO',10),('cccccccc-0000-0000-0000-000000000004','P4','Cuatro','PRODUCTO',10) on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER') on conflict do nothing;

/* CONTEO DE ANA: 08:00, 08:10, 08:25 renglones; PAUSA de 90 min; 09:55 renglón; envía 10:00.
   → bruto 120 min · activo 25 min (10+15+5) · pausas 90. (Hora Colombia = UTC-5, así que 13:00Z = 08:00.) */
insert into public.conteos (id, codigo, bodega_id, estado, tipo, responsable_id, iniciado_en, cerrado_en, enviado_en, enviado_por) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-ANA','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo','44444444-4444-4444-4444-444444444444',
   '2026-09-30 12:40+00','2026-09-30 15:00+00','2026-09-30 15:00+00','44444444-4444-4444-4444-444444444444'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-LUIS','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo','55555555-5555-5555-5555-555555555555',
   '2026-09-30 13:00+00',null,null,null);
insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, cajas, contado_por, contado_en, registrado_en) values
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 10,'44444444-4444-4444-4444-444444444444','2026-09-30 15:30+00','2026-09-30 13:00+00'),
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001', 10,'44444444-4444-4444-4444-444444444444','2026-09-30 13:10+00','2026-09-30 13:10+00'),
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000001', 10,'44444444-4444-4444-4444-444444444444','2026-09-30 13:25+00','2026-09-30 13:25+00'),
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000004','dddddddd-0000-0000-0000-000000000001', 10,'44444444-4444-4444-4444-444444444444','2026-09-30 14:55+00','2026-09-30 14:55+00'),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 10,'55555555-5555-5555-5555-555555555555','2026-09-30 13:00+00','2026-09-30 13:00+00'),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001', 10,'55555555-5555-5555-5555-555555555555','2026-09-30 13:20+00','2026-09-30 13:20+00');

do $prueba$
declare v_falla text := ''; r record; n int;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  ANA constant text := '44444444-4444-4444-4444-444444444444';
begin
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select * into r from public.conteo_tiempos('2026-09-30', '2026-09-30') where codigo = 'FEFO-ANA';
  reset role;
  /* T1 · EL PRIMER RENGLÓN ES EL REGISTRADO, no el de la corrección (el primero se corrigió 15:30Z y siguió siendo 13:00Z) */
  if r.primer_renglon is distinct from '2026-09-30 13:00+00'::timestamptz then v_falla := v_falla || ' T1(primer renglón ' || coalesce(r.primer_renglon::text, 'null') || ')'; end if;
  if r.fin is distinct from '2026-09-30 15:00+00'::timestamptz or not r.enviado then v_falla := v_falla || ' T1b(fin/enviado ' || coalesce(r.fin::text, 'null') || ')'; end if;
  if r.dia <> '2026-09-30' or r.renglones <> 4 or r.persona <> 'Ana' then v_falla := v_falla || ' T1c(' || r::text || ')'; end if;
  if v_falla = '' then raise notice 'T1 · primer renglón 08:00 (aunque se corrigió después), envío 10:00, Ana, 4 renglones'; end if;

  /* T2 · BRUTO, ACTIVO Y PAUSAS */
  if r.bruto_min <> 120 then v_falla := v_falla || ' T2(bruto ' || r.bruto_min || ' y debía ser 120: del primer renglón al envío)'; end if;
  if r.activo_min <> 30 then v_falla := v_falla || ' T2b(activo ' || r.activo_min || ' y debía ser 30: 10+15+5 hasta el envío)'; end if;
  if r.pausas_min <> 90 then v_falla := v_falla || ' T2c(pausas ' || r.pausas_min || ' y debían ser 90)'; end if;
  if v_falla = '' then raise notice 'T2 · activo 30 min, pausa de 90 min descontada'; end if;

  /* T3 · EN CURSO: sin fin ni envío */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select * into r from public.conteo_tiempos('2026-09-30', '2026-09-30') where codigo = 'FEFO-LUIS';
  reset role;
  if r.fin is not null or r.enviado then v_falla := v_falla || ' T3(el conteo en curso trae fin)'; end if;
  if r.ultimo_renglon is null then v_falla := v_falla || ' T3b(no trae la hora del último renglón)'; end if;
  if r.activo_min <> 20 then v_falla := v_falla || ' T3b(activo ' || r.activo_min || ')'; end if;
  if v_falla = '' then raise notice 'T3 · el conteo sin enviar sale «en curso», sin hora de fin'; end if;

  /* T4 · FILTRO DE DÍAS Y PERMISO */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*) into n from public.conteo_tiempos('2026-10-01', '2026-10-31');
  reset role;
  if n <> 0 then v_falla := v_falla || ' T4(el filtro de días deja pasar ' || n || ')'; end if;
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  begin perform * from public.conteo_tiempos('2026-09-01', '2026-09-30'); v_falla := v_falla || ' T4b(vio los tiempos sin permiso)'; exception when others then null; end;
  reset role;
  if v_falla = '' then raise notice 'T4 · el filtro de días corta y sin permiso no se ven los tiempos'; end if;

  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
end $prueba$;
