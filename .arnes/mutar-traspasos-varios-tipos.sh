#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO LO DE VARIOS TIPOS?
#
# Se rompe la migración a propósito, UNA COSA A LA VEZ, y se exige un
# mensaje CONCRETO. Cada mutación comprueba que APLICÓ: `str.replace` no
# avisa cuando no encuentra el texto, y una mutación que no cambia nada
# sale VERDE como si la aserción no cazara nada.
#
#   bash .arnes/mutar-traspasos-varios-tipos.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-varios-tipos.sql
FALLOS=0
probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/vt-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-traspasos-varios-tipos.sh tp_vt_mut 2>&1)
  if echo "$salida" | grep -qF "$espera"; then echo "  ROJA  ✔  $nombre"
  else echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"; echo "           esperaba: «$espera»"; FALLOS=$((FALLOS+1)); fi
}
cp "$ORIG" /tmp/vt-buena.sql
trap 'cp /tmp/vt-buena.sql "$ORIG"' EXIT
echo "Rompiendo lo de varios tipos a proposito, una cosa a la vez:"; echo

# 1. EL CONTROL NO LEE LOS TIPOS DEL VIAJE. Es el fallo silencioso: la
#    tabla queda creada, los tipos se guardan, y el plan sigue contando
#    exactamente como antes. Nada revienta y nada sirve.
#
#    AQUI HUBO UNA SEGUNDA MUTACION para un guardian de la migracion que
#    comprobaba que el nombre de la tabla apareciera en la vista. Esta
#    misma mutacion lo desnudo: con `on false` el nombre sigue ahi y el
#    guardian pasaba. Se quito el guardian en vez de la mutacion.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace('    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id',
            '    left join public.traspasos_viaje_tipos vt on false')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el plan de cada tipo avanza uno" "2(el plan de casco avanzo 0"
# 2. EL VIAJE VIEJO DEJA DE CONTAR. Con un JOIN en vez de LEFT JOIN,
#    todo lo registrado antes de hoy —que no tiene tipos colgados—
#    desaparece del cumplido de golpe. Es el peor de todos: nadie mira
#    el cumplido de la semana pasada hasta que alguien lo pide.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace('    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id',
            '    join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "los viajes de antes siguen contando" "3(PET cuenta 1 y son 2"

# 3. LA CARGA SE CUENTA DOS VECES. El primer tipo guarda su cantidad
#    tambien en `carga` del viaje, para que lo viejo siga leyendola;
#    sumando las dos, el PET del viaje nuevo cuenta 240 en vez de 120.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace('         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga', '         coalesce(vt.cantidad, 0) + coalesce(v.carga, 0) as carga')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la carga no se cuenta dos veces" "4(la carga de PET dio"

# 4. EL VIAJE CON CARGA NO VA EN 1. Si el contador vuelve, un camion
#    con tres tipos y tres viajes avanzaria nueve en el plan.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace('      p_fecha, p_turno, v_primero, p_placa, p_origen, p_destino,\n      1, false, v_carga, null, p_nota, p_documento) r;', '      p_fecha, p_turno, v_primero, p_placa, p_origen, p_destino,\n      2, false, v_carga, null, p_nota, p_documento) r;')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el viaje con carga va en 1" "1d(el viaje con carga quedo en 2 viajes"

# 5. EL MISMO TIPO DOS VECES. El plan de ese tipo avanzaria dos con un
#    solo camion.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace("  if v_n <> jsonb_array_length(p_tipos) then\n    raise exception 'Hay un tipo repetido o vacío en la lista. Cada tipo va una sola vez.';\n  end if;", '')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el mismo tipo no entra dos veces" "6b(lo rechazo, pero no por repetido"

# 6. SIN NINGUN TIPO.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace("  if p_tipos is null or jsonb_typeof(p_tipos) <> 'array' or jsonb_array_length(p_tipos) = 0 then\n    raise exception 'Hay que escoger al menos un tipo de viaje.';\n  end if;", '')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "sin ningun tipo no se registra" "7b(lo rechazo, pero por otra cosa"

# 7. EN LA COLUMNA DEL VIAJE QUEDA OTRO TIPO, no el primero de la lista.
#    Todo lo que ya lee esa columna —la lista, el cruce, los informes
#    viejos— mostraria un tipo que no es el principal.
#
#    SE MUTA A UN TIPO VALIDO y no a null: con null, `traspaso_registrar`
#    revienta con «ese tipo no existe», el bloque entero se corta y la
#    asercion 1e ni se ejecuta. Roja por el acusado equivocado.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace("  v_primero := btrim(p_tipos->0->>'tipo');", "  v_primero := 'casco';")
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el primer tipo queda en la columna del viaje" "1e(el primer tipo no quedo en la columna del viaje)"

# 8. LOS TIPOS SOBREVIVEN A ANULAR EL VIAJE. Si siguieran contando,
#    anular dejaria de servir para lo que sirve.
python3 - <<'PY'
s=open('/tmp/vt-buena.sql',encoding='utf-8').read()
s=s.replace("   where v.estado = 'registrado' and not v.vacio", '   where not v.vacio')
assert s != open('/tmp/vt-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/vt-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "anular saca el viaje de todos sus planes" "9(anulado y casco sigue contando"

cp /tmp/vt-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then echo "$FALLOS asercion(es) no cazan lo que dicen cazar."; exit 1; fi
echo "Las 8 se pusieron rojas. El arnes caza lo que dice cazar."
