#!/usr/bin/env bash
# Mismo material, mismo módulo, distinto estado: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-conteo-estados.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-conteoestados}
export EXCLUIR="conteo-estados-distintos|conteo-fabrica-estados|conteo-repetido-se-suma"  # esta prueba mide la regla de la TABLA; la suma del repetido va en su propia prueba
source .arnes/_base-completa.sh >/tmp/claude-0/cest-base.txt 2>&1 || { tail -8 /tmp/claude-0/cest-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/cest-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/cest-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-conteo-estados-distintos.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/cest-mig.txt || { head -6 /tmp/claude-0/cest-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-conteo-estados.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ estados: una comprobación falló"; exit 1; fi
for n in E1 E2 E3 E4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Estados distintos: NUEVO/LAVADO/EXTRASUCIO conviven; el mismo estado sigue siendo duplicado."
