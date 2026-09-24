#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE LA CADENA AL DERECHO CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN, no por la de al lado. Una mutación que
# vuelve VERDE es un hueco en la PRUEBA, no un permiso para el código.
#
#   bash .arnes/mutar-visto-bueno-easy.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-roturas-visto-bueno-easy.sql
COPIA=/tmp/vbeasy-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT INT TERM HUP

# `replace` NO AVISA cuando no encuentra nada, y una mutación que no
# aplicó deja el arnés verde por el motivo equivocado.
cambia() {
  python3 - "$SQL" "$1" "$2" <<'PY'
import sys
ruta, de, a = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read()
n = s.replace(de, a)
assert n != s, f"la mutacion no aplico: {de[:70]}"
open(ruta, "w", encoding="utf-8").write(n)
PY
}

corre() { bash .arnes/correr-visto-bueno-easy.sh mut_vb 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN:"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=()
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  if echo "$s" | grep -q "BIEN:"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'FALLA|ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

# ---------------------------------------------------------------------
# BORRAR LO YA DECIDIDO
# ---------------------------------------------------------------------
# La fila desaparece. Lo único que queda entre «el administrador puede
# borrar» y «una cifra se fue de un mes cerrado y nadie sabe qué decía»
# son estas tres cosas: que pida motivo, que guarde la fila entera, y
# que ese registro no lo lea cualquiera.

mutacion "1 · borrar lo ya decidido sin motivo" \
  "8d(se borró una rotura ya decidida SIN motivo)" \
  "  if (v.estado <> 'esperando' or v.ol_respuesta is not null)
     and btrim(coalesce(p_motivo, '')) = '' then" \
  "  if false then"

mutacion "2 · el guarda mira solo el estado y no si el OL contestó" \
  "8f(se borró sin motivo una rotura que el OL ya había objetado)" \
  "  if (v.estado <> 'esperando' or v.ol_respuesta is not null)" \
  "  if (v.estado <> 'esperando')"

# GUARDA LA FILA ENTERA Y NO SOLO EL CÓDIGO. Un renglón que diga
# «RB-0007, borrada» no contesta la única pregunta que se va a hacer
# dentro de tres meses: ¿cuántas unidades tenía?
mutacion "3 · el rastro se guarda vacío, sin la fila" \
  "8e3(no quedó el rastro en roturas_borradas" \
  "  values (v.id, v.codigo, v_fila," \
  "  values (v.id, v.codigo, '{}'::jsonb,"

mutacion "4 · el rastro no guarda quién borró" \
  "8e3(no quedó el rastro en roturas_borradas" \
  "          auth.uid())" \
  "          null::uuid)"

mutacion "5 · cualquiera puede leer lo borrado" \
  "8e4(Easy puede leer el registro de lo borrado)" \
  "  for select to authenticated using (public.manda());" \
  "  for select to authenticated using (true);"

# ---------------------------------------------------------------------
# Y LO DE SIEMPRE: QUE BORRAR SIGA SIENDO DEL ADMINISTRADOR
# ---------------------------------------------------------------------
mutacion "6 · borrar deja de ser del administrador" \
  "8a(Easy pudo borrar una rotura)" \
  "  if not public.manda() then
    raise exception 'Borrar una rotura es del administrador';" \
  "  if false then
    raise exception 'Borrar una rotura es del administrador';"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 6 mutaciones se cazaron, cada una por su propia prueba."
