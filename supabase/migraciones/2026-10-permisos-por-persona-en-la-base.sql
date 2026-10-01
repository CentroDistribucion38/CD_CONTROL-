-- =====================================================================
-- LO QUE LE DAS A UNA PERSONA A MANO, LA BASE TAMBIÉN LO RESPETA
-- ---------------------------------------------------------------------
-- QUÉ PASABA
-- En Administración → Usuarios le pones a una persona un permiso suelto
-- («Vh Interno (+)» en Editar, por ejemplo). La pantalla lo respeta y le
-- dibuja el botón. Pero al pulsarlo, la base contesta:
--
--     Crear un Vh Interno requiere el permiso «Vh Interno» (Roles)
--
-- Porque casi todas las funciones preguntan `puede_editar(...)`, y esa
-- llega a `mi_nivel(...)`, que SOLO miraba el permiso del rol e ignoraba
-- lo suelto de la persona. Resultado: la pantalla decía que sí y la base
-- que no. Pasaba con cualquier pantalla dada a mano, no solo con ésta.
--
-- EL ARREGLO
-- `mi_nivel` sigue la misma regla de la aplicación (src/lib/permisos.ts):
--   1. quien manda siempre edita;
--   2. si no, lo puesto a la persona (permisos_extra) —incluido «ninguno»,
--      que le quita UNA pantalla que su rol sí da—;
--   3. si no, lo de su rol;
--   4. si no, ninguno.
-- `puede_editar_modulo` (lo usan las políticas de las tablas) cuenta igual.
--
-- No se toca ninguna fila: solo cambia cómo se lee. Se puede correr varias
-- veces.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.mi_nivel(text)') is null then
    raise exception 'Falta supabase/02-roles.sql. Ese va primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'perfiles'
                    and column_name = 'permisos_extra') then
    raise exception 'Falta supabase/03-usuarios.sql. Ese va primero.';
  end if;
end $$;

create or replace function public.mi_nivel(p_seccion text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.manda() then 'editar'
    else coalesce(
      (select nullif(p.permisos_extra ->> p_seccion, '')
         from public.perfiles p where p.id = auth.uid() and p.activo),
      (select rp.nivel::text from public.rol_permisos rp
        where rp.rol = public.mi_rol() and rp.seccion = p_seccion),
      'ninguno')
  end
$$;

create or replace function public.puede_editar_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.manda() or exists (
    select 1
      from (
        /* lo puesto a la persona */
        select e.key as seccion, e.value as nivel
          from public.perfiles p, jsonb_each_text(p.permisos_extra) e
         where p.id = auth.uid() and p.activo
        union all
        /* lo de su rol, salvo las pantallas que la persona tiene puestas a mano */
        select rp.seccion, rp.nivel::text
          from public.perfiles p
          join public.rol_permisos rp on rp.rol = p.rol
         where p.id = auth.uid() and p.activo
           and coalesce(p.permisos_extra ->> rp.seccion, '') = ''
      ) s
     where s.nivel = 'editar'
       and (s.seccion = '/' || p_modulo or s.seccion like '/' || p_modulo || '/%')
  )
$$;

grant execute on function public.mi_nivel(text)             to authenticated;
grant execute on function public.puede_editar_modulo(text)  to authenticated;

commit;
