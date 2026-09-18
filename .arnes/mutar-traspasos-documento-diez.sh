#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO?
#
# Se rompe la migración a propósito, una cosa a la vez, y se exige un
# mensaje CONCRETO. Una mutación que se pone roja por otro motivo no
# prueba nada de la aserción que dice probar.
#
#   bash .arnes/mutar-traspasos-documento-diez.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-documento-diez.sql
FALLOS=0

probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/diez-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-traspasos-documento-diez.sh tp_diez_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    echo "           esperaba: «$espera»"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/diez-buena.sql
trap 'cp /tmp/diez-buena.sql "$ORIG"' EXIT
echo "Rompiendo la migración a propósito, una cosa a la vez:"
echo

# 1. SIN TOPE DE LARGO. Es el pegado doble: dos documentos seguidos dan
#    un número que NO choca con el índice único, se registra pareciendo
#    bueno, y después no se encuentra por ninguno de los dos.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento_clave is null or documento_clave ~ '^[0-9]+$');")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza la regla sin el diez" "La regla no dice diez"

# 1b. LO MISMO CON LA GUARDIA TAMBIÉN QUITADA: ahí es donde la prueba 2
#     tiene que hablar.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento_clave is null or documento_clave ~ '^[0-9]+$');")
s=s.replace("""  if v_cond not like '%10%' then
    raise exception 'La regla no dice diez: %', v_cond;
  end if;""", "")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "once cifras no entran" "2(dejo entrar once cifras)"

# 2. SIN EXIGIR QUE SEAN NÚMEROS.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento_clave is null or length(documento_clave) <= 10);")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "las letras no entran" "3(dejo entrar un documento con letras)"

# 3. LA REGLA SOBRE `documento` Y NO SOBRE `documento_clave`. Es el error
#    silencioso al revés: rechazaría «12-345 678-90», que son diez cifras
#    y un documento perfectamente bueno.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento is null or documento ~ '^[0-9]{1,10}$');")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza la regla sobre la columna equivocada" "La regla no habla de documento_clave"

# 3b. CON LA GUARDIA QUITADA, que hable la prueba 4.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento is null or documento ~ '^[0-9]{1,10}$');")
s=s.replace("""  if v_cond not like '%documento_clave%' then
    raise exception 'La regla no habla de documento_clave: %', v_cond;
  end if;""", "")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "los guiones y espacios no cuentan como cifra" "4b(rechazo «98-765 432-10»"

# 4. EXIGIR DIEZ EXACTAS en vez de hasta diez. El tope es máximo, no
#    obligatorio: nadie dijo que un documento tenga que llevar diez.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (documento_clave is null or documento_clave ~ '^[0-9]{10}$');")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "una sola cifra también vale" "5(no dejo entrar un documento de una cifra"

# 5. OBLIGAR AL VIAJE VACÍO A TENER DOCUMENTO. No lleva papel: pedírselo
#    es pedirle que se lo invente.
#
#    OJO CON CÓMO SE ROMPE ESTO. La primera versión de esta mutación
#    quitaba el `documento_clave is null or` — y no rompía NADA: en un
#    CHECK, una condición que da NULL se da por buena, así que el viaje
#    vacío seguía entrando igual. La mutación salía verde y yo habría
#    jurado que la aserción no servía, cuando la que no servía era la
#    mutación. Con `coalesce` la condición ya no da NULL sino falso, y
#    ahí sí rechaza.
python3 - <<'PY'
s=open('/tmp/diez-buena.sql',encoding='utf-8').read()
s=s.replace("check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');",
            "check (coalesce(documento_clave, '') ~ '^[0-9]{1,10}$');")
open('/tmp/diez-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el viaje vacío sigue sin documento" "6b(la regla tumbo el viaje vacio"

cp /tmp/diez-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 7 se pusieron rojas. El arnés caza lo que dice cazar."
