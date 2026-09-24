#!/usr/bin/env bash
set -e
export DB=${1:-avrubi}
export EXCLUIR="averias-ubicacion-y-turno"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
echo "--- la migración, dos veces (se puede correr dos veces sin romper nada)"
$PSQL -d $DB -f supabase/migraciones/2026-09-averias-ubicacion-y-turno.sql 2>&1 | grep -E "ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-averias-ubicacion-y-turno.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
# El código de salida de una tubería es el del último mandado, no el de
# psql. Y los renglones de detalle de un FALLA no dicen «ERROR»: sin
# ellos, el arnés de mutaciones lee un fallo sin causa.
salida=$($PSQL -d $DB -f .arnes/prueba-averias-ubicacion.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR|^ +·|^ *·" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
