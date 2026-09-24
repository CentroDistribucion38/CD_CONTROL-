#!/usr/bin/env bash
# =====================================================================
# EL DOCUMENTO EN NÚMEROS Y CON DIEZ CIFRAS COMO MÁXIMO.
#
# Se monta la base entera —hasta la migración del documento, que ya está
# corrida en producción— y encima se corre la de las diez cifras.
#
# SE CORRE SIN AGRUPAR NADA, como lo corre el editor de Supabase.
#
#   bash .arnes/correr-traspasos-documento-diez.sh
# =====================================================================
set -e
DB=${1:-tp_diez}
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
         supabase/modulos/traspasos.sql \
         supabase/migraciones/2026-09-traspasos-maestro.sql \
         supabase/migraciones/2026-09-traspasos-plan-rejilla.sql \
         supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql \
         supabase/migraciones/2026-09-traspasos-placas.sql \
         supabase/migraciones/2026-09-traspasos-borrar-plan.sql \
         supabase/migraciones/2026-09-traspasos-editar-viaje.sql \
         supabase/migraciones/2026-09-traspasos-registro-atrasado.sql \
         supabase/migraciones/2026-09-traspasos-documento.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
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
SQL

# ---------------------------------------------------------------------
# ANTES DE LA MIGRACIÓN: comprobar que HOY SÍ entra un documento largo.
#
# Sin esto la prueba de después no demostraría nada — podría ser que ya
# estuviera prohibido y la migración no hiciera falta.
# ---------------------------------------------------------------------
echo "--- antes: hoy un documento de veinte cifras tiene que entrar"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
begin
  /* SE DESHACE CON UNA EXCEPCIÓN A PROPÓSITO, no con un delete.
     Lo escribí con `delete` y el probador —que es quien tiene que
     probarlo, porque es el rol de la app— NO PUEDE BORRAR de esa tabla:
     el delete reventaba, caía en el `exception when others`, y el arnés
     informaba «ya estaba prohibido» cuando lo que estaba prohibido era
     el borrado. Un aviso que dice lo contrario de lo que pasó es peor
     que ninguno.

     Un `raise` dentro del bloque interno deshace lo que ese bloque
     escribió, que es exactamente lo que hace falta: se comprueba que
     entra y no queda la fila. */
  begin
    perform public.traspaso_registrar(
      public.traspaso_hoy(),'A','pet','ANT001','ag01','planta',1,
      false, null, null, null, '12345678901234567890');
    raise exception 'SI-ENTRA';
  exception when others then
    if sqlerrm = 'SI-ENTRA' then
      raise notice 'Bien: hoy entra un documento de veinte cifras. Es lo que esta migración viene a cerrar.';
    else
      raise notice 'OJO: ya estaba prohibido (%). La migración no prueba nada.', sqlerrm;
    end if;
  end;
end $$;
reset role;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-documento-diez.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-documento-diez.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-documento-diez.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
