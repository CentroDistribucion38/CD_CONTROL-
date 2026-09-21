#!/usr/bin/env bash
# =====================================================================
# DOS MÁQUINAS QUE SE SUMAN EN OTRA, contra Postgres de verdad.
#
# Se corre SIN AGRUPAR NADA, como lo corre el editor de Supabase, y la
# migración DOS VECES: tiene que poder correrse varias veces.
#
#   bash .arnes/correr-rotura-linea-sumar.sh
# =====================================================================
set -e
DB=${1:-rl_sumar}
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
         supabase/modulos/rotura-linea.sql \
         supabase/migraciones/2026-09-rotura-linea-tablero-rapido.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1 || { echo "no montó: $f"; exit 1; }
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

# ANTES: comprobar que HOY el CARGADOR sale aparte. Sin esto, que salga
# junto después no demostraría que la migración hizo algo.
echo "--- antes: el CARGADOR tiene que salir aparte"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
do $$
begin
  /* EL HISTÓRICO: dos filas anotadas ANTES de la migración, que se
     quedan. La prueba mira después que sigan diciendo CARGADOR y
     PALE-DEPA — es la única forma de cazar una migración que reescriba
     lo que ya estaba. Las filas que la prueba inserta por su cuenta
     nacen después y no podrían delatarlo. */
  insert into public.rotlinea_registro (fecha, linea, turno, envase, maquina, kg, und) values
    (date '2026-01-02', 1, 1, '3500005',  66, 1, 3),
    (date '2026-01-02', 1, 1, '3500005', 155, 2, 7);
  if exists (select 1 from public.rotlinea_tablero_maquina('2026-01-02','2026-01-02',null) where maquina = 66) then
    raise notice 'Bien: hoy el CARGADOR sale aparte. Es lo que esta migración viene a juntar.';
  else
    raise notice 'OJO: el CARGADOR ya no salía aparte antes de la migración. La prueba no demostraría nada.';
  end if;
end $$;
SQL

echo "--- la migración, dos veces"
$PSQL -d $DB -f supabase/migraciones/2026-09-rotura-linea-sumar-maquinas.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-rotura-linea-sumar-maquinas.sql 2>&1 | grep -E "^ERROR|psql:.*ERROR" && exit 1

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-rotura-linea-sumar.sql 2>&1 | grep -E "NOTICE|ERROR"
