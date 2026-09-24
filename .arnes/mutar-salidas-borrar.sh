#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE BORRAR SALIDAS CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN, no por la de al lado. Una mutación que
# vuelve VERDE es un hueco en la PRUEBA, no un permiso para el código.
#
#   bash .arnes/mutar-salidas-borrar.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-salidas-borrar-en-lote.sql
COPIA=/tmp/slborrar-original.sql
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

corre() { bash .arnes/correr-salidas-borrar.sh mut_sl 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN:"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=()
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  # PARA TRABAJAR SIN ESPERAR LA CORRIDA ENTERA: con SOLO="4 ·" puesto
  # solo corre las mutaciones cuyo nombre lleve ese texto. Sin SOLO no
  # cambia nada, para que una corrida normal siga siendo todas.
  if [ -n "${SOLO:-}" ] && [[ "$nombre" != *"$SOLO"* ]]; then return; fi
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

mutacion "1 · borrar deja de ser del administrador" \
  "1a(el operador logístico pudo borrar salidas)" \
  "  if not public.manda() then
    raise exception 'Borrar salidas es del administrador';" \
  "  if false then
    raise exception 'Borrar salidas es del administrador';"

mutacion "2 · pregunta por el NOMBRE del rol y no por la casilla" \
  "1a(el operador logístico pudo borrar salidas)" \
  "  if not public.manda() then" \
  "  if public.mi_rol() <> 'admin' and false then"

mutacion "3 · se borra sin motivo" \
  "2a(se borró sin motivo)" \
  "  if v_motivo = '' then" \
  "  if false then"

# EL GUARDA DE LA LISTA VACÍA ES POR EL MENSAJE, no por el efecto: sin
# él no se borra nada igual —el guarda de «v_n = 0» lo frena—, pero
# contesta «Ninguna de esas salidas existe ya», que es mentira y manda a
# buscar el problema donde no está. Por eso la prueba exige el mensaje, y
# la mutación se caza porque el mensaje cambia.
mutacion "4 · la lista vacía contesta un mensaje que no es" \
  "2c(falló por otra cosa" \
  "  if p_ids is null or array_length(p_ids, 1) is null then" \
  "  if false then"

# EL RASTRO ES LO ÚNICO QUE QUEDA. Estas tres son las que separan
# «borrar» de «una cifra desapareció y nadie sabe qué decía».
mutacion "5 · el rastro no guarda las tolvas" \
  "4b(el rastro de s2 guardó 0 tolvas" \
  "         coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
                     from public.roturas_salida_tolvas t
                    where t.salida_id = s.id), '[]'::jsonb)," \
  "         '[]'::jsonb,"

# EL RASTRO SE ESCRIBE ANTES DEL DELETE. Al revés, la cascada ya se
# llevó las tolvas y el registro guarda una lista vacía: diría que la
# salida existió y no qué tenía dentro, que es lo que se le va a
# preguntar. Se simula borrando las tolvas justo antes de escribirlo.
mutacion "6 · el rastro se escribe cuando las tolvas ya se fueron" \
  "4b(el rastro de s2 guardó 0 tolvas" \
  "  insert into public.roturas_salidas_borradas
         (id, codigo, placa, fila, tolvas, motivo, borrada_por)" \
  "  delete from public.roturas_salida_tolvas where salida_id = any(p_ids);
  insert into public.roturas_salidas_borradas
         (id, codigo, placa, fila, tolvas, motivo, borrada_por)"

mutacion "7 · el rastro no guarda quién borró" \
  "4d(el rastro no guardó el motivo y quién)" \
  "         v_motivo, auth.uid()" \
  "         v_motivo, null::uuid"

mutacion "8 · cualquiera puede leer lo borrado" \
  "5a(el operador logístico ve 2 filas de lo borrado)" \
  "  for select to authenticated using (public.manda());" \
  "  for select to authenticated using (true);"

# BORRA SOLO LAS ESCOGIDAS. Es el error que se lleva por delante un mes
# entero sin que nadie lo pida.
mutacion "9 · borra más de las escogidas" \
  "3d(se llevó por delante una que no se escogió)" \
  "  delete from public.roturas_salidas where id = any(p_ids);" \
  "  delete from public.roturas_salidas;"

mutacion "10 · una que ya no existe pasa por buena" \
  "6a(borrar algo que ya no existe contestó bien)" \
  "  if v_n = 0 then
    raise exception 'Ninguna de esas salidas existe ya';
  end if;" \
  "  if false then
    raise exception 'Ninguna de esas salidas existe ya';
  end if;"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 10 mutaciones se cazaron, cada una por su propia prueba."
