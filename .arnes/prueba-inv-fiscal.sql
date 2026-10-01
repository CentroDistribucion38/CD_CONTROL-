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

-- ---------------------------------------------------------------------
-- F1 · SE GUARDA COMPLETO: cabecera, hojas numeradas y las dos personas de cada una
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_id uuid;
begin
  v_id := public.inv_fiscal_guardar(null, 'bbbbbbbb-0000-0000-0000-000000000001', '  Fiscal octubre  ', date '2026-10-02',
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(2)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(4)))::text || '},
       {"numero":3,"ol":' || to_jsonb(trim(both '''' from public.c(5)))::text || ',"bavaria":null}]')::jsonb);
  insert into public._ids values ('f', v_id);
end $$;
reset role;
do $$
declare v uuid := (select v from public._ids where k='f'); f text := '';
begin
  if (select nombre from public.inv_fiscales where id = v) <> 'Fiscal octubre' then f := f || E'\n   · el nombre no quedó sin espacios sobrantes'; end if;
  if (select estado from public.inv_fiscales where id = v) <> 'abierto' then f := f || E'\n   · no arrancó abierto'; end if;
  if (select fecha from public.inv_fiscales where id = v) <> date '2026-10-02' then f := f || E'\n   · la fecha no quedó'; end if;
  if (select string_agg(numero::text, ',' order by numero) from public.inv_fiscal_hojas where fiscal_id = v) <> '1,2,3' then f := f || E'\n   · las hojas no son 1,2,3'; end if;
  if (select count(*) from public.inv_fiscal_miembros where fiscal_id = v) <> 5 then f := f || E'\n   · no quedaron las 5 personas'; end if;
  if not exists (select 1 from public.inv_fiscal_miembros m join public.inv_fiscal_hojas h on h.id = m.hoja_id
                  where h.numero = 2 and m.equipo = 'OL' and m.user_id = 'aaaaaaaa-0000-0000-0000-000000000003')
     or not exists (select 1 from public.inv_fiscal_miembros m join public.inv_fiscal_hojas h on h.id = m.hoja_id
                  where h.numero = 2 and m.equipo = 'BAVARIA' and m.user_id = 'aaaaaaaa-0000-0000-0000-000000000004') then
    f := f || E'\n   · la pareja de la hoja 2 no quedó con su equipo'; end if;
  /* La hoja 3 quedó a medias y eso se permite. */
  if (select count(*) from public.inv_fiscal_miembros m join public.inv_fiscal_hojas h on h.id = m.hoja_id where h.numero = 3) <> 1 then
    f := f || E'\n   · la hoja a medias no quedó con una sola persona'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'F1 · el inventario fiscal se guarda completo: hojas numeradas y, en cada una, la persona del OL y la de Bavaria (una hoja puede quedar a medias)';
end $$;

-- ---------------------------------------------------------------------
-- F2 · LO QUE NO SE ACEPTA, y no deja nada a medias
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := ''; b constant text := 'bbbbbbbb-0000-0000-0000-000000000001';
  q text;
begin
  /* una persona en dos hojas */
  q := 'select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || '},{"numero":2,"bavaria":' || to_jsonb(trim(both '''' from public.c(1)))::text || '}]''::jsonb)';
  f := f || public._espera_error(q, '%solo puede estar en una hoja%', 'una persona quedó en dos hojas');
  /* la misma persona de los dos equipos en una hoja */
  q := 'select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(1)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(1)))::text || '}]''::jsonb)';
  f := f || public._espera_error(q, '%no puede ser del OL y de Bavaria%', 'la misma persona fue del OL y de Bavaria');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":1},{"numero":1}]''::jsonb)', '%está repetida%', 'aceptó la hoja 1 dos veces');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":0}]''::jsonb)', '%desde el 1%', 'aceptó la hoja 0');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"ol":null}]''::jsonb)', '%desde el 1%', 'aceptó una hoja sin número');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[]''::jsonb)', '%al menos una hoja%', 'aceptó cero hojas');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''   '',current_date,''[{"numero":1}]''::jsonb)', '%necesita un nombre%', 'aceptó un nombre en blanco');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',null,''[{"numero":1}]''::jsonb)', '%necesita una fecha%', 'aceptó sin fecha');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''bbbbbbbb-0000-0000-0000-00000000ffff'',''X'',current_date,''[{"numero":1}]''::jsonb)', '%bodega no existe%', 'aceptó una bodega que no existe');
  /* una persona desactivada (el contador 9) y una que no existe */
  q := 'select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(9)))::text || '}]''::jsonb)';
  f := f || public._espera_error(q, '%no existe o está desactivada%', 'aceptó a una persona desactivada');
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''' || b || ''',''X'',current_date,''[{"numero":1,"ol":"aaaaaaaa-9999-0000-0000-000000000000"}]''::jsonb)', '%no existe o está desactivada%', 'aceptó a una persona que no existe');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.inv_fiscales) <> 1 or (select count(*) from public.inv_fiscal_hojas) <> 3 or (select count(*) from public.inv_fiscal_miembros) <> 5 then
    raise exception 'FALLA: un rechazo dejó algo a medias (% fiscales, % hojas, % personas)', (select count(*) from public.inv_fiscales), (select count(*) from public.inv_fiscal_hojas), (select count(*) from public.inv_fiscal_miembros);
  end if;
  raise notice 'F2 · rechaza persona en dos hojas, la misma persona en los dos equipos, hoja repetida o sin número, sin hojas, sin nombre/fecha, bodega o persona inexistente o desactivada, y no deja nada a medias';
end $$;

