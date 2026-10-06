#!/usr/bin/env bash
# PNC · política de bloqueo: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-pnc-politica.sh
set -e
export DB=${1:-pncpolitica}
export EXCLUIR="pnc-politica"
source .arnes/_base-completa.sh >/tmp/claude-0/pnc-base.txt 2>&1 || { tail -8 /tmp/claude-0/pnc-base.txt; echo "✗ la base no salió"; exit 1; }
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for vez in 1 2; do
  $PSQL -d $DB -f supabase/migraciones/2026-10-pnc-politica-bloqueo.sql >/dev/null 2>/tmp/claude-0/pnc-mig.txt || { head -6 /tmp/claude-0/pnc-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-pnc-politica.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ PNC: una comprobación falló"; exit 1; fi
for n in P1 P2 P3 P4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ PNC: las dos respuestas (rótulo y bloqueo mecánico) son obligatorias con PNC, se borran sin PNC y solo las escribe el dueño del conteo."
