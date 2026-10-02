#!/usr/bin/env bash
# Mutantes del SQL «la fecha es la del envío»: cada uno debe hacer FALLAR la prueba.
cd /home/claude/cd38-inventario
S=supabase/migraciones/2026-10-fefo-fecha-es-la-del-envio.sql; T=/tmp/pgm/mutsql-envio.sql
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
m "coalesce((c.enviado_en at time zone 'America/Bogota')::date," "coalesce((c.enviado_en at time zone 'UTC')::date,"
m "(c.creado_en  at time zone 'America/Bogota')::date) as fecha_analisis" "(c.creado_en  at time zone 'UTC')::date) as fecha_analisis"
m "coalesce((c.enviado_en at time zone 'America/Bogota')::date," "coalesce((c.creado_en at time zone 'America/Bogota')::date,"
m "enviado_en = case when enviado_en is null then null else least(v_medio, now()) end" "enviado_en = enviado_en"
m "enviado_en = case when enviado_en is null then null else least(v_medio, now()) end" "enviado_en = least(v_medio, now())"
m "least(v_medio, now())" "v_medio"
m "if not public.manda() then" "if false then"
m "if p_fecha > v_hoy then" "if false then"


echo FIN
