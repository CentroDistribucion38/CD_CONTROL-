#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL CRUCE?
#
# Se rompe la migración a propósito, UNA COSA A LA VEZ, y se exige un
# mensaje CONCRETO.
#
# DOS REGLAS QUE ESTE ARCHIVO APRENDIÓ A GOLPES:
#
#  1. CADA MUTACIÓN COMPRUEBA QUE APLICÓ. `str.replace` no avisa cuando
#     no encuentra el texto: la mutación se escribe idéntica al
#     original, el arnés pasa, y sale VERDE como si la aserción no
#     cazara nada.
#
#  2. UNA MUTACIÓN CAZADA POR EL ACUSADO EQUIVOCADO NO PRUEBA NADA.
#     Quitar el `group by` revienta con un error de Postgres antes de
#     llegar a ninguna aserción; filtrar lo anulado en el `insert` se
#     cae con «archivo vacío». En los dos casos el arnés se pone rojo,
#     pero por otra cosa. Se rompe lo que la aserción dice medir, no lo
#     que sea más fácil de romper.
#
#   bash .arnes/mutar-traspasos-cruce.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-cruce-sap.sql
FALLOS=0

probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/cr-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-traspasos-cruce.sh tp_cruce_mut 2>&1)
  if echo "$salida" | grep -qF "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    echo "           esperaba: «$espera»"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/cr-buena.sql
trap 'cp /tmp/cr-buena.sql "$ORIG"' EXIT
echo "Rompiendo el cruce a propósito, una cosa a la vez:"
echo

# 1. EL NETO NO ES LA SUMA DEL GRUPO. Es la regla entera: -36 +36 -28
#    son -28. Con otra cuenta, el documento cambia de cifra y lo
#    anulado deja de anularse.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      sum(cantidad)::integer as neto,', '      max(cantidad)::integer as neto,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el neto es la suma de los movimientos" "1c(el neto de 7687019429 dio"

# 2. CUÁNTOS MOVIMIENTOS TRAÍA. Es lo que deja ver en la pantalla que
#    ese documento se anuló y se rehizo, en vez de un número pelado.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      count(*)::integer as movimientos,', '      1 as movimientos,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "se guarda cuantos movimientos traia" "1e(guardo 1 movimientos para 7687019429"

# 3. LA ANULACIÓN NO ANULA. Con `cuenta` siempre en cierto, un
#    documento que se anuló del todo aparece como que falta y se sale a
#    buscar un viaje que nunca existió.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      sum(cantidad) <> 0 as cuenta,', '      true as cuenta,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "lo anulado del todo no cuenta" "2b(un documento anulado del todo salio contando)"

# 4. Y AL REIMPORTAR TAMPOCO. El corte se sube dos veces —pasa— y si el
#    `on conflict` no arrastra `cuenta`, lo anulado reaparece contando.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      cuenta = excluded.cuenta,', '      cuenta = true,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "al reimportar, lo anulado sigue anulado" "2e(al reimportar, el documento anulado volvio a contar)"

# 5. EL CRUCE SOLO MIRA UN LADO. Sin el lado de «sobra», el dedazo en el
#    número del documento no aparece por ningún sitio.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('full outer join sis on sis.documento_clave = sap.referencia;', 'left join sis on sis.documento_clave = sap.referencia;')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el dedazo aparece como que sobra" "5(el documento tecleado mal salio"

# 6. LA NORMALIZACIÓN DE SAP SE SEPARA DE LA DEL VIAJE. SAP puede
#    escribir «7687-030 759» y el viaje guarda «7687030759»: si las dos
#    reglas no son la misma, el cruce dice que falta un documento que
#    está registrado justo al lado.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace("      nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '') as referencia,", "      nullif(upper(btrim(coalesce(f->>'referencia', ''))), '') as referencia,")
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el guion no rompe el cruce" "6(«7687-030 759» de SAP no cruzo"

# 7. SIN ENCERRAR EN LAS FECHAS DEL EXCEL. Todo viaje de otra semana
#    saldría como «sobra»: cientos de renglones que no son un problema.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('     and v.fecha between r.desde and r.hasta', '     and true')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el cruce no se come media bodega" "7(un viaje de otra semana sale en el cruce)"

# 8. EL ANULADO CUENTA COMO REGISTRADO. Si contara, anular un viaje
#    sería la forma de hacer desaparecer un «falta».
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace("   where v.estado = 'registrado'", '   where true')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "un viaje anulado no tapa un falta" "8(un viaje anulado cuenta como registrado"

# 9. EL MISMO DOCUMENTO EN DOS DÍAS NO SE MARCA. Cuadra, pero descuadra
#    el cumplido de los dos días y ninguna lista lo dice.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('  (sap.fecha is not null and sis.fecha is not null and sap.fecha <> sis.fecha) as dia_distinto', '  false as dia_distinto')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el mismo documento en dos dias se marca" "9(el mismo documento en dos dias distintos no se marca)"

# 10. IMPORTAR DOS VECES SUMA ENCIMA.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      neto = excluded.neto, movimientos = excluded.movimientos,', '      neto = public.traspasos_sap.neto + excluded.neto, movimientos = excluded.movimientos,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "importar dos veces no suma encima" "10b(volver a importar dejo el neto en"

# 11. CUALQUIERA IMPORTA.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace("  if not public.es_editor() then\n    raise exception 'Importar el corte de SAP requiere rol de supervisor o administrador';\n  end if;", '')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "un operador no importa" "11(un operador pudo importar"

# 12. LA HORA DEL ÚLTIMO MOVIMIENTO. Un documento anulado y rehecho se
#     movería de hora y podría cambiar de turno — y ahí deja de cuadrar
#     con el turno en que de verdad salió.
python3 - <<'PY'
s=open('/tmp/cr-buena.sql',encoding='utf-8').read()
s=s.replace('      (array_agg(hora order by fecha, hora nulls last))[1] as hora,', '      max(hora) as hora,')
assert s != open('/tmp/cr-buena.sql',encoding='utf-8').read(), 'la mutacion no aplico'
open('/tmp/cr-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la hora es la del primer movimiento" "1f(la hora no es la del primer movimiento)"

cp /tmp/cr-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 12 se pusieron rojas. El arnés caza lo que dice cazar."
