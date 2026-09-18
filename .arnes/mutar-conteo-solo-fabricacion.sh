#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL ARNÉS?
#
# Se ROMPE la migración a propósito, una cosa a la vez, y se exige que la
# prueba correspondiente se ponga en ROJO. Si al romper algo la prueba
# sigue en verde, la que está mala es la prueba.
#
# Y OJO CON EQUIVOCARSE DE ACUSADO: una mutación que se pone roja por
# otro motivo —porque la cazó la guardia de la propia migración, por
# ejemplo— no prueba nada de la aserción que dice probar. Por eso cada
# una espera un mensaje CONCRETO y no «algo falló».
#
#   bash .arnes/mutar-conteo-solo-fabricacion.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-conteo-solo-fabricacion.sql
FALLOS=0

probar () {          # $1 = nombre  $2 = qué mensaje tiene que salir
  local nombre="$1" espera="$2" salida
  cp /tmp/fab-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-conteo-solo-fabricacion.sh fefo_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/fab-buena.sql
trap 'cp /tmp/fab-buena.sql "$ORIG"' EXIT

echo "Rompiendo la migración a propósito, una cosa a la vez:"

# 1. SUMAR EN VEZ DE RESTAR. Es el error de signo, el más fácil de
#    cometer y el que ningún ojo ve leyendo tres líneas de extract().
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("l.venc_dia) - p.vida_util", "l.venc_dia) + p.vida_util")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "restar, no sumar" "La cuenta no cuadra"

# 2. EL AÑO A MANO. Copiar el año del vencimiento en vez de sacarlo de la
#    fecha ya restada: acierta cuando la resta no cruza el año y falla
#    cuando sí. Solo se ve con un caso que cruce diciembre, y por eso la
#    siembra trae uno.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("""           fab_anio = (extract(year from (
             make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util))::integer - 2000)::smallint""",
            """           fab_anio = l.venc_anio""")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el año sale de la fecha, no se copia" "La cuenta no cuadra"

# 3. SIN VIDA ÚTIL, RESTAR CERO. Le pondría al renglón una fabricación
#    igual a su vencimiento: un dato inventado que además parece bueno.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("       and coalesce(p.vida_util, 0) > 0\n    returning",
            "       and coalesce(p.vida_util, 0) >= 0\n    returning")
s=s.replace("make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util",
            "make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - coalesce(p.vida_util, 0)")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "sin vida útil no se inventa nada" "3(se invento una fabricacion sin vida util)"

# 4. PISAR LO QUE YA TENÍA FABRICACIÓN. Reescribiría con la cuenta de hoy
#    un renglón que se tecleó frente a la estiba.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("       and l.fab_anio is null\n       and l.venc_anio is not null",
            "       and l.venc_anio is not null")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "no se pisa lo que ya tenía fabricación" "5(le cambio la fabricacion a uno que ya la tenia"

# 5. NO CONVERTIR NADA. Una migración que corre y no hace nada pasa en
#    verde si lo único que se comprueba es que no reventó. La caza la
#    GUARDIA de la propia migración, así que es su mensaje el que tiene
#    que salir — no el de la prueba.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("       and coalesce(p.vida_util, 0) > 0\n    returning",
            "       and false\n    returning")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la migración exige haber convertido" "convertibles sin convertir"

# 5b. LO MISMO, PERO CON LA GUARDIA TAMBIÉN ROTA. Es el escenario que de
#     verdad pone a prueba la aserción 6 de la prueba: no se convirtió
#     nada y nadie lo impidió.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("       and coalesce(p.vida_util, 0) > 0\n    returning",
            "       and false\n    returning")
s=s.replace("""  if v_quedan > 0 then
    raise exception 'Quedaron % renglones convertibles sin convertir', v_quedan;
  end if;""", "")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "de verdad convierte" "6(quedaron"

# 6. MOVERLE EL VENCIMIENTO. Es lo que manda —de él salen «días para
#    vencer» y «días para salir»— y esta migración no tiene por qué
#    tocarlo.
#
#    SE MUEVE DE FORMA COHERENTE —un año más en el vencimiento Y en la
#    fabricación despejada— a propósito. Moverlo a secas lo cazaría la
#    guardia de la migración («la cuenta no cuadra») y no la aserción que
#    dice probarse. Así queda todo cuadrado por dentro y el único que
#    puede notarlo es quien compare contra el dato de antes, que es
#    exactamente lo que hace la prueba 1b.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util",
            "make_date(2000 + l.venc_anio + 1, l.venc_mes, l.venc_dia) - p.vida_util")
s=s.replace("""))::integer - 2000)::smallint
      from public.productos p""",
            """))::integer - 2000)::smallint,
           venc_anio = (l.venc_anio + 1)::smallint
      from public.productos p""")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el vencimiento no se toca" "1b(le movio el vencimiento"

# 7. COMPROBAR SOBRE TODA LA TABLA, no solo sobre lo convertido. Es el
#    error que YO tenía: la migración se habría negado a correr por un
#    renglón viejo que ella no toca, solo porque a su material le
#    cambiaron la vida útil después de contarse. La siembra trae uno así
#    justamente para que esto se note.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("""  if v_quedan > v_descuadrados_antes then
    raise exception 'La conversión descuadró % renglón(es) que antes cuadraban',
      v_quedan - v_descuadrados_antes;
  end if;""",
"""  if v_quedan > 0 then
    raise exception 'La cuenta no cuadra en % renglon(es) de toda la tabla', v_quedan;
  end if;""")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "no revienta por un renglón que no tocó" "de toda la tabla"

# 8. DEPENDER DE UNA TABLA TEMPORAL ENTRE SENTENCIAS.
#
#    ES EL ERROR QUE DE VERDAD PASÓ, y el más caro de los ocho: la
#    primera versión guardaba los renglones convertidos en una tabla
#    temporal `on commit drop` y los comprobaba en la sentencia
#    siguiente. Con `psql -f` y un `begin;` arriba funcionaba; en el
#    editor de Supabase reventó con «relation "_convertidas" does not
#    exist», porque ahí el archivo no corre como una sola transacción.
#
#    El arnés tiene que cazarlo SIN Supabase delante, y por eso corre la
#    migración sin agrupar nada. Esta mutación comprueba que ese arnés
#    de verdad lo caza.
python3 - <<'PY'
s=open('/tmp/fab-buena.sql',encoding='utf-8').read()
s=s.replace("do $$\ndeclare\n  v_ya int;",
            "create temp table _convertidas on commit drop as select 1 as id;\n\ndo $$\ndeclare\n  v_ya int;")
s=s.replace("  select count(*) into v_ya\n    from public.conteo_lineas where fab_anio is not null;",
            "  select count(*) into v_ya from _convertidas;")
open('/tmp/fab-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "nada puede depender de una tabla temporal" 'relation "_convertidas" does not exist'

cp /tmp/fab-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 9 se pusieron rojas. El arnés caza lo que dice cazar."
