#!/usr/bin/env bash
# =====================================================================
# SIDER · SORTING — DE LA BASE DE ANTES A LA DE DESPUÉS
#
# El orden es la prueba. Una migración que cambia la llave de una tabla
# con datos no se prueba sobre una base vacía:
#
#   1. Se arma la base COMPLETA SIN esta migración.
#   2. Se deja el estado de antes —las revisiones del muelle y las
#      importadas— y se saca la huella de lo que se le cobra al socio.
#   3. Se migra, y se migra OTRA VEZ: tiene que poder correrse dos veces.
#   4. Las pruebas de AI que ya existían tienen que seguir en verde:
#      son las que dicen que no se rompió lo de antes.
#   5. Y por último las de Sorting.
#
#     bash .arnes/correr-sider-sorting.sh
#
# Necesita Postgres local: `sudo service postgresql start`.
# =====================================================================
set -e
export DB=${1:-sorting}
export EXCLUIR="${EXCLUIR_EXTRA:+$EXCLUIR_EXTRA|}sider-sorting|sider-revision-ai-interna"
MIGRACION="${MIGRACION:-supabase/migraciones/2026-09-sider-sorting.sql}"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

fallo() { echo "✗ $1"; exit 1; }

echo "--- el estado de antes"
$PSQL -d $DB -f .arnes/prueba-sider-sorting-antes.sql 2>&1 | grep -E "NOTICE|ERROR|FALLA" || true
if ! $PSQL -d $DB -c "select 1 from public._sorting_huella" >/dev/null 2>&1; then
  fallo "no se pudo dejar el estado de antes"
fi

echo "--- la migración (dos veces: se tiene que poder correr dos veces)"
# SE MIRA EL CÓDIGO DE SALIDA, NO LA SALIDA. Antes se filtraba con `grep
# ERROR` y `|| true`: si psql no podía ni abrir el archivo («Permission
# denied», que no dice ERROR en mayúsculas) la migración NO se aplicaba,
# el arnés seguía y las pruebas fallaban con «la columna tipo no existe».
# Con la migración de verdad eso se ve; con una MUTADA se leía como «la
# defensa funciona» cuando en realidad la migración nunca corrió.
[ -r "$MIGRACION" ] || fallo "no se puede leer la migración: $MIGRACION"
for vez in 1 2; do
  set +e
  salida_mig=$($PSQL -d $DB -f "$MIGRACION" 2>&1); codigo=$?
  set -e
  if [ $codigo -ne 0 ]; then
    echo "$salida_mig" | grep -vE "NOTICE" | head -6 | sed 's/^/    /'
    fallo "la migración falló la vez $vez (código $codigo)$([ $vez -eq 2 ] && echo ': no se puede correr dos veces')"
  fi
  [ $vez -eq 1 ] && echo "$salida_mig" | grep -E "Listo" | sed 's/^.*NOTICE:  /    /'
done

# LA REGRESIÓN CORRE EN UNA COPIA, NO EN LA MISMA BASE. Las pruebas viejas
# de AI insertan sus propias revisiones (una fila real del Excel), y
# sobre la misma base contaminaban la huella del cobro: la comprobación
# «el cobro no se movió» fallaba por una fila que ponía la prueba de al
# lado, no por la migración. Se copia DESPUÉS de migrar y ANTES de
# ensuciar, así la regresión corre sobre datos de antes ya migrados —que
# es una prueba más dura que una base vacía.
sudo -u postgres psql -q -c "drop database if exists ${DB}_reg" >/dev/null
sudo -u postgres psql -q -c "create database ${DB}_reg template ${DB}" >/dev/null

echo "--- las pruebas de Sorting"
salida=$($PSQL -d $DB -f .arnes/prueba-sider-sorting.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE" | sed 's/^.*NOTICE:  /    /' || true
if echo "$salida" | grep -qE "ERROR|FALLA"; then
  echo "$salida" | grep -vE "NOTICE|^$" | head -30 | sed 's/^/    /'
  fallo "Sorting: una comprobación falló"
fi
# QUE HAYAN CORRIDO TODAS. Un bloque que no llega a ejecutarse no falla:
# simplemente no dice nada, y el arnés queda verde. Cada bloque termina
# con un aviso numerado; si falta alguno, se para.
for n in "1 ·" "2 ·" "3 ·" "4 ·" "5 ·" "6 ·" "6c ·" "7a ·" "7b ·" "8 ·" "9 ·" "10 ·" "11 ·" "12 ·"; do
  echo "$salida" | grep -q "NOTICE:  $n" || fallo "no corrió la comprobación «$n»: un bloque que no corre no falla, solo calla"
done

echo "--- regresión: las pruebas de AI que ya existían (sobre la copia)"
salida=$($PSQL -d ${DB}_reg -f .arnes/prueba-sider-ai.sql 2>&1) || true
if echo "$salida" | grep -qE "ERROR|FALLARON|FALLÓ"; then
  echo "$salida" | grep -E "ERROR|FALLARON|FALLÓ" | head -4 | sed 's/^/    /'
  fallo "la prueba de AI de antes se rompió con esta migración"
fi
echo "    prueba-sider-ai.sql: $(echo "$salida" | grep -c 'WARNING') comprobaciones"

echo "✓ Sorting: la AI de antes no se movió, los dos tipos conviven en un viaje, el cobro no se contamina y cada permiso se pide por su pantalla."
