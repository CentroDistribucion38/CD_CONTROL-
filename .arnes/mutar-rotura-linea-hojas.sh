#!/usr/bin/env bash
# =====================================================================
# ¿LA PRUEBA DE LAS HOJAS GUARDADAS CAZA LO QUE DICE CAZAR?
#
# Se le vuelve a meter CADA error que dice cazar y se exige que se ponga
# roja POR SU PROPIA AFIRMACIÓN, no por la de al lado.
#
#   bash .arnes/mutar-rotura-linea-hojas.sh
# =====================================================================
set -u
SQL=supabase/migraciones/2026-09-rotura-linea-hojas.sql
COPIA=/tmp/rl-hojas-original.sql
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

corre() { bash .arnes/correr-rotura-linea-hojas.sh mut_rlh 2>&1; }

echo "--- sin mutar (tiene que estar verde)"
if [ "$(corre | grep -c "todo en orden")" != 2 ]; then echo "El arnés ya estaba en rojo ANTES de mutar."; exit 1; fi
echo "    ok"

SORDAS=(); N=0
mutacion() {
  local nombre="$1" espera="$2"; shift 2
  N=$((N+1))
  restaurar
  while [ $# -gt 0 ]; do
    if ! cambia "$1" "$2"; then echo "✗ $nombre — la mutación no aplicó"; exit 1; fi
    shift 2
  done
  local s; s=$(corre)
  if [ "$(echo "$s" | grep -c "todo en orden")" = 2 ]; then
    SORDAS+=("$nombre  → el arnés NO se dio cuenta")
  elif ! echo "$s" | grep -qF "$espera"; then
    SORDAS+=("$nombre  → se puso rojo, pero por otra cosa:
      $(echo "$s" | grep -E 'ERROR' | head -2)")
  else
    echo "✓ $nombre"
  fi
}

mutacion "el espacio de los PDF queda público" \
  "0(el espacio de los PDF" \
  "values ('rotlinea-hojas', 'rotlinea-hojas', false," "values ('rotlinea-hojas', 'rotlinea-hojas', true," \
  "  public             = false," "  public             = true,"

mutacion "el espacio acepta cualquier archivo" \
  "0(el espacio de los PDF" \
  "array['application/pdf'])" "null)"

mutacion "quien edita no puede subir el PDF" \
  "1(la supervisora no pudo guardar" \
  "with check (bucket_id = 'rotlinea-hojas' and public.es_editor());" "with check (bucket_id = 'rotlinea-hojas' and public.mi_rol() = 'admin');"

mutacion "la vista pierde el nombre de quien la generó" \
  "1b(la vista no dice quién" \
  "left join public.perfiles p on p.id = h.generado_por
" "left join public.perfiles p on p.id = h.generado_por and false
"

mutacion "se puede guardar a nombre de otro" \
  "2(se pudo guardar una hoja a nombre de otro)" \
  "with check (public.es_editor() and generado_por = auth.uid());" "with check (public.es_editor());"

mutacion "la ruta puede ser de otro día" \
  "3(una hoja del 15 quedó guardada en la carpeta del 14)" \
  "  constraint rotlinea_hojas_ruta_del_dia check (ruta like fecha::text || '/%')" "  constraint rotlinea_hojas_ruta_del_dia check (ruta like '%.pdf' or true)"

mutacion "lo generado se puede corregir (sin revoke, como nace en Supabase)" \
  "4(la supervisora corrigió" \
  "revoke update, delete on public.rotlinea_hojas from authenticated;" "revoke delete on public.rotlinea_hojas from authenticated;
grant update on public.rotlinea_hojas to authenticated;
drop policy if exists rotlinea_hojas_update on public.rotlinea_hojas;
create policy rotlinea_hojas_update on public.rotlinea_hojas for update to authenticated using (true);"

mutacion "alguien puede borrar hojas" \
  "5(la supervisora borró una hoja" \
  "  if exists (select 1 from pg_policies where tablename = 'rotlinea_hojas' and cmd = 'DELETE') then" "  if false then" \
  "revoke update, delete on public.rotlinea_hojas from authenticated;" "revoke update on public.rotlinea_hojas from authenticated;
grant delete on public.rotlinea_hojas to authenticated;
drop policy if exists rotlinea_hojas_delete on public.rotlinea_hojas;
create policy rotlinea_hojas_delete on public.rotlinea_hojas for delete to authenticated using (public.es_editor());"

mutacion "cualquier editor borra PDF" \
  "5b(la supervisora borró el PDF" \
  "drop policy if exists rotlinea_hojas_borrar on storage.objects;
" "drop policy if exists rotlinea_hojas_borrar on storage.objects;
create policy rotlinea_hojas_borrar on storage.objects for delete to authenticated using (bucket_id = 'rotlinea-hojas' and public.es_editor());
"

mutacion "quien consulta no ve la lista" \
  "6(el operador no ve la lista" \
  "  for select to authenticated using (true);" "  for select to authenticated using (public.es_editor());"

mutacion "quien consulta no puede abrir el PDF" \
  "6b(el operador no puede abrir el PDF)" \
  "for select to authenticated using (bucket_id = 'rotlinea-hojas');" "for select to authenticated using (bucket_id = 'rotlinea-hojas' and public.es_editor());"

mutacion "quien solo consulta guarda hojas" \
  "7(el operador, que solo consulta, guardó" \
  "with check (public.es_editor() and generado_por = auth.uid());" "with check (generado_por = auth.uid());"

mutacion "quien solo consulta sube PDF" \
  "7b(el operador, que solo consulta, subió" \
  "with check (bucket_id = 'rotlinea-hojas' and public.es_editor());" "with check (bucket_id = 'rotlinea-hojas');"

mutacion "cualquiera anula" \
  "8(la supervisora anuló una hoja" \
  "  if not public.rotlinea_hoja_manda() then
    raise exception 'Solo el administrador anula hojas.'" "  if false then
    raise exception 'Solo el administrador anula hojas.'"

mutacion "la primera versión deja al administrador borrar (no se quita al volver a correr)" \
  "9b(el administrador borró una hoja" \
  "  if exists (select 1 from pg_policies where tablename = 'rotlinea_hojas' and cmd = 'DELETE') then" "  if false then" \
  "drop policy if exists rotlinea_hojas_delete on public.rotlinea_hojas;
grant select, insert on public.rotlinea_hojas to authenticated;
revoke update, delete on public.rotlinea_hojas from authenticated;" "grant select, insert on public.rotlinea_hojas to authenticated;
revoke update on public.rotlinea_hojas from authenticated;"

mutacion "la primera versión deja al administrador borrar el PDF" \
  "9c(el administrador borró el PDF" \
  "drop policy if exists rotlinea_hojas_borrar on storage.objects;
" ""

mutacion "se anula sin motivo" \
  "10(se anuló sin motivo)" \
  "  if length(btrim(coalesce(p_motivo, ''))) < 5 then" "  if false then" \
  "  or (anulada_en is not null and length(btrim(anulada_motivo)) >= 5)" "  or (anulada_en is not null)"

mutacion "el administrador no puede anular" \
  "11(el administrador no pudo anular" \
  "     set anulada_en = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
   where id = p_id;" "     set anulada_en = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
   where id = p_id and false;
  raise exception 'no se anuló';"

mutacion "la vista no dice quién anuló" \
  "11b(la vista no dice quién anuló" \
  "left join public.perfiles a on a.id = h.anulada_por;" "left join public.perfiles a on a.id = h.anulada_por and false;"

mutacion "se anula dos veces y la segunda pisa la primera" \
  "12(se anuló dos veces" \
  "  if v_ya is not null then raise exception 'Esa hoja ya está anulada.'; end if;" ""

mutacion "cualquiera quita la anulación" \
  "13(la supervisora quitó una anulación)" \
  "  if not public.rotlinea_hoja_manda() then
    raise exception 'Solo el administrador quita una anulación.'" "  if false then
    raise exception 'Solo el administrador quita una anulación.'"

mutacion "quitar la anulación deja el motivo" \
  "13b(quitar la anulación no la deja como antes)" \
  "     set anulada_en = null, anulada_por = null, anulada_motivo = null" "     set anulada_en = null, anulada_por = null" \
  "  (anulada_en is null and anulada_motivo is null and anulada_por is null)" "  (anulada_en is null and anulada_por is null)"

restaurar
echo ""
if [ ${#SORDAS[@]} -gt 0 ]; then
  printf '✗ %s\n' "${SORDAS[@]}"
  echo "${#SORDAS[@]} de $N no cazan lo que dicen cazar."; exit 1
fi
echo "Las $N se pusieron rojas. La prueba caza lo que dice cazar."
