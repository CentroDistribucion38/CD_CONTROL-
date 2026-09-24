#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE LA UBICACIÓN Y EL TURNO CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN. Una mutación que vuelve VERDE es un
# hueco en la PRUEBA, no un permiso para el código.
#
#   bash .arnes/mutar-averias-ubicacion.sh
#   SOLO="3 ·" bash .arnes/mutar-averias-ubicacion.sh    (una sola)
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-averias-ubicacion-y-turno.sql
COPIA=/tmp/avrubi-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT INT TERM HUP

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

corre() { bash .arnes/correr-averias-ubicacion.sh mut_avr 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN: Averias"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=()
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  if [ -n "${SOLO:-}" ] && [[ "$nombre" != *"$SOLO"* ]]; then return; fi
  restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  if echo "$s" | grep -q "BIEN: Averias"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'FALLA|ERROR|·' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

# ---------------------------------------------------------------------
# 1 · LA UBICACIÓN VUELVE A SER TEXTO LIBRE
# ---------------------------------------------------------------------
# LA FUNCIÓN NO ES LA ÚNICA DEFENSA, y eso está bien: la llave foránea
# de `ubicacion_id` caza el mismo caso. Quitando solo el guard, la
# mutación volvía VERDE — y eso NO significaba que la prueba estuviera
# ciega, sino que el código está defendido dos veces. Lo que se
# comprueba es que la prueba caza el caso cuando no queda ninguna.
mutacion "1 · se acepta una ubicación que no está en el maestro" "NO está en el maestro" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if false then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;" \
  "  add column if not exists ubicacion_id uuid references public.ubicaciones(id)," \
  "  add column if not exists ubicacion_id uuid," \
  "            v_hoy, v_texto, p_ubicacion_id," \
  "            v_hoy, coalesce(v_texto, 'sin sitio'), p_ubicacion_id,"

# TRES DEFENSAS AQUÍ: el guard, el `if not found`, y que la columna
# `ubicacion` no admite nulos. Se quitan las tres.
mutacion "1b · se registra sin ubicación" "se registró sin ubicación" \
  "  if p_ubicacion_id is null then
    raise exception 'Falta la ubicación: una avería que no se sabe dónde está no se puede ir a ver';
  end if;" \
  "  if false then
    raise exception 'Falta la ubicación: una avería que no se sabe dónde está no se puede ir a ver';
  end if;" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if false then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;" \
  "            v_hoy, v_texto, p_ubicacion_id," \
  "            v_hoy, coalesce(v_texto, 'sin sitio'), p_ubicacion_id,"

# ---------------------------------------------------------------------
# 2 · UNA UBICACIÓN APAGADA
# ---------------------------------------------------------------------
mutacion "2 · se registra en una ubicación apagada" "ubicación APAGADA" \
  "  if not v_ubi.activa then
    raise exception 'Esa ubicación está apagada en el maestro: préndela primero o escoge otra';
  end if;" \
  "  if false then
    raise exception 'Esa ubicación está apagada en el maestro: préndela primero o escoge otra';
  end if;"

# ---------------------------------------------------------------------
# 3 · LA FECHA VUELVE A PODERSE MANDAR  ← el corazón del cambio
# ---------------------------------------------------------------------
mutacion "3 · la fecha se puede volver a mandar desde fuera" "TODAVÍA acepta p_fecha" \
  "  p_vence        date default null,
  p_nota         text default null,
  p_paso_antes   date default null)
returns table (id uuid, codigo text)" \
  "  p_vence        date default null,
  p_nota         text default null,
  p_paso_antes   date default null,
  p_fecha        date default null)
returns table (id uuid, codigo text)" \
  "grant execute on function public.averia_registrar(uuid, text, integer, integer, text, text, date, text, date)" \
  "grant execute on function public.averia_registrar(uuid, text, integer, integer, text, text, date, text, date, date)"

mutacion "3b · queda viva la función vieja de texto libre" "versión vieja" \
  "drop function if exists public.averia_registrar(text, text, integer, integer, text, text, date, date, text);" \
  "-- no se borra la vieja"

# ---------------------------------------------------------------------
# 4 · EL TURNO
# ---------------------------------------------------------------------
mutacion "4 · el turno se queda en nulo" "el turno quedó en nulo" \
  "            public.turno_cd(v_ahora), p_paso_antes," \
  "            null, p_paso_antes,"

