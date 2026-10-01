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
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba');
insert into public.productos (id, sku, nombre, tipo_material, cajas_por_estiba) values
  ('cccccccc-0000-0000-0000-000000000001','ENV1','Envase 350','ENVASE',10),
  ('cccccccc-0000-0000-0000-000000000002','ENV2','Otro envase','ENVASE',10) on conflict do nothing;
insert into public.envase_estados (clave, orden) values ('NUEVO',260),('LAVADO',220),('EXTRASUCIO',200) on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER');
insert into public.conteos (id, codigo, bodega_id, estado, tipo, responsable_id) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-A','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo','33333333-3333-3333-3333-333333333333');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
create function public.ag(p_sku text, p_cajas int, p_estado text) returns text language plpgsql as $$
begin
  perform public.conteo_fefo_agregar('eeeeeeee-0000-0000-0000-000000000001', p_sku, 'dddddddd-0000-0000-0000-000000000001'::uuid, false,
    null, p_cajas, null, null, null, false, false, p_estado, null);
  return 'ok';
end $$;

-- E1 · 50 NUEVO + 10 LAVADO + 20 EXTRASUCIO del mismo SKU en el mismo módulo: los tres entran
do $$ declare f text := ''; n int; t int; begin
  perform public.ag('ENV1', 50, 'NUEVO'); perform public.ag('ENV1', 10, 'LAVADO'); perform public.ag('ENV1', 20, 'EXTRASUCIO');
  select count(*), sum(cajas) into n, t from public.conteo_lineas where conteo_id = 'eeeeeeee-0000-0000-0000-000000000001';
  if n <> 3 or t <> 80 then f := f || E'\n   · entraron ' || n || ' renglones con ' || t || ' cajas (esperaba 3 y 80)'; end if;
  if f <> '' then raise exception E'FALLA E1:%', f; end if;
  raise notice 'E1 · NUEVO, LAVADO y EXTRASUCIO del mismo material en el mismo módulo: 3 renglones, 80 cajas';
end $$;

-- E2 · lo que sigue siendo duplicado: mismo material + módulo + fecha + ESTADO
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.ag('ENV1', 5, 'LAVADO')$q$, '%conteo_lineas_unico%', 'el mismo estado dos veces pasó');
  begin perform public.ag('ENV2', 5, null); perform public.ag('ENV2', 6, null);
    f := f || E'\n   · sin estado dos veces pasó';
  exception when unique_violation then null; end;
  if f <> '' then raise exception E'FALLA E2:%', f; end if;
  raise notice 'E2 · el mismo estado (o dos sin estado) en el mismo sitio y fecha sigue siendo duplicado';
end $$;

-- E3 · otro material en el mismo módulo con cualquier estado no choca; sin estado y con estado conviven
do $$ declare f text := ''; n int; begin
  perform public.ag('ENV2', 7, 'NUEVO'); perform public.ag('ENV2', 8, null);
  select count(*) into n from public.conteo_lineas where conteo_id = 'eeeeeeee-0000-0000-0000-000000000001';
  if n <> 5 then f := f || E'\n   · hay ' || n || ' renglones (esperaba 5)'; end if;
  if f <> '' then raise exception E'FALLA E3:%', f; end if;
  raise notice 'E3 · otro material, o sin estado junto a uno con estado, conviven';
end $$;

-- E4 · el estado escrito con espacios es el mismo estado (la base lo recorta antes de guardar)
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.ag('ENV1', 5, '  NUEVO ')$q$, '%conteo_lineas_unico%', 'NUEVO con espacios se coló como otro estado');
  if f <> '' then raise exception E'FALLA E4:%', f; end if;
  raise notice 'E4 · «  NUEVO » y «NUEVO» son el mismo estado';
end $$;
