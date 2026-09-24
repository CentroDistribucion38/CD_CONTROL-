#!/usr/bin/env bash
# =====================================================================
# ROTURAS EN SITIO · área, causas y EER sin material — contra Postgres
# de verdad.
#
# Se monta la base COMPLETA (todas las migraciones menos esta) y
# después se corre esta, dos veces, como la corre el editor de Supabase.
#
#   bash .arnes/correr-roturas-sitio-area.sh
# =====================================================================
set -e
export DB=${1:-rt_area}
export EXCLUIR="roturas-sitio-area"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# ---------------------------------------------------------------------
# ANTES: que el EER TODAVÍA exija material y que el área no exista.
# Sin esto la prueba de después no demostraría nada.
# ---------------------------------------------------------------------
echo "--- antes: el area no existe y el EER exige material"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if to_regclass('public.roturas_areas') is not null then
    raise notice 'OJO: roturas_areas ya existe. La migracion no prueba nada.';
  else
    raise notice 'Bien: todavia no hay maestro de areas.';
  end if;
  if exists (select 1 from public.roturas_causas where clave = 'falla_depa' and activo) then
    raise notice 'OJO: la causa del pallet DEPA ya estaba.';
  else
    raise notice 'Bien: las causas de ahora son las viejas.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-sitio-area-causas.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-sitio-area-causas.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-roturas-sitio-area.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
