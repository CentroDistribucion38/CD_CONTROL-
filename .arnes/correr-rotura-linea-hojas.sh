#!/usr/bin/env bash
# =====================================================================
# LAS HOJAS DEL DÍA GUARDADAS, contra Postgres de verdad.
#
# La migración se corre DOS VECES —tiene que poder correrse varias— y
# las pruebas como usuario, no como superusuario, que se salta el RLS.
#
#   bash .arnes/correr-rotura-linea-hojas.sh
# =====================================================================
set -e
DB=${1:-rl_hojas}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if;
end \$\$;" >/dev/null 2>&1
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

for f in .arnes/supabase-local.sql \
         supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql \
         supabase/modulos/rotura-linea.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1 || { echo "no montó: $f"; exit 1; }
done

# COMO SUPABASE: toda tabla nueva de `public` nace con TODOS los permisos
# para `authenticated`. Sin esto la prueba sería más estricta que la
# nube, y el `revoke update` de la migración no se estaría probando.
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
SQL

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('22222222-2222-2222-2222-222222222222','super@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','opera@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('22222222-2222-2222-2222-222222222222','super','Sandra Supervisora','supervisor',true),
  ('33333333-3333-3333-3333-333333333333','opera','Óscar Operador','operador',true)
on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, activo = true;
SQL

# DOS BASES: una que corre la migración por primera vez, y otra que ya
# tenía la PRIMERA versión —la que dejaba borrar al administrador— y la
# vuelve a correr. Las dos tienen que quedar igual, y la prueba corre en
# las dos.
$PSQL -c "drop database if exists ${DB}_v1" >/dev/null 2>&1
$PSQL -c "create database ${DB}_v1 template $DB" >/dev/null

echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-rotura-linea-hojas.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-rotura-linea-hojas.sql 2>&1 | grep -E "^ERROR|psql:.*ERROR" && exit 1

echo "--- quien ya tenía la primera versión, la vuelve a correr"
$PSQL -d ${DB}_v1 -f .arnes/rotura-linea-hojas-v1.sql >/dev/null 2>&1 || { echo "no montó la primera versión"; exit 1; }
$PSQL -d ${DB}_v1 -f supabase/migraciones/2026-09-rotura-linea-hojas.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true

echo "--- las pruebas, recién corrida"
$PSQL -d $DB -f .arnes/prueba-rotura-linea-hojas.sql 2>&1 | grep -E "NOTICE|ERROR" | sed 's/todo en orden/todo en orden (nueva)/'
echo "--- las pruebas, sobre la primera versión"
$PSQL -d ${DB}_v1 -f .arnes/prueba-rotura-linea-hojas.sql 2>&1 | grep -E "NOTICE|ERROR" | sed 's/todo en orden/todo en orden (sobre la v1)/'
