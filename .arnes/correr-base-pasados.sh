#!/usr/bin/env bash
# Pasados de La base: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-base-pasados.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-basepasados}
export EXCLUIR="base-pasados"
source .arnes/_base-completa.sh >/tmp/claude-0/bpas-base.txt 2>&1 || { tail -8 /tmp/claude-0/bpas-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/bpas-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/bpas-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-base-pasados.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/bpas-mig.txt || { head -6 /tmp/claude-0/bpas-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-base-pasados.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ pasados: una comprobación falló"; exit 1; fi
for n in P1 P2 P3 P4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Renglones pasados: solo quien edita La base, solo enviados, todo o nada, sin duplicar y de lectura para quien ve."
