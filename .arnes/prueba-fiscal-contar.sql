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

/* jefe (admin), sup (edita el fiscal), lector (solo ve), ajeno (sin permiso) y ocho contadores. */
insert into auth.users (id, email)
select ('aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@cdcontrol.local' from generate_series(1, 9) n
on conflict do nothing;
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
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
insert into public.perfiles (id, usuario, nombre, rol, activo)
select ('aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'c' || n, 'Contador ' || n, 'operador', n <> 9 from generate_series(1, 9) n
on conflict (id) do update set activo = excluded.activo, nombre = excluded.nombre, rol = excluded.rol;
grant probador to postgres; grant authenticated to probador;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor','/inventario/fiscal','editar'), ('operador','/inventario/fiscal','ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba');

create table public._ids (k text primary key, v uuid); grant all on public._ids to public;
create function public.c(n int) returns text language sql as $$ select '''aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0') || '''' $$;
insert into public.productos (id, sku, nombre, cajas_por_estiba) values ('cccccccc-0000-0000-0000-000000000001','3128','Aguila',54) on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER'),
  ('dddddddd-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000001','A02_DER','A','02','DER');
create function public.hoy_bogota() returns date language sql as $$ select (now() at time zone 'America/Bogota')::date $$;
grant execute on function public.hoy_bogota() to public;

-- =====================================================================
-- CONTAR LA HOJA DEL FISCAL
--  K1  quién puede contar: solo asignado, plan mostrado en Contar, abierto y desde el día
--  K2  validaciones de lo que se anota (cantidad, estibas o cajas, fecha completa, repetido)
--  K3  A CIEGAS: cada uno ve solo lo suyo; la tabla no se lee directo; el admin ve todo
--  K4  quitar: solo el propio, y mientras esté abierto
--  K5  «mis hojas» trae el id de la hoja, si ya se puede contar y cuántos renglones lleva
--  K6  una hoja con conteos no se quita del plan; borrar el plan entero sí
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_hoy uuid; v_futuro uuid; v_nopub uuid;
begin
  v_hoy := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL HOY', public.hoy_bogota(),
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(2)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":null}]')::jsonb);
  v_futuro := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL FUTURO', public.hoy_bogota() + 4,
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(4)))::text || ',"bavaria":null}]')::jsonb);
  v_nopub := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL SIN MOSTRAR', public.hoy_bogota(),
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(5)))::text || ',"bavaria":null}]')::jsonb);
  insert into public._ids values ('hoy', v_hoy), ('futuro', v_futuro), ('nopub', v_nopub);
  perform public.inv_fiscal_publicar(v_hoy, true);
  perform public.inv_fiscal_publicar(v_futuro, true);
end $$;
reset role;
insert into public._ids select 'h1', id from public.inv_fiscal_hojas where fiscal_id = (select v from public._ids where k='hoy') and numero = 1;
insert into public._ids select 'h2', id from public.inv_fiscal_hojas where fiscal_id = (select v from public._ids where k='hoy') and numero = 2;
insert into public._ids select 'hf', id from public.inv_fiscal_hojas where fiscal_id = (select v from public._ids where k='futuro');
insert into public._ids select 'hn', id from public.inv_fiscal_hojas where fiscal_id = (select v from public._ids where k='nopub');

