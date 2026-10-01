#!/usr/bin/env bash
cd /home/claude/cd38-inventario
M=supabase/migraciones/2026-10-conteo-estados-distintos.sql
mut(){ cp $M /tmp/claude-0/mut-orig.sql; python3 - "$1" "$2" <<'PY'
import sys
p="supabase/migraciones/2026-10-conteo-estados-distintos.sql"; s=open(p).read()
assert sys.argv[1] in s, "no encontré"
open("/tmp/claude-0/mut-m.sql","w").write(s.replace(sys.argv[1],sys.argv[2],1))
PY
 if M=/tmp/claude-0/mut-m.sql bash .arnes/correr-conteo-estados.sh >/tmp/claude-0/mut-out.txt 2>&1; then echo "SOBREVIVIÓ: $1 → $2"; else echo "murió: $1 → $2"; fi; }
mut ", averia, pnc, estado_envase)" ", averia, pnc)"
mut "nulls not distinct" ""
mut "indexdef like '%estado_envase%'" "indexdef like '%zzz%'"
mut "ubicacion_id, venc_dia" "venc_dia"
