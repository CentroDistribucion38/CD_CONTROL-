#!/usr/bin/env bash
# =====================================================================
# REABRIR Y ANULAR UNA SALIDA — contra Postgres de verdad.
#   bash .arnes/correr-salida-reabrir.sh
# =====================================================================
set -e
export DB=${1:-reabrir}
export EXCLUIR="salida-reabrir-y-anular"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

echo "--- antes: reabrir todavia no existe"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='salida_reabrir')
  then raise notice 'Bien: hoy una salida cerrada no se puede corregir.';
  else raise notice 'OJO: ya se podia. La migracion no prueba nada.'; end if;
end $$;
SQL

echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-salida-reabrir-y-anular.sql 2>&1 | grep -E "NOTICE|ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-salida-reabrir-y-anular.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-salida-reabrir.sql 2>&1 | grep -E "NOTICE|ERROR"
