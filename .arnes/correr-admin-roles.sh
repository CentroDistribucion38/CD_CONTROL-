#!/usr/bin/env bash
# ROLES: borrar pasando usuarios, duplicar e historial, contra la base completa.
#   bash .arnes/correr-admin-roles.sh
set -e
export DB=adm_roles
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador; grant select on all tables in schema public to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-admin-roles.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -f .arnes/prueba-admin-roles.sql 2>&1 | grep -E "NOTICE|ERROR"
