#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE ABI CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN, no por la de al lado. Una mutación que
# vuelve VERDE es un hueco en la PRUEBA, no un permiso para el código.
#
#   bash .arnes/mutar-abi-hallazgos.sh
#   SOLO="2 ·" bash .arnes/mutar-abi-hallazgos.sh    (una sola)
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-acciones-abi-hallazgos.sql
COPIA=/tmp/abihz-original.sql
cp "$SQL" "$COPIA"
restaurar() { cp "$COPIA" "$SQL"; }
trap restaurar EXIT INT TERM HUP

# `replace` NO AVISA cuando no encuentra nada, y una mutación que no
# aplicó deja el arnés verde por el motivo equivocado.
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

corre() { bash .arnes/correr-abi-hallazgos.sh mut_abi 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "BIEN: ABI"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
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
  if echo "$s" | grep -q "BIEN: ABI"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'FALLA|ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

# ---------------------------------------------------------------------
# 1 · CUALQUIERA LEVANTA UN HALLAZGO
# ---------------------------------------------------------------------
mutacion "1 · levantar deja de pedir permiso" "pudo levantar un hallazgo" \
  "  if not public.hallazgo_puede_editar() then
    raise exception 'Levantar un hallazgo es de quien tiene Editar en ABI';
  end if;" \
  "  if false then
    raise exception 'Levantar un hallazgo es de quien tiene Editar en ABI';
  end if;"

mutacion "1b · el permiso se pregunta por el NOMBRE del rol" "SE LLAMA «abi»" \
  "      or public.mi_nivel_pantalla('/acciones/abi') = 'editar'" \
  "      or public.mi_nivel_pantalla('/acciones/abi') = 'editar'
      or (select rol from public.perfiles where id = auth.uid()) = 'abi'"

# LAS DOS DEFENSAS A LA VEZ. La funcion comprueba y la tabla tambien:
# quitando solo una, la otra caza el caso y la mutacion volvia VERDE sin
# que eso significara que la prueba esta ciega. Lo que se comprueba es
# que la prueba caza el caso cuando NO queda ninguna defensa.
mutacion "1c · un hallazgo sin sitio" "sin zona y sin ubicación" \
  "  if p_zona is null and btrim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Falta dónde fue: un hallazgo sin sitio no se puede ir a mirar';
  end if;" \
  "  if false then
    raise exception 'Falta dónde fue: un hallazgo sin sitio no se puede ir a mirar';
  end if;" \
  "  constraint hallazgo_tiene_lugar
    check (zona is not null or btrim(coalesce(ubicacion, '')) <> '')" \
  "  constraint hallazgo_tiene_lugar check (true)"

# ---------------------------------------------------------------------
# 2 · LA REGLA DEL MÓDULO: LA MÁQUINA PROPONE Y NO DECIDE
# ---------------------------------------------------------------------
mutacion "2 · la propuesta de la IA se guarda como la redacción" "se guardó como la REDACCIÓN" \
  "     set ia_borrador = btrim(p_texto), ia_en = now()" \
  "     set ia_borrador = btrim(p_texto), ia_en = now(), redaccion = btrim(p_texto)"

mutacion "2b · la IA deja el hallazgo firme sola" "volvió firme el hallazgo sola" \
  "     set ia_borrador = btrim(p_texto), ia_en = now()
   where id = p_id and estado <> 'anulado';" \
  "     set ia_borrador = btrim(p_texto), ia_en = now(),
         redaccion = btrim(p_texto), estado = 'firme'::hallazgo_estado
   where id = p_id and estado <> 'anulado';"

mutacion "2c · «tal cual de la IA» siempre dice que no" "no lo dice" \
  "       (h.ia_borrador is not null
        and btrim(coalesce(h.redaccion, '')) = btrim(coalesce(h.ia_borrador, '')))
         as tal_cual_de_la_ia," \
  "       false as tal_cual_de_la_ia,"

# ---------------------------------------------------------------------
# 3 · FIRME SIN REDACCIÓN
# ---------------------------------------------------------------------
mutacion "3 · se puede quedar firme sin redacción" "FIRME un hallazgo sin redacción" \
  "  constraint hallazgo_firme_con_redaccion
    check (estado in ('borrador', 'anulado') or btrim(coalesce(redaccion, '')) <> '')," \
  "  constraint hallazgo_firme_con_redaccion check (true),"

mutacion "3b · se aprueba una redacción vacía" "redacción vacía" \
  "  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'La redacción no puede quedar vacía: es lo que sale en el informe';
  end if;" \
  "  if false then
    raise exception 'La redacción no puede quedar vacía: es lo que sale en el informe';
  end if;" \
  "  constraint hallazgo_firme_con_redaccion
    check (estado in ('borrador', 'anulado') or btrim(coalesce(redaccion, '')) <> '')," \
  "  constraint hallazgo_firme_con_redaccion check (true),"

mutacion "3c · aprobar no lo deja firme" "no lo dejó firme" \
  "         estado = case when estado = 'borrador' then 'firme'::hallazgo_estado else estado end" \
  "         estado = estado"

mutacion "3d · no queda quién aprobó" "no quedó QUIÉN aprobó" \
  "         redactado_por = auth.uid(), redactado_en = now()," \
  "         redactado_por = null, redactado_en = now(),"

