#!/usr/bin/env bash
# =====================================================================
# ESTIBAS COMPLETAS **Y** CAJAS SUELTAS, contra Postgres de verdad.
#
# Se corre SIN AGRUPAR NADA, como lo corre el editor de Supabase: un
# `psql -f` con `begin;` arriba ejecuta el archivo entero en una sola
# transacción y el editor no, y esa diferencia ya me costó dos intentos
# fallidos en producción.
#
#   bash .arnes/correr-conteo-estibas-y-saldo.sh
# =====================================================================
set -e
DB=${1:-fefo_es}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if;
end \$\$;" >/dev/null 2>&1
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

for f in .arnes/supabase-local.sql \
         supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql \
         supabase/modulos/inventario.sql \
         supabase/migraciones/2026-09-inventario-fefo.sql \
         supabase/datos/inventario-maestro-cd38.sql \
         supabase/migraciones/2026-09-conteo-borrador.sql \
         supabase/migraciones/2026-09-conteo-saldo.sql \
         supabase/migraciones/2026-09-conteo-treinta-a-la-vez.sql \
         supabase/migraciones/2026-09-conteo-fabricacion.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
SQL

# ---------------------------------------------------------------------
# ANTES DE LA MIGRACIÓN: comprobar que la regla vieja DE VERDAD estorba.
#
# Sin esto, la prueba de después no demostraría nada — podría ser que
# estibas + saldo ya se pudiera y la migración no hiciera falta. Se
# comprueba que HOY no se puede, y después que SÍ se puede.
# ---------------------------------------------------------------------
echo "--- antes: la regla vieja tiene que estorbar"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
declare v_bod uuid; v_prod uuid; v_ubi uuid; v_con uuid;
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  select id into v_prod from public.productos where sku = '3128';
  select id into v_ubi from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER';
  insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en)
  values ('FEFO-ANTES', v_bod, 'fefo', 'en_proceso',
          '11111111-1111-1111-1111-111111111111', now())
  on conflict (codigo) do update set estado = 'en_proceso' returning id into v_con;
  begin
    insert into public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, estibas, saldo, rotacion,
       venc_dia, venc_mes, venc_anio, cantidad_teorica)
    values (v_con, v_prod, v_ubi, 12, 8, false, 11, 3, 27, 0);
    raise notice 'OJO: estibas + saldo YA se podía antes de la migración. La migración no prueba nada.';
  exception when check_violation then
    raise notice 'Bien: hoy la base rechaza estibas + saldo. Es lo que esta migración viene a soltar.';
  end;
  delete from public.conteo_lineas where conteo_id = v_con;
end $$;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-conteo-estibas-y-saldo.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-conteo-estibas-y-saldo.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-conteo-estibas-y-saldo.sql 2>&1 | grep -E "NOTICE|ERROR"
