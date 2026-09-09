-- =====================================================================
-- CREAR USUARIOS DESDE LA PLATAFORMA
-- =====================================================================
-- Se puede correr varias veces sin romper nada.
--
-- QUÉ NO HACE ESTE ARCHIVO: crear la cuenta. Eso vive en auth.users y
-- solo se puede tocar con la llave de servicio, desde el servidor
-- (src/app/api/admin/usuarios/route.ts). Aquí van las dos columnas que
-- el perfil necesita y las reglas de quién puede tocarlas.
-- =====================================================================

alter table public.perfiles
  -- La clave que sugiere la plataforma es PROVISIONAL: sirve para el
  -- primer ingreso y nada más. Mientras esto esté en true, la
  -- aplicación no deja pasar a ningún módulo: obliga a cambiarla.
  --
  -- Cuatro dígitos son diez mil combinaciones. Como clave de un rato
  -- está bien; como clave permanente se adivina. Por eso el bloqueo no
  -- es un consejo en pantalla: es la condición para entrar.
  add column if not exists clave_provisional boolean not null default false,

  -- UN MÓDULO EXTRA PARA UNA PERSONA, sin inventarle un rol.
  --
  -- Los permisos son del ROL, y eso está bien: quince personas con el
  -- mismo trabajo se administran una vez. Pero de vez en cuando hay una
  -- excepción —el de portería que además revisa el maestro— y crear un
  -- rol "portería que además revisa el maestro" para una persona
  -- convierte la lista de roles en una lista de personas.
  --
  -- Es un mapa de ruta → nivel: {"/sider/maestro": "editar"}. Se SUMA a
  -- lo que da el rol y nunca resta: quitar un permiso se hace en el rol,
  -- que es donde se ve a quién más afecta.
  add column if not exists permisos_extra jsonb not null default '{}'::jsonb;

-- Que no entre un nivel inventado. Va en una función y no escrito
-- dentro del CHECK porque Postgres no acepta subconsultas ahí: hay que
-- recorrer el jsonb, y recorrerlo es una subconsulta. Se probó.
create or replace function public.permisos_extra_validos(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'object'
     and coalesce(
           (select bool_and(e.value in ('ver', 'editar')) from jsonb_each_text(p) e),
           true)   -- un objeto vacío no tiene nada que validar
$$;

alter table public.perfiles
  drop constraint if exists perfiles_permisos_extra_validos;
alter table public.perfiles
  add constraint perfiles_permisos_extra_validos
  check (public.permisos_extra_validos(permisos_extra));

-- ---------------------------------------------------------------------
-- LAS DOS COLUMNAS NUEVAS SON DEL ADMINISTRADOR.
--
-- Sin esto, cualquiera podría darse permisos_extra desde la pantalla de
-- su propio perfil —la política de "editar mi perfil" le deja escribir
-- su fila— y ascenderse solo. El disparador de columnas protegidas ya
-- existía para rol y usuario; se le agregan estas dos.
-- ---------------------------------------------------------------------
create or replace function public.perfil_campos_protegidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol() = 'admin' then
    return new;
  end if;
  if new.rol is distinct from old.rol
     or new.usuario is distinct from old.usuario
     or new.activo is distinct from old.activo
     or new.bodega is distinct from old.bodega
     or new.permisos_extra is distinct from old.permisos_extra then
    raise exception 'Solo el administrador puede cambiar usuario, rol, bodega, estado o permisos.';
  end if;
  -- La clave provisional sí la puede APAGAR uno mismo: es justo lo que
  -- pasa cuando cambia su contraseña. Prenderla es del administrador.
  if new.clave_provisional and not old.clave_provisional then
    raise exception 'Solo el administrador puede marcar una clave como provisional.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- EL ADMINISTRADOR VE Y EDITA TODOS LOS PERFILES.
-- La pantalla de usuarios necesita listarlos; sin esta política solo
-- vería el suyo y la lista saldría con una sola fila.
-- ---------------------------------------------------------------------
drop policy if exists "perfiles: el admin ve todo" on public.perfiles;
create policy "perfiles: el admin ve todo"
  on public.perfiles for select
  to authenticated
  using (public.mi_rol() = 'admin' or id = auth.uid());

drop policy if exists "perfiles: el admin edita todo" on public.perfiles;
create policy "perfiles: el admin edita todo"
  on public.perfiles for update
  to authenticated
  using (public.mi_rol() = 'admin')
  with check (public.mi_rol() = 'admin');

-- ---------------------------------------------------------------------
-- ¿ESTÁ LIBRE ESE USUARIO?
--
-- La pantalla lo pregunta ANTES de crear, para decirlo mientras se
-- escribe en vez de reventar al guardar. Va como función y no como
-- consulta directa porque quien pregunta puede no tener permiso de leer
-- la tabla entera, y para contestar "sí o no" no hace falta.
-- ---------------------------------------------------------------------
create or replace function public.usuario_libre(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.perfiles
     where lower(btrim(usuario)) = lower(btrim(p_usuario))
  );
$$;

grant execute on function public.usuario_libre(text) to authenticated;
