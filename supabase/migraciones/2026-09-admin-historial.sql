-- =====================================================================
-- ADMINISTRACIÓN · HISTORIAL DE USUARIOS Y ESTADO DEL SISTEMA
-- ---------------------------------------------------------------------
-- «¿Quién le quitó el acceso a ARENOSA?» Hasta hoy no había cómo
-- contestarlo: quedaba escrito quién cambió un ROL y quién borró DATOS,
-- pero no qué se le hizo a cada PERSONA.
--
--   1. usuarios_historial: a quién, qué (creado, editado, rol, activado,
--      desactivado, clave, eliminado), de qué a qué, quién y cuándo.
--   2. usuarios_lote escribe ahí lo que hace (rol, activar, desactivar).
--   3. usuarios_historial_anotar: lo que hacen las rutas del servidor con
--      la llave de servicio (crear, editar, nueva clave, eliminar). Solo
--      la llave de servicio la puede llamar; quién lo hizo lo dice la
--      ruta, que ya comprobó la sesión.
--   4. admin_existe: para la portada, qué partes de la base ya están
--      (y por tanto qué SQL falta correr).
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.usuarios_historial (
  id          bigint generated always as identity primary key,
  a_quien     uuid,                -- sin llave: el historial sobrevive a la persona
  a_quien_nombre  text,
  a_quien_usuario text,
  accion      text not null check (accion in
                ('creado', 'editado', 'rol', 'activado', 'desactivado', 'clave', 'eliminado')),
  detalle     jsonb not null default '{}'::jsonb,
  hecho_por   uuid,
  hecho_en    timestamptz not null default now()
);
create index if not exists usuarios_historial_quien_idx on public.usuarios_historial (a_quien, hecho_en desc);
create index if not exists usuarios_historial_en_idx on public.usuarios_historial (hecho_en desc);
alter table public.usuarios_historial enable row level security;
drop policy if exists usuarios_historial_ver on public.usuarios_historial;
create policy usuarios_historial_ver on public.usuarios_historial for select to authenticated using (public.manda());
revoke insert, update, delete on public.usuarios_historial from authenticated, anon;
grant select on public.usuarios_historial to authenticated;

create or replace view public.v_usuarios_historial as
select h.*, p.nombre as hecho_nombre
  from public.usuarios_historial h left join public.perfiles p on p.id = h.hecho_por
 where public.manda();
grant select on public.v_usuarios_historial to authenticated;

-- ---------------------------------------------------------------------
-- VARIOS A LA VEZ — el mismo de 2026-09-admin-usuarios.sql, y ahora deja
-- escrito a quién y de qué a qué.
-- ---------------------------------------------------------------------
create or replace function public.usuarios_lote(p_ids uuid[], p_accion text, p_rol text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  if not public.manda() then raise exception 'Solo quien administra cambia usuarios'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No escogiste a nadie'; end if;
  if auth.uid() = any(p_ids) and p_accion in ('rol', 'desactivar') then
    raise exception 'Tú estás en la selección: no puedes cambiarte el rol ni desactivarte desde aquí. Quítate de la selección';
  end if;
  if p_accion = 'rol' then
    if not exists (select 1 from public.roles where clave = p_rol) then raise exception 'Ese rol no existe'; end if;
    insert into public.usuarios_historial (a_quien, a_quien_nombre, a_quien_usuario, accion, detalle, hecho_por)
    select p.id, p.nombre, p.usuario, 'rol',
           jsonb_build_object('de', p.rol, 'de_nombre', r0.nombre, 'a', p_rol, 'a_nombre', r1.nombre), auth.uid()
      from public.perfiles p
      left join public.roles r0 on r0.clave = p.rol
      left join public.roles r1 on r1.clave = p_rol
     where p.id = any(p_ids) and p.rol is distinct from p_rol;
    update public.perfiles set rol = p_rol where id = any(p_ids);
  elsif p_accion in ('activar', 'desactivar') then
    insert into public.usuarios_historial (a_quien, a_quien_nombre, a_quien_usuario, accion, hecho_por)
    select p.id, p.nombre, p.usuario, case when p_accion = 'activar' then 'activado' else 'desactivado' end, auth.uid()
      from public.perfiles p
     where p.id = any(p_ids) and p.activo is distinct from (p_accion = 'activar');
    update public.perfiles set activo = (p_accion = 'activar') where id = any(p_ids);
  else
    raise exception 'Acción desconocida: %', p_accion;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- LO QUE HACEN LAS RUTAS DEL SERVIDOR. p_filas: [{a_quien, nombre,
-- usuario, accion, detalle}]. Solo la llave de servicio.
-- ---------------------------------------------------------------------
create or replace function public.usuarios_historial_anotar(p_hecho_por uuid, p_filas jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.usuarios_historial (a_quien, a_quien_nombre, a_quien_usuario, accion, detalle, hecho_por)
  select nullif(f->>'a_quien', '')::uuid, f->>'nombre', f->>'usuario', f->>'accion',
         coalesce(f->'detalle', '{}'::jsonb), p_hecho_por
    from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) f;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.usuarios_historial_anotar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.usuarios_historial_anotar(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- ¿QUÉ PARTES DE LA BASE YA ESTÁN? 'tabla:public.x' o 'fn:public.f'.
-- ---------------------------------------------------------------------
create or replace function public.admin_existe(p_objetos text[])
returns table (objeto text, existe boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare o text; e boolean;
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  foreach o in array coalesce(p_objetos, '{}') loop
    begin
      if o like 'tabla:%' then e := to_regclass(substr(o, 7)) is not null;
      elsif o like 'fn:%' then e := to_regproc(substr(o, 4)) is not null;
      else e := false; end if;
    exception when others then e := true;   -- varias con el mismo nombre: existe
    end;
    objeto := o; existe := e; return next;
  end loop;
end $$;
revoke all on function public.admin_existe(text[]) from public, anon;
grant execute on function public.admin_existe(text[]) to authenticated;

do $$ begin raise notice 'LISTO: historial de usuarios y estado del sistema.'; end $$;
commit;