# ---------------------------------------------------------------------
# 4 · SE REESCRIBE UN CERRADO
# ---------------------------------------------------------------------
mutacion "4 · se le reescribe el texto a uno cerrado" "a un hallazgo ya cerrado" \
  "  if v.estado = 'cerrado' then
    raise exception 'Ese hallazgo ya se cerró: su texto ya salió en un informe. Levanta uno nuevo';
  end if;" \
  "  if false then
    raise exception 'Ese hallazgo ya se cerró: su texto ya salió en un informe. Levanta uno nuevo';
  end if;"

mutacion "4b · se cierra un borrador" "todavía estaba en borrador" \
  "  if v.estado <> 'firme' then
    raise exception 'Solo se cierra un hallazgo firme: primero se aprueba su redacción';
  end if;" \
  "  if false then
    raise exception 'Solo se cierra un hallazgo firme: primero se aprueba su redacción';
  end if;" \
  "  constraint hallazgo_firme_con_redaccion
    check (estado in ('borrador', 'anulado') or btrim(coalesce(redaccion, '')) <> '')," \
  "  constraint hallazgo_firme_con_redaccion check (true),"

# ---------------------------------------------------------------------
# 5 · DOS ACCIONES DEL MISMO HALLAZGO
# ---------------------------------------------------------------------
mutacion "5 · el mismo hallazgo abre dos acciones" "abrió DOS acciones" \
  "  if v.accion_id is not null then
    raise exception 'Ese hallazgo ya tiene una acción abierta';
  end if;" \
  "  if false then
    raise exception 'Ese hallazgo ya tiene una acción abierta';
  end if;"

# `accion_id = accion_id` NO SIRVE COMO MUTACIÓN: dentro de esta
# función `accion_id` es también el nombre de la columna de salida, así
# que Postgres contesta «ambiguous» y el arnés se pone rojo por un error
# de sintaxis y no por la regla. Dejarlo así habría sido una mutación
# que "caza" sin probar nada.
mutacion "5b · la acción no queda amarrada" "no quedó amarrada" \
  "  update public.acciones_hallazgos set accion_id = r.id where id = p_id;" \
  "  update public.acciones_hallazgos set accion_id = null where id = p_id;"

mutacion "5c · la acción se lleva el dictado y no la redacción" "no se llevó la redacción" \
  "    p_descripcion => coalesce(v.redaccion, v.lo_que_se_vio)" \
  "    p_descripcion => coalesce(v.lo_que_se_vio, v.redaccion)"

# ---------------------------------------------------------------------
# 6 · ANULAR
# ---------------------------------------------------------------------
mutacion "6 · se anula sin motivo" "se anuló sin motivo" \
  "  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula: queda escrito en la fila';
  end if;" \
  "  if false then
    raise exception 'Hay que decir por qué se anula: queda escrito en la fila';
  end if;" \
  "  constraint hallazgo_anulado_con_motivo
    check (estado <> 'anulado' or btrim(coalesce(motivo_anulacion, '')) <> '')," \
  "  constraint hallazgo_anulado_con_motivo check (true),"

mutacion "6b · a un anulado se le sigue pidiendo redacción" "a un hallazgo anulado" \
  "   where id = p_id and estado <> 'anulado';
  if not found then raise exception 'Ese hallazgo no existe o está anulado'; end if;" \
  "   where id = p_id;
  if not found then raise exception 'Ese hallazgo no existe o está anulado'; end if;"

# ---------------------------------------------------------------------
# 7 · BORRAR
# ---------------------------------------------------------------------
mutacion "7 · borrar deja de ser del administrador" "pudo BORRAR hallazgos" \
  "  if not public.manda() then
    raise exception 'Borrar hallazgos es del administrador';
  end if;" \
  "  if not public.hallazgo_puede_editar() then
    raise exception 'Borrar hallazgos es del administrador';
  end if;"

mutacion "7b · se borra sin motivo" "se borró sin motivo" \
  "  if v_motivo = '' then
    raise exception 'Hay que decir por qué se borran: la fila se va y el motivo es lo único que queda';
  end if;" \
  "  if false then
    raise exception 'Hay que decir por qué se borran: la fila se va y el motivo es lo único que queda';
  end if;"

mutacion "7c · el registro de borrados lo lee cualquiera" "puede leer el registro" \
  "create policy hallazgos_borrados_ver on public.acciones_hallazgos_borrados
  for select to authenticated using (public.manda());" \
  "create policy hallazgos_borrados_ver on public.acciones_hallazgos_borrados
  for select to authenticated using (true);"

# ---------------------------------------------------------------------
# 9 · EL ANTES Y EL DESPUÉS
# ---------------------------------------------------------------------
mutacion "9 · el antes y el después se cuentan juntos" "no se cuentan aparte" \
  "         where f.hallazgo_id = h.id and f.momento = 'antes') as fotos_antes," \
  "         where f.hallazgo_id = h.id) as fotos_antes,"

mutacion "9b · se acepta cualquier palabra como momento" "que no es antes ni despues" \
  "      add constraint hallazgo_foto_momento check (momento in ('antes', 'despues'));" \
  "      add constraint hallazgo_foto_momento check (true);" \
  "  momento     text not null default 'antes'
                check (momento in ('antes', 'despues'))," \
  "  momento     text not null default 'antes',"

restaurar
echo ""
if [ ${#SORDAS[@]} -gt 0 ]; then
  printf '✗ %s\n' "${SORDAS[@]}"
  echo ""
  echo "${#SORDAS[@]} mutación(es) que la prueba NO caza. Es un hueco en la prueba."
  exit 1
fi
echo "✓ Todas las mutaciones se cazaron, y cada una por su propia afirmación."
