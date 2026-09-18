#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL ARNÉS?
#
# Se rompe la migración a propósito, una cosa a la vez, y se exige un
# mensaje CONCRETO. Una mutación que se pone roja por otro motivo no
# prueba nada de la aserción que dice probar.
#
#   bash .arnes/mutar-conteo-estibas-y-saldo.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-conteo-estibas-y-saldo.sql
FALLOS=0

probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/es-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-conteo-estibas-y-saldo.sh fefo_es_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/es-buena.sql
trap 'cp /tmp/es-buena.sql "$ORIG"' EXIT
echo "Rompiendo la migración a propósito, una cosa a la vez:"

# 1. LA REGLA DE LA TABLA SIN SOLTAR. Es lo que impedía el renglón de
#    doce estibas y ocho cajas sueltas.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("  check (cajas is null or (estibas is null and saldo is null));",
            "  check (num_nonnulls(estibas, cajas, saldo) <= 1);")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza la regla vieja en la tabla" "Quedó la regla vieja"

# 1b. LO MISMO CON LA GUARDIA TAMBIÉN ROTA: ahí es donde la prueba 1
#     tiene que hablar.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("  check (cajas is null or (estibas is null and saldo is null));",
            "  check (num_nonnulls(estibas, cajas, saldo) <= 1);")
s=s.replace("""  if v_cond like '%num_nonnulls%' then
    raise exception 'Quedó la regla vieja: estibas y saldo seguirían sin poder ir juntos';
  end if;""", "")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "estibas y saldo caben en un renglón" "check_violation\|violates check constraint\|CANTIDAD:"

# 2. LA FUNCIÓN SIN LA REGLA NUEVA: dejaría mezclar las dos formas de
#    contar, y el renglón ya no diría cómo se contó.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("""  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'O se cuenta por estibas —completas más el saldo suelto— o se cuenta por cajas. Las dos formas en un renglón dejan sin decir cómo se contó.';
  end if;""", "")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el mensaje amable sale de la función" "4b(lo rechazo, pero no con el mensaje de la funcion"

# 3. SIN EXIGIR NINGUNA CANTIDAD. Soltar una regla no puede soltar la de
#    al lado: un renglón sin cifra no es un renglón.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("""  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) + coalesce(p_saldo, 0) <= 0 then
    raise exception 'Hay que anotar cuántas estibas o cuántas cajas.';
  end if;""", "", 1)
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "sigue haciendo falta una cantidad" "5(entro un renglon sin ninguna cantidad)"

# 4. CORREGIR DEJANDO LA CIFRA VIEJA COLGANDO. Pasar un renglón de
#    cajas a estibas tiene que BORRAR las cajas; si se conservan, el
#    total suma las dos formas y nadie lo nota — el número simplemente
#    sale más grande.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("    estibas = p_estibas, cajas = p_cajas, saldo = p_saldo,",
            "    estibas = p_estibas, cajas = coalesce(p_cajas, cajas), saldo = p_saldo,")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la tabla caza la cifra colgando" "conteo_lineas_una_forma_de_contar"

# 4b. LO MISMO CON LA REGLA DE LA TABLA TAMBIÉN SOLTADA. Es donde la
#     prueba 6 tiene que hablar: si nadie lo impide, el renglón acaba
#     con las dos formas puestas y el total suma las dos.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("    estibas = p_estibas, cajas = p_cajas, saldo = p_saldo,",
            "    estibas = p_estibas, cajas = coalesce(p_cajas, cajas), saldo = p_saldo,")
s=s.replace("  check (cajas is null or (estibas is null and saldo is null));",
            "  check (true);")
s=s.replace("""  if v_cond not like '%cajas%' or v_cond not like '%estibas%' or v_cond not like '%saldo%' then
    raise exception 'La regla no habla de las tres columnas: %', v_cond;
  end if;""", "")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "corregir no deja la cifra vieja colgando" "6(quedaron las cajas viejas colgando"

# 5. EL TOTAL SIN EL SALDO. Es el error silencioso: el renglón se ve
#    bien, la cifra de cajas sale corta, y el mes cuadra de menos.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
s=s.replace("""     coalesce(v_factor, 0) * coalesce(p_estibas, 0)
       + coalesce(p_cajas, 0) + coalesce(p_saldo, 0),""",
            """     coalesce(v_factor, 0) * coalesce(p_estibas, 0)
       + coalesce(p_cajas, 0),""")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la cifra guardada es la calculada" "8(en 1 renglones la cifra guardada no es la calculada)"

# 6. EL 31 DE FEBRERO. Dos números en rango que juntos no son un día: la
#    regla de la tabla lo deja pasar y quien revienta es la VISTA al
#    leerlo, así que el borrador entero deja de cargar por un renglón.
python3 - <<'PY'
s=open('/tmp/es-buena.sql',encoding='utf-8').read()
viejo = """    begin
      perform make_date(2000 + v_va, v_vm::integer, v_vd::integer);
    exception when others then
      raise exception 'El %/%/% no existe. Revisa el día.', v_vd, v_vm, v_va;
    end;"""
assert s.count(viejo) == 2, s.count(viejo)
s = s.replace(viejo, "    null;")
open('/tmp/es-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el 31/02 no entra" "9(dejo guardar el 31/02"

cp /tmp/es-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 8 se pusieron rojas. El arnés caza lo que dice cazar."
