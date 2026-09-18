#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL ARNÉS?
#
# Una aserción que no puede fallar es peor que no tener aserción: da
# permiso para no mirar. En este proyecto ya pasaron dos —una miraba
# `Number.isFinite` de algo que siempre era finito, otra comprobaba
# `[hidden]` en secciones que ninguna ponía `display`—, y las dos
# estuvieron en verde encima de un error de verdad.
#
# Así que aquí se ROMPE la migración a propósito, una cosa a la vez, y
# se exige que la prueba correspondiente se ponga en rojo. Si al romper
# algo la prueba sigue en verde, la que está mala es la prueba.
#
#   bash .arnes/mutar-traspasos-documento.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-documento.sql
COPIA=/tmp/doc-mutada.sql
FALLOS=0

probar () {          # $1 = nombre  $2 = qué prueba tiene que ponerse roja
  local nombre="$1" espera="$2"
  cp "$COPIA" "$ORIG"
  local salida
  salida=$(bash .arnes/correr-traspasos-documento.sh tp_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/doc-buena.sql
trap 'cp /tmp/doc-buena.sql "$ORIG"' EXIT

echo "Rompiendo la migración a propósito, una cosa a la vez:"

# 1. SIN NORMALIZAR: la clave se queda con el texto tal cual, así que
#    «t 12 345» deja de ser el mismo papel que «T-12345».
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("nullif(upper(regexp_replace(coalesce(documento, ''), '[^A-Za-z0-9]', '', 'g')), '')",
            "nullif(documento, '')")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la clave normalizada" "5(entro el mismo documento escrito distinto)"

# 2. LA CLAVE VACÍA COMO '' Y NO NULL: dos viajes vacíos chocarían.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("nullif(upper(regexp_replace(coalesce(documento, ''), '[^A-Za-z0-9]', '', 'g')), '')",
            "upper(regexp_replace(coalesce(documento, ''), '[^A-Za-z0-9]', '', 'g'))")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "'' no puede pasar por NULL" "1(un vacio no pudo entrar"

# 3. EL ÍNDICE SIN SER PARCIAL. La propia migración lo rechaza antes de
#    dejarlo puesto: por eso lo que tiene que ponerse rojo es SU GUARDIA,
#    no la prueba 7 de abajo. La primera versión de este archivo esperaba
#    aquí el mensaje de la prueba 7 y salió VERDE — no porque nada cazara
#    el error, sino porque lo cazó OTRA cosa. Una mutación que se equivoca
#    de acusado es tan inútil como una aserción que no puede fallar.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("""  on public.traspasos_viajes (documento_clave)
  where estado = 'registrado' and documento_clave is not null;""",
            """  on public.traspasos_viajes (documento_clave)
  where documento_clave is not null;""",1)
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la migración rechaza un índice no parcial" "el_indice_no_es_parcial_por_estado"

# 3b. EL MISMO ERROR, PERO CON LA GUARDIA TAMBIÉN ROTA. Este es el
#     escenario que de verdad pone a prueba la aserción 7: el índice
#     cubre también lo anulado y nadie lo impidió, así que anular deja
#     de liberar el documento y no se puede volver a registrar.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("""  on public.traspasos_viajes (documento_clave)
  where estado = 'registrado' and documento_clave is not null;""",
            """  on public.traspasos_viajes (documento_clave)
  where documento_clave is not null;""",1)
s=s.replace("""  elsif v_pred not like '%registrado%' then
    v_falta := v_falta || ' el_indice_no_es_parcial_por_estado';""",
            """  elsif false then
    null;""")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "anular libera el documento" "7(anular no libero el documento"

# 4. SIN ÍNDICE ÚNICO: el `if` de la función deja pasar al segundo que
#    escribe en el mismo microsegundo.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("create unique index if not exists traspasos_viajes_documento_unico",
            "create index if not exists traspasos_viajes_documento_unico")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el candado de verdad es el índice" "indice_unico_parcial\|13(el indice no existe"

# 5. CORREGIR CHOCANDO CONTRA SÍ MISMO: sin `w.id <> p_id`, cambiarle la
#    placa a un viaje sería imposible para siempre.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("where w.estado = 'registrado' and w.id <> p_id",
            "where w.estado = 'registrado'")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "corregir no choca contra sí mismo" "10(el viaje choco contra su propio documento"

# 6. PASAR A VACÍO SIN SOLTAR EL DOCUMENTO: el número queda ocupado por
#    un viaje que no lo lleva.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("tipo = null, placa = null, documento = null,",
            "tipo = null, placa = null,")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el vacío suelta su documento" "12(el vacio se quedo con el documento"

# 7. LA MARCA SOBRE LOS VACÍOS: un vacío no es un viaje al que le falte
#    el documento.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("(not v.vacio and v.estado = 'registrado' and v.documento is null) as sin_documento",
            "(v.documento is null) as sin_documento")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "sin_documento no marca vacíos ni anulados" "8(marco vacios\|8b(marco anulados"

# 8. LA FIRMA VIEJA SOBREVIVIENDO: PostgREST escogería una de las dos y
#    el documento se mandaría a ninguna parte.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("""drop function if exists public.traspaso_registrar(
  date, text, text, text, text, text, integer, boolean, integer, text, text);""","")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la firma vieja tiene que desaparecer" "quedo_la_firma_vieja_de_registrar\|A(quedo la firma vieja"

# 9. SIN EXIGIR EL DOCUMENTO AL REGISTRAR.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("""  if v_doc is null then
    raise exception 'Hay que decir el documento del viaje. Es el número del papel que va con el vehículo';
  end if;""","")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el documento es obligatorio al registrar" "2(entro un viaje con carga sin documento"

# 10. SIN EXIGIRLO AL CORREGIR.
python3 - <<'PY'
s=open('/tmp/doc-buena.sql',encoding='utf-8').read()
s=s.replace("""    if v_doc is null then
      raise exception 'Hay que decir el documento del viaje. Si este viaje es de antes y no lo tiene, este es el momento de ponérselo';
    end if;""","")
open('/tmp/doc-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el documento es obligatorio al corregir" "9(corrigio sin documento"

cp /tmp/doc-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 11 se pusieron rojas. El arnés caza lo que dice cazar."
