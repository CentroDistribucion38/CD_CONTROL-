#!/usr/bin/env bash
# La base completa (con la migración nueva) y la prueba del permiso «Pedir / quitar revisión AI».
#     bash .arnes/correr-sider-pedir-ai-permiso.sh      (necesita: sudo service postgresql start)
set -e
export DB=${1:-pedirai}
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
# La migración va AL FINAL y dos veces: en la base armada con reintentos, una anterior puede acabar corriendo después y pisar la función.
for vez in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-sider-pedir-revision-ai-permiso.sql >/dev/null || { echo "✗ la migración falló (vez $vez)"; exit 1; }; done
salida=$($PSQL -d $DB -f .arnes/prueba-sider-pedir-ai-permiso.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -20 | sed 's/^/    /'; echo "✗ permiso de pedir revisión AI"; exit 1; fi
for n in 1 2 3 4 5 6 7; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió la comprobación $n"; exit 1; }; done
echo "✓ Pedir / quitar revisión AI: el administrador siempre, con su casilla en «editar» sí, editar En tránsito no alcanza, ni «ver», ni sin perfil; lo puesto a una persona manda sobre su rol."
