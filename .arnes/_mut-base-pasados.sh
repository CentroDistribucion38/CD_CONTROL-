#!/usr/bin/env bash
cd /home/claude/cd38-inventario
S=supabase/migraciones/2026-10-base-pasados.sql; T=/tmp/claude-0/mutsql-bpas.sql
m(){
  python3 - "$S" "$T" "$1" "$2" <<'PY' || { echo "no encontré: $1"; return; }
import sys
s=open(sys.argv[1]).read(); a,b=sys.argv[3:5]
if a not in s: sys.exit(1)
open(sys.argv[2],'w').write(s.replace(a,b,1))
PY
  salida=$(M=$T bash .arnes/correr-base-pasados.sh basepasmut 2>&1 | tail -2)
  if echo "$salida" | grep -q "^✓"; then echo "SOBREVIVIÓ: $1 → $2"; else echo "muerto:     $1"; fi
}
m "if not (public.puede_editar('/inventario/base') or public.manda()) then" "if false then"
m "if not (public.puede_editar('/inventario/base') or public.manda()) then" "if not public.manda() then"
m "if auth.uid() is null then raise exception 'Hay que entrar para marcar renglones.'; end if;" ""
m "if cardinality(v_pedidas) = 0 then raise exception 'No marcaste ningún renglón.'; end if;" ""
m "and c.tipo = 'fefo' and c.estado = 'cerrado';" "and c.estado = 'cerrado';"
m "and c.tipo = 'fefo' and c.estado = 'cerrado';" "and c.tipo = 'fefo';"
m "if v_n <> cardinality(v_pedidas) then" "if false then"
m "on conflict (linea_id) do nothing;" "on conflict (linea_id) do update set pasado_en = now();"
m "select x, auth.uid() from unnest(v_pedidas) x" "select x, null from unnest(v_pedidas) x"
m "if coalesce(p_pasado, true) then" "if true then"
m "delete from public.conteo_lineas_pasadas where linea_id = any (v_pedidas);" "delete from public.conteo_lineas_pasadas;"
m "for select to authenticated using (public.puede_ver('/inventario/base') or public.manda());" "for select to authenticated using (true);"
m "revoke all on public.conteo_lineas_pasadas from public, anon, authenticated;" ""
m "linea_id  uuid primary key references public.conteo_lineas(id) on delete cascade," "linea_id  uuid primary key,"
