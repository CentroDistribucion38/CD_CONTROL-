#!/usr/bin/env bash
# Eliminar de verdad un camión anulado: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-sider-eliminar.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-eliminar}
export EXCLUIR="sider-viaje-eliminar"
source .arnes/_base-completa.sh >/tmp/claude-0/elim-base.txt 2>&1 || { tail -8 /tmp/claude-0/elim-base.txt; echo "✗ la base no salió"; exit 1; }
# (las migraciones de precios/maestro fallan a propósito en una base vacía; solo importan las de Sider)
if grep FALLA /tmp/claude-0/elim-base.txt | grep -qi "sider\|corregir"; then grep FALLA /tmp/claude-0/elim-base.txt | grep -i "sider\|corregir" | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-09-sider-viaje-eliminar.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/elim-mig.txt || { head -6 /tmp/claude-0/elim-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-sider-eliminar.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ eliminar: una comprobación falló"; exit 1; fi
for n in E1 E2 E3 E4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Eliminar: solo lo anulado, pide ELIMINAR, todo o nada, se lleva lo que cuelga, deja registro."
