#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO LA LLAVE DEL CRUCE?
# Cada mutación comprueba que APLICÓ: `str.replace` no avisa, y una que
# no cambia nada sale VERDE como si la aserción no cazara nada.
#   bash .arnes/mutar-traspasos-cruce-permiso.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-traspasos-cruce-permiso.sql
FALLOS=0
probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/cp-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-traspasos-cruce-permiso.sh tp_crp_mut 2>&1)
  if echo "$salida" | grep -qF "$espera"; then echo "  ROJA  ✔  $nombre"
  else echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"; echo "           esperaba: «$espera»"; FALLOS=$((FALLOS+1)); fi
}
cp "$ORIG" /tmp/cp-buena.sql
trap 'cp /tmp/cp-buena.sql "$ORIG"' EXIT
echo "Rompiendo la llave a propósito, una cosa a la vez:"; echo

# 1. RECORTAR EL NIVEL A 'ver'. La pantalla quedaría a la vista y sin el
#    botón de subir: peor que no darla.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("  select p.rol, '/traspasos/cruce', p.nivel", "  select p.rol, '/traspasos/cruce', 'ver'")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "la guardia caza el nivel recortado" "les quedó un nivel distinto del que tienen en Traspasos"

# 1b. CON LA GUARDIA QUITADA: ahí tiene que hablar la prueba.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("  select p.rol, '/traspasos/cruce', p.nivel", "  select p.rol, '/traspasos/cruce', 'ver'")
s=s.replace("""    raise exception 'A % rol(es) les quedó un nivel distinto del que tienen en Traspasos.', v_malos;""","null;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "quien edita Traspasos edita el cruce" "1(al que edita Traspasos le quedo"

# 2. NO DARLE EL CRUCE A NADIE.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("""  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/traspasos/cruce', p.nivel
    from public.rol_permisos p
   where p.seccion = '/traspasos'
  on conflict (rol, seccion) do nothing;""","")
s=s.replace("""    raise exception 'A % rol(es) de los que iban a recibir el cruce no les llegó.', v_malos;""","null;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "los roles con Traspasos reciben el cruce" "rol(es) con Traspasos se quedaron sin el cruce"

# 3. ABRIRLE EL CRUCE AL ROL CON TRASPASOS CERRADO.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("  select p.rol, '/traspasos/cruce', p.nivel\n    from public.rol_permisos p\n   where p.seccion = '/traspasos'",
            "  select p.rol, '/traspasos/cruce', 'editar'\n    from public.rol_permisos p\n   where p.seccion = '/traspasos'")
s=s.replace("""    raise exception 'A % rol(es) les quedó un nivel distinto del que tienen en Traspasos.', v_malos;""","null;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "al rol con Traspasos cerrado no se le abre" "3(al rol con Traspasos cerrado le quedo"

# 4. EL CASO CARO: colarle el cruce a quien le CERRARON Traspasos a mano.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("""         || jsonb_build_object('/traspasos/cruce', permisos_extra -> '/traspasos')""",
            """         || jsonb_build_object('/traspasos/cruce', 'editar')""")
s=s.replace("""    raise exception 'A % persona(s) con permiso propio no se les copió igual. Si a alguien le cerraron Traspasos a mano, el cruce tiene que quedarle cerrado también.', v_malos;""","null;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "el «ninguno» a mano se respeta" "6(a la persona con Traspasos cerrado a mano le quedo"

# 5. NO COPIAR LOS PERMISOS PROPIOS.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("""  update public.perfiles
     set permisos_extra = permisos_extra
         || jsonb_build_object('/traspasos/cruce', permisos_extra -> '/traspasos')
   where permisos_extra ? '/traspasos'
     and not (permisos_extra ? '/traspasos/cruce');""","")
s=s.replace("""    raise exception 'A % persona(s) con permiso propio no se les copió igual. Si a alguien le cerraron Traspasos a mano, el cruce tiene que quedarle cerrado también.', v_malos;""","null;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "los permisos propios se copian" "7(a la persona con Traspasos en editar le quedo"

# 6. PISAR LO PUESTO A MANO.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("  on conflict (rol, seccion) do nothing;",
            "  on conflict (rol, seccion) do update set nivel = excluded.nivel;")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "lo puesto a mano no se pisa" "5(se piso el nivel puesto a mano"

# 7. INVENTARLE UN PERMISO PROPIO A QUIEN NO LO TENÍA.
python3 - <<'PYX'
s=open('/tmp/cp-buena.sql',encoding='utf-8').read()
s=s.replace("""   where permisos_extra ? '/traspasos'
     and not (permisos_extra ? '/traspasos/cruce');""",
            """   where not (permisos_extra ? '/traspasos/cruce');""")
assert s != open('/tmp/cp-buena.sql',encoding='utf-8').read(), 'no aplico'
open('/tmp/cp-mutada.sql','w',encoding='utf-8').write(s)
PYX
probar "no se le inventa un permiso propio a quien no lo tenia" "8(a quien no tenia permisos propios se le invento uno"

cp /tmp/cp-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then echo "$FALLOS aserción(es) no cazan lo que dicen cazar."; exit 1; fi
echo "Las 8 se pusieron rojas. El arnés caza lo que dice cazar."
