#!/usr/bin/env bash
# USUARIOS: último ingreso, rastro y cambios de a varios, contra la base completa.
#   bash .arnes/correr-admin-usuarios.sh
set -e
export DB=adm_usuarios
export EXCLUIR="admin-usuarios"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador; grant select on all tables in schema public to probador;" >/dev/null 2>&1 || true
$PSQL -d $DB -c "alter table auth.users add column if not exists last_sign_in_at timestamptz; alter table auth.users add column if not exists created_at timestamptz default now();" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-admin-usuarios.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -f .arnes/prueba-admin-usuarios.sql 2>&1 | grep -E "NOTICE|ERROR"
