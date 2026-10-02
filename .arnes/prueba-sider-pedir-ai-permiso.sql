\set ON_ERROR_STOP on
set client_min_messages = notice;
-- =====================================================================
-- PEDIR / QUITAR LA REVISIÓN AI POR PERMISO («Pedir / quitar revisión AI»)
--   · el administrador (manda) sigue pudiendo, sin que se le dé nada
--   · un operador con «editar» en ESA casilla puede; con «ver» no
--   · editar En tránsito NO basta (era el hueco: editar cualquier pantalla)
--   · una persona con la casilla puesta a mano sí; a la que se le quita a mano, no
--   · sin perfil, no
-- =====================================================================
create or replace function public._espera_error2(p_sql text, p_patron text, p_desc text) returns text
language plpgsql as $$
begin
  begin execute p_sql; return E'\n   · ' || p_desc;
  exception when others then
    if sqlerrm like p_patron then return ''; end if;
    return E'\n   · ' || p_desc || ' (falló con otra cosa: ' || sqlerrm || ')';
  end;
end $$;
create or replace function public._espera_bien2(p_sql text, p_desc text) returns text
language plpgsql as $$
begin
  begin execute p_sql; return '';
  exception when others then return E'\n   · ' || p_desc || ' (falló: ' || sqlerrm || ')';
  end;
end $$;
grant execute on function public._espera_error2(text,text,text), public._espera_bien2(text,text) to probador;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','op1@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','op2@cdcontrol.local'),
  ('66666666-6666-6666-6666-666666666666','op3@cdcontrol.local')
on conflict do nothing;
insert into public.roles (clave, nombre, manda) values ('conai', 'Con AI', false), ('sinai', 'Sin AI', false)
  on conflict (clave) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('44444444-4444-4444-4444-444444444444','op1','Op1','conai',true),
  ('55555555-5555-5555-5555-555555555555','op2','Op2','sinai',true),
  ('66666666-6666-6666-6666-666666666666','op3','Op3','sinai',true)
on conflict (id) do update set rol = excluded.rol, activo = true, permisos_extra = '{}'::jsonb;
delete from public.rol_permisos where rol in ('conai','sinai');
insert into public.rol_permisos (rol, seccion, nivel) values
  ('conai', '/sider/transito/revision-ai', 'editar'),
  ('conai', '/sider/transito', 'editar'),
  ('sinai', '/sider/transito', 'editar');
insert into public.sider_origenes (planta, cd_origen, activo) values ('BAQ','Barranquilla',true) on conflict (planta) do update set activo = true;
insert into public.sider_skus (sku, descripcion, activo) values ('G175','Costeñita 175',true) on conflict (sku) do update set activo = true;
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha) values
  ('bbbbbbbb-0000-0000-0000-000000000001','PAI111','BAQ','G175',20,'2026-10-01')
on conflict (id) do nothing;
update public.sider_viajes set requiere_ai = false where id = 'bbbbbbbb-0000-0000-0000-000000000001';

grant select on public.sider_viajes to probador;

create or replace function pg_temp.como(p_id text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_id, false); end $$;

-- 1 · el administrador
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_bien2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, 'el administrador no pudo pedir');
  f := f || public._espera_bien2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', false, null)$q$, 'el administrador no pudo quitar');
  if f <> '' then raise exception E'FALLA 1:%', f; end if;
  raise notice '1 · el administrador pide y quita sin que se le dé nada';
end $$;

-- 2 · quien tiene la casilla
reset role; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_bien2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, 'con la casilla en «editar» no pudo pedir');
  f := f || public._espera_bien2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', false, null)$q$, 'con la casilla en «editar» no pudo quitar');
  if f <> '' then raise exception E'FALLA 2:%', f; end if;
  raise notice '2 · con «editar» en Pedir / quitar revisión AI se puede pedir y quitar';
end $$;

-- 3 · editar En tránsito no basta
reset role; select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, '%Pedir / quitar revisión AI%', 'editar En tránsito bastó para pedir');
  f := f || public._espera_error2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', false, null)$q$, '%Pedir / quitar revisión AI%', 'editar En tránsito bastó para quitar');
  if f <> '' then raise exception E'FALLA 3:%', f; end if;
  raise notice '3 · editar En tránsito NO alcanza: hace falta su casilla';
end $$;

-- 4 · «ver» en la casilla tampoco; y a mano por persona
reset role;
update public.rol_permisos set nivel = 'ver' where rol = 'conai' and seccion = '/sider/transito/revision-ai';
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, '%Pedir / quitar revisión AI%', '«ver» bastó para pedir');
  if f <> '' then raise exception E'FALLA 4:%', f; end if;
  raise notice '4 · con «ver» no se puede pedir';
end $$;
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.perfiles set permisos_extra = '{"/sider/transito/revision-ai":"editar"}'::jsonb where id = '66666666-6666-6666-6666-666666666666';
update public.perfiles set permisos_extra = '{"/sider/transito/revision-ai":"ninguno"}'::jsonb where id = '44444444-4444-4444-4444-444444444444';
update public.rol_permisos set nivel = 'editar' where rol = 'conai' and seccion = '/sider/transito/revision-ai';
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_bien2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, 'la casilla puesta a mano a una persona no le dejó pedir');
  if f <> '' then raise exception E'FALLA 4b:%', f; end if;
  raise notice '5 · la casilla puesta a una persona sola le deja pedir';
end $$;
reset role; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', false, null)$q$, '%Pedir / quitar revisión AI%', 'a quien se le quitó a mano igual pudo quitar');
  if f <> '' then raise exception E'FALLA 4c:%', f; end if;
  raise notice '6 · quitarla a mano a una persona le cierra lo que su rol le daba';
end $$;

-- 7 · sin perfil
reset role; select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false); set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error2($q$select public.sider_ai_marcar('bbbbbbbb-0000-0000-0000-000000000001', true, null)$q$, '%Pedir / quitar revisión AI%', 'sin perfil pudo pedir');
  if f <> '' then raise exception E'FALLA 5:%', f; end if;
  raise notice '7 · sin perfil no puede';
end $$;
reset role;
