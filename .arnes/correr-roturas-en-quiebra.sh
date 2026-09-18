#!/usr/bin/env bash
# =====================================================================
# QUE NADIE PIERDA EL TABLERO DE QUIEBRA.
#
# Levanta una base nueva con los roles de verdad, le pone además unos
# casos que el archivo de roles no trae —una persona con el tablero
# CERRADO a mano, otra con él abierto por encima de su rol, y un rol al
# que ya se lo dieron— y corre la migración.
#
# SE CORRE SIN AGRUPAR NADA, como lo corre el editor de Supabase. Ya me
# costó una migración que funcionaba con psql y reventaba allá.
#
#   bash .arnes/correr-roturas-en-quiebra.sh
# =====================================================================
set -e
DB=${1:-qb_ramas}
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
         supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

# «SIN ACCESO» POR PERSONA, PRIMERO. El CHECK de perfiles solo admitía
# 'ver' y 'editar', así que un permiso propio en 'ninguno' —el que le
# quita UNA pantalla a UNA persona— no se podía ni guardar. Apareció
# aquí: la siembra de abajo reventó contra él. Va antes porque uno de
# los casos que hay que probar es justamente ese.
$PSQL -d $DB -f supabase/migraciones/2026-09-permiso-sin-acceso-por-persona.sql 2>&1 | grep -E "ERROR" && exit 1

$PSQL -d $DB -f .arnes/siembra-permisos-quiebra.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-dentro-de-quiebra.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-dentro-de-quiebra.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-roturas-en-quiebra.sql 2>&1 | grep -E "NOTICE|ERROR"
