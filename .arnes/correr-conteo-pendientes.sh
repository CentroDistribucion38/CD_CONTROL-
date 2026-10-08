#!/usr/bin/env bash
# LO PENDIENTE DE CADA UBICACIÓN, contra Postgres de verdad: la base COMPLETA, la migración dos veces y la prueba
# de la pre-anotación (que ahora incluye «de cuatro, uno hoy: salen los tres que faltan» y «ya no está»).
#   bash .arnes/correr-conteo-pendientes.sh
set -e
export DB=conteo_pend
bash .arnes/_base-completa.sh | grep -E "FALLA|quedan 0" || true
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1 || true
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
SQL
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into public.bodegas (codigo, nombre) values ('CD38', 'CD38') on conflict (codigo) do nothing;
insert into public.productos (sku, nombre, cajas_por_estiba, unidades_por_caja, hl)
  select s, 'MATERIAL ' || s, 60, 24, 0.0033 from unnest(array['3128','3130','3134']) s
  on conflict (sku) do nothing;
SQL
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-10-conteo-pendientes-por-ubicacion.sql 2>&1 | grep -E "ERROR|LISTO" ; done
salida=$($PSQL -d $DB -f .arnes/prueba-conteo-preanotacion.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
