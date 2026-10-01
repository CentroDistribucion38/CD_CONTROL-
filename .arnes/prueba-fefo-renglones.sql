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
insert into public.conteos (id, codigo, bodega_id, estado, tipo) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-A','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-B','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000003','GEN-1','bbbbbbbb-0000-0000-0000-000000000001','borrador','general');
/* FEFO-A: 4 renglones (l1..l4). FEFO-B: 1 (l5). GEN-1: 1 (l6, no es FEFO). */
insert into public.conteo_lineas (id, conteo_id, producto_id, ubicacion_id, estibas, venc_dia, venc_mes, venc_anio) values
  ('11000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',1,1,1,28),
  ('11000000-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',2,1,2,28),
  ('11000000-0000-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',3,1,3,28),
  ('11000000-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',4,1,4,28),
  ('11000000-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',5,1,5,28),
  ('11000000-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',6,1,6,28);

-- R1 · solo quien administra; sin marcar nada no hace nada
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000001']::uuid[])$q$, '%administra%', 'un supervisor pudo eliminar renglones');
  if f <> '' then raise exception 'FALLA R1:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar('{}'::uuid[])$q$, '%ningún renglón%', 'aceptó no marcar nada');
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(null)$q$, '%ningún renglón%', 'aceptó null');
  if f <> '' then raise exception 'FALLA R1:%', f; end if;
  raise notice 'R1 · solo el administrador; sin renglones marcados no hace nada';
end $$;
reset role;
do $$ begin if (select count(*) from public.conteo_lineas) <> 6 then raise exception 'FALLA R1: se borró algo'; end if; end $$;

-- R2 · todo o nada: uno que no existe, uno que no es de FEFO, o dejar un FEFO vacío
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-0000000000ff']::uuid[])$q$, '%No se borró nada%', 'borró aunque uno no existía');
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000006']::uuid[])$q$, '%No se borró nada%', 'borró un renglón que no es de un FEFO');
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000005']::uuid[])$q$, '%sin renglones%', 'dejó un FEFO sin renglones');
  f := f || public._espera_error($q$select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000004']::uuid[])$q$, '%sin renglones%', 'dejó vacío un FEFO quitando todos sus renglones');
  if f <> '' then raise exception 'FALLA R2:%', f; end if;
  raise notice 'R2 · todo o nada: no borra si uno no existe, no es de FEFO, o el FEFO quedaría vacío';
end $$;
reset role;
do $$ begin if (select count(*) from public.conteo_lineas) <> 6 then raise exception 'FALLA R2: se borró algo con un intento malo'; end if; end $$;

-- R3 · quita dos renglones de FEFO-A (uno repetido en la lista) y deja lo demás
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare r record; n int := 0;
begin
  for r in select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000002']::uuid[]) loop
    n := n + 1;
    if r.codigo <> 'FEFO-A' or r.eliminados <> 2 or r.quedan <> 2 then raise exception 'FALLA R3: devolvió % / % / %', r.codigo, r.eliminados, r.quedan; end if;
  end loop;
  if n <> 1 then raise exception 'FALLA R3: devolvió % filas', n; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.conteo_lineas where id in ('11000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000003')) then raise exception 'FALLA R3: siguen los marcados'; end if;
  if (select count(*) from public.conteo_lineas) <> 4 or not exists (select 1 from public.conteo_lineas where id = '11000000-0000-0000-0000-000000000001') or not exists (select 1 from public.conteo_lineas where id = '11000000-0000-0000-0000-000000000006') then
    raise exception 'FALLA R3: se llevó lo que no era';
  end if;
  if not exists (select 1 from public.conteos where codigo = 'FEFO-A' and estado = 'cerrado') then raise exception 'FALLA R3: tocó el recorrido'; end if;
  if not exists (select 1 from public.admin_borrados where nombre = 'Inventario · renglones de FEFO FEFO-A' and filas = 2) then raise exception 'FALLA R3: no quedó en el registro'; end if;
  raise notice 'R3 · quita los marcados (sin repetir), deja lo demás, no toca el recorrido y queda en el registro';
end $$;

-- R4 · renglones de dos recorridos a la vez, uno por recorrido
insert into public.conteo_lineas (id, conteo_id, producto_id, ubicacion_id, estibas, venc_dia, venc_mes, venc_anio) values
  ('11000000-0000-0000-0000-000000000007','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',7,1,7,28);
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare n int := 0; r record;
begin
  for r in select * from public.conteo_fefo_lineas_eliminar(array['11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000005']::uuid[]) order by codigo loop
    n := n + 1;
    if r.eliminados <> 1 or r.quedan < 1 then raise exception 'FALLA R4: % % %', r.codigo, r.eliminados, r.quedan; end if;
  end loop;
  if n <> 2 then raise exception 'FALLA R4: devolvió % recorridos', n; end if;
  raise notice 'R4 · de dos recorridos a la vez: cada uno pierde su renglón y conserva el resto';
end $$;
reset role;
