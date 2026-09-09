-- ---------------------------------------------------------------------
-- Campos de "Mi perfil".
-- Se puede correr varias veces sin romper nada.
--
-- Qué NO se agrega aquí a propósito:
--   · usuario y rol ya existen y solo los cambia el administrador.
--   · la contraseña la maneja auth.users, no esta tabla.
-- ---------------------------------------------------------------------

alter table public.perfiles
  -- Dato informativo. Hoy solo hay una bodega; queda como columna para el
  -- día que CONTROL cubra más de un centro.
  add column if not exists bodega text not null default 'Ag01 — Barranquilla',

  -- 1, 2 o 3. Nulo = la persona no lo ha dicho.
  add column if not exists turno_habitual smallint,

  -- Qué abrir al entrar: null = mostrar el selector de módulos.
  add column if not exists modulo_inicio text,

  -- Tablas y botones más grandes en los equipos de piso.
  add column if not exists texto_grande boolean not null default false,

  -- Qué colores ve esta persona. 'oficial' es el azul de siempre;
  -- 'ambar' es la paleta construida sobre #FFC000. El tema solo cambia
  -- COLOR: ni un dato, ni un permiso, ni una cifra dependen de él, así
  -- que dos personas viendo temas distintos ven exactamente lo mismo.
  add column if not exists tema text not null default 'oficial';

alter table public.perfiles
  drop constraint if exists perfiles_turno_habitual_valido;
alter table public.perfiles
  add constraint perfiles_turno_habitual_valido
  check (turno_habitual is null or turno_habitual between 1 and 3);

-- Que no entre un tema que no existe: si mañana alguien escribe
-- 'morado' por API, la pantalla se quedaría sin colores.
alter table public.perfiles
  drop constraint if exists perfiles_tema_valido;
alter table public.perfiles
  add constraint perfiles_tema_valido
  check (tema in ('oficial', 'ambar'));

-- ---------------------------------------------------------------------
-- Cada quien edita SOLO su propio perfil, y solo estas columnas: el
-- disparador rechaza cualquier intento de auto-ascenderse de rol o de
-- cambiarse el usuario desde la pantalla de perfil.
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
  return new;
end;
$$;

drop trigger if exists perfiles_protege_campos on public.perfiles;
create trigger perfiles_protege_campos
  before update on public.perfiles
  for each row execute function public.perfil_campos_protegidos();

drop policy if exists "perfil propio: actualizar" on public.perfiles;
create policy "perfil propio: actualizar"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
