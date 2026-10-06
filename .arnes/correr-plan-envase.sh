#!/usr/bin/env bash
# PLAN DE ENVASE (2026-10-plan-envase.sql) contra la base completa.
#   bash .arnes/correr-plan-envase.sh
set -e
export DB=inv_plan
export EXCLUIR="plan-envase"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-plan-envase.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -c "grant select on public.plan_envase_semanas, public.plan_envase_pendiente, public.plan_envase_bloques to probador;" >/dev/null 2>&1 || true
salida=$($PSQL -d $DB -f .arnes/prueba-plan-envase.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "PLAN:|^psql.*ERROR"; then exit 1; fi
