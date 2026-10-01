#!/usr/bin/env bash
cd /home/claude/cd38-inventario
S=supabase/migraciones/2026-10-fiscal-contar.sql; T=/tmp/claude-0/mutsql-fcont.sql
m(){
  python3 - "$S" "$T" "$1" "$2" <<'PY' || { echo "no encontré: $1"; return; }
import sys
s=open(sys.argv[1]).read(); a,b=sys.argv[3:5]
if a not in s: sys.exit(1)
open(sys.argv[2],'w').write(s.replace(a,b,1))
PY
  salida=$(M=$T bash .arnes/correr-fiscal-contar.sh fcontmut 2>&1 | tail -2)
  if echo "$salida" | grep -q "^✓"; then echo "SOBREVIVIÓ: $1 → $2"; else echo "muerto:     $1"; fi
}
m "if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;" ""
m "if v_pub is null then raise exception" "if false then raise exception"
m "if v_fecha > (now()" "if false and v_fecha > (now()"
m "if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;" ""
m "if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then" "if false then"
m "if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then" "if false then"
m "if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then" "if false then"
m "(hoja_id, contado_por, ubicacion_id, producto_id, venc_dia, venc_mes, venc_anio) nulls not distinct" "(hoja_id, contado_por, ubicacion_id, producto_id, venc_dia, venc_mes, venc_anio)"
m "(hoja_id, contado_por, ubicacion_id, producto_id, venc_dia, venc_mes, venc_anio) nulls not distinct" "(hoja_id, contado_por, ubicacion_id, producto_id) nulls not distinct"
m "for select to authenticated using (public.manda());" "for select to authenticated using (true);"
m "where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by" "where c.hoja_id = p_hoja
   order by"
m "where c.id = p_id and c.contado_por = auth.uid();" "where c.id = p_id;"
m "delete from public.inv_fiscal_conteos where id = p_id and contado_por = auth.uid();" "delete from public.inv_fiscal_conteos where id = p_id;"
m "if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  delete" "delete"
m "and exists (select 1 from public.inv_fiscal_conteos where hoja_id = old.id) then" "and false then"
m "(f.fecha <= (now() at time zone 'America/Bogota')::date)," "(f.fecha < (now() at time zone 'America/Bogota')::date),"
m "where c.hoja_id = h.id and c.contado_por = auth.uid())" "where c.hoja_id = h.id)"
m "constraint inv_fiscal_conteos_cajas_sola check (cajas is null or (estibas is null and saldo is null))," ""
m "  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if v_fecha >" "  if v_fecha >"
