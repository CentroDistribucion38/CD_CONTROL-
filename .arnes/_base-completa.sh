set -u
DB=${DB:-todo}
PSQL="sudo -u postgres psql -q -v ON_ERROR_STOP=1"
$PSQL -c "drop database if exists $DB" >/dev/null 2>&1; $PSQL -c "create database $DB" >/dev/null
$PSQL -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='probador') then create role probador login; end if; end \$\$;" >/dev/null 2>&1
pend=(.arnes/supabase-local.sql supabase/00-nucleo.sql supabase/01-perfil.sql supabase/02-roles.sql supabase/03-usuarios.sql $(ls supabase/modulos/*.sql | grep -v seed) $(ls -tr supabase/migraciones/*.sql | grep -v "rls-rapida\|PENDIENTES" | grep -Ev "${EXCLUIR:-^$}"))
for vuelta in 1 2 3 4 5 6; do
  resto=()
  for f in "${pend[@]}"; do
    if ! $PSQL -d $DB -f "$f" >/tmp/claude-0/todo-err.txt 2>&1; then resto+=("$f"); fi
  done
  echo "vuelta $vuelta: quedan ${#resto[@]}"
  [ ${#resto[@]} -eq 0 ] && break
  [ ${#resto[@]} -eq ${#pend[@]} ] && break
  pend=("${resto[@]}")
done
for f in "${resto[@]}"; do echo "FALLA $f: $($PSQL -d $DB -f "$f" 2>&1 | grep ERROR | head -1)"; done
