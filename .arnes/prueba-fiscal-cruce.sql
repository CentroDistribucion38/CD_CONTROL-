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

/* Segundo material (sin factor de estiba) y tres sitios más. */
insert into public.productos (id, sku, nombre, cajas_por_estiba) values ('cccccccc-0000-0000-0000-000000000002','ENV1','Envase',null) on conflict do nothing;
create function public.ag2(n int, hoja text, ubi int, prod int, est text, sal text, caj text, dia text default 'null', mes text default 'null', anio text default 'null') returns text language sql as $$
  select public.como(n, 'select public.inv_fiscal_contar_agregar(' || public.id(hoja) || ',''dddddddd-0000-0000-0000-00000000000' || $3 || ''',''cccccccc-0000-0000-0000-00000000000' || $4 || ''',' || $5 || ',' || $6 || ',' || $7 || ',' || $8 || '::smallint,' || $9 || '::smallint,' || $10 || '::smallint,null)')
$$;
grant execute on function public.ag2(int, text, int, int, text, text, text, text, text, text) to public;
create function public.term(n int, hoja text, si boolean default true) returns text language sql as $$
  select public.como(n, 'select public.inv_fiscal_terminar(' || public.id(hoja) || ',' || $3 || ')::text')
$$;
grant execute on function public.term(int, text, boolean) to public;

-- =====================================================================
-- TERMINAR LA HOJA Y CRUZAR LA PAREJA
--  T1  terminar: solo quien es de la hoja, con el plan mostrado y desde su día, y con al menos un renglón
--  T2  una hoja terminada no se toca (ni anotar ni quitar); reabrir la devuelve
--  T3  «mis hojas» dice si terminé y si mi pareja terminó, y nada más de lo suyo
--  T4  el avance: solo cifras, para quien ve la pantalla
--  T5  el cruce: solo quien edita, solo con las dos terminadas, y clasifica bien
--  T6  editar el plan no pierde lo terminado ni mezcla a quien se cambió
--  T7  eliminar el plan se lleva lo terminado sin trabarse
-- =====================================================================

-- T1 · terminar
do $$ declare f text := ''; r text; begin
  r := public.term(1, 'h1');
  if r not like '%al menos un renglón%' then f := f || E'\n   · pudo terminar una hoja sin ningún renglón: ' || r; end if;
  r := public.term(7, 'h1');
  if r not like '%no es tuya%' then f := f || E'\n   · alguien que no es de la hoja la terminó: ' || r; end if;
  r := public.term(3, 'h1');
  if r not like '%no es tuya%' then f := f || E'\n   · una persona de OTRA hoja terminó la hoja 1: ' || r; end if;
  r := public.term(4, 'hf');
  if r not like '%Todavía no es el día%' then f := f || E'\n   · se pudo terminar antes del día: ' || r; end if;
  r := public.term(5, 'hn');
  if r not like '%no está visible en Contar%' then f := f || E'\n   · se pudo terminar un plan que no se ha mostrado: ' || r; end if;
  /* lo que cuentan los dos de la hoja 1 (OL = 1, Bavaria = 2) */
  perform public.ag2(1, 'h1', 1, 1, '3', '10', 'null');                 /* 172 cajas */
  perform public.ag2(1, 'h1', 2, 1, 'null', 'null', '20', '1', '2', '28');
  perform public.ag2(1, 'h1', 2, 1, 'null', 'null', '7', '5', '5', '28'); /* solo el OL */
  perform public.ag2(1, 'h1', 2, 2, 'null', 'null', '0');               /* un cero cuenta */
  perform public.ag2(2, 'h1', 1, 1, '4', 'null', 'null');               /* 216 cajas: difiere */
  perform public.ag2(2, 'h1', 2, 1, 'null', 'null', '20', '1', '2', '28'); /* coincide */
  perform public.ag2(2, 'h1', 1, 2, 'null', 'null', '5');               /* solo Bavaria */
  perform public.ag2(2, 'h1', 2, 2, 'null', 'null', '0');               /* cero con cero: coincide */
  perform public.ag2(2, 'h1', 2, 1, 'null', 'null', '3', '6', '6', '28'); /* mismo sitio y material, OTRO vencimiento */
  r := public.term(1, 'h1');
  if r like 'ERROR%' then f := f || E'\n   · el OL no pudo terminar con renglones anotados: ' || r; end if;
  r := public.term(1, 'h1');
  if r like 'ERROR%' then f := f || E'\n   · terminar dos veces dio error (debía ser inofensivo): ' || r; end if;
  if f <> '' then raise exception E'FALLA T1:%', f; end if;
  raise notice 'T1 · termina solo quien es de la hoja, con el plan mostrado, desde su día y con al menos un renglón';
