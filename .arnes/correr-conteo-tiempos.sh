#!/usr/bin/env bash
# Tiempos del conteo: base completa (sin esta migración), se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-conteo-tiempos.sh
set -e
export DB=${1:-conteotiempos}
export EXCLUIR="conteo-tiempos"
source .arnes/_base-completa.sh >/tmp/claude-0/ct-base.txt 2>&1 || { tail -8 /tmp/claude-0/ct-base.txt; echo "✗ la base no salió"; exit 1; }
if grep -q "^FALLA [^ ]*inventario" /tmp/claude-0/ct-base.txt; then grep "^FALLA [^ ]*inventario" /tmp/claude-0/ct-base.txt | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for vez in 1 2; do
  for mig in 2026-10-conteo-tiempos 2026-10-conteo-vence-8h; do
  $PSQL -d $DB -f supabase/migraciones/$mig.sql >/dev/null 2>/tmp/claude-0/ct-mig.txt || { head -6 /tmp/claude-0/ct-mig.txt; echo "✗ la migración $mig falló la vez $vez"; exit 1; }
  done
done
salida=$($PSQL -d $DB -f .arnes/prueba-conteo-tiempos.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ tiempos: una comprobación falló"; exit 1; fi
for n in T1 T2 T3 T4 T5; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Tiempos del conteo: primer renglón → envío, pausas largas aparte, en curso sin fin, y solo lo ve quien puede ver el Tablero o el Conteo."
