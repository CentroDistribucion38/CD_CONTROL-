#!/usr/bin/env bash
# Mutantes del SQL de cambiar la fecha de un FEFO: cada uno debe hacer FALLAR su prueba.
cd /home/claude/cd38-inventario
S=supabase/migraciones/2026-10-fefo-cambiar-fecha.sql; T=/tmp/claude-0/mutsql-fecha.sql
m(){
  python3 - "$S" "$T" "$1" "$2" <<'PY' || { echo "no encontré: $1"; return; }
import sys
s=open(sys.argv[1]).read(); a,b=sys.argv[3:5]
if a not in s: sys.exit(1)
open(sys.argv[2],'w').write(s.replace(a,b,1))
PY
  salida=$(M=$T bash .arnes/correr-fefo-fecha.sh fefofechamut 2>&1 | tail -2)
  if echo "$salida" | grep -q "^✓"; then echo "SOBREVIVIÓ: $1 → $2"; else echo "muerto:     $1"; fi
}
m 'if not public.manda() then' 'if false then'
m 'if p_fecha > v_hoy then' 'if false then'
m "at time zone 'America/Bogota')::date;" "at time zone 'UTC')::date;"
m 'if v_codigo is distinct from btrim(coalesce(p_codigo, '"''"')) then' 'if false then'
m "if v_tipo <> 'fefo' then" 'if false then'
m "|| ' 12:00:00-05')::timestamptz" "|| ' 23:30:00-05')::timestamptz"
m "and c.id <> p_conteo and c.codigo like" "and c.codigo like"
m "exit when not exists (select 1 from public.conteos c where c.codigo = v_nuevo);" "exit;"
m "if v_codigo not like 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-%' then" "if true then"
m "if v_codigo ~ '^FEFO-[0-9]{8}-[0-9]+\$' then" "if true then"
m "if p_fecha is null then raise exception 'Falta la fecha.'; end if;" ""
