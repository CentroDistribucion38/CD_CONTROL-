#!/usr/bin/env bash
set -e
export DB=${1:-precios}
export EXCLUIR="roturas-precios"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL MAESTRO DE MENTIRAS: los 45 códigos del archivo de precios más seis
# de los que salen, para poder comprobar que de verdad se apagan.
$PSQL -d $DB -c "
insert into public.productos (sku, nombre, tipo_material, en_sitio)
select s, 'Material ' || s, case when s ~ '^(35|412)' and s <> '3583' then 'ENVASE' else 'PRODUCTO' end, true
  from unnest(array[
    '2182','2511','2512','3128','3583','3617','3659','3664','3751','3759','3787','9139','9150',
    '9480','9482','9494','9508','9798','9845','9856','13451','14779','15781','20050','20463',
    '20546','20867','20877','21156','22613','23204','23224',
    '3500005','3500162','3500213','3500373','3500383','3500446','3500887','3500888','3501225',
    '3501226','3501430','3501539','412375',
    '7599','21177','22003','22284','22398','23060']) s
on conflict (sku) do update set en_sitio = true;" >/dev/null

echo "--- la migración"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-precios.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-roturas-precios.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
echo "--- otra vez (se puede correr dos veces sin romper nada)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-precios.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "✓ Los precios del MM60: 32 productos con su precio y su envase, 13 envases con el suyo, el no retornable sin envase, ningún enlace roto ni precio en cero, y el desplegable de en sitio en exactamente los 45."
