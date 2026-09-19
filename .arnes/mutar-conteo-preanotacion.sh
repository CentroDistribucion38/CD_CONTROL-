#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE LA PRE-ANOTACIÓN CAZA LO QUE DICE CAZAR?
#
# Un arnés en verde no prueba nada por sí solo: prueba que no encontró
# lo que buscó, y buscar mal también sale verde. Aquí se le vuelve a
# meter CADA error que la prueba afirma cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN.
#
#   bash .arnes/mutar-conteo-preanotacion.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-conteo-preanotacion.sql
COPIA=/tmp/preanotacion-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT

# `replace` NO AVISA cuando no encuentra nada: reescribe el archivo
# idéntico y el arnés aprueba lo mismo de siempre.
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

corre() { bash .arnes/correr-conteo-preanotacion.sh mut_pre 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
SAL=$(corre)
if ! echo "$SAL" | grep -q "todo en orden"; then
  echo "El arnés ya estaba en rojo ANTES de mutar nada:"; echo "$SAL" | grep -E "ERROR" | head -5
  exit 1
fi
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
  if ! echo "$s" | grep -qE "ERROR" && echo "$s" | grep -q "todo en orden"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

# ── EL LADO QUE FALTA ───────────────────────────────────────────────
mutacion "1 · la clave del lado nuevo no se arma como las 428 que ya están" \
  "la clave no se armó" \
  "  v_clave := v_calle || v_mod || coalesce('_' || v_lado, '');" \
  "  v_clave := v_calle || v_mod || coalesce('-' || v_lado, '');"

mutacion "2 · el lado nuevo nace sin la familia del otro lado" \
  "no heredó la familia" \
  "         (select u.familia   from public.ubicaciones u
           where u.bodega_id = p_bodega and u.calle = v_calle and u.modulo = v_mod
             and u.familia is not null limit 1)," \
  "         null::text,"

mutacion "3 · el lado nuevo nace sin la capacidad del otro lado" \
  "no heredó la capacidad" \
  "         (select u.capacidad from public.ubicaciones u
           where u.bodega_id = p_bodega and u.calle = v_calle and u.modulo = v_mod
             and u.capacidad is not null limit 1)," \
  "         null::integer,"

# SI NO MIRA SI YA EXISTE, la segunda llamada intenta crear otro A01_DER
# y choca con la llave única (bodega, clave). Rojo por Postgres, no por
# la prueba — así que se exige el mensaje de la llave, que es lo que de
# verdad protege el histórico de esa posición.
mutacion "4 · no mira si el lado ya existe y trata de crearlo otra vez" \
  "duplicate key" \
  "  select id into v_id from public.ubicaciones
   where bodega_id = p_bodega and clave = v_clave;" \
  "  v_id := null;"

# LO QUE APORTA ESTA COMPROBACIÓN ES EL MENSAJE, NO LA PROTECCIÓN.
# La tabla tiene un CHECK sobre `lado`, así que un lado inventado se
# rechaza igual — pero con «violates check constraint
# ubicaciones_lado_check», que no dice qué hacer. Quitando la
# comprobación, la prueba se pone roja diciendo «lo rechazó, pero por
# otra cosa», que es exactamente lo que pasó. Esa es la afirmación.
mutacion "5 · el lado inventado deja de rechazarse con un mensaje legible" \
  "lo rechazó, pero por otra cosa" \
  "  if v_lado is not null and v_lado not in ('IZQ', 'DER') then" \
  "  if false then"

# ── LA PRE-ANOTACIÓN ────────────────────────────────────────────────
mutacion "6 · la pre-anotación trae UN renglón en vez de todos los del último conteo" \
  "y son 2: la posición tenía dos códigos" \
  "    dense_rank() over (" "    row_number() over ("

mutacion "7 · la pre-anotación trae el conteo más VIEJO en vez del último" \
  "sigue trayendo el de ayer" \
  "      order by coalesce(c.cerrado_en, c.iniciado_en, c.creado_en) desc, c.id desc" \
  "      order by coalesce(c.cerrado_en, c.iniciado_en, c.creado_en) asc, c.id asc"

# ── LO QUE FALTA POR CONTAR ─────────────────────────────────────────
mutacion "8 · lo que falta por contar sale al revés: las contadas" \
  "sale como que falta" \
  "     and not exists (
       select 1 from public.conteo_lineas cl
        where cl.conteo_id = p_conteo and cl.ubicacion_id = u.id)" \
  "     and exists (
       select 1 from public.conteo_lineas cl
        where cl.conteo_id = p_conteo and cl.ubicacion_id = u.id)"

mutacion "9 · pide contar las posiciones dadas de baja" \
  "pide contar una posición dada de baja" \
  "   where u.activa
     and not exists (" \
  "   where true
     and not exists ("

mutacion "10 · deja de decir hace cuántos días se contó (la lista deja de ser alerta)" \
  "no dice que B02_IZQ se contó hace un día" \
  "         case when ul.cuando is null then null
              else (current_date - (ul.cuando at time zone 'America/Bogota')::date)::int
         end" \
  "         null::int"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 10 mutaciones se cazaron, cada una por su propia prueba."
