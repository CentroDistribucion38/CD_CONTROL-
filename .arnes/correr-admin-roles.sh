#!/usr/bin/env bash
# ROLES: borrar pasando usuarios, duplicar e historial, contra la base completa.
#   bash .arnes/correr-admin-roles.sh
set -e
export DB=adm_roles
export EXCLUIR="admin-roles|roles-supervisor-borrable"
bash .arnes/_base-completa.sh >/dev/null
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -d $DB -c "grant probador to postgres; grant authenticated to probador; grant select on all tables in schema public to probador;" >/dev/null 2>&1 || true
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-admin-roles.sql 2>&1 | grep -E "ERROR|LISTO"; done
$PSQL -d $DB -f .arnes/prueba-admin-roles.sql 2>&1 | grep -E "NOTICE|ERROR"
# Supervisor borrable y firmas de roturas por permiso de pantalla.
# ANTES de migrar: un rol «otro» con Editar en las cuatro pantallas de firma
# y un verificador con Editar en Verificación. Después: «otro» no firma
# nada (se le bajó a Ver) y el verificador sigue firmando lo suyo.
$PSQL -d $DB >/dev/null 2>&1 <<'SQL'
insert into public.roles (clave, nombre) values ('otro','Otro'), ('verificador','Verificador') on conflict do nothing;
insert into public.rol_permisos (rol, seccion, nivel) values
  ('otro','/roturas/en-sitio/visto-bueno','editar'), ('otro','/roturas/salida','editar'),
  ('otro','/roturas/salida/verificacion','editar'), ('otro','/roturas/salida/validacion','editar'),
  ('verificador','/roturas/salida/verificacion','editar')
on conflict (rol, seccion) do update set nivel = excluded.nivel;
SQL
for i in 1 2; do $PSQL -d $DB -f supabase/migraciones/2026-09-roles-supervisor-borrable.sql 2>&1 | grep -E "ERROR|LISTO|Firma|bajadas"; done
$PSQL -d $DB -f .arnes/prueba-roles-supervisor.sql 2>&1 | grep -E "NOTICE|ERROR"
$PSQL -d $DB -At -c "select case when (select count(*) from rol_permisos where rol='otro' and nivel='editar' and seccion like '/roturas/%')=0 and (select nivel::text from rol_permisos where rol='verificador' and seccion='/roturas/salida/verificacion')='editar' then 'FIRMAS IGUALES ok' else 'FIRMAS: un rol ganó o perdió una firma que no debía' end"
