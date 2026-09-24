#!/usr/bin/env bash
# =====================================================================
# REGISTRAR UN VIAJE ADELANTADO — contra Postgres de verdad.
#
# SE MONTA LA BASE COMPLETA (todas las migraciones menos esta) y
# después se corre esta, DOS VECES, como la corre el editor de
# Supabase. Así la prueba ve la misma base que la bodega: con el
# candado del día cerrado, con facturación y con el día operativo que
# arranca a las 22:00.
#
#   bash .arnes/correr-traspasos-adelantado.sh
# =====================================================================
set -e
export DB=${1:-tp_adel}
export EXCLUIR="registro-adelantado"
source .arnes/_base-completa.sh
sudo -u postgres psql -q -d $DB -c "grant probador to postgres; grant authenticated to probador;" >/dev/null 2>&1

PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"

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
# ANTES: comprobar que HOY el viaje de mañana NO entra.
# Sin esto la prueba de después no demostraría nada — podría ser que ya
# entrara y la migración no hiciera falta.
# ---------------------------------------------------------------------
echo "--- antes: el viaje de manana NO entra"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" || true
set client_min_messages = notice;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
begin
  begin
    perform public.traspaso_registrar(public.traspaso_hoy() + 1,'A','pet','ANT001','ag01','planta',1);
    raise notice 'OJO: ya entraba. La migracion no prueba nada.';
  exception when others then
    if sqlerrm like '%todavía no ha pasado%' then
      raise notice 'Bien: hoy rechaza el viaje de manana. Es lo que esta migracion viene a abrir.';
    else
      raise notice 'OJO: rechazo por otra cosa (%)', sqlerrm;
    end if;
  end;
end $$;
reset role;
SQL

echo "--- la migración, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-registro-adelantado.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-registro-adelantado.sql 2>&1 | grep -E "ERROR" && exit 1

echo "--- las pruebas"
salida=$($PSQL -d $DB -f .arnes/prueba-traspasos-adelantado.sql 2>&1) || true; echo "$salida" | grep -E "NOTICE|ERROR" || true
# Y SE FALLA DE VERDAD: ver la palabra FALLA en pantalla y que el
# script salga 0 es lo que hizo que esto pasara por verde meses.
if echo "$salida" | grep -qE "FALLA:|^psql.*ERROR"; then exit 1; fi
