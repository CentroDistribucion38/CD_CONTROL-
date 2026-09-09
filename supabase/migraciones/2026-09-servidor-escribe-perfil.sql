-- =====================================================================
-- EL SERVIDOR PUEDE COMPLETAR UN PERFIL RECIÉN CREADO
-- =====================================================================
-- Se puede correr varias veces sin romper nada.
--
-- EL SÍNTOMA
--   "La cuenta de X quedó creada, pero su perfil no se pudo completar:
--    Solo el administrador puede marcar una clave como provisional."
--
-- LA CAUSA
-- El disparador perfil_campos_protegidos pregunta public.manda(), y
-- manda() mira el rol de auth.uid(). Cuando quien escribe es el SERVIDOR
-- con la llave de servicio no hay sesión: auth.uid() es nulo, manda()
-- da falso, y el disparador rebota su propia escritura. La cuenta queda
-- creada en auth.users y el perfil a medias — justo lo que el upsert
-- venía a evitar.
--
-- POR QUÉ DEJARLO PASAR NO ABRE UN HUECO
-- Las dos políticas de UPDATE de perfiles exigen sesión:
--     "perfil propio: actualizar"     using (id = auth.uid())
--     "perfiles: el admin edita todo" using (public.mi_rol() = 'admin')
-- Con auth.uid() nulo ninguna de las dos casa, así que una petición
-- anónima NUNCA llega hasta el disparador. El único que llega sin sesión
-- es la llave de servicio, que se salta el RLS entero por diseño y ya
-- tiene la llave del edificio: bloquearla aquí no protegía nada, solo
-- rompía.
--
-- El disparador existe para que un OPERADOR CON SESIÓN no se ascienda
-- solo desde la pantalla de su perfil. Eso sigue igual de cerrado.
-- =====================================================================

begin;

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

commit;

do $comp$
begin
  if not exists (select 1 from pg_trigger where tgname = 'perfiles_protege_campos') then
    raise exception 'listo: el disparador no quedó puesto';
  end if;
  raise notice 'listo: el servidor ya puede completar un perfil, y un operador sigue sin poder ascenderse';
end
$comp$;
