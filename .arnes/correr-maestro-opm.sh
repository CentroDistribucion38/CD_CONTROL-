#!/usr/bin/env bash
set -e
export DB=${1:-maestroopm}
export EXCLUIR="maestro-unico-y-opm"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-maestro-unico-y-opm.sql 2>&1 | grep -E "ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-maestro-unico-y-opm.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-maestro-opm.sql 2>&1 | grep -E "NOTICE|ERROR"
