#!/usr/bin/env bash
# =====================================================================
# LA CONVERSIÓN DE LOS RENGLONES VIEJOS, contra Postgres de verdad.
#
# Levanta una base NUEVA, siembra renglones COMO ERAN ANTES —con
# vencimiento tecleado y sin fabricación, que es lo que hay hoy en la
# bodega— y después corre la migración. Sin esa siembra la migración no
# tendría nada que convertir y pasaría en verde sin hacer nada, que es
# la forma más común de que una migración de datos parezca correcta.
#
#   bash .arnes/correr-conteo-solo-fabricacion.sh
# =====================================================================
set -e
DB=${1:-fefo_fab}
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
         supabase/modulos/inventario.sql \
         supabase/migraciones/2026-09-inventario-fefo.sql \
         supabase/datos/inventario-maestro-cd38.sql \
         supabase/migraciones/2026-09-conteo-borrador.sql \
         supabase/migraciones/2026-09-conteo-saldo.sql \
         supabase/migraciones/2026-09-conteo-treinta-a-la-vez.sql \
         supabase/migraciones/2026-09-conteo-fabricacion.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

# ---------------------------------------------------------------------
# LOS RENGLONES COMO ERAN ANTES.
#
# Se escriben DIRECTO en la tabla y no por `conteo_fefo_agregar`, a
# propósito: esa función ya calcula la fabricación, así que sembrar con
# ella daría filas nuevas y no filas viejas — y la migración no tendría
# nada que arreglar.
#
# Cuatro casos, y los cuatro tienen que salir distintos:
#   1. PRODUCTO con vencimiento y vida útil   → se convierte
#   2. PRODUCTO con vencimiento y SIN vida    → se queda, y se avisa
#   3. ENVASE sin ninguna fecha               → se queda, y está bien
#   4. Uno que YA trae fabricación            → no se toca
# ---------------------------------------------------------------------
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
SQL

$PSQL -d $DB -f .arnes/siembra-conteo-viejo.sql >/dev/null

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-conteo-solo-fabricacion.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-conteo-solo-fabricacion.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-conteo-solo-fabricacion.sql 2>&1 | grep -E "NOTICE|ERROR"
