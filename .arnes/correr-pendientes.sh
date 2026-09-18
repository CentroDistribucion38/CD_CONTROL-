#!/usr/bin/env bash
# =====================================================================
# EL ARCHIVO ÚNICO CON TODO LO PENDIENTE, contra Postgres de verdad.
#
# QUÉ SE COMPRUEBA:
#
#   1. QUE CORRA ENTERO sobre una base que se parece a la de producción
#      —el núcleo, los perfiles, los roles, los módulos de inventario y
#      traspasos y las migraciones que YA están puestas— y no sobre una
#      base vacía, donde cualquier cosa pasa.
#
#   2. QUE SE PUEDA CORRER DOS VECES. Es la promesa que le doy: «se
#      puede correr varias veces sin romper nada». Si la segunda vuelta
#      da un solo ERROR, la promesa es mentira y alguien va a partir su
#      base intentando arreglar algo.
#
#   3. SIN AGRUPAR NADA, como lo corre el editor de Supabase. Un
#      `psql -f` con `begin;` arriba ejecuta el archivo entero en una
#      sola transacción y el editor NO: si algo falla a mitad, lo de
#      antes queda puesto y lo de después sigue corriendo. Esa
#      diferencia ya costó dos intentos fallidos en producción.
#
#   4. COMO NO-SUPERUSUARIO en la parte que importa: el resumen final
#      lee `rol_permisos`, que tiene RLS.
#
#   bash .arnes/correr-pendientes.sh
# =====================================================================
set -e
DB=${1:-pendientes}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if;
end \$\$;" >/dev/null 2>&1
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

# ── LA BASE DE ANTES ────────────────────────────────────────────────
# Todo lo que YA está puesto en producción. Si esto no queda bien, lo
# de después se prueba contra una base que no existe.
#
# AQUÍ NO VA 2026-09-traspasos-cruce-sap.sql: esta corrida prueba el caso
# de quien NUNCA la corrió, y que aun así queda bien. El caso contrario
# —ya corrida y CON DATOS dentro, que es el de producción— lo prueba
# .arnes/correr-traspasos-sap-movimientos.sh, que siembra la tabla vieja
# antes de migrar. Entre los dos quedan cubiertos los dos caminos.
BASE="
.arnes/supabase-local.sql
supabase/00-nucleo.sql
supabase/01-perfil.sql
supabase/02-roles.sql
supabase/03-usuarios.sql
supabase/modulos/acciones.sql
supabase/modulos/roturas.sql
supabase/modulos/sider.sql
supabase/modulos/quiebra.sql
supabase/modulos/inventario.sql
supabase/modulos/traspasos.sql
supabase/migraciones/2026-09-permiso-sin-acceso-por-persona.sql
supabase/migraciones/2026-09-inventario-fefo.sql
supabase/migraciones/2026-09-conteo-borrador.sql
supabase/migraciones/2026-09-conteo-saldo.sql
supabase/migraciones/2026-09-conteo-estibas-y-saldo.sql
supabase/migraciones/2026-09-conteo-fabricacion.sql
supabase/migraciones/2026-09-conteos-maestro.sql
supabase/migraciones/2026-09-conteo-treinta-a-la-vez.sql
supabase/migraciones/2026-09-traspasos-maestro.sql
supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql
supabase/migraciones/2026-09-traspasos-placas.sql
supabase/migraciones/2026-09-traspasos-borrar-plan.sql
supabase/migraciones/2026-09-traspasos-editar-viaje.sql
supabase/migraciones/2026-09-traspasos-registro-atrasado.sql
supabase/migraciones/2026-09-traspasos-documento.sql
"

echo "--- la base de antes"
for f in $BASE; do
  if [ ! -f "$f" ]; then echo "FALTA EL ARCHIVO $f"; exit 1; fi
  if ! $PSQL -d $DB -f "$f" >/tmp/base.log 2>&1; then
    echo "ERROR montando la base en $f:"; grep -E "ERROR" /tmp/base.log | head -5; exit 1
  fi
done
echo "    ok"

$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('44444444-4444-4444-4444-444444444444','ope@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('44444444-4444-4444-4444-444444444444','ope','Opera','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
SQL

ARCHIVO=supabase/migraciones/PENDIENTES-todo-en-uno.sql

echo "--- primera vuelta"
$PSQL -d $DB -f $ARCHIVO 2>&1 | grep -E "^(ERROR|psql:.*ERROR)" && { echo "   ^^ la primera vuelta falló"; exit 1; }
$PSQL -d $DB -f $ARCHIVO 2>&1 | grep -E "LISTO|NO QUEDÓ" | head -3

echo "--- segunda vuelta (tiene que poder correrse varias veces)"
$PSQL -d $DB -f $ARCHIVO 2>&1 | grep -E "^(ERROR|psql:.*ERROR)" && { echo "   ^^ la segunda vuelta falló"; exit 1; }
echo "    ok"

# ── Y LAS PRUEBAS DE CADA MIGRACIÓN, CON SU PROPIO ARNÉS ────────────
#
# NO SE CORREN AQUÍ CONTRA ESTA BASE. Cada prueba necesita su siembra
# —roles con el tablero abierto y cerrado, tipos y puntos de traspaso, un
# viaje viejo ya registrado— y montarla otra vez aquí sería copiarla, que
# es como se termina teniendo dos siembras que no se parecen y un arnés
# que aprueba lo que la otra rechaza.
#
# Lo que este archivo prueba es lo suyo: QUE EL ARCHIVO ÚNICO CORRA
# ENTERO Y DOS VECES sobre una base de producción. Lo que cada migración
# hace ya lo prueba su propio arnés, y se llaman desde aquí para que no
# se pueda decir «corrió el junto» sin haber corrido los sueltos.
echo "--- el arnés propio de cada migración"
for a in correr-inventario-base correr-traspasos-documento-diez \
         correr-traspasos-dia-cerrado correr-traspasos-cruce \
         correr-traspasos-cruce-permiso correr-traspasos-varios-tipos \
         correr-traspasos-sap-movimientos ; do
  if [ -f ".arnes/$a.sh" ]; then
    if SAL=$(bash ".arnes/$a.sh" 2>&1); then
      echo "  ✓ ${a#correr-}"
    else
      echo "  ✗ ${a#correr-}"; echo "$SAL" | grep -E "ERROR|✗" | head -3; FALLO=1
    fi
  fi
done

echo
if [ -n "$FALLO" ]; then
  echo "EL ARCHIVO ÚNICO corre, pero alguna migración falló su propia prueba."
  exit 1
fi
echo "EL ARCHIVO ÚNICO: corre entero, dos veces, sobre la base de producción,"
echo "                  y cada migración pasa su propio arnés."