create function public.como(n int, q text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'), true);
  set local role probador;
  begin execute q into r; exception when others then r := 'ERROR: ' || sqlerrm; end;
  reset role;
  return r;
end $$;
grant execute on function public.como(int, text) to public;
create function public.id(k text) returns text language sql as $$ select '''' || (select v from public._ids where _ids.k = $1) || '''' $$;
grant execute on function public.id(text) to public;
create function public.ag(n int, hoja text, ubi int, est text, sal text, caj text, dia text default 'null', mes text default 'null', anio text default 'null') returns text language sql as $$
  select public.como(n, 'select public.inv_fiscal_contar_agregar(' || public.id(hoja) || ',''dddddddd-0000-0000-0000-00000000000' || $3 || ''',''cccccccc-0000-0000-0000-000000000001'',' || $4 || ',' || $5 || ',' || $6 || ',' || $7 || '::smallint,' || $8 || '::smallint,' || $9 || '::smallint,null)::text')
$$;
grant execute on function public.ag(int, text, int, text, text, text, text, text, text) to public;

-- K1 · quién puede contar
do $$ declare f text := ''; r text; begin
  r := public.ag(1, 'h1', 1, '3', '10', 'null');
  if r like 'ERROR%' then f := f || E'\n   · la persona del OL de la hoja 1 no pudo anotar: ' || r; end if;
  r := public.ag(2, 'h1', 1, '4', 'null', 'null');
  if r like 'ERROR%' then f := f || E'\n   · la persona de Bavaria de la hoja 1 no pudo anotar: ' || r; end if;
  r := public.ag(3, 'h1', 1, '1', 'null', 'null');
  if r not like '%no es tuya%' then f := f || E'\n   · una persona de OTRA hoja anotó en la hoja 1: ' || r; end if;
  r := public.ag(7, 'h1', 1, '1', 'null', 'null');
  if r not like '%no es tuya%' then f := f || E'\n   · alguien que no está en ninguna hoja anotó: ' || r; end if;
  r := public.ag(4, 'hf', 1, '1', 'null', 'null');
  if r not like '%Todavía no es el día%' then f := f || E'\n   · se pudo contar antes del día del inventario: ' || r; end if;
  r := public.ag(5, 'hn', 1, '1', 'null', 'null');
  if r not like '%no está visible en Contar%' then f := f || E'\n   · se pudo contar un plan que no se ha mostrado en Contar: ' || r; end if;
  if f <> '' then raise exception E'FALLA K1:%', f; end if;
  raise notice 'K1 · solo cuenta quien está en esa hoja, con el plan mostrado y desde su día';
end $$;

-- K2 · validaciones
do $$ declare f text := ''; r text; begin
  r := public.ag(1, 'h1', 2, 'null', 'null', 'null');
  if r not like '%Falta la cantidad%' then f := f || E'\n   · aceptó un renglón sin cantidad: ' || r; end if;
  r := public.ag(1, 'h1', 2, '2', 'null', '30');
  if r not like '%estibas (con su saldo) o cajas%' then f := f || E'\n   · aceptó estibas y cajas a la vez: ' || r; end if;
  r := public.ag(1, 'h1', 2, '-1', 'null', 'null');
  if r not like '%negativas%' and r not like '%violates check%' then f := f || E'\n   · aceptó una cantidad negativa: ' || r; end if;
  r := public.ag(1, 'h1', 2, '1', 'null', 'null', '5', 'null', 'null');
  if r not like '%va completa%' then f := f || E'\n   · aceptó una fecha a medias: ' || r; end if;
  r := public.ag(1, 'h1', 2, '1', 'null', 'null', '31', '13', '27');
  if r not like '%no es válida%' then f := f || E'\n   · aceptó un mes 13: ' || r; end if;
  r := public.ag(1, 'h1', 1, '9', 'null', 'null', '1', '5', '28');
  if r like 'ERROR%' then f := f || E'\n   · el mismo sitio y material, ahora CON fecha, debe poder anotarse: ' || r; end if;
  r := public.ag(1, 'h1', 1, '9', 'null', 'null', '1', '5', '28');
  if r not like '%Ya anotaste%' then f := f || E'\n   · aceptó el mismo material en el mismo sitio y vencimiento dos veces: ' || r; end if;
  r := public.ag(1, 'h1', 2, '2', 'null', 'null', '1', '2', '28');
  if r like 'ERROR%' then f := f || E'\n   · un renglón válido con fecha no pasó: ' || r; end if;
  r := public.ag(1, 'h1', 2, '2', 'null', 'null', '1', '3', '28');
  if r like 'ERROR%' then f := f || E'\n   · el mismo material con OTRO vencimiento debe poder anotarse: ' || r; end if;
  r := public.ag(1, 'h1', 2, 'null', 'null', '0', '1', '4', '28');
  if r like 'ERROR%' then f := f || E'\n   · contar cero cajas debe valer (hay un cero): ' || r; end if;
  if f <> '' then raise exception E'FALLA K2:%', f; end if;
  raise notice 'K2 · cantidad, estibas o cajas, fecha completa y válida, sin repetir, y el cero cuenta';
end $$;

-- K3 · a ciegas
do $$ declare f text := ''; r text; begin
  r := public.como(1, 'select count(*)::text from public.inv_fiscal_contar_mios(' || public.id('h1') || ')');
  if r <> '5' then f := f || E'\n   · el del OL ve ' || r || ' renglones (eran 5: 1 de K1 + 4 de K2)'; end if;
  r := public.como(2, 'select count(*)::text from public.inv_fiscal_contar_mios(' || public.id('h1') || ')');
  if r <> '1' then f := f || E'\n   · el de Bavaria ve ' || r || ' (debía ver solo su 1)'; end if;
  r := public.como(2, 'select string_agg(estibas::text, '','') from public.inv_fiscal_contar_mios(' || public.id('h1') || ')');
  if r <> '4' then f := f || E'\n   · el de Bavaria ve datos que no son suyos: ' || r; end if;
  r := public.como(3, 'select count(*)::text from public.inv_fiscal_contar_mios(' || public.id('h1') || ')');
  if r <> '0' then f := f || E'\n   · alguien de otra hoja ve renglones de la hoja 1: ' || r; end if;
  r := public.como(1, 'select count(*)::text from public.inv_fiscal_conteos');
  if r <> '0' then f := f || E'\n   · una persona lee la tabla directamente (' || r || ' filas)'; end if;
  r := public.como(2, 'select count(*)::text from public.inv_fiscal_conteos');
  if r <> '0' then f := f || E'\n   · la pareja lee la tabla directamente (' || r || ' filas)'; end if;
  if f <> '' then raise exception E'FALLA K3:%', f; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ declare n bigint; begin
  select count(*) into n from public.inv_fiscal_conteos;
  if n <> 6 then raise exception 'FALLA K3: el administrador ve % filas (eran 6)', n; end if;
  raise notice 'K3 · a ciegas: cada uno ve lo suyo, la tabla no se lee directo y el administrador ve todo';
end $$;
reset role;

-- K4 · quitar
do $$ declare f text := ''; r text; mio uuid; ajeno uuid; begin
  select id into ajeno from public.inv_fiscal_conteos where contado_por = 'aaaaaaaa-0000-0000-0000-000000000002';
  select id into mio from public.inv_fiscal_conteos where contado_por = 'aaaaaaaa-0000-0000-0000-000000000001' and cajas = 0;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || ajeno || ''')::text');
  if r not like '%no es tuyo%' then f := f || E'\n   · quitó el renglón de su pareja: ' || r; end if;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || mio || ''')::text');
  if r like 'ERROR%' then f := f || E'\n   · no pudo quitar su propio renglón: ' || r; end if;
  if exists (select 1 from public.inv_fiscal_conteos where id = mio) then f := f || E'\n   · el renglón sigue después de quitarlo'; end if;
  if not exists (select 1 from public.inv_fiscal_conteos where id = ajeno) then f := f || E'\n   · se borró el renglón de la pareja'; end if;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || mio || ''')::text');
  if r not like '%no es tuyo o ya no existe%' then f := f || E'\n   · quitar uno que ya no existe no avisa: ' || r; end if;
  if f <> '' then raise exception E'FALLA K4:%', f; end if;
