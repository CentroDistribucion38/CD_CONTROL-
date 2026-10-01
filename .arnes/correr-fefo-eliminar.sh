#!/usr/bin/env bash
# Eliminar un FEFO: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-fefo-eliminar.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-fefoelim}
export EXCLUIR="fefo-eliminar"
source .arnes/_base-completa.sh >/tmp/claude-0/fefoe-base.txt 2>&1 || { tail -8 /tmp/claude-0/fefoe-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/fefoe-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/fefoe-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-fefo-eliminar.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/fefoe-mig.txt || { head -6 /tmp/claude-0/fefoe-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-fefo-eliminar.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ eliminar FEFO: una comprobación falló"; exit 1; fi
for n in E1 E2 E3 E4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Eliminar un FEFO: solo quien administra, con el código, borra sus renglones y deja registro."
