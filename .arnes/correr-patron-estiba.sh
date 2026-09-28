#!/usr/bin/env bash
set -e
export DB=${1:-patron}
export EXCLUIR="patron-de-estiba"
source .arnes/_base-completa.sh
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

# EL MAESTRO DE MENTIRAS. La base de prueba nace sin materiales, así que
# sin esto la migración sembraría cero y el arnés estaría midiendo el
# vacío. Van cuatro de verdad, con su factor de estiba real del archivo,
# y uno con el factor PELEADO a propósito: el aviso de desacuerdo también
# tiene que sonar cuando hay algo de qué avisar.
$PSQL -d $DB -c "
insert into productos (sku, nombre, unidades_por_caja, cajas_por_estiba, vida_util, dias_minimo) values
  ('2154','Aguila TW 330cc X 24',24,75,180,30),
  ('2182','Pony Malta R 330cc X 30',30,45,365,30),
  ('3128','Aguila RN 330cc X 30',30,45,180,30),
  ('9845','Aguila Tw 330Cc X 30',30,45,180,30)
on conflict do nothing;" >/dev/null

echo "--- la migración"
if $PSQL -d $DB -f supabase/migraciones/2026-09-patron-de-estiba.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-patron-estiba.sql 2>&1) || true
echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
echo "--- otra vez (se puede correr dos veces sin romper nada, y sin pisar lo puesto a mano)"
if $PSQL -d $DB -f supabase/migraciones/2026-09-patron-de-estiba.sql 2>&1 | grep -E "^ERROR|ERROR:"; then exit 1; fi
n=$(sudo -u postgres psql -tAq -d $DB -c "select pat_largo||'x'||pat_ancho||'x'||pat_nivel from productos where sku='2154'")
if [ -n "$n" ] && [ "$n" != "9x9x9" ]; then echo "✗ la segunda corrida pisó el patrón puesto a mano: $n"; exit 1; fi
echo "✓ El patrón de estiba: tres columnas con tope, los 123 del maestro sembrados, ninguno peleado con el factor de estiba, y la segunda corrida no pisa lo corregido a mano."
