#!/usr/bin/env bash
# USO DE LA APP POR USUARIO, contra la base completa.
#   bash .arnes/correr-uso.sh
set -e
export DB=adm_uso
export EXCLUIR="uso-por-usuario"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador; grant select on all tables in schema public to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-uso-por-usuario.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -c "grant select on public.uso_visitas to probador;" >/dev/null 2>&1 || true
salida=$($PSQL -d $DB -f .arnes/prueba-uso.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "USO:|^psql.*ERROR"; then exit 1; fi
