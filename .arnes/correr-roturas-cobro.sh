#!/usr/bin/env bash
set -e
export DB=${1:-cobro}
export EXCLUIR="roturas-cobro"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL MAESTRO: los dos materiales del ejemplo, con su precio y su enlace.
$PSQL -d $DB -c "
insert into public.productos (sku, nombre, tipo_material, color_vidrio, unidades_por_caja, activo, en_sitio)
values ('2182','Pony Malta R 330cc X 30','PRODUCTO',null,30,true,true),
       ('3500162','Envase Marron 330R','ENVASE','ambar',null,true,true)
on conflict (sku) do nothing;" >/dev/null
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-precios.sql >/dev/null 2>&1; then :; else
  # El archivo de precios exige los 45; aquí solo hacen falta dos.
  $PSQL -d $DB -c "
    update public.productos set precio_botella = 233.50, envase_sku = '3500162' where sku = '2182';
    update public.productos set precio_botella = 100.00 where sku = '3500162';" >/dev/null
fi
$PSQL -d $DB -c "
insert into public.roturas_materiales (clave, nombre, tipo, color, botellas_x_empaque, activo) values
  ('2182','Pony Malta R 330cc X 30','producto_terminado',null,30,true),
  ('3500162','Envase Marron 330R','eer','ambar',null,true)
on conflict (clave) do nothing;" >/dev/null

# DOS ROTURAS VIEJAS, guardadas como las guardaba la funcion de antes:
#  · RB-VIEJA  10 unidades y 300 botellas -- el producto 10 x 30.
#  · RB-AMANO  10 unidades y  77 botellas -- alguien las conto.
$PSQL -d $DB -c "
insert into public.roturas (codigo, material, tipo, color, unidades, contaminadas, botellas,
                            proceso, area, causa, grupo, estado)
values ('RB-VIEJA','2182','producto_terminado',null,10,0,300,'lineas','bahias_t1','estibas_malas','asumida','esperando'),
       ('RB-AMANO','2182','producto_terminado',null,10,0, 77,'lineas','bahias_t1','estibas_malas','asumida','esperando')
on conflict do nothing;" >/dev/null

echo "--- la migración"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-cobro.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-roturas-cobro.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|WARNING|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
echo "--- otra vez (se puede correr dos veces sin romper nada)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-cobro.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "✓ El cobro: una unidad es una botella y lo viejo quedó corregido sin pisar lo contado a mano; la rota cobra solo el envase, la contaminada envase y producto, el EER no lleva producto, y sin precio la plata sale nula y no cero."
