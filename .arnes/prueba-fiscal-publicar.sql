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
on conflict (id) do update set activo = excluded.activo, nombre = excluded.nombre;
grant probador to postgres; grant authenticated to probador;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor','/inventario/fiscal','editar'), ('operador','/inventario/fiscal','ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba');

create table public._ids (k text primary key, v uuid); grant all on public._ids to public;
create function public.c(n int) returns text language sql as $$ select '''aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0') || '''' $$;


-- =====================================================================
-- DEL PLAN A «CONTAR»: el botón, lo que ve cada persona, y quién edita.
--
-- LO QUE PUEDE ROMPERSE:
--  P1  que un plan sin publicar le aparezca a alguien en Contar
--  P2  que, publicado, no le aparezca su hoja a cada persona (con su pareja y su equipo)
--  P3  que le aparezca a quien no está en ninguna hoja
--  P4  que «quitar de Contar» no lo quite
--  P5  que publique quien solo puede ver, un plan vacío o uno cerrado
--  P6  que un plan de un día que ya pasó siga apareciendo
--  P7  que quien no administra edite un plan cerrado, o que el admin no pueda
--  P8  que editar un plan ya publicado lo deje de mostrar
-- =====================================================================
create function public.hoy_bogota() returns date language sql as $$ select (now() at time zone 'America/Bogota')::date $$;
grant execute on function public.hoy_bogota() to public;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_id uuid; v_pasado uuid; v_vacio uuid;
begin
  v_id := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL OCTUBRE', public.hoy_bogota() + 3,
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(2)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(4)))::text || '},
       {"numero":3,"ol":' || to_jsonb(trim(both '''' from public.c(5)))::text || ',"bavaria":null}]')::jsonb);
  insert into public._ids values ('f', v_id);
  v_pasado := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL AYER', public.hoy_bogota() - 1,
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(6)))::text || ',"bavaria":null}]')::jsonb);
  insert into public._ids values ('pasado', v_pasado);
  v_vacio := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL VACIO', public.hoy_bogota() + 5,
    '[{"numero":1}]'::jsonb);
  insert into public._ids values ('vacio', v_vacio);
end $$;
reset role;

create function public.ve(n int) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'), true);
  set local role probador;
  select coalesce(string_agg(nombre || '/' || hoja || '/' || equipo || '/' || coalesce(pareja, '-') || '/' || coalesce(pareja_equipo, '-'), ' ; '), '') into r from public.inv_fiscal_mis_hojas();
  reset role;
  return r;
end $$;
grant execute on function public.ve(int) to public;

-- P1 · sin publicar, nadie lo ve
do $$ declare f text := ''; begin
  if public.ve(1) <> '' then f := f || E'\n   · un plan sin publicar le aparece a una persona: ' || public.ve(1); end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P1 · un plan sin mostrar en Contar no le aparece a nadie';
end $$;

-- P2 y P3 · publicado, cada quien ve SU hoja, con su pareja; quien no está, nada
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
select public.inv_fiscal_publicar((select v from public._ids where k='f'), true);
reset role;
do $$ declare f text := ''; begin
  if public.ve(1) <> 'FISCAL OCTUBRE/1/OL/Contador 2/BAVARIA' then f := f || E'\n   · la persona del OL de la hoja 1 ve: «' || public.ve(1) || '»'; end if;
  if public.ve(2) <> 'FISCAL OCTUBRE/1/BAVARIA/Contador 1/OL' then f := f || E'\n   · la persona de Bavaria de la hoja 1 ve: «' || public.ve(2) || '»'; end if;
  if public.ve(4) <> 'FISCAL OCTUBRE/2/BAVARIA/Contador 3/OL' then f := f || E'\n   · la hoja 2 de Bavaria ve: «' || public.ve(4) || '»'; end if;
  if public.ve(5) <> 'FISCAL OCTUBRE/3/OL/-/-' then f := f || E'\n   · la hoja a medias ve: «' || public.ve(5) || '»'; end if;
  if public.ve(7) <> '' then f := f || E'\n   · quien no está en ninguna hoja ve: «' || public.ve(7) || '»'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P2 · publicado, cada persona ve SU hoja, su equipo y su pareja; P3 · quien no está en ninguna hoja no ve nada';
end $$;

-- P8 · editar un plan ya publicado no lo deja de mostrar
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
select public.inv_fiscal_guardar((select v from public._ids where k='f'), 'bbbbbbbb-0000-0000-0000-000000000001', 'FISCAL OCTUBRE', public.hoy_bogota() + 3,
  ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(8)))::text || '},
     {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(4)))::text || '}]')::jsonb);
reset role;
do $$ declare f text := ''; begin
  if public.ve(8) <> 'FISCAL OCTUBRE/1/BAVARIA/Contador 1/OL' then f := f || E'\n   · tras editar, la persona nueva ve: «' || public.ve(8) || '»'; end if;
  if public.ve(2) <> '' then f := f || E'\n   · la persona que salió de la hoja sigue viéndola: «' || public.ve(2) || '»'; end if;
  if public.ve(1) <> 'FISCAL OCTUBRE/1/OL/Contador 8/BAVARIA' then f := f || E'\n   · el que se quedó ve: «' || public.ve(1) || '»'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P8 · editar un plan ya mostrado sigue mostrándose, con las parejas nuevas';
end $$;

-- P4 · quitar de Contar
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
select public.inv_fiscal_publicar((select v from public._ids where k='f'), false);
reset role;
do $$ declare f text := ''; begin
  if public.ve(1) <> '' then f := f || E'\n   · quitado de Contar, sigue apareciendo: ' || public.ve(1); end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P4 · «quitar de Contar» lo quita';
end $$;

-- P5 · quién puede publicar y qué
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.inv_fiscal_publicar((select v from public._ids where k=''f''), true)', '%permiso%', 'quien solo puede ver publicó el plan');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.inv_fiscal_publicar((select v from public._ids where k=''vacio''), true)', '%a nadie asignado%', 'se publicó un plan sin nadie asignado');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
update public.inv_fiscales set estado = 'cerrado' where id = (select v from public._ids where k='vacio');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.inv_fiscal_publicar((select v from public._ids where k=''vacio''), true)', '%ya está cerrado%', 'se publicó un plan cerrado');
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P5 · publica solo quien edita el fiscal, y no un plan vacío ni uno cerrado';
end $$;
reset role;

-- P6 · un plan de un día que ya pasó no aparece, aunque esté publicado
update public.inv_fiscales set publicado_en = now() where id = (select v from public._ids where k='pasado');
do $$ declare f text := ''; begin
  if public.ve(6) <> '' then f := f || E'\n   · un plan de ayer sigue apareciendo: ' || public.ve(6); end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P6 · un plan de un día que ya pasó deja de aparecer solo';
end $$;
-- y el de hoy sí aparece (el día es el de Colombia)
update public.inv_fiscales set fecha = public.hoy_bogota() where id = (select v from public._ids where k='pasado');
do $$ declare f text := ''; begin
  if public.ve(6) <> 'FISCAL AYER/1/OL/-/-' then f := f || E'\n   · un plan de HOY no aparece: «' || public.ve(6) || '»'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;

-- P7 · editar un plan cerrado: solo quien administra
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$ declare f text := ''; begin
  f := f || public._espera_error('select public.inv_fiscal_guardar((select v from public._ids where k=''vacio''), ''bbbbbbbb-0000-0000-0000-000000000001'', ''X'', current_date, ''[{"numero":1}]''::jsonb)', '%ya está cerrado%', 'un supervisor editó un plan cerrado');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare f text := ''; begin
  perform public.inv_fiscal_guardar((select v from public._ids where k='vacio'), 'bbbbbbbb-0000-0000-0000-000000000001', 'RENOMBRADO', current_date, '[{"numero":1}]'::jsonb);
  if (select nombre from public.inv_fiscales where id = (select v from public._ids where k='vacio')) <> 'RENOMBRADO' then f := f || E'\n   · el admin no pudo editar un plan cerrado'; end if;
  perform public.inv_fiscal_eliminar((select v from public._ids where k='vacio'));
  if exists (select 1 from public.inv_fiscales where id = (select v from public._ids where k='vacio')) then f := f || E'\n   · el admin no pudo eliminar el plan'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'P7 · un plan cerrado solo lo edita quien administra, que también lo elimina';
end $$;
reset role;
