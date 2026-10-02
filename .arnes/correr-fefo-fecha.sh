#!/usr/bin/env bash
# Eliminar un FEFO: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-fefo-fecha.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-fefofecha}
export EXCLUIR="fefo-cambiar-fecha|fefo-fecha-es-la-del-envio"
source .arnes/_base-completa.sh >/tmp/claude-0/feffe-base.txt 2>&1 || { tail -8 /tmp/claude-0/feffe-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/feffe-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/feffe-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
MA=${MA:-supabase/migraciones/2026-10-fefo-cambiar-fecha.sql}
M=${M:-supabase/migraciones/2026-10-fefo-fecha-es-la-del-envio.sql}
for vez in 1 2; do
  for f in $MA $M; do
    $PSQL -d $DB -f $f >/dev/null 2>/tmp/claude-0/feffe-mig.txt || { head -6 /tmp/claude-0/feffe-mig.txt; echo "✗ la migración $f falló la vez $vez"; exit 1; }
  done
done
salida=$($PSQL -d $DB -f .arnes/prueba-fefo-fecha.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ cambiar fecha FEFO: una comprobación falló"; exit 1; fi
for n in F1 F2 F3 F4 G1 G2 G3; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Cambiar la fecha de un FEFO: solo quien administra, con el código, renumera y no pierde renglones."
