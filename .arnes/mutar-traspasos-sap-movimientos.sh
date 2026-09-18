#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DEL CORTE POR MOVIMIENTOS CAZA LO QUE DICE CAZAR?
#
# Un arnés en verde no prueba nada por sí solo: prueba que no encontró
# lo que buscó, y buscar mal también sale verde. Aquí se le vuelve a
# meter CADA error que la prueba afirma cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN — no por otra cosa, no por el
# compilador, no por un choque de Postgres que habría saltado igual.
#
#   bash .arnes/mutar-traspasos-sap-movimientos.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-traspasos-sap-movimientos.sql
COPIA=/tmp/mov-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT

# `sed`/`python` NO AVISAN cuando no encuentran nada: reescriben el
# archivo idéntico y el arnés aprueba lo mismo de siempre. Por eso cada
# mutación comprueba que DE VERDAD cambió el archivo.
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

corre() { bash .arnes/correr-traspasos-sap-movimientos.sh mut_mov 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
SAL=$(corre)
if ! echo "$SAL" | grep -q "todo en orden"; then
  echo "El arnés ya estaba en rojo ANTES de mutar nada:"; echo "$SAL" | grep -E "ERROR" | head -5
  exit 1
fi
echo "    ok"

SORDAS=()
mutacion() {  # $1 = nombre  $2 = texto que debe salir  $3.. = pares de cambia
  local nombre="$1" espera="$2"; shift 2
  restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  # ROJO ES CUALQUIER «ERROR», no solo que falte el «todo en orden» del
  # final. La prueba del SQL es lo último que corre, así que mirar solo
  # esa línea dejaba pasar una mutación que reventaba ANTES —en el
  # traspaso de lo viejo, por ejemplo— y seguía llegando al final.
  if ! echo "$s" | grep -qE "ERROR" && echo "$s" | grep -q "todo en orden"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

mutacion "1 · no se borra el día antes de meterlo (vuelven los duplicados)" \
  "se duplicó al reimportar" \
  "     where m.fecha = d.fecha" "     where false and m.fecha = d.fecha"

mutacion "2 · se borra TODO en cada importación, no solo los días del archivo" \
  "se llevó por delante" \
  "     where m.fecha = d.fecha" "     where true or m.fecha = d.fecha"

# EL AGRUPADO ES POR DOCUMENTO, NO POR DOCUMENTO Y DÍA. Agrupando
# también por fecha, el documento partido entre el 17 y el 18 vuelve a
# ser dos cosas distintas y el -36 sigue contando: exactamente el error
# que esta migración viene a quitar, escrito de otra manera.
mutacion "3 · el agrupado vuelve a partirse por día" \
  "el agrupado se partió por día" \
  "group by m.referencia;" "group by m.referencia, m.fecha;"

mutacion "4 · dos movimientos idénticos se colapsan en uno" \
  "dos movimientos idénticos quedaron en" \
  "    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           cantidad, centro, almacen, auth.uid(), now()
      from buenas" \
  "    select distinct referencia, referencia_cruda, fecha, hora, material, descripcion,
           cantidad, centro, almacen, auth.uid(), now()
      from buenas"

mutacion "5 · el archivo equivocado ya no se rechaza antes de borrar" \
  "tragó un archivo que no es el corte" \
  "  if v_leidas = 0 then" "  if false and v_leidas = 0 then"

mutacion "6 · el documento se fecha con su ÚLTIMO movimiento" \
  "se movió al día en que lo arreglaron" \
  "  min(m.fecha)                                                as fecha," \
  "  max(m.fecha)                                                as fecha,"

mutacion "7 · el cruce se queda leyendo de la tabla jubilada" \
  "SIGUE LEYENDO DE LA TABLA JUBILADA" \
  "  select * from public.v_traspasos_sap where cuenta" \
  "  select * from public.traspasos_sap where cuenta"

mutacion "8 · la tabla vieja se borra en vez de jubilarse" \
  "la tabla vieja se borró" \
  "    alter table public.traspasos_sap rename to traspasos_sap_viejo;" \
  "    drop table public.traspasos_sap cascade;"

# LA MIGRACIÓN SE DEFIENDE SOLA de este: si lo viejo no se trajo, se
# niega a jubilar la tabla en vez de dejar el corte a medias. Es mejor
# guardia que la prueba, así que lo que se exige es ESE mensaje.
mutacion "9 · lo ya importado no se trae (se pierde el corte de producción)" \
  "no se jubila nada hasta que eso se aclare" \
  "    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           neto, centro, almacen, importado_por, importado_en
      from public.traspasos_sap;" \
  "    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           neto, centro, almacen, importado_por, importado_en
      from public.traspasos_sap where false;"

mutacion "10 · cualquiera puede importar el corte" \
  "un operador pudo importar" \
  "  if not public.es_editor() then" "  if false then"

mutacion "11 · la referencia deja de normalizarse igual que el documento del viaje" \
  "se separaron las dos normalizaciones" \
  "      nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '') as referencia," \
  "      nullif(upper(btrim(coalesce(f->>'referencia', ''))), '') as referencia,"

mutacion "12 · se pierde el número de movimientos reemplazados (un corte filtrado pasa sin verse)" \
  "dijo que reemplazó" \
  "  return query select v_doc, v_leidas, v_met, v_bor, v_dias, v_anu, v_desde, v_hasta;" \
  "  return query select v_doc, v_leidas, v_met, v_met, v_dias, v_anu, v_desde, v_hasta;"

restaurar
echo
if [ ${#SORDAS[@]} -gt 0 ]; then
  echo "AFIRMACIONES QUE NO SE SOSTIENEN:"
  for s in "${SORDAS[@]}"; do echo "  · $s"; done
  exit 1
fi
echo "Las 12 mutaciones se cazaron, cada una por su propia prueba."
