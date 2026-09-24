#!/usr/bin/env bash
set -e
export DB=${1:-abihz}
export EXCLUIR="acciones-abi-hallazgos"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
echo "--- la migración, dos veces (se puede correr dos veces sin romper nada)"
$PSQL -d $DB -f supabase/migraciones/2026-09-acciones-abi-hallazgos.sql 2>&1 | grep -E "ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-acciones-abi-hallazgos.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
# El código de salida de una tubería es el del último mandado, no el de
# psql: sin esto el arnés diría «verde» pasara lo que pasara.
salida=$($PSQL -d $DB -f .arnes/prueba-abi-hallazgos.sql 2>&1) || true
# LOS RENGLONES DE DETALLE TAMBIEN. Un FALLA de psql trae sus motivos en
# renglones que NO dicen «ERROR», y filtrando solo por esa palabra el
# arnes de mutaciones leia un fallo sin causa y lo reportaba como «se
# puso rojo, pero por otra cosa» — veintidos veces seguidas.
echo "$salida" | grep -E "NOTICE|ERROR|^ +·|^ *·" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
