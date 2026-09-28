#!/usr/bin/env bash
set -e
export DB=${1:-cruce}
export EXCLUIR="maestro-cruce"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL MAESTRO DE VERDAD, LOS 494 DE «FEFO 002.xlsx». `_base-completa.sh`
# monta el esquema pero no los datos, y este cruce no mide nada contra
# una tabla vacía: lo que viene a probar es justamente qué pasa cuando
# el archivo se encuentra con materiales que YA tienen valores puestos.
$PSQL -d $DB -f supabase/datos/inventario-maestro-cd38.sql >/dev/null 2>&1 || {
  echo "✗ no se pudo cargar supabase/datos/inventario-maestro-cd38.sql"; exit 1; }

# UNA CATEGORÍA PUESTA A MANO ANTES DE CORRER. El cruce tiene que
# respetarla: todo lo suyo es «rellena lo vacío», no «pisa lo que haya».
$PSQL -d $DB -c "update public.productos set categoria = 'PUESTA A MANO' where sku = '1413';" >/dev/null

echo "--- antes: qué le falta al maestro"
$PSQL -d $DB -tAc "select
  count(*) || ' materiales · ' ||
  count(*) filter (where categoria is null) || ' sin categoría'
  from public.productos" | sed 's/^/    /'

# LA HUELLA DE LAS ESTIBAS ANTES DE TOCAR NADA. Es lo que el Excel
# habría borrado con sus ceros, y la única forma de comprobar que
# ninguna de las 495 se movió.
estiba_antes=$($PSQL -d $DB -tAc "select md5(string_agg(sku||':'||coalesce(cajas_por_estiba::text,'-')||'/'||coalesce(unidades_por_estiba::text,'-'), '|' order by sku)) from public.productos")

echo "--- el cruce"
if $PSQL -d $DB -f supabase/migraciones/2026-09-maestro-cruce-2026-09-26.sql 2>&1 \
   | grep -E "^ERROR|ERROR:"; then exit 1; fi

estiba_despues=$($PSQL -d $DB -tAc "select md5(string_agg(sku||':'||coalesce(cajas_por_estiba::text,'-')||'/'||coalesce(unidades_por_estiba::text,'-'), '|' order by sku)) from public.productos")
if [ "$estiba_antes" != "$estiba_despues" ]; then
  echo "✗ el cruce cambió las cajas o unidades por estiba de algún material."
  echo "  El Excel las trae en CERO para 370 de los 493: ahí un cero hace que una estiba"
  echo "  de ese material cuente cero cajas, y no lo nota nadie hasta cuadrar el mes."
  $PSQL -d $DB -c "select sku, nombre, cajas_por_estiba, unidades_por_estiba from productos where cajas_por_estiba = 0 or unidades_por_estiba = 0 order by sku"
  exit 1
fi

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-maestro-cruce.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|WARNING|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi

echo "--- otra vez (se puede correr dos veces sin cambiar nada)"
antes=$($PSQL -d $DB -tAc "select md5(string_agg(sku||coalesce(categoria,'')||coalesce(tipo_envase,'')||coalesce(hl::text,'')||coalesce(cajas_por_estiba::text,'')||coalesce(contenido::text,''), '|' order by sku)) from public.productos")
if $PSQL -d $DB -f supabase/migraciones/2026-09-maestro-cruce-2026-09-26.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
despues=$($PSQL -d $DB -tAc "select md5(string_agg(sku||coalesce(categoria,'')||coalesce(tipo_envase,'')||coalesce(hl::text,'')||coalesce(cajas_por_estiba::text,'')||coalesce(contenido::text,''), '|' order by sku)) from public.productos")
if [ "$antes" != "$despues" ]; then
  echo "✗ la segunda corrida cambió el maestro: no es idempotente"; exit 1; fi

echo "--- y un código del archivo que NO esté en el maestro para la base EN SECO"
# NO BASTA CON QUE LO NOMBRE: tiene que PARARSE. Con un `raise notice` el
# texto sale igual, el archivo termina «bien» y nadie vuelve a mirar —y
# ese código se queda fuera del maestro sin familia ni mínimos, mudo en
# las pantallas de FEFO. Se comprueba que el psql devuelva error.
$PSQL -d $DB -c "delete from public.productos where sku = '3503486';" >/dev/null
salida=$($PSQL -d $DB -f supabase/migraciones/2026-09-maestro-cruce-2026-09-26.sql 2>&1) && paro=no || paro=si
if [ "$paro" != "si" ]; then
  echo "✗ con un código del archivo fuera del maestro, el cruce TERMINÓ BIEN:"
  echo "  avisar no sirve —el archivo acaba en verde y ese código se queda fuera, mudo—."
  exit 1
fi
if ! echo "$salida" | grep -q "3503486"; then
  echo "✗ se paró, pero sin decir QUÉ código falta: hay que ir a buscarlo a mano"
  exit 1
fi
echo "    se paró en seco y lo nombró ✓"

echo "✓ El cruce del maestro: los 493 códigos del archivo ya estaban —no faltaba ninguno—, así que lo que entra son las cuatro columnas que nunca existieron (categoría, tipo de envase, HL y referencia); las cajas y unidades por estiba NO se tocan porque el Excel las trae en cero para 370 materiales y ahí un cero hace que una estiba cuente cero cajas; lo puesto a mano no se pisa, los cuatro contenidos que el nombre del material desempata sí se corrigen, se puede correr dos veces sin mover nada, y un código que no esté en el maestro para el archivo en seco en vez de darlo de alta mudo."
