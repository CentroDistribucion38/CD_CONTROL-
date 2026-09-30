#!/usr/bin/env bash
# La salida en dos tiempos (ficha y dar salida): arma la base, aplica la migración DOS veces y corre su prueba.
#   bash .arnes/correr-sider-fichas.sh
set -e
export DB=${1:-fichas}
source .arnes/_base-completa.sh >/tmp/claude-0/fichas-base.txt 2>&1 || { tail -12 /tmp/claude-0/fichas-base.txt; echo "✗ la base no salió"; exit 1; }
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
for vez in 1 2; do
  $PSQL -d $DB -f supabase/migraciones/2026-09-sider-fichas-de-salida.sql >/dev/null 2>/tmp/claude-0/fichas-mig.txt || { cat /tmp/claude-0/fichas-mig.txt | head -6; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-sider-fichas.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ fichas: una comprobación falló"; exit 1; fi
for n in F1a F1 F2 F3 F3b F4 F5; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Fichas de salida: guardar no crea viajes, dar salida los crea con factura y fotos, cada uno ve lo suyo, todo o nada."
