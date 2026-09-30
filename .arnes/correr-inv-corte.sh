#!/usr/bin/env bash
# Corte de líneas de Inventario: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-inv-corte.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-invcorte}
export EXCLUIR="inventario-corte-lineas"
source .arnes/_base-completa.sh >/tmp/claude-0/invc-base.txt 2>&1 || { tail -8 /tmp/claude-0/invc-base.txt; echo "✗ la base no salió"; exit 1; }
# (las migraciones de precios/maestro fallan a propósito en una base vacía; solo importan las de inventario)
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/invc-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/invc-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-09-inventario-corte-lineas.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/invc-mig.txt || { head -6 /tmp/claude-0/invc-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-inv-corte.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ corte de líneas: una comprobación falló"; exit 1; fi
for n in I1 I2 I3 I4 I5; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Corte de líneas: se guarda completo o nada, el final cierra su inicial, permisos de ver/editar/eliminar."
