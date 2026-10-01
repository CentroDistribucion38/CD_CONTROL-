#!/usr/bin/env bash
cd /home/claude/cd38-inventario
M=supabase/migraciones/2026-10-fiscal-cruce.sql
mut(){ python3 - "$1" "$2" <<'PY'
import sys
p="supabase/migraciones/2026-10-fiscal-cruce.sql"; s=open(p).read()
a=sys.argv[1].replace("\\n","\n"); b=sys.argv[2].replace("\\n","\n")
if a not in s: print("NOENCONTRE"); sys.exit(3)
open("/tmp/claude-0/mut-fc.sql","w").write(s.replace(a,b,1))
PY
 if [ $? -ne 0 ]; then echo "NO ENCONTRÉ: $1"; return; fi
 if M=/tmp/claude-0/mut-fc.sql bash .arnes/correr-fiscal-cruce.sh >/tmp/claude-0/mut-fc-out.txt 2>&1; then echo "SOBREVIVIÓ: $1 → $2"; else echo "murió: $1"; fi; }
mut "before insert or delete on public.inv_fiscal_conteos" "before update on public.inv_fiscal_conteos"
mut "if not exists (select 1 from public.inv_fiscal_hojas where id = old.hoja_id) then return old; end if;" "if false then return old; end if;"
mut "if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo) then" "if false then"
mut "if v_pub is null then" "if false then"
mut "if v_fecha > (now() at time zone 'America/Bogota')::date then" "if false then"
mut "if v_equipo is null then raise exception 'Esa hoja no es tuya.'" "if false then raise exception 'Esa hoja no es tuya.'"
mut "if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;" "if false then raise exception 'cerrado'; end if;"
mut "t.user_id = o.user_id)" "t.user_id = auth.uid())"
mut "if not public.puede_ver('/inventario/fiscal') then" "if false then"
mut "if not public.puede_editar('/inventario/fiscal') then" "if false then"
mut ") < 2 then" ") < 1 then"
mut "when j.co = j.cb then 'COINCIDE'" "when j.co <= j.cb then 'COINCIDE'"
mut "+ coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas" "+ coalesce(c.cajas, 0))::bigint as cajas"
mut "and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)" "and true"
mut "m.user_id = c.contado_por\n      join public.productos p" "m.equipo = c.equipo\n      join public.productos p"
mut "m.user_id = c.contado_por\n           where c.hoja_id = h.id and m.equipo = 'BAVARIA')" "m.equipo = c.equipo\n           where c.hoja_id = h.id and m.equipo = 'BAVARIA')"
mut "where hoja_id = v_hoja and user_id = v_user)" "where hoja_id = v_hoja)"
mut "where hoja_id = p_hoja and user_id = v_yo;" "where hoja_id = p_hoja and false;"
mut "(case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end)" "0"
mut "when j.cb is null then 'SOLO_OL'" "when j.cb is null then 'DIFIERE'"
mut "on conflict (hoja_id, user_id) do nothing" "on conflict (hoja_id, user_id) do update set termino_en = now()"
echo FIN
