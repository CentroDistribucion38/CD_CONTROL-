#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE «SUMAR EN OTRA MÁQUINA» CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN, no por la de al lado.
#
#   bash .arnes/mutar-rotura-linea-sumar.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-rotura-linea-sumar-maquinas.sql
COPIA=/tmp/rl-sumar-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT INT TERM HUP

# `replace` NO AVISA cuando no encuentra nada.
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

corre() { bash .arnes/correr-rotura-linea-sumar.sh mut_rl 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "todo en orden"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
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
  if echo "$s" | grep -q "todo en orden"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

# ── LA SUMA ─────────────────────────────────────────────────────────
mutacion "1 · PALE-DEPA deja de sumarse en PASTEURIZADORA" \
  "PASTEURIZADORA (13)" \
  "update public.rotlinea_maquinas set suma_en = 13 where item = 155;" \
  "update public.rotlinea_maquinas set suma_en = null where item = 155;"

mutacion "2 · CARGADOR deja de sumarse en SALIDA DE LAVADORA" \
  "SALIDA DE LAVADORA (6)" \
  "update public.rotlinea_maquinas set suma_en = 6  where item = 66;" \
  "update public.rotlinea_maquinas set suma_en = null where item = 66;"

# El guardia de la propia migración lo caza antes que la prueba, así
# que para medir a LA PRUEBA se quita el guardia en las dos de arriba.
# Estas otras sí llegan a la prueba:

mutacion "3 · la función agrupa por la máquina anotada y no por la de destino" \
  "siguen saliendo aparte en el tablero" \
  "    join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
   where r.fecha between p_desde and p_hasta" \
  "    join public.rotlinea_maquinas d on d.item = m.item
   where r.fecha between p_desde and p_hasta" \
  "  if exists (select 1 from public.rotlinea_tablero_maquina('1900-01-01', '2999-12-31', null)
              where maquina in (66, 155)) then" \
  "  if false then"

mutacion "4 · la barra se llama como la máquina anotada y no como la de destino" \
  "no se llama PASTEURIZADORA" \
  "  select d.item, d.nombre, d.orden," \
  "  select d.item, (select min(x.nombre) from public.rotlinea_maquinas x where x.suma_en = d.item) , d.orden,"

mutacion "5 · juntar resta: se cuenta solo la máquina de destino" \
  "juntar no puede restar" \
  "    join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
   where r.fecha between p_desde and p_hasta
     and (p_linea is null or r.linea = p_linea)" \
  "    join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
   where r.fecha between p_desde and p_hasta
     and m.suma_en is null
     and (p_linea is null or r.linea = p_linea)" \
  "  if exists (select 1 from public.rotlinea_tablero_maquina('1900-01-01', '2999-12-31', null)
              where maquina in (66, 155)) then" \
  "  if false then"

mutacion "6 · la migración reescribe el histórico en vez de sumar" \
  "la migración reescribió el histórico" \
  "update public.rotlinea_maquinas set suma_en = 6  where item = 66;    -- CARGADOR  → SALIDA DE LAVADORA" \
  "update public.rotlinea_maquinas set suma_en = 6  where item = 66;    -- CARGADOR  → SALIDA DE LAVADORA
update public.rotlinea_registro r set maquina = m.suma_en
  from public.rotlinea_maquinas m where m.item = r.maquina and m.suma_en is not null;"

mutacion "7 · el filtro de línea deja de filtrar" \
  "en la línea 2 SALIDA DE LAVADORA" \
  "     and (p_linea is null or r.linea = p_linea)
   group by d.item, d.nombre, d.orden" \
  "   group by d.item, d.nombre, d.orden"

mutacion "8 · la vista diaria se queda con la regla vieja" \
  "la vista diaria y la función dan paretos distintos" \
  "join public.rotlinea_maquinas d on d.item = coalesce(m.suma_en, m.item)
group by r.fecha, r.linea, d.item, d.nombre, d.orden;" \
  "join public.rotlinea_maquinas d on d.item = m.item
group by r.fecha, r.linea, d.item, d.nombre, d.orden;"

mutacion "9 · se permite encadenar: la que recibe se suma en otra" \
  "PASTEURIZADORA se dejó sumar en otra" \
  "  if exists (select 1 from public.rotlinea_maquinas
              where suma_en = new.item and item <> new.item) then" \
  "  if false then"

mutacion "10 · se permite sumar en una que ya se suma en otra" \
  "LAVADORA se dejó sumar en PALE-DEPA" \
  "  if exists (select 1 from public.rotlinea_maquinas
              where item = new.suma_en and suma_en is not null) then" \
  "  if false then"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 10 mutaciones se cazaron, cada una por su propia prueba."
