#!/usr/bin/env bash
# Del plan fiscal a Contar: base completa (con el fiscal, SIN esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-fiscal-publicar.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-fiscalpub}
export EXCLUIR="fiscal-publicar"
source .arnes/_base-completa.sh >/tmp/claude-0/fpub-base.txt 2>&1 || { tail -8 /tmp/claude-0/fpub-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/fpub-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/fpub-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-fiscal-publicar.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/fpub-mig.txt || { head -6 /tmp/claude-0/fpub-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-fiscal-publicar.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ fiscal publicar: una comprobación falló"; exit 1; fi
for n in P1 P2 P4 P5 P6 P7 P8; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Fiscal → Contar: se muestra con un botón, cada persona ve su hoja con su pareja, se quita, y un plan cerrado solo lo edita quien administra."
