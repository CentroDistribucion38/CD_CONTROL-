#!/usr/bin/env bash
# Vh Interno con varios materiales: arma la base con la migración de Revisión AI,
# aplica la de varios materiales DOS veces y corre su prueba.
#   bash .arnes/correr-sider-varios.sh
set -e
export DB=${1:-varios}
export EXCLUIR_EXTRA="sider-interno-varios-materiales${EXCLUIR_EXTRA:+|$EXCLUIR_EXTRA}"
bash .arnes/correr-sider-revision.sh $DB >/tmp/claude-0/varios-base.txt 2>&1 || { tail -15 /tmp/claude-0/varios-base.txt; echo "✗ la base de Revisión AI no salió"; exit 1; }
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
for vez in 1 2; do
  $PSQL -d $DB -f supabase/migraciones/2026-09-sider-interno-varios-materiales.sql >/dev/null 2>&1 || { echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-sider-varios.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -20 | sed 's/^/    /'; echo "✗ varios materiales: una comprobación falló"; exit 1; fi
for n in V1 V2 V3; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Vh Interno con varios materiales: todo o nada, misma placa y factura, una tarjeta por material, mismas reglas, sin permiso no crea."
