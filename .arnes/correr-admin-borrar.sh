#!/usr/bin/env bash
# BORRAR DATOS PUNTUALES, contra Postgres de verdad: la base COMPLETA
# (todos los módulos y migraciones), la migración dos veces, y la prueba.
#   bash .arnes/correr-admin-borrar.sh
set -e
export DB=adm_borrar
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-admin-borrar-datos.sql 2>&1 | grep -E "ERROR|LISTO" ; done
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-admin-borrar-todo.sql 2>&1 | grep -E "ERROR|LISTO" ; done
salida=$($PSQL -d $DB -f .arnes/prueba-admin-borrar.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
# Y TODA LA LISTA: cada punto cuenta, exporta y borra sin error de SQL.
salida2=$($PSQL -d $DB -f .arnes/prueba-admin-borrar-todo.sql 2>&1) || true; echo "$salida2" | grep -E "NOTICE|ERROR" || true
if echo "$salida2" | grep -qE "FALLA:|^psql.*ERROR|BORRAR DATOS \(todo\):"; then exit 1; fi
