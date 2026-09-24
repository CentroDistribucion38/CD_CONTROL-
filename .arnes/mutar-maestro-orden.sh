#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DEL ORDEN DEL MAESTRO CAZA LO QUE DICE CAZAR?
#   bash .arnes/mutar-maestro-orden.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-roturas-maestro-orden.sql
COPIA=/tmp/maeorden-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT INT TERM HUP

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
corre() { bash .arnes/correr-maestro-orden.sh mut_mo 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN:"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=()
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  if [ -n "${SOLO:-}" ] && [[ "$nombre" != *"$SOLO"* ]]; then return; fi
  restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  if echo "$s" | grep -q "BIEN:"; then SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'FALLA|ERROR' | head -2)")
  else echo "✓ $nombre"; fi
}

mutacion "1 · reordenar deja de pedir permiso" \
  "1a(quien solo VE pudo reordenar el maestro)" \
  "  if public.mi_nivel_pantalla('/roturas/en-sitio/maestro') <> 'editar'
     and not public.manda() then" \
  "  if false then"

# EL ORDEN ES LA POSICIÓN EN LA LISTA. Si saliera de otra cosa —el
# nombre, la clave— dos renglones pueden quedar con el mismo y la lista
# se reordena sola al recargar: parece que no guardó.
# EL ORDEN ES LA POSICIÓN EN LA LISTA. Si saliera de otra cosa, dos
# renglones pueden quedar con el mismo y la lista se reordena sola al
# recargar: parece que no guardó.
mutacion "2 · todos quedan con el mismo orden" \
  "2b(" \
  "  if p_hoja = 'procesos' then
    update public.roturas_procesos t
       set orden = x.pos" \
  "  if p_hoja = 'procesos' then
    update public.roturas_procesos t
       set orden = 7 + 0 * x.pos"

mutacion "3 · una hoja inventada pasa por buena" \
  "3a(aceptó una hoja que no existe)" \
  "    raise exception 'No existe la hoja «%» en el maestro de en sitio', p_hoja;" \
  "    return 0;"

mutacion "4 · dice que guardó sin guardar nada" \
  "4a(dijo que guardó sin guardar nada)" \
  "  if v_n = 0 then
    raise exception 'Ninguna de esas claves existe en %: no se reordenó nada', p_hoja;
  end if;" \
  "  if false then
    raise exception 'Ninguna de esas claves existe en %: no se reordenó nada', p_hoja;
  end if;"

# EL GUARDA DE LA LISTA VACÍA ES POR EL MENSAJE: sin él no se reordena
# nada igual —el guarda de «v_n = 0» lo frena— pero contesta «ninguna de
# esas claves existe», que manda a buscar el problema donde no está.
mutacion "5 · la lista vacía contesta un mensaje que no es" \
  "4b(falló por otra cosa" \
  "  if p_claves is null or array_length(p_claves, 1) is null then" \
  "  if false then"

mutacion "6 · el relleno no toca las causas" \
  "5c(quedaron" \
  "  update public.roturas_causas t set orden = x.pos
    from (select clave, row_number() over (order by nombre) + 100 as pos
            from public.roturas_causas where orden is null) x
   where t.clave = x.clave;
  get diagnostics v_i = row_count; v_n := v_n + v_i;" \
  "  v_i := 1; v_n := v_n + v_i;"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 6 mutaciones se cazaron, cada una por su propia prueba."
