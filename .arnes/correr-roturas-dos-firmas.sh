#!/usr/bin/env bash
# =====================================================================
# LA SALIDA CON DOS FIRMAS — contra Postgres de verdad.
#
# Base completa (todas las migraciones menos esta), la migración dos
# veces, y las pruebas.
#
#   bash .arnes/correr-roturas-dos-firmas.sh
# =====================================================================
set -e
export DB=${1:-rt_firmas}
export EXCLUIR="salida-dos-firmas"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# ---------------------------------------------------------------------
# ANTES: que la validación TODAVÍA exija la firma del verificador.
# Sin esto la prueba de después no demostraría nada.
# ---------------------------------------------------------------------
echo "--- antes: la validacion exige verificacion"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='salida_firmar') like '%Todavía no la ha verificado nadie%' then
    raise notice 'Bien: hoy la validacion espera al verificador. Es lo que esto viene a quitar.';
  else
    raise notice 'OJO: ya no lo exigia. La migracion no prueba nada.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-salida-dos-firmas.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-salida-dos-firmas.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-roturas-dos-firmas.sql 2>&1 | grep -E "NOTICE|ERROR"
