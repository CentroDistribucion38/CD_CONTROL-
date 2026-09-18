#!/usr/bin/env bash
# =====================================================================
# EL CRUCE CONTRA SAP, contra Postgres de verdad.
# SE CORRE SIN AGRUPAR NADA, como lo corre el editor de Supabase.
#   bash .arnes/correr-traspasos-cruce.sh
# =====================================================================
set -e
DB=${1:-tp_mov}
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
         supabase/migraciones/2026-09-traspasos-documento.sql \
         supabase/migraciones/2026-09-traspasos-documento-diez.sql ; do
  $PSQL -d $DB -f "$f" >/dev/null 2>&1
done

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
insert into public.traspasos_tipos (clave, nombre, activo, orden) values ('pet','PET',true,1)
on conflict (clave) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2)
on conflict (clave) do update set activo = true;
SQL

# ── LA TABLA VIEJA, CON DATOS DENTRO ────────────────────────────────
# La migración tiene que TRAERSE lo ya importado, no empezar de cero.
# Probarla sobre una base sin nada dejaría sin comprobar justo el paso
# que puede perder datos de producción.
echo "--- el corte de SAP como estaba antes (tabla agrupada, con datos)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-cruce-sap.sql >/dev/null 2>&1
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into public.traspasos_sap
  (referencia, referencia_cruda, fecha, hora, neto, movimientos, cuenta, descripcion)
values
  ('7687000001','7687000001', date '2026-09-10', time '08:00', -28, 3, true,  'VIEJO QUE CUENTA'),
  ('7687000002','7687000002', date '2026-09-10', time '09:00',   0, 2, false, 'VIEJO ANULADO');
SQL

echo "--- la migración nueva, dos veces (tiene que poder correrse varias veces)"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-sap-movimientos.sql 2>&1 | grep -E "NOTICE|ERROR" || true
echo "--- segunda vuelta"
$PSQL -d $DB -f supabase/migraciones/2026-09-traspasos-sap-movimientos.sql 2>&1 | grep -E "^ERROR|psql:.*ERROR" && exit 1

# ── QUE LO VIEJO SIGA DANDO LO MISMO ────────────────────────────────
echo "--- lo que ya estaba importado"
$PSQL -d $DB 2>&1 <<'SQL' | grep -E "NOTICE|ERROR"
do $$
declare v_falla text := '';
begin
  if (select neto from public.v_traspasos_sap where referencia = '7687000001') <> -28 then
    v_falla := v_falla || ' (el documento viejo perdió su neto)'; end if;
  if (select cuenta from public.v_traspasos_sap where referencia = '7687000001') is not true then
    v_falla := v_falla || ' (el documento viejo dejó de contar)'; end if;
  if (select cuenta from public.v_traspasos_sap where referencia = '7687000002') is not false then
    v_falla := v_falla || ' (el viejo anulado empezó a contar)'; end if;
  if (select estado from public.v_traspasos_cruce where documento = '7687000001') <> 'falta' then
    v_falla := v_falla || ' (el viejo desapareció del cruce)'; end if;
  /* EN `elsif` Y NO EN DOS `if`: contar filas de una tabla que no
     existe revienta con un error de Postgres antes de llegar a decir
     que la tabla no existe, que es justo lo que se quería avisar. */
  if to_regclass('public.traspasos_sap_viejo') is null then
    v_falla := v_falla || ' (la tabla vieja se borró en vez de jubilarse)';
  elsif (select count(*) from public.traspasos_sap_viejo) <> 2 then
    v_falla := v_falla || ' (la tabla jubilada perdió sus filas)';
  end if;
  if v_falla <> '' then raise exception 'TRASPASO DE LO VIEJO:%', v_falla; end if;
  raise notice 'LO VIEJO ok';
end $$;
SQL

echo "--- las pruebas"
$PSQL -d $DB -f .arnes/prueba-traspasos-sap-movimientos.sql 2>&1 | grep -E "NOTICE|ERROR"
