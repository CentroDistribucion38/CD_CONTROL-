#!/usr/bin/env bash
# mutantes de 2026-10-permisos-por-persona-en-la-base.sql: la prueba debe FALLAR con cada uno.
cd /home/claude/cd38-inventario
O=supabase/migraciones/2026-10-permisos-por-persona-en-la-base.sql
mut(){ python3 - "$O" "$1" "$2" <<'PY' || { echo "no encontré: $1"; return; }
import sys
p,a,b=sys.argv[1:4]; s=open(p).read()
if a not in s: sys.exit(1)
open("/tmp/claude-0/mutante.sql","w").write(s.replace(a,b,1))
PY
  if M=/tmp/claude-0/mutante.sql bash .arnes/correr-permisos-por-persona.sh pp_mut 2>&1 | grep -q "^✓"; then echo "SOBREVIVIÓ: $1 → $2"; else echo "murió: $1"; fi; }
mut "(select nullif(p.permisos_extra ->> p_seccion, '')
         from public.perfiles p where p.id = auth.uid() and p.activo)," "null::text,"
mut "from public.perfiles p where p.id = auth.uid() and p.activo)," "from public.perfiles p where p.id = auth.uid())," 
mut "when public.manda() then 'editar'" "when false then 'editar'"
mut "      'ninguno')
  end" "      'editar')
  end"
mut "where p.id = auth.uid() and p.activo
        union all" "where p.id = auth.uid()
        union all"
mut "and coalesce(p.permisos_extra ->> rp.seccion, '') = ''" "and true"
mut "select e.key as seccion, e.value as nivel" "select e.key as seccion, 'ver' as nivel"
mut "s.seccion like '/' || p_modulo || '/%'" "s.seccion like '/' || p_modulo || '%'"
mut "select public.manda() or exists (
    select 1
      from (" "select exists (
    select 1
      from ("
echo FIN
