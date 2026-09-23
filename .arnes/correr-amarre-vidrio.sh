#!/usr/bin/env bash
# =====================================================================
# EL VIDRIO SE AMARRA AL REGISTRAR — contra Postgres de verdad.
#   bash .arnes/correr-amarre-vidrio.sh
# =====================================================================
set -e
export DB=${1:-amarre}
export EXCLUIR="se-amarra-al-registrar"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

echo "--- antes: el amarre todavia no existe"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='traspaso_amarrar_cedula') then
    raise notice 'Bien: hoy no se puede amarrar el vidrio al registrar. Es lo que esto viene a agregar.';
  else
    raise notice 'OJO: ya se podia. La migracion no prueba nada.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-vidrio-se-amarra-al-registrar.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
if $PSQL -d $DB -f supabase/migraciones/2026-09-vidrio-se-amarra-al-registrar.sql 2>&1 | grep -E "ERROR"; then exit 1; fi

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-amarre-vidrio.sql 2>&1 | grep -E "NOTICE|ERROR"