end $$;

-- T2 · una hoja terminada no se toca
do $$ declare f text := ''; r text; v_id uuid; begin
  r := public.ag2(1, 'h1', 1, 1, '1', 'null', 'null', '9', '9', '29');
  if r not like '%Ya terminaste tu hoja%' then f := f || E'\n   · se pudo anotar en una hoja terminada: ' || r; end if;
  select id into v_id from public.inv_fiscal_conteos where contado_por = 'aaaaaaaa-0000-0000-0000-000000000001' and cajas = 7;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || v_id || ''')::text');
  if r not like '%Ya terminaste tu hoja%' then f := f || E'\n   · se pudo quitar un renglón de una hoja terminada: ' || r; end if;
  r := public.ag2(2, 'h1', 1, 1, '1', 'null', 'null', '9', '9', '29');
  if r like 'ERROR%' then f := f || E'\n   · la pareja que NO terminó no pudo anotar: ' || r; end if;
  /* Reabrir devuelve el derecho a anotar y a quitar. */
  r := public.term(1, 'h1', false);
  if r like 'ERROR%' then f := f || E'\n   · no pudo reabrir su hoja: ' || r; end if;
  r := public.como(1, 'select public.inv_fiscal_contar_quitar(''' || v_id || ''')::text');
  if r like 'ERROR%' then f := f || E'\n   · reabierta, no pudo quitar un renglón: ' || r; end if;
  r := public.ag2(1, 'h1', 2, 1, 'null', 'null', '7', '5', '5', '28');
  if r like 'ERROR%' then f := f || E'\n   · reabierta, no pudo volver a anotar: ' || r; end if;
  delete from public.inv_fiscal_conteos where contado_por = 'aaaaaaaa-0000-0000-0000-000000000002' and venc_dia = 9;
  perform public.term(1, 'h1');
  if f <> '' then raise exception E'FALLA T2:%', f; end if;
  raise notice 'T2 · terminada, no se anota ni se quita; reabrir lo devuelve';
end $$;

-- T3 · mis hojas
do $$ declare f text := ''; r text; begin
  r := public.como(1, $q$select termine::text || '/' || pareja_termino::text from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'true/false' then f := f || E'\n   · el OL debía ver termine=true y pareja_termino=false: ' || r; end if;
  r := public.como(2, $q$select termine::text || '/' || pareja_termino::text from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'false/true' then f := f || E'\n   · Bavaria debía ver termine=false y pareja_termino=true: ' || r; end if;
  r := public.como(3, $q$select termine::text || '/' || pareja_termino::text from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'false/false' then f := f || E'\n   · quien está solo en su hoja debía ver false/false: ' || r; end if;
  /* A CIEGAS: la función no devuelve nada de lo que contó la pareja. */
  r := (select pg_get_function_result(p.oid) from pg_proc p where p.proname = 'inv_fiscal_mis_hojas');
  if r ~* 'cajas|sku|material|producto|ubicacion' then f := f || E'\n   · «mis hojas» devuelve datos de lo contado: ' || r; end if;
  if f <> '' then raise exception E'FALLA T3:%', f; end if;
  raise notice 'T3 · mis hojas dice si terminé y si mi pareja terminó, sin nada de lo contado';
end $$;

-- T4 · el avance
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$ declare f text := ''; n int; a record; begin
  select * into a from public.inv_fiscal_avance() where numero = 1 and fiscal_id = (select v from public._ids where k = 'hoy');
  if a.ol_renglones <> 4 or a.bavaria_renglones <> 5 then f := f || E'\n   · los renglones del avance: OL ' || a.ol_renglones || ' (4) y Bavaria ' || a.bavaria_renglones || ' (5)'; end if;
  if a.ol_termino is null or a.bavaria_termino is not null then f := f || E'\n   · el OL debía figurar terminado y Bavaria no'; end if;
  if f <> '' then raise exception E'FALLA T4:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select * from public.inv_fiscal_avance()', '%requiere el permiso%', 'quien no ve el fiscal pudo ver el avance');
  if f <> '' then raise exception E'FALLA T4:%', f; end if;
  raise notice 'T4 · el avance trae solo cifras y solo lo ve quien ve el inventario fiscal';
end $$;
reset role;

-- T5 · el cruce
do $$ declare f text := ''; r text; begin
  /* Antes de que las dos terminen. */
  r := public.como(1, 'select count(*)::text from public.inv_fiscal_cruce(' || public.id('h1') || ')');
  if r not like '%permiso%' then f := f || E'\n   · un contador (solo ve) pudo pedir el cruce: ' || r; end if;
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select * from public.inv_fiscal_cruce(' || public.id('h1') || ')', '%las dos personas%terminan%', 'se cruzó con una sola persona terminada');
  f := f || public._espera_error('select * from public.inv_fiscal_cruce(' || public.id('h2') || ')', '%las dos personas%terminan%', 'se cruzó una hoja de una sola persona');
  f := f || public._espera_error('select * from public.inv_fiscal_cruce(''99999999-9999-9999-9999-999999999999'')', '%no existe%', 'se cruzó una hoja que no existe');
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
reset role;
do $$ declare f text := ''; r text; begin
  r := public.term(2, 'h1');
  if r like 'ERROR%' then f := f || E'\n   · Bavaria no pudo terminar: ' || r; end if;
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select * from public.inv_fiscal_cruce(' || public.id('h1') || ')', '%requiere el permiso%', 'quien solo ve pudo cruzar');
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; x record; n int := 0; v text := ''; begin
  for x in select * from public.inv_fiscal_cruce((select id from public.inv_fiscal_hojas h join public._ids i on i.k = 'h1' and i.v = h.id)) loop
    n := n + 1;
    v := v || x.ubicacion || '|' || x.sku || '|' || coalesce(x.venc_dia::text, '-') || '|' || coalesce(x.cajas_ol::text, '-') || '|' || coalesce(x.cajas_bavaria::text, '-') || '|' || x.diferencia || '|' || x.estado || E'\n';
  end loop;
  if n <> 6 then f := f || E'\n   · el cruce trae ' || n || ' filas (esperaba 6):' || E'\n' || v; end if;
  if v not like '%A01_DER|3128|-|172|216|-44|DIFIERE%' then f := f || E'\n   · estibas × factor + saldo contra estibas: ' || v; end if;
  if v not like '%A02_DER|3128|1|20|20|0|COINCIDE%' then f := f || E'\n   · mismo sitio, material, vencimiento y cajas debía COINCIDIR: ' || v; end if;
  if v not like '%A02_DER|3128|5|7|-|7|SOLO_OL%' then f := f || E'\n   · lo anotado solo por el OL: ' || v; end if;
  if v not like '%A02_DER|3128|6|-|3|-3|SOLO_BAVARIA%' then f := f || E'\n   · otro vencimiento debía salir como dos filas, una de cada equipo: ' || v; end if;
  if v not like '%A01_DER|ENV1|-|-|5|-5|SOLO_BAVARIA%' then f := f || E'\n   · lo anotado solo por Bavaria: ' || v; end if;
  if v not like '%A02_DER|ENV1|-|0|0|0|COINCIDE%' then f := f || E'\n   · cero contra cero debía COINCIDIR: ' || v; end if;
  /* Lo que no coincide va primero y lo que coincide, al final. */
  if split_part(v, E'\n', 5) not like '%COINCIDE%' or split_part(v, E'\n', 6) not like '%COINCIDE%' or split_part(v, E'\n', 1) like '%COINCIDE%' then
    f := f || E'\n   · el orden: lo que no coincide primero y lo que coincide al final: ' || v; end if;
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ declare f text := ''; begin
  if (select count(*) from public.inv_fiscal_cruce((select id from public.inv_fiscal_hojas h join public._ids i on i.k = 'h1' and i.v = h.id))) <> 6 then
    f := f || E'\n   · el administrador no pudo cruzar'; end if;
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
reset role;
/* Reabrir deshace el cruce. */
do $$ declare f text := ''; r text; begin
  perform public.term(2, 'h1', false);
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select * from public.inv_fiscal_cruce((select id from public.inv_fiscal_hojas h join public._ids i on i.k = ''h1'' and i.v = h.id))', '%las dos personas%terminan%', 'con una hoja reabierta todavía se pudo cruzar');
  if f <> '' then raise exception E'FALLA T5:%', f; end if;
  raise notice 'T5 · el cruce: solo quien edita, solo con las dos terminadas; coincide / difiere / solo uno / otro vencimiento / ceros; reabrir lo cierra';
end $$;
reset role;

-- T6 · editar el plan
do $$ declare f text := ''; r text; vf uuid; begin
  perform public.term(2, 'h1');
  select z.v into vf from public._ids z where z.k = 'hoy';
  /* El plan se edita (cambia el nombre) con las mismas parejas: lo terminado sigue terminado. */
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  set local role probador;
  perform public.inv_fiscal_guardar(vf, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL HOY EDITADO', public.hoy_bogota(),
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(2)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":null}]')::jsonb);
  reset role;
  r := public.como(1, $q$select termine::text from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'true' then f := f || E'\n   · editar el plan hizo perder lo terminado del OL: ' || r; end if;
  r := public.como(2, $q$select termine::text from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'true' then f := f || E'\n   · editar el plan hizo perder lo terminado de Bavaria: ' || r; end if;
  /* Se cambia a la persona de Bavaria (2 → 6): la nueva no hereda lo terminado y lo del anterior no se mezcla. */
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  set local role probador;
  perform public.inv_fiscal_guardar(vf, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL HOY EDITADO', public.hoy_bogota(),
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(6)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":null}]')::jsonb);
  reset role;
  r := public.como(6, $q$select termine::text || '/' || pareja_termino::text || '/' || mis_renglones from public.inv_fiscal_mis_hojas() where hoja = 1$q$);
  if r <> 'false/true/0' then f := f || E'\n   · quien reemplazó a la pareja debía ver false/true/0: ' || r; end if;
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  set local role probador;
  begin
    perform * from public.inv_fiscal_cruce((select id from public.inv_fiscal_hojas h join public._ids i on i.k = 'h1' and i.v = h.id));
    f := f || E'\n   · se cruzó con una persona nueva que todavía no terminó';
  exception when others then
    if sqlerrm not like '%las dos personas%terminan%' then f := f || E'\n   · otro error: ' || sqlerrm; end if;
  end;
  select count(*) filter (where bavaria_renglones = 0) into r from public.inv_fiscal_avance() where numero = 1 and fiscal_id = vf;
  if r::int <> 1 then f := f || E'\n   · el avance contó lo de quien ya no está en la hoja'; end if;
  reset role;
  if f <> '' then raise exception E'FALLA T6:%', f; end if;
  raise notice 'T6 · editar el plan no pierde lo terminado, y a quien se cambia no se le mezcla lo del anterior';
end $$;

-- T7 · eliminar el plan con hojas terminadas
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ declare f text := ''; vf uuid; begin
  select z.v into vf from public._ids z where z.k = 'hoy';
  perform public.inv_fiscal_eliminar(vf);
  reset role;
  if exists (select 1 from public.inv_fiscal_conteos where fiscal_id = vf) or exists (select 1 from public.inv_fiscal_terminos) then
    f := f || E'\n   · eliminar el plan dejó conteos o terminados sueltos';
  end if;
  if f <> '' then raise exception E'FALLA T7:%', f; end if;
  raise notice 'T7 · eliminar un plan con hojas terminadas se lleva todo sin trabarse';
end $$;
reset role;