end $$;
/* Cerrado: ya no se anota ni se quita. */
update public.inv_fiscales set estado = 'cerrado' where id = (select v from public._ids where k='hoy');
do $$ declare f text := ''; r text; mio uuid; begin
  select id into mio from public.inv_fiscal_conteos where contado_por = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || mio || ''')::text');
  if r not like '%cerrado%' then f := f || E'\n   · quitó un renglón de un inventario cerrado: ' || r; end if;
  r := public.ag(1, 'h1', 2, '7', 'null', 'null');
  if r not like '%cerrado%' then f := f || E'\n   · anotó en un inventario cerrado: ' || r; end if;
  if f <> '' then raise exception E'FALLA K4:%', f; end if;
  raise notice 'K4 · quita solo lo propio; cerrado, ya no se anota ni se quita';
end $$;
update public.inv_fiscales set estado = 'abierto' where id = (select v from public._ids where k='hoy');

-- K5 · mis hojas
do $$ declare f text := ''; r text; begin
  r := public.como(1, 'select hoja_id::text || ''/'' || puede_contar || ''/'' || mis_renglones from public.inv_fiscal_mis_hojas()');
  if r <> (select v::text from public._ids where k='h1') || '/true/4' then f := f || E'\n   · mis hojas del OL: ' || r; end if;
  r := public.como(4, 'select puede_contar::text from public.inv_fiscal_mis_hojas()');
  if r <> 'false' then f := f || E'\n   · un inventario de otro día dice que ya se puede contar: ' || r; end if;
  r := public.como(3, 'select hoja_id::text || ''/'' || mis_renglones from public.inv_fiscal_mis_hojas()');
  if r <> (select v::text from public._ids where k='h2') || '/0' then f := f || E'\n   · la hoja 2 sin renglones: ' || r; end if;
  if f <> '' then raise exception E'FALLA K5:%', f; end if;
  raise notice 'K5 · mis hojas trae el id de la hoja, si ya se puede contar y cuántos renglones lleva';
end $$;

-- K6 · una hoja con conteos no se quita; la que no tiene sí; el plan entero sí
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error($q$select public.inv_fiscal_guardar((select v from public._ids where k='hoy'), 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL HOY', public.hoy_bogota(), '[{"numero":2}]'::jsonb)$q$, '%ya tiene conteos%', 'quitó una hoja que ya tenía conteos');
  if f <> '' then raise exception E'FALLA K6:%', f; end if;
  /* Quitar la hoja 2 (sin conteos) sí se puede. */
  perform public.inv_fiscal_guardar((select v from public._ids where k='hoy'), 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL HOY', public.hoy_bogota(),
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(2)))::text || '}]')::jsonb);
end $$;
reset role;
do $$ begin
  if (select count(*) from public.inv_fiscal_conteos where hoja_id = (select v from public._ids where k='h1')) <> 5 then raise exception 'FALLA K6: editar el plan perdió conteos'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = (select v from public._ids where k='h2')) then raise exception 'FALLA K6: no se pudo quitar la hoja sin conteos'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
select public.inv_fiscal_eliminar((select v from public._ids where k='hoy'));
reset role;
do $$ begin
  if exists (select 1 from public.inv_fiscal_conteos) then raise exception 'FALLA K6: al eliminar el plan quedaron conteos'; end if;
  raise notice 'K6 · una hoja con conteos no se quita al editar; la vacía sí; eliminar el plan entero se lleva todo';
end $$;
