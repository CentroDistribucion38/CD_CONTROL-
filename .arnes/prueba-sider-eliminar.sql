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
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
grant probador to postgres; grant authenticated to probador;

-- Tres viajes: dos anulados (uno con certificación, foto y revisión AI) y uno vivo.
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai) values
 ('eeeeeeee-0000-0000-0000-0000000000e1','ELI001','Galapa','3500024',20,'2026-09-20','recibido',true),
 ('eeeeeeee-0000-0000-0000-0000000000e2','ELI002','Galapa','3500024',10,'2026-09-20','en_transito',false),
 ('eeeeeeee-0000-0000-0000-0000000000e3','ELI003','Galapa','3500024',10,'2026-09-20','en_transito',false);
insert into public.sider_certificaciones (id, viaje_id, punta, lat, lng) values
 ('cccccccc-0000-0000-0000-0000000000e1','eeeeeeee-0000-0000-0000-0000000000e1','llegada',10.96,-74.79);
insert into public.sider_fotos (certificacion_id, ranura, ruta)
values ('cccccccc-0000-0000-0000-0000000000e1', (select e from unnest(enum_range(null::ranura_foto)) e limit 1), 'eli001/foto1.jpg');

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ begin perform public.sider_viaje_anular('eeeeeeee-0000-0000-0000-0000000000e1','Se digitó dos veces');
perform public.sider_viaje_anular('eeeeeeee-0000-0000-0000-0000000000e2','No salió'); end $$;
reset role;

-- E1 · los candados
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000e2']::uuid[], 'ELIMINAR')$q$,
        '%Solo quien administra%', 'quien no administra pudo eliminar');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'E1 · quien no administra la plataforma no puede eliminar';
end $$;
reset role;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000e2']::uuid[], 'eliminar')$q$,
        '%escribir ELIMINAR%', 'aceptó «eliminar» en minúsculas');
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000e2']::uuid[], null)$q$,
        '%escribir ELIMINAR%', 'aceptó sin confirmación');
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000e3']::uuid[], 'ELIMINAR')$q$,
        '%ya está anulado%', 'eliminó un viaje que NO estaba anulado');
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000e2','eeeeeeee-0000-0000-0000-0000000000e3']::uuid[], 'ELIMINAR')$q$,
        '%ya está anulado%', 'eliminó los anulados aunque uno de la lista estaba vivo (debe ser todo o nada)');
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar('{}'::uuid[], 'ELIMINAR')$q$,
        '%ningún viaje%', 'aceptó una lista vacía');
  f := f || public._espera_error($q$select * from public.sider_viaje_eliminar(array['eeeeeeee-0000-0000-0000-0000000000ff']::uuid[], 'ELIMINAR')$q$,
        '%ya no existe%', 'aceptó un id que no existe');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'E2 · pide ELIMINAR, solo borra lo anulado, todo o nada, y lo rechazado no borra nada';
end $$;

reset role;
do $$ begin
  if (select count(*) from public.sider_viajes where id::text like 'eeeeeeee-0000-0000-0000-0000000000e%') <> 3 then
    raise exception 'FALLA: un intento rechazado igual borró algo';
  end if;
end $$;
create table public._elim_r (filas integer, rutas text[]);
grant all on public._elim_r to public;
set role probador;
do $$ begin
  insert into public._elim_r select * from public.sider_viaje_eliminar(
    array['eeeeeeee-0000-0000-0000-0000000000e1','eeeeeeee-0000-0000-0000-0000000000e2']::uuid[], 'ELIMINAR');
end $$;
reset role;

-- E3 · elimina de verdad, con lo que cuelga, devuelve rutas y deja registro
do $$
declare r record; f text := '';
begin
  select * into r from public._elim_r;
  if r.filas <> 2 then f := f || E'\n   · devolvió ' || r.filas || ' filas y eran 2'; end if;
  if r.rutas is distinct from array['eli001/foto1.jpg'] then f := f || E'\n   · las rutas de las fotos no son las esperadas: ' || coalesce(r.rutas::text,'nulo'); end if;
  if exists (select 1 from public.sider_viajes where id in ('eeeeeeee-0000-0000-0000-0000000000e1','eeeeeeee-0000-0000-0000-0000000000e2')) then f := f || E'\n   · el viaje sigue ahí'; end if;
  if exists (select 1 from public.sider_certificaciones where viaje_id = 'eeeeeeee-0000-0000-0000-0000000000e1') then f := f || E'\n   · quedó la certificación'; end if;
  if exists (select 1 from public.sider_fotos where certificacion_id = 'cccccccc-0000-0000-0000-0000000000e1') then f := f || E'\n   · quedó la foto'; end if;
  if not exists (select 1 from public.sider_viajes where id = 'eeeeeeee-0000-0000-0000-0000000000e3') then f := f || E'\n   · se llevó el viaje vivo'; end if;
  if (select count(*) from public.sider_viajes_eliminados where viaje_id in ('eeeeeeee-0000-0000-0000-0000000000e1','eeeeeeee-0000-0000-0000-0000000000e2')) <> 2 then
    f := f || E'\n   · no dejó registro de los dos';
  end if;
  if not exists (select 1 from public.sider_viajes_eliminados
                  where placa = 'ELI001' and motivo = 'Se digitó dos veces'
                    and eliminado_por = '11111111-1111-1111-1111-111111111111') then
    f := f || E'\n   · el registro no guardó placa, motivo y quién';
  end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'E3 · elimina el viaje con sus certificaciones y fotos, devuelve las rutas, deja registro y no toca el vivo';
end $$;

-- E4 · el registro solo lo lee quien administra
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
begin
  if (select count(*) from public.sider_viajes_eliminados) <> 0 then raise exception 'FALLA: quien no administra lee el registro de eliminados'; end if;
  raise notice 'E4 · el registro de eliminados es solo de quien administra';
end $$;
reset role;
