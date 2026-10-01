#!/usr/bin/env bash
# Inventario fiscal: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-inv-fiscal.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-invfiscal}
export EXCLUIR="inventario-fiscal"
source .arnes/_base-completa.sh >/tmp/claude-0/invf-base.txt 2>&1 || { tail -8 /tmp/claude-0/invf-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/invf-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/invf-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-inventario-fiscal.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/invf-mig.txt || { head -6 /tmp/claude-0/invf-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-inv-fiscal.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ inventario fiscal: una comprobación falló"; exit 1; fi
for n in F1 F2 F3 F4 F5; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Inventario fiscal: se guarda completo o nada, parejas OL/Bavaria por hoja numerada, permisos de ver/editar/eliminar."
