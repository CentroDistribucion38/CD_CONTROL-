#!/usr/bin/env bash
set -e
export DB=${1:-camino}
export EXCLUIR="roturas-camino-por-causa"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL MAESTRO DE MENTIRAS: un producto terminado y un envase, que es lo
# que hace falta para probar los dos caminos de cobro.
$PSQL -d $DB -c "
insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, activo) values
  ('PRUEBA-PT','Aguila RN 330cc X 30','producto_terminado','ambar',30,true),
  ('PRUEBA-EER','Envase Marron 330R','eer','ambar',null,true)
on conflict (clave) do nothing;" >/dev/null

echo "--- la migración"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-camino-por-causa.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-camino-causa.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
echo "--- otra vez (se puede correr dos veces sin romper nada)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-camino-por-causa.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "✓ Cada causa por su camino: la del OL espera en su bandeja con sus rotas Y sus contaminadas, la que no es suya nace en «no se cobra» y no le llega, y el EER no admite contaminadas."
