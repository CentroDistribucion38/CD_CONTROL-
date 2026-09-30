#!/usr/bin/env bash
# uso: _mutar.sh archivo "viejo" "nuevo" prueba.mjs  → debe FALLAR (✗); restaura siempre.
f="$1"; cp "$f" /tmp/claude-0/mut.bak
python3 - "$f" "$2" "$3" <<'PY' || { echo "no encontré: $2"; exit 2; }
import sys
p,a,b=sys.argv[1:4]; s=open(p).read()
if a not in s: sys.exit(1)
open(p,'w').write(s.replace(a,b,1))
PY
salida=$(node "$4" 2>&1 | tail -3)
cp /tmp/claude-0/mut.bak "$f"
if echo "$salida" | grep -q "^✓"; then echo "SOBREVIVIÓ: $2 → $3"; else echo "muerto:     $2"; fi
