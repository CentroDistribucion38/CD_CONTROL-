#!/usr/bin/env bash
# «Me la encontré» va directo a cobro: base completa SIN esta migración, se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-encontrada-a-cobro.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-encontrada}
export EXCLUIR="encontrada-a-cobro"
source .arnes/_base-completa.sh >/tmp/claude-0/enc-base.txt 2>&1 || { tail -8 /tmp/claude-0/enc-base.txt; echo "✗ la base no salió"; exit 1; }
# Dos archivos fallan siempre y no importan: el del descargo (reemplazado a propósito) y el de precios (necesita datos).
if grep "^FALLA [^ ]*roturas" /tmp/claude-0/enc-base.txt | grep -vE "descargo-del-ol|roturas-precios" | grep -q .; then grep "^FALLA [^ ]*roturas" /tmp/claude-0/enc-base.txt | grep -vE "descargo-del-ol|roturas-precios" | cut -c1-200; echo "✗ la base no salió"; exit 1; fi
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-10-roturas-encontrada-a-cobro.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/enc-mig.txt || { head -6 /tmp/claude-0/enc-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-encontrada-a-cobro.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ encontrada a cobro: una comprobación falló"; exit 1; fi
echo "$salida" | grep -q "NOTICE:  ENCONTRADA ·" || { echo "✗ no corrió la prueba"; exit 1; }
# El relleno: una encontrada que ya esperaba visto bueno pasa a cobro; la que Easy objetó y la de OPM no se tocan.
$PSQL -d $DB -c "update public.roturas set estado='esperando', decidida_en=null, decidida_por=null, nota_decision=null where descripcion='encontrada'" >/dev/null
$PSQL -d $DB -f $M >/dev/null 2>&1 || { echo "✗ la migración falló al rellenar"; exit 1; }
rel=$($PSQL -d $DB -At -c "select string_agg(descripcion||'='||estado, ',' order by descripcion) from public.roturas where descripcion in ('encontrada','opm','objetada')")
[ "$rel" = "encontrada=cuenta,objetada=esperando,opm=esperando" ] || { echo "✗ el relleno dejó: $rel"; exit 1; }
echo "✓ «Me la encontré» va directo a cobro; la de OPM sigue en el visto bueno; nadie objeta lo cobrado."
