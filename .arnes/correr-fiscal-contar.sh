#!/usr/bin/env bash
# Del plan fiscal a Contar: base completa (con el fiscal, SIN esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-fiscal-contar.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-fiscalcont}
export EXCLUIR="fiscal-contar"
source .arnes/_base-completa.sh >/tmp/claude-0/fcont-base.txt 2>&1 || { tail -8 /tmp/claude-0/fcont-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/fcont-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/fcont-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-fiscal-contar.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/fcont-mig.txt || { head -6 /tmp/claude-0/fcont-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-fiscal-contar.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ fiscal publicar: una comprobación falló"; exit 1; fi
for n in K1 K2 K3 K4 K5 K6; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Contar el fiscal: solo la persona de esa hoja, a ciegas, con sus validaciones, y una hoja con conteos no se pierde al editar."
