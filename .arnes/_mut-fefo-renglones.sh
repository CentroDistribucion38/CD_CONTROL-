#!/usr/bin/env bash
cd /home/claude/cd38-inventario
S=supabase/migraciones/2026-10-fefo-renglones-eliminar.sql; T=/tmp/claude-0/mutsql-renglones.sql
m(){
  python3 - "$S" "$T" "$1" "$2" <<'PY' || { echo "no encontré: $1"; return; }
import sys
s=open(sys.argv[1]).read(); a,b=sys.argv[3:5]
if a not in s: sys.exit(1)
open(sys.argv[2],'w').write(s.replace(a,b,1))
PY
  salida=$(M=$T bash .arnes/correr-fefo-renglones.sh feforenmut 2>&1 | tail -2)
  if echo "$salida" | grep -q "^✓"; then echo "SOBREVIVIÓ: $1 → $2"; else echo "muerto:     $1"; fi
}
m 'if not public.manda() then' 'if false then'
m "if cardinality(v_pedidas) = 0 then raise exception 'No marcaste ningún renglón.'; end if;" ""
m "if v_n <> cardinality(v_pedidas) then" "if false then"
m "where cl.id = any (v_pedidas) and c.tipo = 'fefo';" "where cl.id = any (v_pedidas);"
m "if r.van >= r.hay then" "if r.van > r.hay then"
m "where conteo_id = r.id and id = any (v_pedidas);" "where id = any (v_pedidas) and conteo_id is not null;"
m "select coalesce(array_agg(distinct x), '{}')" "select coalesce(array_agg(x), '{}')"
m "quedan := r.hay - r.van;" "quedan := r.hay;"
m "values ('inventario_fefo_renglones', 'Inventario · renglones de FEFO ' || r.cod, r.van, 0);" "values ('inventario_fefo_renglones', 'Inventario · renglones de FEFO ' || r.cod, 1, 0);"
m "   where c.id in (select cl.conteo_id from public.conteo_lineas cl where cl.id = any (v_pedidas)) for update;" "   where false for update;"
