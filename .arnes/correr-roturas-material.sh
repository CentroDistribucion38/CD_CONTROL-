#!/usr/bin/env bash
set -e
export DB=${1:-rtmat}
export EXCLUIR="roturas-material-del-maestro"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL ENVASE SIN COLOR SE SIEMBRA **ANTES** DE LA MIGRACIÓN, y ese es el
# punto: el archivo reventaba con «ENVASE MARRON 330NR CERVEZAS» —un
# envase real de su maestro sin color puesto— al intentar copiarlo. La
# primera versión de esta prueba lo creaba DESPUÉS, cuando el archivo ya
# había pasado, así que no probaba lo que decía probar.
$PSQL -d $DB -c "insert into public.productos (sku, nombre, activo, tipo_material, color_vidrio)
 values ('SKU-MARRON','ENVASE MARRON 330NR CERVEZAS', true, 'ENVASE', null)
 on conflict (sku) do update set color_vidrio = null;" >/dev/null 2>&1

echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-roturas-material-del-maestro.sql 2>&1 | grep -E "ERROR" || true
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-material-del-maestro.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-roturas-material.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR|^ +·|^ *·" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
