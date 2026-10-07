#!/usr/bin/env bash
# Evidencias del conteo: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-conteo-evidencias.sh
set -e
export DB=${1:-conteoevid}
export EXCLUIR="conteo-evidencias"
source .arnes/_base-completa.sh >/tmp/claude-0/ev-base.txt 2>&1 || { tail -8 /tmp/claude-0/ev-base.txt; echo "✗ la base no salió"; exit 1; }
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for vez in 1 2; do
  $PSQL -d $DB -f supabase/migraciones/2026-10-conteo-evidencias.sql >/dev/null 2>/tmp/claude-0/ev-mig.txt || { head -6 /tmp/claude-0/ev-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-conteo-evidencias.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ evidencias: una comprobación falló"; exit 1; fi
for n in E1 E2 E3 E4 E5; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Evidencias: avería, PNC (con política), módulo mezclado y sin acceso por día y ubicación, con cobertura; sin anulados y solo para quien ve el Tablero o el Conteo."
