\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function public._espera_error(p_sql text, p_patron text, p_desc text) returns text
language plpgsql as $$
begin
  begin execute p_sql; return E'\n   · ' || p_desc;
  exception when others then
    if sqlerrm like p_patron then return ''; end if;
    return E'\n   · ' || p_desc || ' (falló, pero con otra cosa: ' || sqlerrm || ')';
  end;
end $$;
grant execute on function public._espera_error(text, text, text) to public;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
grant probador to postgres; grant authenticated to probador;
insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba');
insert into public.productos (id, sku, nombre) values ('cccccccc-0000-0000-0000-000000000001','3128','Aguila') on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER');
/* El FEFO del sábado 26/9 (enviado), uno que ya es de hoy, y uno que no es FEFO. */
insert into public.conteos (id, codigo, bodega_id, estado, tipo, creado_en) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-20260926-02','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo','2026-09-26 15:00:00-05'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-20260930-01','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo','2026-09-30 10:00:00-05'),
  ('eeeeeeee-0000-0000-0000-000000000003','GEN-1','bbbbbbbb-0000-0000-0000-000000000001','borrador','general', now());
insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas, venc_dia, venc_mes, venc_anio) values
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',3,1,1,28);

-- F1 · solo quien administra; no del futuro; el código debe coincidir; no FEFO no se toca
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001','FEFO-20260926-02','2026-09-30')$q$, '%administra%', 'un supervisor pudo cambiar la fecha');
  if f <> '' then raise exception 'FALLA F1:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001','FEFO-20260926-02', ((now() at time zone 'America/Bogota')::date + 1))$q$, '%futuro%', 'aceptó una fecha del futuro');
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001','FEFO-OTRO','2026-09-30')$q$, '%no coincide%', 'cambió con un código que no es el del FEFO');
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000003','GEN-1','2026-09-30')$q$, '%no es un FEFO%', 'tocó un conteo que no es FEFO');
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-0000000000ff','X','2026-09-30')$q$, '%ya no existe%', 'no avisa de un FEFO que no existe');
  f := f || public._espera_error($q$select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001','FEFO-20260926-02',null)$q$, '%Falta la fecha%', 'aceptó sin fecha');
  if f <> '' then raise exception 'FALLA F1:%', f; end if;
  raise notice 'F1 · solo el administrador; no del futuro; el código debe coincidir; lo que no es FEFO no se toca';
end $$;
reset role;
do $$ begin
  if (select creado_en::date from public.conteos where id='eeeeeeee-0000-0000-0000-000000000001') <> '2026-09-26' then raise exception 'FALLA F1: la fecha cambió con un intento malo'; end if;
end $$;

-- F2 · pasarlo al 30/9: la fecha de la base cambia, se renumera (ya hay un -01 ese día), lo demás queda
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare r record;
begin
  select * into r from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001',' FEFO-20260926-02 ','2026-09-30');
  if r.codigo_anterior <> 'FEFO-20260926-02' or r.codigo_nuevo <> 'FEFO-20260930-02' or r.fecha <> '2026-09-30' then
    raise exception 'FALLA F2: devolvió % / % / %', r.codigo_anterior, r.codigo_nuevo, r.fecha;
  end if;
end $$;
reset role;
do $$
begin
  if (select fecha_analisis from public.v_conteos_fefo where id='eeeeeeee-0000-0000-0000-000000000001') <> '2026-09-30' then raise exception 'FALLA F2: la base sigue mostrando otra fecha'; end if;
  if (select codigo from public.conteos where id='eeeeeeee-0000-0000-0000-000000000001') <> 'FEFO-20260930-02' then raise exception 'FALLA F2: no se renumeró'; end if;
  if (select count(*) from public.conteo_lineas where conteo_id='eeeeeeee-0000-0000-0000-000000000001') <> 1 then raise exception 'FALLA F2: se perdieron renglones'; end if;
  if (select estado from public.conteos where id='eeeeeeee-0000-0000-0000-000000000001') <> 'cerrado' then raise exception 'FALLA F2: cambió el estado'; end if;
  if (select codigo from public.conteos where id='eeeeeeee-0000-0000-0000-000000000002') <> 'FEFO-20260930-01' then raise exception 'FALLA F2: tocó otro FEFO'; end if;
  raise notice 'F2 · pasa al 30/9, toma el siguiente número libre de ese día y conserva renglones y estado';
end $$;

-- F3 · a «hoy» de Colombia: a las 11 p.m. de Bogotá ya es el día siguiente en UTC, y aun así queda en el día de Bogotá
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
select * from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001','FEFO-20260930-02', (now() at time zone 'America/Bogota')::date);
reset role;
do $$
begin
  if (select fecha_analisis from public.v_conteos_fefo where id='eeeeeeee-0000-0000-0000-000000000001') <> (now() at time zone 'America/Bogota')::date then raise exception 'FALLA F3: no quedó con la fecha de hoy de Colombia'; end if;
  raise notice 'F3 · «hoy» es el de Colombia';
end $$;
-- F4 · si ya decía ese día, no se renumera
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare r record; c text := 'FEFO-20261001-01';
begin
  select * into r from public.conteo_fefo_cambiar_fecha('eeeeeeee-0000-0000-0000-000000000001', c, (now() at time zone 'America/Bogota')::date);
  if r.codigo_nuevo <> c then raise exception 'FALLA F4: renumeró de más (% → %)', c, r.codigo_nuevo; end if;
  raise notice 'F4 · repetir la misma fecha no cambia el código';
end $$;
reset role;
