#!/usr/bin/env bash
# =====================================================================
# FACTURACIÓN DE TRASPASOS, contra Postgres de verdad.
#
# Antes de migrar se dejan viajes como los hay hoy —con el número de SAP
# escrito en «Documento», de hoy y de un día ya cerrado, y un vacío— para
# comprobar que la migración se los trae bien. La migración corre DOS
# VECES, sin agrupar, como la corre el editor de Supabase.
#
#   bash .arnes/correr-traspasos-facturacion.sh
# =====================================================================
set -e
DB=${1:-tp_fact}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
MIG=${MIG:-supabase/migraciones/2026-09-traspasos-facturacion.sql}

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
         supabase/modulos/traspasos.sql \
         supabase/migraciones/2026-09-traspasos-maestro.sql \
         supabase/migraciones/2026-09-traspasos-plan-rejilla.sql \
         supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql \
         supabase/migraciones/2026-09-traspasos-placas.sql \
         supabase/migraciones/2026-09-traspasos-borrar-plan.sql \
         supabase/migraciones/2026-09-traspasos-editar-viaje.sql \
         supabase/migraciones/2026-09-traspasos-registro-atrasado.sql \
         supabase/migraciones/2026-09-traspasos-documento.sql \
         supabase/migraciones/2026-09-traspasos-documento-diez.sql \
         supabase/migraciones/2026-09-traspasos-dia-cerrado.sql \
         supabase/migraciones/2026-09-traspasos-varios-tipos.sql \
         supabase/migraciones/2026-09-traspasos-cruce-sap.sql \
         supabase/migraciones/2026-09-traspasos-sap-movimientos.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1 || { echo "no montó: $f"; exit 1; }
done

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('55555555-5555-5555-5555-555555555555','fac@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.rol_permisos (rol, seccion, nivel) values ('supervisor','/traspasos','editar')
on conflict (rol, seccion) do update set nivel = 'editar';
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1)
on conflict (clave) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2)
on conflict (clave) do update set activo = true;
SQL

# ── LOS VIAJES COMO ESTÁN HOY ───────────────────────────────────────
# El jefe registra: puede hacerlo en un día cerrado, y así queda uno.
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
select public.traspaso_registrar(public.traspaso_hoy(), 'A', 'pet', 'OLD111', 'ag01', 'planta', 1,
  false, 50, null, 'antes: SAP en documento', '7687000001');
select public.traspaso_registrar(public.traspaso_hoy() - 5, 'A', 'pet', 'OLD222', 'ag01', 'planta', 1,
  false, 40, null, 'antes, día cerrado', '7687000002');
select public.traspaso_registrar(public.traspaso_hoy(), 'A', null, null, null, null, 2,
  true, null, null, 'vacíos de antes', null);
SQL

echo "--- la migración, dos veces"
$PSQL -d $DB -f "$MIG" 2>&1 | grep -E "NOTICE:  (LISTO|Viajes)|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f "$MIG" 2>&1 | grep -E "^ERROR|psql:.*ERROR" && exit 1

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('55555555-5555-5555-5555-555555555555','fac','Fanny Factura','facturacion',true)
on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, activo = true;
SQL

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-traspasos-facturacion.sql 2>&1 | grep -E "NOTICE|ERROR"
