#!/usr/bin/env bash
# Vh Interno con canal (socio / T1) y envase por material: arma la base con Revisión AI y varios materiales,
# siembra materiales de prueba, aplica la migración DOS veces y corre su prueba.
#   bash .arnes/correr-sider-canal.sh
set -e
export DB=${1:-canal}
export EXCLUIR_EXTRA="sider-vh-interno-canal-socio"
bash .arnes/correr-sider-varios.sh $DB >/tmp/claude-0/canal-base.txt 2>&1 || { tail -15 /tmp/claude-0/canal-base.txt; echo "✗ la base de varios materiales no salió"; exit 1; }
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
M=${M:-supabase/migraciones/2026-09-sider-vh-interno-canal-socio.sql}
$PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/canal-mig.txt || { head -6 /tmp/claude-0/canal-mig.txt; echo "✗ la migración falló la vez 1"; exit 1; }
# materiales de prueba y un socio; uno con el envase puesto a mano
$PSQL -d $DB >/dev/null <<'SQL'
update public.sider_skus set descripcion = 'Envase Costeñita 175R', clase = 'EER', envase_ai = null where sku = 'G175';
insert into public.sider_skus (sku, descripcion, clase, activo) values
  ('TM330','Envase Marron 330R','EER',true), ('TF1000','BOTELLA FLINT 1000R','EER',true),
  ('TCB','ENVASE COSTENA BACANA 320CC R','EER',true), ('TCJ','CAJA PLASTICA MARRON 750cc x 16','Cajas',true),
  ('TX','Envase Marron 999R','EER',true)
on conflict (sku) do update set descripcion = excluded.descripcion, clase = excluded.clase, envase_ai = null;
update public.sider_skus set envase_ai = 'F750' where sku = 'TF1000';
insert into public.sider_ai_socios (clave, nombre, orden) values ('sociox','Socio X',1) on conflict (clave) do nothing;
SQL
$PSQL -d $DB -f $M >/dev/null 2>/tmp/claude-0/canal-mig.txt || { head -6 /tmp/claude-0/canal-mig.txt; echo "✗ la migración falló la vez 2"; exit 1; }
salida=$($PSQL -d $DB -f .arnes/prueba-sider-canal.sql 2>&1) || true
echo "$salida" | grep NOTICE | sed 's/^.*NOTICE:  /    /'
if echo "$salida" | grep -qE "ERROR|FALLA"; then echo "$salida" | grep -vE "NOTICE|^$" | head -25 | sed 's/^/    /'; echo "✗ canal: una comprobación falló"; exit 1; fi
for n in C1 C2 C3 C4; do echo "$salida" | grep -q "NOTICE:  $n ·" || { echo "✗ no corrió $n"; exit 1; }; done
echo "✓ Vh Interno con canal: socio sin documento, T1 con factura, envase por material, la llamada vieja sigue sirviendo."
