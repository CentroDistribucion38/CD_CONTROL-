#!/usr/bin/env bash
# Corte final sin cantidad en el origen: la base con la migración del corte y la nueva (dos veces), la prueba de siempre
# y la prueba nueva encima.
#   bash .arnes/correr-inv-corte-final.sh        (necesita: sudo service postgresql start)
set -e
export DB=${1:-invcortefinal}
export EXCLUIR="inventario-corte-lineas|corte-final-sin-cantidad"
source .arnes/_base-completa.sh >/tmp/claude-0/icf-base.txt 2>&1 || { tail -8 /tmp/claude-0/icf-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/icf-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/icf-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -f supabase/migraciones/2026-09-inventario-corte-lineas.sql >/dev/null 2>/tmp/claude-0/icf-mig.txt || { head -6 /tmp/claude-0/icf-mig.txt; echo "✗ la migración del corte falló"; exit 1; }
for vez in 1 2; do
  $PSQL -d $DB -f supabase/migraciones/2026-10-corte-final-sin-cantidad.sql >/dev/null 2>/tmp/claude-0/icf-mig.txt || { head -6 /tmp/claude-0/icf-mig.txt; echo "✗ la migración nueva falló la vez $vez"; exit 1; }
done
# La prueba de siempre, con la función NUEVA: tiene que seguir pasando entera.
salida=$($PSQL -d $DB -f .arnes/prueba-inv-corte.sql 2>&1) || true
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ regresión: la prueba del corte de siempre falló"; exit 1; fi
for n in I1 I2 I3 I4 I5 I6 I7; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ regresión: no corrió $n"; exit 1; }; done
echo "    (regresión) I1–I7 siguen pasando con la función nueva"
salida=$($PSQL -d $DB -f .arnes/prueba-inv-corte-final.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ corte final sin cantidad: una comprobación falló"; exit 1; fi
for n in I8 I9 I10; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Corte final: el origen se guarda sin cantidad (vacía, no cero); el inicial, los destinos y lo a medias siguen rechazados."
