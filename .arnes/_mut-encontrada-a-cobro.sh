#!/usr/bin/env bash
# Mutantes de la migración «encontrada → cobro»: cada uno debe hacer FALLAR su prueba.
cd /home/claude/cd38-inventario
F=supabase/migraciones/2026-10-roturas-encontrada-a-cobro.sh
SRC=supabase/migraciones/2026-10-roturas-encontrada-a-cobro.sql
mut(){ python3 - "$SRC" "$1" "$2" /tmp/claude-0/mutante-enc.sql <<'PY' || { echo "no encontré: $1"; return; }
import sys
src,a,b,out=sys.argv[1:5]; s=open(src).read()
if a not in s: sys.exit(1)
open(out,'w').write(s.replace(a,b,1))
PY
  if M=/tmp/claude-0/mutante-enc.sql bash .arnes/correr-encontrada-a-cobro.sh >/tmp/claude-0/mut-enc-out.txt 2>&1; then echo "SOBREVIVIÓ: $1"; else echo "muerto:     $1"; fi
}
mut "if p_origen = 'encontrada' and v.estado = 'esperando' and v.ol_respuesta is null then" "if p_origen = 'opm' and v.estado = 'esperando' and v.ol_respuesta is null then"
mut "and v.estado = 'esperando' and v.ol_respuesta is null then
    update" "and v.estado = 'esperando' then
    update"
mut "if v.origen = 'encontrada' and v.estado = 'cuenta' and v.ol_respuesta is null then" "if false then"
mut "decidida_por = auth.uid(), decidida_en = now()," "decidida_por = null, decidida_en = null,"
mut "where origen = 'encontrada' and estado = 'esperando' and ol_respuesta is null;" "where origen = 'encontrada' and estado = 'esperando';"
mut "set estado = 'cuenta',
           decidida_por = auth.uid()" "set estado = 'cuenta', ol_respuesta = 'acepta', ol_en = now(),
           decidida_por = auth.uid()"
echo FIN
