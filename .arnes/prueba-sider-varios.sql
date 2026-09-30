-- Un Vh Interno con varios materiales: todo o nada, misma placa/factura, una tarjeta por material.
create table if not exists public._v_ids (ids uuid[]);
grant all on public._v_ids to public;
truncate public._v_ids;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
begin
  insert into public._v_ids values (public.sider_viaje_interno_crear_varios('VAR001','GAL','Barranquilla','7001',
    '[{"sku":"G175","estibas":30},{"sku":"G350","estibas":12}]'::jsonb));
end $$;
reset role;
do $$
declare f text := ''; ids uuid[]; n int;
begin
  select v.ids into ids from public._v_ids v;
  if coalesce(array_length(ids,1),0) <> 2 then f := f || E'\n   · no devolvió dos viajes'; end if;
  select count(*) into n from public.sider_viajes where placa = 'VAR001' and factura = '7001' and interno and estado = 'recibido';
  if n <> 2 then f := f || E'\n   · no quedaron dos líneas recibidas con la misma placa y factura (' || n || ')'; end if;
  if (select count(distinct sku) from public.sider_viajes where placa = 'VAR001') <> 2 then f := f || E'\n   · los materiales no quedaron distintos'; end if;
  if (select sum(estibas) from public.sider_viajes where placa = 'VAR001') <> 42 then f := f || E'\n   · las estibas no son las de cada línea'; end if;
  if (select count(*) from public.v_sider_revision_pendientes where placa = 'VAR001') is distinct from 2 then
    f := f || E'\n   · no cayeron dos tarjetas en Revisión AI'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'V1 · dos materiales, misma placa y factura, dos tarjetas';
end $$;

set role probador;
do $$
declare f text := '';
begin
  /* TODO O NADA: la segunda línea es un material apagado → no queda ni la primera. */
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR002','GAL','Barranquilla','7002',
      '[{"sku":"G175","estibas":5},{"sku":"G000","estibas":5}]'::jsonb)$q$, '%material%', 'aceptó un material apagado');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR003','GAL','Barranquilla','7003',
      '[{"sku":"G175","estibas":5},{"sku":"G175","estibas":6}]'::jsonb)$q$, '%repetido%', 'aceptó el mismo material dos veces');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR004','GAL','Barranquilla','7004','[]'::jsonb)$q$, '%al menos un material%', 'aceptó cero materiales');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR005','GAL','Barranquilla','7005',
      '[{"sku":"G175","estibas":0}]'::jsonb)$q$, '%estibas%', 'aceptó cero estibas');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR006','GAL','Barranquilla','',
      '[{"sku":"G175","estibas":3}]'::jsonb)$q$, '%documento%', 'aceptó sin factura');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('AB1','GAL','Barranquilla','7007',
      '[{"sku":"G175","estibas":3}]'::jsonb)$q$, '%3 letras y 3 números%', 'aceptó una placa mala');
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR008','GAL','Barranquilla','7008',
      '[{"sku":"G175","estibas":"x"}]'::jsonb)$q$, '%no son un número%', 'aceptó estibas que no son número');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'V2 · todo o nada, sin repetidos, sin vacíos, cada regla de siempre se sigue pidiendo';
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.sider_viajes where placa in ('VAR002','VAR003','VAR004','VAR005','VAR006','VAR008')) then
    raise exception E'FALLA:\n   · quedó una línea a medias tras un error'; end if;
end $$;
set role probador;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare f text := '';
begin
  f := f || public._espera_error($q$select public.sider_viaje_interno_crear_varios('VAR009','GAL','Barranquilla','7009',
      '[{"sku":"G175","estibas":3}]'::jsonb)$q$, '%permiso%', 'creó sin el permiso «Vh Interno»');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'V3 · sin el permiso no crea';
end $$;
reset role;