mutacion "4b · el turno del CD arranca como el de la planta (a medianoche)" \
  "no parte el día en 06–14" \
  "           when extract(hour from (p_cuando at time zone 'America/Bogota')) >= 6
            and extract(hour from (p_cuando at time zone 'America/Bogota')) < 14 then 1" \
  "           when extract(hour from (p_cuando at time zone 'America/Bogota')) >= 0
            and extract(hour from (p_cuando at time zone 'America/Bogota')) < 8 then 1"

mutacion "4c · el turno usa la hora del servidor y no la de Colombia" \
  "usa la hora del servidor" \
  "           when extract(hour from (p_cuando at time zone 'America/Bogota')) >= 14
            and extract(hour from (p_cuando at time zone 'America/Bogota')) < 22 then 2" \
  "           when extract(hour from p_cuando) >= 14
            and extract(hour from p_cuando) < 22 then 2"

# ---------------------------------------------------------------------
# 5 · EL TEXTO DE LA UBICACIÓN
# ---------------------------------------------------------------------
mutacion "5 · el texto de la ubicación se arma con otro separador" "se armó mal" \
  "  select case when u.lado is null then u.calle || ' · ' || u.modulo
              else u.calle || ' · ' || u.modulo || ' · ' || u.lado end" \
  "  select case when u.lado is null then u.calle || '-' || u.modulo
              else u.calle || '-' || u.modulo || '-' || u.lado end"

mutacion "5b · la vista deja de traer la calle del maestro" "no trae la calle" \
  "         u.calle, u.modulo, u.lado, u.clave as ubicacion_clave," \
  "         null::text as calle, u.modulo, u.lado, u.clave as ubicacion_clave,"

mutacion "5c · la vista deja de traer la hora" "no trae la hora" \
  "         to_char(a.creado_en at time zone 'America/Bogota', 'HH24:MI') as hora," \
  "         null::text as hora,"

# ---------------------------------------------------------------------
# 6 · «CORREGIR» SE SALTA LA REGLA
# ---------------------------------------------------------------------
mutacion "6 · corregir acepta una ubicación que no está en el maestro" \
  "«corregir» aceptó una ubicación" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;

  if coalesce(p_cajas, 0) <= 0" \
  "  select * into v_ubi from public.ubicaciones where ubicaciones.id = p_ubicacion_id;
  if false then
    raise exception 'Esa ubicación no está en el maestro de Inventario';
  end if;

  if coalesce(p_cajas, 0) <= 0" \
  "  add column if not exists ubicacion_id uuid references public.ubicaciones(id)," \
  "  add column if not exists ubicacion_id uuid," \
  "     set ubicacion = public.ubicacion_texto(p_ubicacion_id)," \
  "     set ubicacion = coalesce(public.ubicacion_texto(p_ubicacion_id), 'sin sitio'),"

mutacion "6b · corregir no actualiza el texto de la ubicación" "corregir no cambió la ubicación" \
  "     set ubicacion = public.ubicacion_texto(p_ubicacion_id),
         ubicacion_id = p_ubicacion_id," \
  "     set ubicacion_id = p_ubicacion_id,"

mutacion "6c · queda viva la versión vieja de corregir" "puerta trasera" \
  "drop function if exists public.averia_corregir(uuid, text, text, integer, integer, text, text, date, date, text);" \
  "-- no se borra la vieja"

# ---------------------------------------------------------------------
# 7 · «PASÓ ANTES»
# ---------------------------------------------------------------------
mutacion "7 · «pasó antes» acepta hoy" "que no es «antes»" \
  "  if p_paso_antes is not null and p_paso_antes >= v_hoy then
    raise exception 'Si pasó hoy no hace falta decirlo: la fecha del registro ya es la de hoy';
  end if;" \
  "  if false then
    raise exception 'Si pasó hoy no hace falta decirlo: la fecha del registro ya es la de hoy';
  end if;"

# ---------------------------------------------------------------------
# 8 · LAS VIEJAS DESAPARECEN
# ---------------------------------------------------------------------
mutacion "8 · las averías viejas sin amarre desaparecen de la vista" "DESAPARECIÓ de la vista" \
  "    left join public.ubicaciones u on u.id = a.ubicacion_id;" \
  "    join public.ubicaciones u on u.id = a.ubicacion_id;"

restaurar
echo ""
if [ ${#SORDAS[@]} -gt 0 ]; then
  printf '✗ %s\n' "${SORDAS[@]}"
  echo ""
  echo "${#SORDAS[@]} mutación(es) que la prueba NO caza. Es un hueco en la prueba."
  exit 1
fi
echo "✓ Todas las mutaciones se cazaron, y cada una por su propia afirmación."
