#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE FACTURACIÓN CAZA LO QUE DICE CAZAR?
# Cada error que dice cazar, metido de vuelta en la migración; tiene que
# ponerse roja POR SU PROPIA AFIRMACIÓN.
#   bash .arnes/mutar-traspasos-facturacion.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-traspasos-facturacion.sql
COPIA=/tmp/tp-fact-original.sql
# LA FUNCIÓN DE CONFIRMAR VIVE EN LOS DOS ARCHIVOS: el de mudarla dentro
# de Traspasos la vuelve a crear. Una mutación que tocara solo el primero
# la taparía el segundo, y la prueba saldría verde sin haber probado nada.
SQL2=supabase/migraciones/2026-09-traspasos-facturacion-en-traspasos.sql
COPIA2=/tmp/tp-fact-en-traspasos.sql
cp "$SQL" "$COPIA"; cp "$SQL2" "$COPIA2"
restaurar() { cp "$COPIA" "$SQL"; cp "$COPIA2" "$SQL2"; }
trap restaurar EXIT INT TERM HUP

cambia() {
  python3 - "$SQL" "$SQL2" "$1" "$2" <<'PY'
import sys
r1, r2, de, a = sys.argv[1:5]
hubo = False
for ruta in (r1, r2):
    s = open(ruta, encoding="utf-8").read()
    n = s.replace(de, a)
    if n != s:
        hubo = True
        open(ruta, "w", encoding="utf-8").write(n)
assert hubo, f"la mutacion no aplico: {de[:70]}"
PY
}
corre() { bash .arnes/correr-traspasos-facturacion.sh mut_tpf 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if ! corre | grep -q "todo en orden"; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=(); N=0
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  N=$((N+1)); restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  if echo "$s" | grep -q "todo en orden"; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

mutacion "lo de antes no se trae" "0(el número de SAP de antes" \
  " where documento_clave is not null
   and factura_documento is null" " where false and documento_clave is not null
   and factura_documento is null"

mutacion "lo de antes se trae sin marcarlo histórico" "0(el número de SAP de antes" \
  "       salida_historica  = true
 where documento_clave is not null" "       salida_historica  = false
 where documento_clave is not null"

mutacion "el candado del día frena la migración y a facturación" "ese día está cerrado" \
  "  if tg_op = 'UPDATE'
     and (to_jsonb(new) - v_salida) is not distinct from (to_jsonb(old) - v_salida) then
    return new;
  end if;

  v_fecha" "  v_fecha"

mutacion "el patio confirma salidas" "2(el supervisor del patio confirmó" \
  "  if not public.puede_editar('/traspasos/facturacion') then
    raise exception 'Solo facturación confirma" "  if false then
    raise exception 'Solo facturación confirma"

mutacion "acepta letras en el número" "3b(letras" \
  "  if v_clave !~ '^[0-9]{1,10}\$' then" "  if false then"

mutacion "el repetido no dice en qué viaje está" "4b(el repetido no dice" \
  "   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if found then" "   where factura_clave = v_clave and estado = 'registrado' limit 1;
  if false then"

mutacion "un viaje sale dos veces" "6(un viaje salió dos veces)" \
  "  if v.salida_en is not null then
    raise exception 'Ese viaje ya salió con el documento %.', v.factura_documento;
  end if;" "  update public.traspasos_viajes set salida_en = null, factura_documento = null where id = p_id;"

mutacion "un vacío sale" "7(un vacío salió" \
  "  if v.vacio then raise exception 'Un viaje vacío no lleva documento de facturación.'; end if;" ""

mutacion "un anulado sale" "7b(un viaje anulado salió)" \
  "  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado: no sale.'; end if;" ""

mutacion "el patio toca lo que ya salió" "9(el patio anuló un viaje que ya salió)" \
  "create trigger traspasos_viaje_salido_intocable
  before update on public.traspasos_viajes
  for each row execute function public.traspasos_viaje_salido_intocable();" "" \
  "  if not exists (select 1 from pg_trigger where tgname = 'traspasos_viaje_salido_intocable') then" "  if false then"

mutacion "cualquiera reabre" "10(facturación reabrió" \
  "  if not public.manda() then
    raise exception 'Solo el administrador reabre" "  if false then
    raise exception 'Solo el administrador reabre"

mutacion "se reabre sin motivo" "10b(se reabrió sin motivo)" \
  "  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se reabre" "  if false then
    raise exception 'Escribe por qué se reabre"

mutacion "confirmar no deja rastro" "11(confirmar y reabrir no quedaron en el rastro" \
  "  select p_id, auth.uid(), 'Facturación confirmó la salida', to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where n.id = p_id;" "  select p_id, auth.uid(), 'x', to_jsonb(v), to_jsonb(n)
    from public.traspasos_viajes n where false;"

mutacion "reabierto sigue por facturar mal calculado" "10d(reabrir no lo dejó por facturar" \
  "  (not v.vacio and v.estado = 'registrado' and v.salida_en is null) as por_facturar" \
  "  (not v.vacio and v.estado = 'registrado' and v.salida_en is null and v.documento is null) as por_facturar"

mutacion "el cruce sigue contra la orden de cargue" "12b(el cruce emparejó por la orden de cargue" \
  "full outer join sis on sis.factura_clave = sap.referencia;" "full outer join sis on sis.documento = sap.referencia;"

mutacion "las importaciones cuentan contra la orden de cargue" "12c(las importaciones" \
  "       where v.estado = 'registrado' and v.factura_clave = m.referencia))::int" \
  "       where v.estado = 'registrado' and v.documento_clave = m.referencia))::int"

restaurar
echo ""
if [ ${#SORDAS[@]} -gt 0 ]; then
  printf '✗ %s\n' "${SORDAS[@]}"
  echo "${#SORDAS[@]} de $N no cazan lo que dicen cazar."; exit 1
fi
echo "Las $N se pusieron rojas. La prueba caza lo que dice cazar."
