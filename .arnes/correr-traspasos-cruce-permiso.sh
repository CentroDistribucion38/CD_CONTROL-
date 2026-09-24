#!/usr/bin/env bash
# =====================================================================
# LA LLAVE DE LA BASE DEL CONTEO, contra Postgres de verdad.
#
# Levanta una base nueva con los roles reales, le pone además los casos
# que el archivo de roles no trae —un rol que EDITA el tablero, uno que
# lo tiene CERRADO, uno que ya tenía la base puesta a mano, y dos
# personas con permiso propio— y corre la migración.
#
# SE CORRE SIN AGRUPAR NADA, como lo corre el editor de Supabase: un
# `psql -f` con `begin;` arriba ejecuta el archivo entero en una sola
# transacción y el editor no, y esa diferencia ya me costó dos intentos
# fallidos en producción.
#
#   bash .arnes/correr-traspasos-cruce-permiso.sh
# =====================================================================
set -e
DB=${1:-tp_crp}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if;
end \$\$;" >/dev/null 2>&1
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

for f in .arnes/supabase-local.sql \
         supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

# «SIN ACCESO» POR PERSONA, PRIMERO. El CHECK de perfiles solo admitía
# 'ver' y 'editar', así que un permiso propio en 'ninguno' —el que le
# quita UNA pantalla a UNA persona— no se podía ni guardar. Uno de los
# casos que hay que probar aquí es justamente ese.
$PSQL -d $DB -f supabase/migraciones/2026-09-permiso-sin-acceso-por-persona.sql 2>&1 | grep -E "ERROR" && exit 1

$PSQL -d $DB -f .arnes/siembra-permisos-cruce.sql 2>&1 | grep -E "ERROR" && exit 1

# ---------------------------------------------------------------------
# ANTES DE LA MIGRACIÓN: comprobar que la pantalla está CERRADA.
#
# Sin esto, la prueba de después no demostraría nada — podría ser que
# /traspasos/cruce ya estuviera abierta y la migración no hiciera falta.
# ---------------------------------------------------------------------
echo "--- antes: la pantalla nueva tiene que estar cerrada para todos"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.rol_permisos
   where seccion = '/traspasos/cruce' and rol <> 'yatiene';
  if v_n > 0 then
    raise notice 'OJO: % rol(es) YA tenían la base antes de la migración. La migración no prueba nada.', v_n;
  else
    raise notice 'Bien: hoy nadie ve /traspasos/cruce salvo el que la tiene a mano. Es lo que esta migración viene a abrir.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-cruce-permiso.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-cruce-permiso.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-cruce-permiso.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
