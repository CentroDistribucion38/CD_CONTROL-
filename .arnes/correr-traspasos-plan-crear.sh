#!/usr/bin/env bash
# =====================================================================
# TRASPASOS · EL PLAN LO CREA QUIEN SE ESCOJA, LO PUBLICADO SOLO QUIEN MANDA
#
#   1. Se arma la base COMPLETA SIN esta migración (la de antes).
#   2. Se migra, y se migra OTRA VEZ: se tiene que poder correr dos veces.
#   3. Las pruebas nuevas, con todos sus avisos numerados.
#   4. Regresión sobre una COPIA: las pruebas de plan que ya existían.
#
#     bash .arnes/correr-traspasos-plan-crear.sh          # la prueba
#     MIGRACION=.arnes/_mutada.sql bash … mut             # lo usa el mutador
#
# Necesita Postgres local: `sudo service postgresql start`.
# =====================================================================
set -e
export DB=${1:-plancrear}
export EXCLUIR="${EXCLUIR_EXTRA:+$EXCLUIR_EXTRA|}traspasos-plan-crear-no-cambiar"
MIGRACION="${MIGRACION:-supabase/migraciones/2026-09-traspasos-plan-crear-no-cambiar.sql}"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

fallo() { echo "✗ $1"; exit 1; }

echo "--- la migración (dos veces)"
# SE MIRA EL CÓDIGO DE SALIDA, no lo que diga la salida: una migración que
# ni se abre no dice ERROR y el arnés seguiría «verde» con la de antes.
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

# La regresión corre en una copia hecha DESPUÉS de migrar y ANTES de
# ensuciar con las pruebas nuevas.
sudo -u postgres psql -q -c "drop database if exists ${DB}_reg" >/dev/null
sudo -u postgres psql -q -c "create database ${DB}_reg template ${DB}" >/dev/null

echo "--- las pruebas del plan"
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-plan-crear.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE" | sed 's/^.*NOTICE:  /    /' || true
if echo "$salida" | grep -qE "ERROR|FALLA"; then
  echo "$salida" | grep -vE "NOTICE|^$" | head -30 | sed 's/^/    /'
  fallo "el plan: una comprobación falló"
fi
for n in "0 ·" "1 ·" "2 ·" "3 ·" "4 ·" "5 ·" "6 ·" "6b ·" "6c ·" "7 ·" "8 ·" "9 ·" "10 ·" "11 ·" "12 ·" "13 ·" "14 ·"; do
  echo "$salida" | grep -q "NOTICE:  $n" || fallo "no corrió la comprobación «$n»: un bloque que no corre no falla, solo calla"
done

echo "--- regresión: las pruebas del plan que ya existían (sobre la copia)"
salida=$($PSQL -d ${DB}_reg -f .arnes/prueba-borrar-plan.sql 2>&1) || true
if echo "$salida" | grep -qE "ERROR|FALLARON|FALLÓ"; then
  echo "$salida" | grep -E "ERROR|FALLARON|FALLÓ" | head -4 | sed 's/^/    /'
  fallo "prueba-borrar-plan.sql se rompió con esta migración"
fi
echo "    prueba-borrar-plan.sql: $(echo "$salida" | grep -c 'WARNING') comprobaciones"

echo "✓ Plan: el creador arma y publica, no cambia lo publicado; quien manda sí; el editor de otras pantallas ya no planea a mano."
