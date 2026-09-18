#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL CANDADO?
#
# Se rompe la migración a propósito, una cosa a la vez, y se exige un
# mensaje CONCRETO.
#
# CADA MUTACIÓN COMPRUEBA QUE DE VERDAD APLICÓ. `str.replace` no avisa
# cuando no encuentra el texto: si la migración cambia y la mutación se
# queda con la redacción vieja, escribe un archivo IDÉNTICO al original,
# el arnés pasa, y sale VERDE — que se lee como «la aserción no caza
# nada» cuando lo que no cazaba nada era la mutación. Pasó con dos de
# estas ocho al cambiarle la firma a traspaso_dia_abierto.
#
#   bash .arnes/mutar-traspasos-dia-cerrado.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-dia-cerrado.sql
FALLOS=0

probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/dia-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-traspasos-dia-cerrado.sh tp_dia_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    echo "           esperaba: «$espera»"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/dia-buena.sql
trap 'cp /tmp/dia-buena.sql "$ORIG"' EXIT
echo "Rompiendo el candado a propósito, una cosa a la vez:"
echo

# 1. EL CORTE EN LA MEDIANOCHE. Es el error que parte el turno C en dos
#    todas las noches: a las 00:01 pierde de golpe lo que lleva digitado.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("""  select p_fecha is not null
     and p_ahora < public.traspaso_arranque_turno(p_fecha, 'C') + interval '8 hours'""",
            """  select p_fecha = public.traspaso_hoy()""")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el dia no se corta en la medianoche" "13(la medianoche cierra el dia"

# 2. SIN CANDADO. El disparador no se crea: todo sigue como antes.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("""  create trigger traspasos_viajes_candado_dia
    before insert or update on public.traspasos_viajes
    for each row execute function public.traspaso_candado_dia();""", "")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza que el candado no quedo puesto" "El candado no quedó puesto"

# 2b. CON LA GUARDIA TAMBIÉN QUITADA: ahí tiene que hablar la prueba.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("""  create trigger traspasos_viajes_candado_dia
    before insert or update on public.traspasos_viajes
    for each row execute function public.traspaso_candado_dia();""", "")
s=s.replace("""    raise exception 'El candado no quedó puesto.';""", "null;")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "un dia viejo no se registra" "5(dejo registrar un viaje de hace nueve dias)"

# 3. SOLO EN INSERT. Registrar viejo quedaría cerrado, pero ANULAR lo
#    viejo seguiría abierto — que es justo la mitad con la que se
#    manipula: se anula lo de la semana pasada y desaparece del cumplido.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("    before insert or update on public.traspasos_viajes",
            "    before insert on public.traspasos_viajes")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "un viaje viejo no se anula" "6(dejo anular un viaje de hace nueve dias)"

# 4. MIRANDO SOLO LA FECHA NUEVA. Arrastrar un viaje de hace nueve días
#    a la fecha de hoy lo dejaría abierto, con los datos ya cambiados.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("  v_fecha := least(coalesce(new.fecha, old.fecha), coalesce(old.fecha, new.fecha));",
            "  v_fecha := coalesce(new.fecha, old.fecha);")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "no se arrastra un viaje viejo a hoy" "9(se pudo arrastrar un viaje viejo a la fecha de hoy)"

# 5. EL CANDADO TAMBIÉN PARA QUIEN ADMINISTRA. Sin la salida de arriba,
#    un error de la semana pasada quedaría mal para siempre y la única
#    forma de arreglarlo sería tocar la tabla a mano.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("  if public.manda() then return coalesce(new, old); end if;", "")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "quien administra no tiene tope" "10(el administrador no pudo registrar hacia atras"

# 6. EL CANDADO SE COME EL DÍA DE HOY. Si estorba el trabajo de cada
#    día, lo primero que pasa es que alguien pide quitarlo entero.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("""  if public.traspaso_dia_abierto(v_fecha) then
    return new;
  end if;""", "")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "dentro del dia se sigue registrando" "1(no deja registrar un viaje de hoy"

# 7. CERRADO TAMBIÉN POR TURNO. Es la opción que se descartó: el turno B
#    no podría arreglar el error del turno A sin llamar al administrador.
python3 - <<'PY'
s=open('/tmp/dia-buena.sql',encoding='utf-8').read()
s=s.replace("""  select p_fecha is not null
     and p_ahora < public.traspaso_arranque_turno(p_fecha, 'C') + interval '8 hours'""",
            """  select false""")
assert s != open('/tmp/dia-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico: el texto cambio'
open('/tmp/dia-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza que hoy salga cerrado" "El día de hoy sale cerrado"

cp /tmp/dia-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 8 se pusieron rojas. El arnés caza lo que dice cazar."
