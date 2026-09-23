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

# ---------------------------------------------------------------------
# Y AHORA SIN EL ROL «verificador».
#
# Es el caso de la base de la bodega, donde ese rol nunca se creó — y es
# el que se me pasó: la primera versión de la migración exigía que
# estuviera y reventó entera en Supabase con «se borró el rol
# verificador» sobre un rol que jamás existió.
#
# Se monta una base aparte, se le quita el rol ANTES de correr la
# migración, y se exige que corra igual. Probar solo el caso fácil es lo
# que hace que el arnés diga que sí y la bodega diga que no.
# ---------------------------------------------------------------------
echo "--- y en una base SIN el rol verificador (el caso de la bodega)"
DB2="${DB}_sinrol"
$PSQL -c "drop database if exists $DB2" >/dev/null 2>&1
$PSQL -c "create database $DB2 template $DB" >/dev/null 2>&1 || {
  echo "no se pudo clonar la base; se salta"; exit 0; }
$PSQL -d $DB2 -c "delete from public.rol_permisos where rol = 'verificador';
                  delete from public.perfiles where rol = 'verificador';
                  delete from public.roles where clave = 'verificador';" >/dev/null 2>&1
$PSQL -d $DB2 -c "select count(*) as roles_verificador from public.roles where clave = 'verificador'" 2>&1 | grep -E "^ *0" >/dev/null \
  && echo "    el rol no está, como en la bodega" \
  || { echo "    OJO: el rol sigue ahí, la prueba no demuestra nada"; exit 1; }
$PSQL -d $DB2 -f supabase/migraciones/2026-09-roturas-salida-dos-firmas.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" \
  || { echo "    FALLA: la migración se cae en una base sin ese rol"; exit 1; }
