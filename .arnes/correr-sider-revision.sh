#!/usr/bin/env bash
# =====================================================================
# SIDER · REVISIÓN AI NORMAL Y CERTIFICADA — DE LA BASE DE ANTES A LA DE DESPUÉS
#
#   1. Se arma la base COMPLETA SIN esta migración (ya trae la de Sorting).
#   2. Se deja el estado de antes y se saca la huella de lo que se cobra.
#   3. Se migra, y se migra OTRA VEZ.
#   4. Regresión sobre una copia: las pruebas de AI de antes.
#   5. Las pruebas nuevas.
#
#     bash .arnes/correr-sider-revision.sh
# =====================================================================
set -e
export DB=${1:-revision}
export EXCLUIR="${EXCLUIR_EXTRA:+$EXCLUIR_EXTRA|}sider-revision-ai-interna"
MIGRACION="${MIGRACION:-supabase/migraciones/2026-09-sider-revision-ai-interna.sql}"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
fallo() { echo "✗ $1"; exit 1; }

echo "--- el estado de antes"
$PSQL -d $DB -f .arnes/prueba-sider-revision-antes.sql 2>&1 | grep -E "NOTICE|ERROR|FALLA" || true
$PSQL -d $DB -c "select 1 from public._rev_huella" >/dev/null 2>&1 || fallo "no se pudo dejar el estado de antes"

echo "--- la migración (dos veces)"
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

sudo -u postgres psql -q -c "drop database if exists ${DB}_reg" >/dev/null
sudo -u postgres psql -q -c "create database ${DB}_reg template ${DB}" >/dev/null

# La sección 8b de la migración (lo ya creado) se corre otra vez desde la prueba 11.
sed -n '/^-- 8b\. LO QUE YA ESTABA CREADO/,/^-- 9\. COMPROBACIÓN FINAL/p' "$MIGRACION" | sed '$d' > .arnes/_mig-8b.sql
grep -qF "do \$\$" .arnes/_mig-8b.sql || fallo "no se pudo extraer la sección 8b de la migración"

echo "--- las pruebas nuevas"
salida=$($PSQL -d $DB -f .arnes/prueba-sider-revision.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE" | sed 's/^.*NOTICE:  /    /' || true
if echo "$salida" | grep -qE "ERROR|FALLA"; then
  echo "$salida" | grep -vE "NOTICE|^$" | head -30 | sed 's/^/    /'
  fallo "Revisión AI: una comprobación falló"
fi
for n in "1 ·" "2 ·" "3 ·" "3b ·" "4 ·" "5 ·" "6 ·" "7 ·" "8 ·" "9 ·" "10 ·" "11 ·"; do
  echo "$salida" | grep -q "NOTICE:  $n" || fallo "no corrió la comprobación «$n»: un bloque que no corre no falla, solo calla"
done

echo "--- regresión: la prueba de AI que ya existía (sobre la copia)"
salida=$($PSQL -d ${DB}_reg -f .arnes/prueba-sider-ai.sql 2>&1) || true
if echo "$salida" | grep -qE "ERROR|FALLARON|FALLÓ"; then
  echo "$salida" | grep -E "ERROR|FALLARON|FALLÓ" | head -4 | sed 's/^/    /'
  fallo "la prueba de AI de antes se rompió con esta migración"
fi
echo "    prueba-sider-ai.sql: $(echo "$salida" | grep -c 'WARNING') comprobaciones"

echo "✓ Revisión AI: el cobro de antes no se movió, el Vh Interno nace recibido y cae en Revisión AI sin llegada, no cuenta como certificado, y cada permiso se pide por su pantalla."
