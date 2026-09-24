#!/usr/bin/env bash
# =====================================================================
# EL DESCARGO DEL OPERADOR LOGÍSTICO — contra Postgres de verdad.
#   bash .arnes/correr-descargo-ol.sh
# =====================================================================
set -e
export DB=${1:-descargo}
export EXCLUIR="descargo-del-ol"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

echo "--- antes: responder un cobro todavia no existe"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='rotura_responder') then
    raise notice 'Bien: hoy el OL no tiene donde responder. Es lo que esto viene a agregar.';
  else
    raise notice 'OJO: ya se podia. La migracion no prueba nada.';
  end if;
end $$;
SQL

echo "--- la migración"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-descargo-del-ol.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta (tiene que poder correrse dos veces)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-descargo-del-ol.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-descargo-ol.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
