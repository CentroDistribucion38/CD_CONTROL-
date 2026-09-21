-- =====================================================================
-- ADMINISTRACIÓN · USUARIOS A OTRO NIVEL
-- ---------------------------------------------------------------------
-- Lo que la pantalla de Usuarios necesita y la base no daba:
--
--   usuarios_ingreso()   la última vez que cada persona entró (vive en
--                        auth.users, que la aplicación no puede leer).
--   usuarios_rastro()    cuántos registros ha dejado cada persona en toda
--                        la base: viajes, pesadas, reportes, firmas… Es
--                        lo que decide si se puede ELIMINAR de verdad
--                        (cero registros) o solo desactivar (para no
--                        perder quién hizo qué).
--   usuarios_lote()      cambiar el rol, activar o desactivar a varios a
--                        la vez, en una sola transacción.
--
-- Todo solo para quien administra (manda()). El candado de perfiles
-- (perfiles_candado_trg) sigue debajo: nunca queda la plataforma sin
-- alguien activo que la administre. Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. EL ÚLTIMO INGRESO
-- ---------------------------------------------------------------------
create or replace function public.usuarios_ingreso()
returns table (id uuid, ultimo_ingreso timestamptz, creado timestamptz)
language plpgsql stable security definer
set search_path = public, auth
as $$
begin
  if not public.manda() then raise exception 'Solo quien administra ve los ingresos'; end if;
  return query select u.id, u.last_sign_in_at, u.created_at
                 from auth.users u join public.perfiles p on p.id = u.id;
end $$;

-- ---------------------------------------------------------------------
-- 2. EL RASTRO: toda columna que apunta a una persona.
--    Las que tienen llave hacia perfiles o auth.users, y además las uuid
--    que se llaman «…_por» aunque no tengan llave (firmado_por,
--    generado_por, salida_por…). No cuenta perfiles ni la lista de
--    asignables de Acciones, que se van con la persona.
-- ---------------------------------------------------------------------
create or replace function public.usuarios_rastro(p_ids uuid[] default null)
returns table (id uuid, registros bigint)
language plpgsql stable security definer
set search_path = public
as $$
declare c record; v_sql text := '';
begin
  if not public.manda() then raise exception 'Solo quien administra ve el rastro de los usuarios'; end if;
  for c in
    select distinct x.tabla, x.columna from (
      select cl.relname::text tabla, a.attname::text columna
        from pg_constraint k
        join pg_class cl on cl.oid = k.conrelid
        join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       where k.contype = 'f' and array_length(k.conkey, 1) = 1
         and k.confrelid in ('public.perfiles'::regclass, 'auth.users'::regclass)
      union
      select c2.table_name::text, c2.column_name::text
        from information_schema.columns c2
        join information_schema.tables t2 on t2.table_schema = c2.table_schema and t2.table_name = c2.table_name
       where c2.table_schema = 'public' and t2.table_type = 'BASE TABLE'
         and c2.data_type = 'uuid' and c2.column_name like '%\_por'
    ) x
    where x.tabla not in ('perfiles', 'acciones_asignables', 'admin_borrados', 'roles_historial')
  loop
    v_sql := v_sql || case when v_sql = '' then '' else ' union all ' end ||
      format('select %I as id, count(*) as n from public.%I where %I is not null group by 1', c.columna, c.tabla, c.columna);
  end loop;
  if v_sql = '' then return; end if;
  return query execute format(
    'select p.id, coalesce(sum(r.n), 0)::bigint from public.perfiles p left join (%s) r on r.id = p.id
      where $1 is null or p.id = any($1) group by p.id', v_sql) using p_ids;
end $$;

-- ---------------------------------------------------------------------
-- 3. VARIOS A LA VEZ
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
    update public.perfiles set rol = p_rol where id = any(p_ids);
  elsif p_accion = 'activar' then
    update public.perfiles set activo = true where id = any(p_ids);
  elsif p_accion = 'desactivar' then
    update public.perfiles set activo = false where id = any(p_ids);
  else
    raise exception 'Acción desconocida: %', p_accion;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.usuarios_ingreso() from public, anon;
revoke all on function public.usuarios_rastro(uuid[]) from public, anon;
revoke all on function public.usuarios_lote(uuid[], text, text) from public, anon;
grant execute on function public.usuarios_ingreso() to authenticated;
grant execute on function public.usuarios_rastro(uuid[]) to authenticated;
grant execute on function public.usuarios_lote(uuid[], text, text) to authenticated;

do $$ begin raise notice 'LISTO: usuarios con último ingreso, rastro y cambios de a varios.'; end $$;
commit;
