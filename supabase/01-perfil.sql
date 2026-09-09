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

  -- Qué colores ve esta persona. El tema solo cambia COLOR: ni un dato,
  -- ni un permiso, ni una cifra dependen de él, así que dos personas
  -- viendo temas distintos ven exactamente lo mismo.
  --   oficial   el azul marino y el rojo de siempre
  --   tinta     el mismo azul marino, acento en ámbar
  --   pizarra   pizarra y turquesa
  --   ambar     grafito y ámbar sobre papel cálido
  --   negro     negro plano y ámbar
  --   gris      gris claro y ámbar (la única barra clara)
  --   halo      negro con resplandor rojo y ámbar
  add column if not exists tema text not null default 'oficial';

alter table public.perfiles
  drop constraint if exists perfiles_turno_habitual_valido;
alter table public.perfiles
  add constraint perfiles_turno_habitual_valido
  check (turno_habitual is null or turno_habitual between 1 and 3);

-- Que no entre un tema que no existe: si mañana alguien escribe
-- 'morado' por API, la pantalla se quedaría sin colores. Al agregar un
-- tema nuevo hay que agregarlo también aquí y en TEMAS de Perfil.tsx.
alter table public.perfiles
  drop constraint if exists perfiles_tema_valido;
alter table public.perfiles
  add constraint perfiles_tema_valido
  check (tema in ('oficial', 'tinta', 'pizarra', 'ambar',
                  'negro', 'gris', 'halo'));

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
  -- Sin sesión no hay nadie a quien impedirle nada: es el servidor
  -- escribiendo con la llave de servicio. Ver la explicación de arriba.
  if auth.uid() is null then
    return new;
  end if;

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

drop policy if exists "perfil propio: actualizar" on public.perfiles;
create policy "perfil propio: actualizar"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
