#!/usr/bin/env bash
# ¿La prueba caza el error que se acaba de arreglar?
set -u
SQL=supabase/migraciones/2026-09-roturas-material-del-maestro.sql
COPIA=/tmp/rtmat-original.sql
cp "$SQL" "$COPIA"; restaurar() { cp "$COPIA" "$SQL"; }; trap restaurar EXIT INT TERM HUP
cambia() { python3 - "$SQL" "$1" "$2" <<'PY'
import sys
ruta, de, a = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read(); n = s.replace(de, a)
assert n != s, f"la mutacion no aplico: {de[:70]}"
open(ruta, "w", encoding="utf-8").write(n)
PY
}
corre() { bash .arnes/correr-roturas-material.sh mut_rtm 2>&1; }
echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN: Roturas"; then echo "Ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"
SORDAS=()
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  if [ -n "${SOLO:-}" ] && [[ "$nombre" != *"$SOLO"* ]]; then return; fi
  restaurar
  while [ $# -gt 0 ]; do cambia "$1" "$2" || { echo "✗ $nombre — no aplicó"; exit 1; }; shift 2; done
  local s; s=$(corre)
  if echo "$s" | grep -q "BIEN: Roturas"; then SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → rojo por otra cosa: $(echo "$s" | grep -E 'FALLA|·' | head -2)")
  else echo "✓ $nombre"; fi
}

# VUELVE EL ERROR ORIGINAL: la base mira solo su tabla vieja.
mutacion "1 · vuelve el error original (la base mira solo roturas_materiales)" \
  "SIGUE siendo rechazado" \
  "    v_mat := public.rotura_material_asegurar(v_pedido);" \
  "    v_mat := v_pedido;" \
  "select v.clave, v.nombre, v.tipo::rotura_tipo, v.color::vidrio_color,
       v.botellas_x_empaque, true
  from public.v_roturas_materiales_maestro v
 where not exists (select 1 from public.roturas_materiales r where r.clave = v.clave)" \
  "select v.clave, v.nombre, v.tipo::rotura_tipo, v.color::vidrio_color,
       v.botellas_x_empaque, true
  from public.v_roturas_materiales_maestro v
 where false"

mutacion "2 · el apagado se prende solo" "se PRENDIÓ solo" \
  "  if exists (select 1 from public.roturas_materiales r where r.clave = v_clave) then
    return null;
  end if;" \
  "  if exists (select 1 from public.roturas_materiales r where r.clave = v_clave) then
    update public.roturas_materiales set activo = true where clave = v_clave;
    return v_clave;
  end if;"

mutacion "3 · el error no distingue apagado de ausente" "no dice que el material está apagado" \
  "        raise exception 'El material % está apagado en el maestro de Roturas: préndelo ahí y vuelve a intentar', v_pedido;" \
  "        raise exception 'No se pudo usar ese material';"

# CON `producto_terminado` Y NO `eer`: la tabla tiene una restricción
# —`roturas_mat_color`— que exige color a los EER, y la mutación se caía
# ahí antes de llegar a lo que se quiere probar. Esa restricción es una
# SEGUNDA defensa y está bien que exista; lo que hay que comprobar es
# que la prueba caza el caso cuando esa defensa no aplica.
mutacion "4 · se acepta uno que no está en ningún maestro" "se inventó en el maestro" \
  "  select * into m from public.v_roturas_materiales_maestro v where v.clave = v_clave;
  if not found then return null; end if;" \
  "  select * into m from public.v_roturas_materiales_maestro v where v.clave = v_clave;
  if not found then
    insert into public.roturas_materiales (clave, nombre, tipo, activo)
    values (v_clave, v_clave, 'producto_terminado', true) on conflict (clave) do nothing;
    return v_clave;
  end if;"

# 5 · EL ERROR QUE ÉL SE ENCONTRÓ CORRIENDO EL SQL. Quitar el filtro de
# los envases sin color hace que el archivo entero reviente con
# «violates check constraint roturas_mat_color» — que es exactamente lo
# que le pasó. Si esta mutación vuelve verde, la prueba dejó de cubrir
# el caso y el archivo puede volver a caerse en su base.
mutacion "5 · el archivo revienta con un envase sin color de vidrio" \
  "roturas_mat_color" \
  "   and not (v.tipo = 'eer' and v.color is null)" \
  "   and true"

# 5b · Y QUE NO SE INVENTE UN COLOR PARA HACERLO PASAR.
mutacion "5b · se le inventa un color al envase que no lo tiene" "con el color" \
  "  if m.tipo = 'eer' and m.color is null then
    return null;
  end if;" \
  "  if m.tipo = 'eer' and m.color is null then
    m.color := 'ambar';
  end if;" \
  "   and not (v.tipo = 'eer' and v.color is null)" \
  "   and true" \
  "select v.clave, v.nombre, v.tipo::rotura_tipo, v.color::vidrio_color," \
  "select v.clave, v.nombre, v.tipo::rotura_tipo, coalesce(v.color, 'ambar')::vidrio_color,"

restaurar; echo ""
if [ ${#SORDAS[@]} -gt 0 ]; then printf '✗ %s\n' "${SORDAS[@]}"; echo ""; echo "${#SORDAS[@]} sin cazar."; exit 1; fi
echo "✓ Todas las mutaciones se cazaron."
