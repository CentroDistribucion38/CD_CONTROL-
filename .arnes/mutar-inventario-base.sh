#!/usr/bin/env bash
# =====================================================================
# ¿DE VERDAD CAZA ALGO EL ARNÉS DE LA LLAVE?
#
# Se rompe la migración a propósito, una cosa a la vez, y se exige un
# mensaje CONCRETO. Una mutación que se pone roja por otro motivo no
# prueba nada de la aserción que dice probar.
#
# Y LAS QUE TIENEN DOS REDES SE PRUEBAN DOS VECES: con la guardia de la
# migración puesta —ahí tiene que hablar la guardia— y con la guardia
# quitada —ahí tiene que hablar la prueba—. Sin ese par, una aserción
# puede llevar meses sin comprobar nada porque la guardia de al lado
# salta primero. Ya pasó cuatro veces en este proyecto.
#
#   bash .arnes/mutar-inventario-base.sh
# =====================================================================
set -u
ORIG=supabase/migraciones/2026-09-inventario-base.sql
FALLOS=0

probar () {
  local nombre="$1" espera="$2" salida
  cp /tmp/base-mutada.sql "$ORIG"
  salida=$(bash .arnes/correr-inventario-base.sh inv_base_mut 2>&1)
  if echo "$salida" | grep -q "$espera"; then
    echo "  ROJA  ✔  $nombre"
  else
    echo "  VERDE ✘  $nombre  ← LA PRUEBA NO CAZA ESTO"
    echo "           esperaba: «$espera»"
    FALLOS=$((FALLOS+1))
  fi
}

cp "$ORIG" /tmp/base-buena.sql
trap 'cp /tmp/base-buena.sql "$ORIG"' EXIT
echo "Rompiendo la migración a propósito, una cosa a la vez:"
echo

# 1. COPIAR EL NIVEL DEL TABLERO en vez de dar 'ver'. Es el error que
#    deja a /admin/roles ofreciendo «editar» sobre una pantalla que no
#    escribe nada — y eso se lee como que desde ahí se corrige un renglón.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  select p.rol, '/inventario/base', 'ver'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'""",
            """  select p.rol, '/inventario/base', p.nivel
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'""")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza el nivel que la pantalla no tiene" "les quedó un nivel que esta pantalla no tiene"

# 1b. LO MISMO CON LA GUARDIA TAMBIÉN QUITADA: ahí es donde la prueba 1
#     tiene que hablar.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  select p.rol, '/inventario/base', 'ver'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'""",
            """  select p.rol, '/inventario/base', p.nivel
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'""")
s=s.replace("""  if v_malos > 0 then
    raise exception 'A % rol(es) les quedó un nivel que esta pantalla no tiene, por ejemplo %. Solo lee.',
      v_malos, v_ejemplo;
  end if;""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la base se da en «ver», no en «editar»" "1(al que edita el tablero le quedo"

# 2. NO DARLE LA BASE A NADIE. Sin la fila, la pantalla existe y está
#    cerrada para todos: no da error, simplemente no sale en el menú.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/inventario/base', 'ver'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do nothing;""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza que no llegó a nadie" "de los que iban a recibir la base no les llegó"

# 2b. CON LA GUARDIA QUITADA, que hable la prueba.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/inventario/base', 'ver'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do nothing;""", "")
s=s.replace("""  if v_malos > 0 then
    raise exception 'A % rol(es) de los que iban a recibir la base no les llegó.', v_malos;
  end if;""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "los roles que ven el tablero reciben la base" "rol(es) que ven el tablero se quedaron sin la base"

# 3. ABRIRLE LA BASE AL ROL QUE TIENE EL TABLERO CERRADO.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do nothing;""",
            """   where p.seccion = '/inventario'
  on conflict (rol, seccion) do nothing;""")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "al rol con el tablero cerrado no se le abre" "3(al rol con el tablero cerrado le quedo"

# 4. EL CASO CARO: colarle la base a la persona a la que le CERRARON el
#    tablero a mano. La base trae MÁS detalle que el tablero, así que no
#    sería devolverle lo que le quitaron: sería darle de más.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""           case when permisos_extra ->> '/inventario' = 'ninguno' then 'ninguno' else 'ver' end)""",
            """           'ver')""")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza el tablero cerrado que se abre" "se les abrió la base"

# 4b. CON LA GUARDIA QUITADA, que hable la prueba.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""           case when permisos_extra ->> '/inventario' = 'ninguno' then 'ninguno' else 'ver' end)""",
            """           'ver')""")
s=s.replace("""  if v_malos > 0 then
    raise exception 'A % persona(s) con el tablero cerrado a mano se les abrió la base. Eso es justo lo que no puede pasar.',
      v_malos;
  end if;""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "el «ninguno» a mano se respeta" "6(a la persona con el tablero cerrado a mano le quedo"

# 5. NO COPIAR LOS PERMISOS PROPIOS. La persona a la que se lo abrieron
#    por encima de su rol se quedaría sin la base.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  update public.perfiles
     set permisos_extra = permisos_extra || jsonb_build_object(
           '/inventario/base',
           case when permisos_extra ->> '/inventario' = 'ninguno' then 'ninguno' else 'ver' end)
   where permisos_extra ? '/inventario'
     and not (permisos_extra ? '/inventario/base');""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "la guardia caza los permisos propios sin copiar" "con permiso propio no se les copió la base"

# 5b. CON LA GUARDIA QUITADA.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""  update public.perfiles
     set permisos_extra = permisos_extra || jsonb_build_object(
           '/inventario/base',
           case when permisos_extra ->> '/inventario' = 'ninguno' then 'ninguno' else 'ver' end)
   where permisos_extra ? '/inventario'
     and not (permisos_extra ? '/inventario/base');""", "")
s=s.replace("""  if v_malos > 0 then
    raise exception 'A % persona(s) con permiso propio no se les copió la base.', v_malos;
  end if;""", "")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "los permisos propios se copian" "7(a la persona con el tablero abierto a mano le quedo"

# 6. PISAR LO PUESTO A MANO. Una migración que se corre varias veces no
#    puede deshacer en la segunda vuelta lo que alguien decidió entre
#    las dos.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do nothing;""",
            """     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do update set nivel = excluded.nivel;""")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "lo puesto a mano no se pisa" "5(se piso el nivel puesto a mano"

# 7. INVENTARLE UN PERMISO PROPIO A QUIEN NO LO TENÍA. Escribírselo lo
#    saca del rol para siempre: a partir de ahí cambiar el rol ya no le
#    cambia esa pantalla, y nadie se acuerda de por qué.
python3 - <<'PY'
s=open('/tmp/base-buena.sql',encoding='utf-8').read()
s=s.replace("""   where permisos_extra ? '/inventario'
     and not (permisos_extra ? '/inventario/base');""",
            """   where not (permisos_extra ? '/inventario/base');""")
open('/tmp/base-mutada.sql','w',encoding='utf-8').write(s)
PY
probar "no se le inventa un permiso propio a quien no lo tenía" "8(a quien no tenia permisos propios se le invento uno"

cp /tmp/base-buena.sql "$ORIG"
echo
if [ "$FALLOS" -gt 0 ]; then
  echo "$FALLOS aserción(es) no cazan lo que dicen cazar."
  exit 1
fi
echo "Las 11 se pusieron rojas. El arnés caza lo que dice cazar."
