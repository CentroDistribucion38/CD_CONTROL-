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
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','lector@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','ajeno@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('44444444-4444-4444-4444-444444444444','lector','Lector','operador',true),
  ('55555555-5555-5555-5555-555555555555','ajeno','Ajeno','facturacion',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
grant probador to postgres; grant authenticated to probador;
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor','/inventario/base','editar'), ('operador','/inventario/base','ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;
delete from public.rol_permisos where rol = 'facturacion' and seccion = '/inventario/base';
insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba');
insert into public.productos (id, sku, nombre) values ('cccccccc-0000-0000-0000-000000000001','3128','Aguila') on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER');
insert into public.conteos (id, codigo, bodega_id, estado, tipo) values
  ('eeeeeeee-0000-0000-0000-000000000001','FEFO-A','bbbbbbbb-0000-0000-0000-000000000001','cerrado','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000002','FEFO-B','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo'),
  ('eeeeeeee-0000-0000-0000-000000000003','GEN-1','bbbbbbbb-0000-0000-0000-000000000001','cerrado','general');
/* l1..l3: FEFO-A (enviado). l4: FEFO-B (abierto). l5: GEN-1 (no es FEFO). */
insert into public.conteo_lineas (id, conteo_id, producto_id, ubicacion_id, estibas, venc_dia, venc_mes, venc_anio) values
  ('11000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',1,1,1,28),
  ('11000000-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',2,1,2,28),
  ('11000000-0000-0000-0000-000000000003','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',3,1,3,28),
  ('11000000-0000-0000-0000-000000000004','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',4,1,4,28),
  ('11000000-0000-0000-0000-000000000005','eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',5,1,5,28);
create function public.l(n int) returns text language sql as $$ select '''11000000-0000-0000-0000-00000000000' || $1 || '''::uuid' $$;
grant execute on function public.l(int) to public;

-- P1 · quién puede marcar
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(1) || '])', '%permiso de editar%', 'quien solo ve La base pudo marcar');
  if f <> '' then raise exception E'FALLA P1:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(1) || '])', '%permiso de editar%', 'quien no tiene La base pudo marcar');
  f := f || public._espera_error('insert into public.conteo_lineas_pasadas (linea_id) values (' || public.l(1) || ')', '%permission denied%', 'se pudo escribir la tabla directamente');
  if f <> '' then raise exception E'FALLA P1:%', f; end if;
end $$;
reset role;
do $$ begin if exists (select 1 from public.conteo_lineas_pasadas) then raise exception 'FALLA P1: alguien sin permiso dejó marcas'; end if; end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare n int; begin
  n := public.conteo_fefo_marcar_pasado(array[('11000000-0000-0000-0000-000000000001')::uuid]);
  if n <> 1 then raise exception 'FALLA P1: el que edita La base marcó % (debía ser 1)', n; end if;
  raise notice 'P1 · solo marca quien edita La base (o administra); la tabla no se escribe directo';
end $$;
reset role;

-- P2 · todo o nada y solo enviados
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[]::uuid[])', '%ningún renglón%', 'aceptó no marcar nada');
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(null)', '%ningún renglón%', 'aceptó null');
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(4) || '])', '%todavía no se envió%', 'marcó un renglón de un recorrido abierto');
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(5) || '])', '%no es de un FEFO%', 'marcó un renglón que no es de FEFO');
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(2) || ', ''99999999-0000-0000-0000-000000000009''::uuid])', '%ya no existe%', 'marcó con uno que no existe');
  f := f || public._espera_error('select public.conteo_fefo_marcar_pasado(array[' || public.l(2) || ',' || public.l(4) || '])', '%todavía no se envió%', 'marcó el bueno junto con uno abierto');
  if f <> '' then raise exception E'FALLA P2:%', f; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.conteo_lineas_pasadas) <> 1 then raise exception 'FALLA P2: quedaron marcas de un intento que debía ser todo o nada (hay %)', (select count(*) from public.conteo_lineas_pasadas); end if;
  raise notice 'P2 · solo enviados y de FEFO; si uno no vale no se marca ninguno';
end $$;

-- P3 · repetir no cambia nada; desmarcar
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare n int; antes timestamptz; despues timestamptz; begin
  select pasado_en into antes from public.conteo_lineas_pasadas where linea_id = '11000000-0000-0000-0000-000000000001';
  perform pg_sleep(0.05);
  n := public.conteo_fefo_marcar_pasado(array[('11000000-0000-0000-0000-000000000001')::uuid]);
  if n <> 0 then raise exception 'FALLA P3: marcar de nuevo lo ya marcado cambió % filas', n; end if;
  select pasado_en into despues from public.conteo_lineas_pasadas where linea_id = '11000000-0000-0000-0000-000000000001';
  if antes is distinct from despues then raise exception 'FALLA P3: marcar de nuevo cambió cuándo se marcó'; end if;
  n := public.conteo_fefo_marcar_pasado(array[('11000000-0000-0000-0000-000000000002')::uuid, ('11000000-0000-0000-0000-000000000003')::uuid]);
  if n <> 2 then raise exception 'FALLA P3: marcar dos dio %', n; end if;
  if (select pasado_por from public.conteo_lineas_pasadas where linea_id = '11000000-0000-0000-0000-000000000002') <> '33333333-3333-3333-3333-333333333333' then raise exception 'FALLA P3: no quedó quién lo marcó'; end if;
  n := public.conteo_fefo_marcar_pasado(array[('11000000-0000-0000-0000-000000000003')::uuid], false);
  if n <> 1 or exists (select 1 from public.conteo_lineas_pasadas where linea_id = '11000000-0000-0000-0000-000000000003') then raise exception 'FALLA P3: desmarcar no quitó la marca (%)', n; end if;
  n := public.conteo_fefo_marcar_pasado(array[('11000000-0000-0000-0000-000000000003')::uuid], false);
  if n <> 0 then raise exception 'FALLA P3: desmarcar lo que no estaba marcado cambió %', n; end if;
  if (select count(*) from public.conteo_lineas_pasadas) <> 2 then raise exception 'FALLA P3: debían quedar 2 marcas'; end if;
  raise notice 'P3 · marcar dos veces no duplica ni cambia cuándo; desmarcar quita solo esa marca';
end $$;
reset role;

-- P4 · lectura: quien ve La base ve las marcas; quien no, nada; borrar el renglón se lleva la marca
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$ begin
  if (select count(*) from public.conteo_lineas_pasadas) <> 2 then raise exception 'FALLA P4: quien ve La base no ve las marcas (ve %)', (select count(*) from public.conteo_lineas_pasadas); end if;
end $$;
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set role probador;
do $$ begin
  if (select count(*) from public.conteo_lineas_pasadas) <> 0 then raise exception 'FALLA P4: quien no tiene La base ve las marcas'; end if;
end $$;
reset role;
delete from public.conteo_lineas where id = '11000000-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from public.conteo_lineas_pasadas where linea_id = '11000000-0000-0000-0000-000000000001') then raise exception 'FALLA P4: al borrar el renglón quedó su marca'; end if;
  raise notice 'P4 · lo ve quien ve La base, no lo ve quien no; borrar el renglón borra su marca';
end $$;
