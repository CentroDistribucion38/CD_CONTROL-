#!/usr/bin/env bash
# Terminar la hoja y cruzar la pareja del fiscal: base completa (SIN esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-fiscal-cruce.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-fiscalcruce}
export EXCLUIR="fiscal-cruce"
source .arnes/_base-completa.sh >/tmp/claude-0/fcru-base.txt 2>&1 || { tail -8 /tmp/claude-0/fcru-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/fcru-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/fcru-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-fiscal-cruce.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/fcru-mig.txt || { head -6 /tmp/claude-0/fcru-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-fiscal-cruce.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -30 | sed 's/^/    /'; echo "✗ fiscal cruce: una comprobación falló"; exit 1; fi
for n in T1 T2 T3 T4 T5 T6 T7; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Fiscal: terminar la hoja, la hoja terminada no se toca, y el cruce de la pareja solo para quien arma el plan."
