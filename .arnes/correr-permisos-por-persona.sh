#!/usr/bin/env bash
# Lo puesto a mano a una persona vale también en la base (mi_nivel / puede_editar_modulo): base completa SIN esta migración, se aplica DOS veces y corre su prueba.
#   bash .arnes/correr-permisos-por-persona.sh        (M=archivo para probar un mutante)
set -e
export DB=${1:-permpersona}
export EXCLUIR="permisos-por-persona"
source .arnes/_base-completa.sh >/tmp/claude-0/pp-base.txt 2>&1 || true
# Tres archivos viejos se niegan a correr solos (están reemplazados o piden datos): no importan aquí.
if grep "^FALLA " /tmp/claude-0/pp-base.txt | grep -vE "roturas-descargo-del-ol|roturas-precios|maestro-cruce-2026-09-26"; then echo "✗ la base no salió"; exit 1; fi
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
# ANTES: el fallo existe (si no, la prueba no demuestra nada).
antes=$($PSQL -d $DB -f .arnes/prueba-permisos-por-persona.sql 2>&1) || true
echo "$antes" | grep -q "FALLA" || { echo "✗ antes de la migración la prueba debía fallar y no falló"; exit 1; }
$PSQL -c "drop database if exists ${DB}2" >/dev/null 2>&1
M=${M:-supabase/migraciones/2026-10-permisos-por-persona-en-la-base.sql}
for vez in 1 2; do
  $PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/pp-mig.txt || { head -6 /tmp/claude-0/pp-mig.txt; echo "✗ la migración falló la vez $vez"; exit 1; }
done
salida=$($PSQL -d $DB -f .arnes/prueba-permisos-por-persona.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -20 | sed 's/^/    /'; echo "✗ permisos por persona: una comprobación falló"; exit 1; fi
echo "$salida" | grep -q "NOTICE:  P1-P12" || { echo "✗ no corrió la prueba"; exit 1; }
echo "✓ Permisos por persona: lo que se da a mano vale también en la base, lo cerrado a mano cierra, y el rol sigue donde no se tocó."
