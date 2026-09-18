#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL ARNÉS?
#
# Se ROMPE la migración a propósito, una cosa a la vez, y se exige que
# salga un mensaje CONCRETO.
#
# HAY DOS REDES Y SE PRUEBAN POR SEPARADO:
#
#   · LA GUARDIA de la propia migración, que se niega a dejar la base
#     mal y es la que protege de verdad el día que esto se corra.
#   · LAS ASERCIONES de la prueba, que son las que dicen QUÉ estaba mal.
#
# La primera versión de este archivo esperaba la aserción en mutaciones
# que caza la guardia, y cuatro salieron «verdes» — no porque nadie
# cazara el error, sino porque lo cazó la otra red. Una mutación que se
# equivoca de acusado es tan inútil como una aserción que no puede
# fallar. Por eso cada error se rompe DOS veces: una con la guardia
# puesta y otra con la guardia también rota.
#
#   bash .arnes/mutar-roturas-en-quiebra.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-roturas-dentro-de-quiebra.sql
PERM=supabase/migraciones/2026-09-permiso-sin-acceso-por-persona.sql
FALLOS=0

probar () {          # $1 = nombre  $2 = qué mensaje tiene que salir
  local nombre="$1" espera="$2" salida
  cp /tmp/qb-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-roturas-en-quiebra.sh qb_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/qb-buena.sql
cp "$PERM" /tmp/qb-perm-buena.sql
trap 'cp /tmp/qb-buena.sql "$ORIG"; cp /tmp/qb-perm-buena.sql "$PERM"' EXIT

echo "Rompiendo la migración a propósito, una cosa a la vez:"

# ---------------------------------------------------------------------
# 1. UN NIVEL FIJO EN VEZ DEL QUE CADA ROL TIENE. Es el atajo evidente
#    —«todos a ver»— y le quitaría el editar al jefe de planta sin que
#    nadie lo note hasta que intente guardar algo.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py nivel-fijo
probar "la guardia exige el nivel de cada rol" "El permiso del tablero no quedó igual"

python3 .arnes/_mutar-qb.py nivel-fijo sin-guardia
probar "cada rol con SU nivel, no uno fijo" "2(jefeplanta quedo con ver en vez de editar)"

# ---------------------------------------------------------------------
# 2. REPARTIR A TODOS LOS ROLES, tengan o no /quiebra. Repartir de más no
#    lo reclama nadie: nunca falta una pantalla que no debías ver, y por
#    eso hay que buscarlo a propósito.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py reparte-a-todos
probar "la guardia caza el reparto de más" "El permiso del tablero no quedó igual"

python3 .arnes/_mutar-qb.py reparte-a-todos sin-guardia
probar "no se le da el tablero a quien no tiene /quiebra" "3(porteria acabo con el tablero"

# ---------------------------------------------------------------------
# 3. PISAR LO QUE YA ESTABA PUESTO A MANO. Una migración que se puede
#    correr varias veces no puede deshacer en la segunda vuelta lo que
#    una persona decidió entre las dos.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py pisa-lo-puesto
probar "no se pisa lo puesto a mano" "4(le piso el nivel puesto a mano"

# ---------------------------------------------------------------------
# 4. COPIAR SOLO LOS ROLES Y NO LOS PERMISOS PROPIOS DE CADA PERSONA.
#    Es el fallo silencioso de este archivo: quien tenía /quiebra CERRADO
#    en particular recuperaría el tablero por la puerta de atrás.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py sin-personas
probar "la guardia exige copiar lo de cada persona" "quedaron con distinto permiso propio"

python3 .arnes/_mutar-qb.py sin-personas sin-guardia
probar "los permisos propios también se copian" "5(al que le cerraron /quiebra le quedo el tablero"

# ---------------------------------------------------------------------
# 5. INVENTARLE UN PERMISO PROPIO A QUIEN NO LO TENÍA.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py inventa-personas
probar "la guardia caza el permiso propio inventado" "sin tenerlo sobre /quiebra"

python3 .arnes/_mutar-qb.py inventa-personas sin-guardia
probar "no se inventa un permiso propio a quien no lo tenía" "7(le invento un permiso propio"

# ---------------------------------------------------------------------
# 6. MOVER EN VEZ DE COPIAR. /quiebra sigue siendo la puerta del módulo:
#    quien la pierda no vería ni la bifurcación.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py mueve-no-copia
probar "se copia, no se mueve" "8(se perdio el permiso sobre /quiebra"

# ---------------------------------------------------------------------
# 7. COMPROBAR DE MÁS: juzgar también las filas que la migración
#    respetó. ES EL ERROR QUE YO TENÍA — se negaba a correr por el rol
#    que ya tenía el tablero puesto a mano con otro nivel, que es
#    precisamente la fila que ella decidió no tocar.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py comprueba-de-mas
probar "no revienta por una fila que respetó" "El permiso del tablero no quedó igual"

# ---------------------------------------------------------------------
# 8. EL CHECK SIN «SIN ACCESO». Si vuelve a admitir solo 'ver' y
#    'editar', no se puede ni guardar el caso de la persona a la que le
#    cerraron una pantalla — que es el fallo que destapó todo esto.
# ---------------------------------------------------------------------
python3 .arnes/_mutar-qb.py check-sin-ninguno
cp /tmp/qb-buena.sql "$ORIG"
cp /tmp/qb-perm-mutada.sql "$PERM"
if bash .arnes/correr-roturas-en-quiebra.sh qb_mut 2>&1 | grep -q "sigue sin admitir"; then
  echo "  ROJA  ✔  el CHECK admite «Sin acceso»"
else
  echo "  VERDE ✘  el CHECK admite «Sin acceso»  ← LA PRUEBA NO CAZA ESTO"
  FALLOS=$((FALLOS+1))
fi
cp /tmp/qb-perm-buena.sql "$PERM"

cp /tmp/qb-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 12 se pusieron rojas. Las dos redes cazan, y cada una lo suyo."
