#!/usr/bin/env bash
# =====================================================================
# ACCIONES · CORREGIR Y ELIMINAR, contra Postgres de verdad.
#   bash .arnes/correr-acciones-depurar.sh
# Se comprueba que corregir cambie lo que debe y deje la línea en el
# hilo, y que eliminar borre dejando rastro en admin_borrados.
# =====================================================================
set -e
DB=ac_dep
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if;
end \$\$;" >/dev/null 2>&1
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
for f in .arnes/supabase-local.sql supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql \
         supabase/modulos/acciones.sql supabase/migraciones/2026-09-admin-borrar-datos.sql; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1 || echo "falló $f"
done
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','jefe@x.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol='admin', activo=true;
SQL
echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-acciones-depurar.sql 2>&1 | grep -E "NOTICE|ERROR" || true
$PSQL -d $DB -f supabase/migraciones/2026-09-acciones-depurar.sql 2>&1 | grep -E "ERROR" && exit 1
echo "--- prueba"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR"
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_id uuid; v_n int; v_t text; v_h int;
begin
  select r.id into v_id from public.accion_reportar('Titlo mal escrito',
    (select clave from public.acciones_motivos limit 1), 'media', null, 'pasillo 3') r;
  perform public.accion_editar(v_id, 'Título corregido', 'ahora con descripción', 'despacho', 'alta', 'pasillo 4');
  select titulo into v_t from public.acciones where id = v_id;
  if v_t <> 'Título corregido' then raise exception 'MAL: no corrigió el título (%)', v_t; end if;
  if (select area from public.acciones where id = v_id) <> 'despacho' then raise exception 'MAL: no cambió el área'; end if;
  if (select prioridad::text from public.acciones where id = v_id) <> 'alta' then raise exception 'MAL: no cambió la prioridad'; end if;
  select count(*) into v_h from public.acciones_hilo where accion_id = v_id and texto like 'Corregido desde administración%';
  if v_h <> 1 then raise exception 'MAL: la corrección no quedó en el hilo'; end if;
  select public.accion_eliminar(array[v_id], 'era una prueba') into v_n;
  if v_n <> 1 then raise exception 'MAL: eliminó % y debía ser 1', v_n; end if;
  if exists (select 1 from public.acciones where id = v_id) then raise exception 'MAL: sigue ahí'; end if;
  if not exists (select 1 from public.admin_borrados where clave = 'acciones_eliminar' and nombre like '%era una prueba%') then
    raise exception 'MAL: no quedó rastro en admin_borrados'; end if;
  raise notice 'BIEN: corregir escribe en el hilo y eliminar borra dejando rastro.';
end $$;
SQL
