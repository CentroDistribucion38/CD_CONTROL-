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
insert into public.productos (id, sku, nombre) values ('cccccccc-0000-0000-0000-000000000001','3128','Aguila')
  on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER');
/* Dos FEFO: uno enviado con 2 renglones y uno abierto con 1; y uno general que no es FEFO. */
insert into public.conteos (id, codigo, bodega_id, estado, tipo) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-A','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-B','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000003','GEN-1','bbbbbbbb-0000-0000-0000-000000000001','borrador','general');
insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas, venc_dia, venc_mes, venc_anio) values
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',3,1,1,28),
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',2,1,2,28),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',1,1,3,28);

-- E1 · solo quien administra
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-000000000001','FEFO-A')$q$, '%administra%', 'un supervisor pudo eliminar un FEFO');
  if f <> '' then raise exception 'FALLA E1:%', f; end if;
  raise notice 'E1 · un supervisor no puede eliminar un FEFO';
end $$;
reset role;
do $$ begin if (select count(*) from public.conteos where tipo='fefo') <> 2 then raise exception 'FALLA E1: se borró algo'; end if; end $$;

-- E2 · el código tiene que coincidir, y solo se borra lo de ese FEFO
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-000000000001','FEFO-B')$q$, '%no coincide%', 'borró con un código que no es el del FEFO');
  f := f || public._espera_error($q$select * from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-000000000003','GEN-1')$q$, '%no es un FEFO%', 'eliminó un conteo que no es FEFO');
  f := f || public._espera_error($q$select * from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-0000000000ff','X')$q$, '%ya no existe%', 'no avisa de un FEFO que no existe');
  if f <> '' then raise exception 'FALLA E2:%', f; end if;
  raise notice 'E2 · el código tiene que coincidir; lo que no es FEFO o no existe no se toca';
end $$;
reset role;
do $$ begin if (select count(*) from public.conteos) <> 3 then raise exception 'FALLA E2: se borró algo con un código malo'; end if; end $$;

-- E3 · el administrador elimina uno enviado con sus renglones; el otro queda
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare r record;
begin
  select * into r from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-000000000001', ' FEFO-A ');
  if r.codigo <> 'FEFO-A' or r.renglones <> 2 then raise exception 'FALLA E3: devolvió % / %', r.codigo, r.renglones; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.conteos where codigo = 'FEFO-A') then raise exception 'FALLA E3: sigue el FEFO-A'; end if;
  if exists (select 1 from public.conteo_lineas where conteo_id = 'eeeeeeee-0000-0000-0000-000000000001') then raise exception 'FALLA E3: quedaron sus renglones'; end if;
  if (select count(*) from public.conteo_lineas) <> 1 or not exists (select 1 from public.conteos where codigo = 'FEFO-B') or not exists (select 1 from public.conteos where codigo = 'GEN-1') then
    raise exception 'FALLA E3: se llevó lo que no era';
  end if;
  if not exists (select 1 from public.admin_borrados where nombre = 'Inventario · FEFO FEFO-A' and filas = 3) then
    raise exception 'FALLA E3: no quedó en el registro de borrados';
  end if;
  raise notice 'E3 · el administrador elimina un FEFO con sus renglones, deja el resto y queda en el registro';
end $$;

-- E4 · un borrador abierto también
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
select * from public.conteo_fefo_eliminar('eeeeeeee-0000-0000-0000-000000000002', 'FEFO-B');
reset role;
do $$ begin
  if exists (select 1 from public.conteos where tipo = 'fefo') then raise exception 'FALLA E4: sigue un FEFO'; end if;
  raise notice 'E4 · un FEFO abierto (borrador) también se elimina';
end $$;
