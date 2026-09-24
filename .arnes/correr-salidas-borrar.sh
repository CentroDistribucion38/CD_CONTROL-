#!/usr/bin/env bash
set -e
export DB=${1:-slborrar}
export EXCLUIR="salidas-borrar-en-lote"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
echo "--- la migración, dos veces (se puede correr dos veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-salidas-borrar-en-lote.sql 2>&1 | grep -E "ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-salidas-borrar-en-lote.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
# El codigo de salida de una tuberia es el del ultimo mandado, no el de
# psql: sin esto el arnes diria «verde» pasara lo que pasara.
salida=$($PSQL -d $DB -f .arnes/prueba-salidas-borrar.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
