#!/usr/bin/env bash
set -e
export DB=${1:-color}
export EXCLUIR="roturas-color-envases"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# LOS TRECE EN EL MAESTRO, SIN COLOR: es el estado en que estaba la base
# de Cristian y el que trabó el registro.
$PSQL -d $DB -c "
insert into public.productos (sku, nombre, tipo_material, activo, en_sitio)
select s, n, 'ENVASE', true, true from (values
  ('3500005','Envase Costeñita 175R'),('3500162','Envase Marron 330R'),
  ('3500213','Envase Flint 330R'),('3500373','Envase Marron 750R'),
  ('3500383','Envase Flint 750R'),('3500446','Envase Marron Club Col 330R'),
  ('3500887','BOTELLA FLINT 1000R'),('3500888','BOTELLA MARRON 1000CC'),
  ('3501225','BOTELLA FLINT 250 CC'),('3501226','BOTELLA MARRON 250 CC'),
  ('3501430','ENVASE COSTENA BACANA 320CC R'),('3501539','BOTELLA MARRON 850 ML R'),
  ('412375','Envase Flint 210NR Coronita')) v(s,n)
on conflict (sku) do update set color_vidrio = null, activo = true, en_sitio = true;" >/dev/null

echo "--- antes: cuántos ve la pantalla"
$PSQL -d $DB -tAc "select coalesce(count(*),0) from public.v_roturas_materiales_maestro where tipo='eer' and color='ambar'" | sed 's/^/    ámbar: /'

echo "--- la migración"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-color-envases.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-color-envases.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|WARNING|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
echo "--- otra vez (y el color puesto a mano no se pisa)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-roturas-color-envases.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
c=$($PSQL -d $DB -tAc "select color_vidrio from productos where sku='3500162'")
if [ "$c" != "green" ]; then echo "✗ la segunda corrida pisó el color puesto a mano: $c"; exit 1; fi
echo "✓ El color de los envases: los 11 que lo dicen en el nombre quedan puestos, los 2 que no lo dicen se quedan vacíos y se nombran, el desplegable de EER vuelve a mostrarlos, y un color corregido a mano no se pisa."
