#!/usr/bin/env bash
# DEPURAR VIAJES contra Postgres de verdad: base completa, migración dos veces, prueba.
set -e
export DB=tp_depurar
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
$PSQL -d $DB -f supabase/migraciones/2026-09-admin-borrar-datos.sql 2>&1 | grep -E "ERROR" || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-depurar.sql 2>&1 | grep -E "ERROR|LISTO" ; done
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-depurar.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