-- ---------------------------------------------------------------------
-- F3 · VOLVER A GUARDAR: cambia parejas, quita una hoja y agrega otra; la hoja que sigue conserva su id
-- ---------------------------------------------------------------------
create temp table _antes as select id from public.inv_fiscal_hojas where numero = 1 and fiscal_id = (select v from public._ids where k='f');
grant all on _antes to public;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v uuid := (select v from public._ids where k='f'); r uuid;
begin
  /* intercambian las dos personas de la hoja 1; se quita la 3; entra la 4 */
  r := public.inv_fiscal_guardar(v, 'bbbbbbbb-0000-0000-0000-000000000001', 'Fiscal octubre 2', date '2026-10-03',
    ('[{"numero":1,"ol":' || to_jsonb(trim(both '''' from public.c(2)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(1)))::text || '},
       {"numero":2,"ol":' || to_jsonb(trim(both '''' from public.c(3)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(4)))::text || '},
       {"numero":4,"ol":' || to_jsonb(trim(both '''' from public.c(5)))::text || ',"bavaria":' || to_jsonb(trim(both '''' from public.c(6)))::text || '}]')::jsonb);
  if r <> v then raise exception 'FALLA: guardar con id devolvió otro inventario'; end if;
end $$;
reset role;
do $$
declare v uuid := (select v from public._ids where k='f'); f text := '';
begin
  if (select string_agg(numero::text, ',' order by numero) from public.inv_fiscal_hojas where fiscal_id = v) <> '1,2,4' then f := f || E'\n   · las hojas no quedaron 1,2,4'; end if;
  if (select id from public.inv_fiscal_hojas where fiscal_id = v and numero = 1) <> (select id from _antes) then f := f || E'\n   · la hoja 1 cambió de id al volver a guardar'; end if;
  if (select count(*) from public.inv_fiscal_miembros where fiscal_id = v) <> 6 then f := f || E'\n   · no son 6 personas'; end if;
  if not exists (select 1 from public.inv_fiscal_miembros m join public.inv_fiscal_hojas h on h.id = m.hoja_id
                  where h.numero = 1 and m.equipo = 'OL' and m.user_id = 'aaaaaaaa-0000-0000-0000-000000000002') then f := f || E'\n   · el cambio de pareja de la hoja 1 no quedó'; end if;
  if (select nombre from public.inv_fiscales where id = v) <> 'Fiscal octubre 2' or (select fecha from public.inv_fiscales where id = v) <> date '2026-10-03' then f := f || E'\n   · no cambió el nombre o la fecha'; end if;
  if (select count(*) from public.inv_fiscales) <> 1 then f := f || E'\n   · volver a guardar creó otro inventario'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
  raise notice 'F3 · volver a guardar reemplaza parejas, quita y agrega hojas, y la hoja que sigue conserva su id';
end $$;

-- ---------------------------------------------------------------------
-- F4 · PERMISOS: guarda quien edita; el que solo ve, no; ver depende del permiso
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''bbbbbbbb-0000-0000-0000-000000000001'',''X'',current_date,''[{"numero":1}]''::jsonb)', '%requiere el permiso%', 'quien solo ve pudo armar un inventario fiscal');
  if (select count(*) from public.inv_fiscales) <> 1 then f := f || E'\n   · quien tiene «ver» no ve el inventario'; end if;
  if (select count(*) from public.inv_fiscal_miembros) <> 6 then f := f || E'\n   · quien tiene «ver» no ve las parejas'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error('select public.inv_fiscal_guardar(null,''bbbbbbbb-0000-0000-0000-000000000001'',''X'',current_date,''[{"numero":1}]''::jsonb)', '%requiere el permiso%', 'quien no tiene permiso pudo armar uno');
  if (select count(*) from public.inv_fiscales) <> 0 or (select count(*) from public.inv_fiscal_hojas) <> 0 or (select count(*) from public.inv_fiscal_miembros) <> 0 then f := f || E'\n   · quien no tiene permiso ve inventarios fiscales'; end if;
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
do $$ begin raise notice 'F4 · arma quien edita; quien solo ve lo ve pero no lo cambia; sin permiso no ve nada'; end $$;

-- ---------------------------------------------------------------------
-- F5 · CERRADO NO SE TOCA; ELIMINAR ES SOLO DE QUIEN ADMINISTRA Y SE LLEVA TODO
-- ---------------------------------------------------------------------
update public.inv_fiscales set estado = 'cerrado' where id = (select v from public._ids where k='f');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := '';
begin
  f := f || public._espera_error('select public.inv_fiscal_guardar(''' || (select v from public._ids where k='f') || ''',''bbbbbbbb-0000-0000-0000-000000000001'',''X'',current_date,''[{"numero":1}]''::jsonb)', '%ya está cerrado%', 'se pudo cambiar un inventario cerrado');
  f := f || public._espera_error('select public.inv_fiscal_eliminar(''' || (select v from public._ids where k='f') || ''')', '%Solo quien administra%', 'quien no administra pudo eliminar');
  if f <> '' then raise exception E'FALLA:%', f; end if;
end $$;
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set role probador;
do $$ begin perform public.inv_fiscal_eliminar((select v from public._ids where k='f')); end $$;
reset role;
do $$
begin
  if exists (select 1 from public.inv_fiscales) or exists (select 1 from public.inv_fiscal_hojas) or exists (select 1 from public.inv_fiscal_miembros) then
    raise exception 'FALLA: eliminar no se llevó las hojas y las parejas';
  end if;
  raise notice 'F5 · un inventario cerrado no se cambia; eliminar es solo de quien administra y se lleva hojas y parejas';
end $$;
