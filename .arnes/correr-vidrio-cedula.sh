#!/usr/bin/env bash
# =====================================================================
# EL VIDRIO SALE CON EL VIAJE — contra Postgres de verdad.
#
# Base completa (todas las migraciones menos esta), la migración dos
# veces, y las pruebas.
#
#   bash .arnes/correr-vidrio-cedula.sh
# =====================================================================
set -e
export DB=${1:-vidrio_cedula}
export EXCLUIR="vidrio-cedula"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# ---------------------------------------------------------------------
# ANTES: que la validación TODAVÍA sea la que da el aval del vidrio.
# Sin esto la prueba de después no demostraría nada: un arnés que pasa
# igual antes y después de la migración no está midiendo la migración.
# ---------------------------------------------------------------------
echo "--- antes: la salida todavia se valida aparte"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='salida_firmar') like '%quien pesó no valida%' then
    raise notice 'Bien: hoy el vidrio se valida aparte. Es lo que esto viene a mudar a facturacion.';
  else
    raise notice 'OJO: ya no se validaba aparte. La migracion no prueba nada.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-vidrio-cedula-facturacion.sql 2>&1 | grep -E "NOTICE:  LISTO|ERROR" || true
echo "--- segunda vuelta"
if $PSQL -d $DB -f supabase/migraciones/2026-09-vidrio-cedula-facturacion.sql 2>&1 | grep -E "ERROR"; then exit 1; fi

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-vidrio-cedula.sql 2>&1 | grep -E "NOTICE|ERROR"

# ---------------------------------------------------------------------
# Y EN UNA BASE SIN EL ROL «validador».
#
# Es el caso de la base de la bodega —los papeles de la cadena se
# resuelven por PERMISO de pantalla, no por el nombre del rol— y es el
# que ya tumbó una migración: la primera versión de «dos firmas» exigía
# que el rol verificador estuviera y reventó entera en Supabase sobre un
# rol que jamás se creó.
#
# Probar solo el caso fácil es lo que hace que el arnés diga que sí y la
# bodega diga que no.
# ---------------------------------------------------------------------
echo "--- y en una base SIN el rol validador (el caso de la bodega)"
DB2="${DB}_sinrol"
$PSQL -c "drop database if exists $DB2" >/dev/null 2>&1
$PSQL -c "create database $DB2 template ${DB}" >/dev/null 2>&1 || {
  echo "no se pudo clonar la base; se salta"; exit 0; }
$PSQL -d $DB2 -c "delete from public.rol_permisos where rol = 'validador';
                  delete from public.perfiles where rol = 'validador';
                  delete from public.roles where clave = 'validador';" >/dev/null 2>&1
if $PSQL -d $DB2 -c "select count(*) from public.roles where clave = 'validador'" 2>&1 | grep -qE "^ *0"; then
  echo "    el rol no está, como en la bodega"
else
  echo "    OJO: el rol sigue ahí, la prueba no demuestra nada"; exit 1
fi
if $PSQL -d $DB2 -f supabase/migraciones/2026-09-vidrio-cedula-facturacion.sql 2>&1 | grep -qE "NOTICE:  LISTO"; then
  echo "    corre igual sin ese rol"
else
  echo "    FALLA: la migración se cae en una base sin ese rol"; exit 1
fi
