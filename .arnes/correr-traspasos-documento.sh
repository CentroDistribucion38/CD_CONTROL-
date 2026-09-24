#!/usr/bin/env bash
# =====================================================================
# EL ARNÉS DEL DOCUMENTO DEL VIAJE, de punta a punta.
#
# Levanta una base NUEVA cada vez. No es por limpieza: una prueba que
# corre sobre lo que dejó la anterior pasa la primera vez y falla la
# segunda con un «documento repetido» que es de la prueba y no del
# código — y entonces media hora se va buscando un error que no existe.
# Pasó, y por eso este archivo existe en vez de una línea de psql.
#
#   bash .arnes/correr-traspasos-documento.sh
# =====================================================================
set -e
DB=${1:-tp_doc}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists $DB" >/dev/null
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
         supabase/migraciones/2026-09-traspasos-registro-atrasado.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

# UN VIAJE DE ANTES DE LA MIGRACIÓN. Se registra con la función VIEJA,
# así que queda sin documento — que es exactamente lo que hay hoy en la
# base de la bodega. Sin esta fila no se puede comprobar que la
# migración no rompe lo que ya está, ni que la vista lo marca.
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
/* EL ADMINISTRADOR VA PRIMERO. El núcleo no deja que la plataforma se
   quede sin nadie que administre, así que sembrar al supervisor solo
   revienta con «Quedaría nadie activo que administre». */
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1)
on conflict (clave) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2)
on conflict (clave) do update set activo = true;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
select public.traspaso_registrar(public.traspaso_hoy(),'A','pet','VIE001','ag01','planta',1);
reset role;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-documento.sql 2>&1 | grep -E "NOTICE|ERROR" || true
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-documento.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-documento.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
