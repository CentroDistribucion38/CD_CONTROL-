#!/usr/bin/env bash
# HISTORIAL DE USUARIOS y ESTADO DEL SISTEMA, contra la base completa.
#   bash .arnes/correr-admin-historial.sh
set -e
export DB=adm_historial
export EXCLUIR="admin-historial"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador; grant select on all tables in schema public to probador;" >/dev/null 2>&1 || true
$PSQL -d $DB -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end \$\$;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-admin-historial.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -c "grant select on public.usuarios_historial, public.v_usuarios_historial to probador;" >/dev/null 2>&1 || true
salida=$($PSQL -d $DB -f .arnes/prueba-admin-historial.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
