#!/usr/bin/env bash
# uso: _mut-sql.sh migracion.sql runner.sh "viejo" "nuevo"  → debe FALLAR (✗); no toca la migración: usa .arnes/_mut.sql
python3 - "$1" "$3" "$4" <<'PY' || { echo "no encontré: $3"; exit 2; }
import sys
s=open(sys.argv[1]).read()
if sys.argv[2] not in s: sys.exit(1)
open('.arnes/_mut.sql','w').write(s.replace(sys.argv[2],sys.argv[3],1))
PY
r=$(M=.arnes/_mut.sql timeout 170 bash "$2" 2>&1 | tail -1)
rm -f .arnes/_mut.sql
case "$r" in ✓*) echo "SOBREVIVIÓ: $3";; *) echo "muerto:     $3";; esac
