#!/usr/bin/env bash
# =====================================================================
# LO QUE SE MOVIO Y NO MIDE — contra Postgres de verdad.
#
# Base completa (todas las migraciones menos esta), la migracion dos
# veces, y las pruebas.
#
#   bash .arnes/correr-lo-que-no-mide.sh
# =====================================================================
set -e
export DB=${1:-no_mide}
export EXCLUIR="lo-que-no-mide"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# ---------------------------------------------------------------------
# ANTES: que lo que no mide TODAVIA no se pueda ver en ninguna parte.
# Un arnes que pasa igual antes y despues de la migracion no esta
# midiendo la migracion.
# ---------------------------------------------------------------------
echo "--- antes: lo que no mide no se ve"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if to_regclass('public.v_traspasos_fuera_del_plan') is null then
    raise notice 'Bien: hoy no hay donde ver lo que no mide. Es lo que esto viene a agregar.';
  else
    raise notice 'OJO: la vista ya estaba. La migracion no prueba nada.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-lo-que-no-mide.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
if $PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-lo-que-no-mide.sql 2>&1 | grep -E "ERROR"; then exit 1; fi

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-lo-que-no-mide.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
