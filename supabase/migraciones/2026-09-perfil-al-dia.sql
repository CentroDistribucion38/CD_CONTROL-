-- =====================================================================
-- PONER AL DÍA EL PERFIL: columnas, los siete temas y la protección
-- =====================================================================
-- Se puede correr varias veces sin romper nada, y no importa qué hayas
-- corrido antes.
--
-- Reemplaza tener que correr 01-perfil.sql y la migración de los temas
-- por separado. Va todo junto a propósito: correr 01-perfil.sql suelto
-- REVERTÍA la protección que agregó 03-usuarios.sql, porque los dos
-- archivos traían su propia copia del disparador y la de 01 era vieja.
-- Aquí va una sola, y está escrita para que el orden ya no importe.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Las columnas del perfil.
-- ---------------------------------------------------------------------
alter table public.perfiles
  add column if not exists bodega text not null default 'Ag01 — Barranquilla',
  add column if not exists turno_habitual smallint,
  add column if not exists modulo_inicio text,
  add column if not exists texto_grande boolean not null default false,
  add column if not exists tema text not null default 'oficial';

alter table public.perfiles
  drop constraint if exists perfiles_turno_habitual_valido;
alter table public.perfiles
  add constraint perfiles_turno_habitual_valido
  check (turno_habitual is null or turno_habitual between 1 and 3);

-- ---------------------------------------------------------------------
-- 2. Los SIETE temas. El color vive en globals.css, no aquí: esta regla
--    existe nada más para que un valor escrito a mano no deje a alguien
--    con la aplicación sin colores.
-- ---------------------------------------------------------------------
alter table public.perfiles
  drop constraint if exists perfiles_tema_valido;
alter table public.perfiles
  add constraint perfiles_tema_valido
  check (tema in ('oficial', 'tinta', 'pizarra', 'ambar',
                  'negro', 'gris', 'halo'));

-- ---------------------------------------------------------------------
-- 3. La protección de las columnas que solo toca el administrador.
-- ---------------------------------------------------------------------
create or replace function public.perfil_campos_protegidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El administrador sí puede cambiarlos.
  if public.mi_rol() = 'admin' then
    return new;
  end if;

  if new.rol is distinct from old.rol
     or new.usuario is distinct from old.usuario
     or new.activo is distinct from old.activo
     or new.bodega is distinct from old.bodega then
    raise exception 'Solo el administrador puede cambiar usuario, rol, bodega o estado.';
  end if;

  -- Las dos columnas de 03-usuarios.sql se comparan por jsonb y no por
  -- nombre. Escrito como `new.permisos_extra`, esta función NO COMPILA si
  -- la columna todavía no existe, y entonces 01 y 03 tendrían que correrse
  -- en un orden exacto. Por jsonb, si la columna no está, los dos lados
  -- dan null, null no es distinto de null, y no pasa nada. Así el orden
  -- deja de importar y no hay dos copias del disparador que se pisen: era
  -- eso lo que hacía que correr 01 despues de 03 borrara la proteccion.
  if to_jsonb(new)->'permisos_extra' is distinct from to_jsonb(old)->'permisos_extra' then
    raise exception 'Solo el administrador puede cambiar los permisos.';
  end if;

  -- La clave provisional se puede APAGAR uno mismo —es lo que pasa al
  -- cambiar la contraseña— pero no prender.
  if coalesce((to_jsonb(new)->>'clave_provisional')::boolean, false)
     and not coalesce((to_jsonb(old)->>'clave_provisional')::boolean, false) then
    raise exception 'Solo el administrador puede marcar una clave como provisional.';
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_protege_campos on public.perfiles;
create trigger perfiles_protege_campos
  before update on public.perfiles
  for each row execute function public.perfil_campos_protegidos();

commit;

-- ---------------------------------------------------------------------
-- Comprobación. Si algo falta, revienta aquí con el nombre.
-- ---------------------------------------------------------------------
do $comp$
declare
  falta text;
begin
  select string_agg(c, ', ') into falta
  from unnest(array['bodega','turno_habitual','modulo_inicio','texto_grande','tema']) c
  where not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='perfiles' and column_name=c);
  if falta is not null then
    raise exception 'listo: FALTAN columnas: %', falta;
  end if;

  if not exists (select 1 from pg_constraint where conname='perfiles_tema_valido') then
    raise exception 'listo: falta la regla de los temas';
  end if;

  if not exists (select 1 from pg_trigger where tgname='perfiles_protege_campos') then
    raise exception 'listo: falta el disparador de columnas protegidas';
  end if;

  raise notice 'listo: columnas, los siete temas y la proteccion quedaron puestos';
end
$comp$;
