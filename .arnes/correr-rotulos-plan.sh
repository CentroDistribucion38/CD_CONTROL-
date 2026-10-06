#!/usr/bin/env bash
# RÓTULOS DEL PLAN (2026-10-rotulos-plan.sql) contra la base completa.
#   bash .arnes/correr-rotulos-plan.sh
set -e
export DB=inv_rotplan
export EXCLUIR="rotulos-plan"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-rotulos-plan.sql 2>&1 | grep -E "ERROR|LISTO" || true; done
$PSQL -d $DB -c "grant select on public.rotulos_plan to probador;" >/dev/null 2>&1 || true
salida=$($PSQL -d $DB -f .arnes/prueba-rotulos-plan.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "ROTULOS-PLAN:|^psql.*ERROR"; then exit 1; fi
