-- =====================================================================
-- ADMINISTRACIÓN · ROLES A OTRO NIVEL
-- ---------------------------------------------------------------------
-- «No me deja eliminar un rol.» La base frenaba bien —un rol de sistema
-- no se borra y uno con usuarios tampoco—, pero la pantalla no daba
-- salida: había que ir a Usuarios, cambiar a cada persona de rol, volver
-- y bajar al final de 43 pantallas a buscar el botón.
--
-- ESTE ARCHIVO:
--   1. rol_borrar(clave, mover_a): pasa a sus usuarios al rol que se
--      diga y borra el rol, en un solo paso y en una sola transacción.
--      Los de sistema (Administrador, Supervisor, Operador) siguen sin
--      borrarse: la aplicación los usa por su clave.
--   2. rol_crear(clave, nombre, descripcion, copiar_de): crear un rol, o
--      DUPLICAR uno con todos sus permisos.
--   3. EL HISTORIAL: roles_historial guarda cada cambio —permisos que
--      cambiaron (de qué a qué), rol creado, duplicado, borrado y a
--      dónde se pasaron sus usuarios— con quién y cuándo.
--      rol_permisos_guardar se vuelve a crear igual que antes, y además
--      escribe en el historial SOLO lo que cambió.
--
-- Todo solo para un rol que administra (manda()). Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.roles_historial (
  id         bigint generated always as identity primary key,
  rol        text        not null,
  rol_nombre text        not null,
  accion     text        not null check (accion in ('permisos', 'creado', 'duplicado', 'borrado')),
  detalle    jsonb       not null default '{}'::jsonb,
  hecho_por  uuid        default auth.uid(),
  hecho_en   timestamptz not null default now()
);
create index if not exists roles_historial_rol_idx on public.roles_historial (rol, hecho_en desc);
alter table public.roles_historial enable row level security;
drop policy if exists roles_historial_ver on public.roles_historial;
create policy roles_historial_ver on public.roles_historial
  for select to authenticated using (public.manda());
revoke insert, update, delete on public.roles_historial from authenticated, anon;
grant select on public.roles_historial to authenticated;

create or replace view public.v_roles_historial as
select h.*, p.nombre as hecho_nombre
  from public.roles_historial h left join public.perfiles p on p.id = h.hecho_por
 where public.manda();
grant select on public.v_roles_historial to authenticated;

-- ---------------------------------------------------------------------
-- 1. GUARDAR PERMISOS — el mismo de 02-roles.sql, y ahora deja escrito
--    qué cambió: [{seccion, antes, despues}]. Si no cambió nada, nada.
-- ---------------------------------------------------------------------
create or replace function public.rol_permisos_guardar(p_rol text, p_permisos jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb;
  n integer := 0;
  v_antes jsonb;
  v_despues jsonb;
  v_cambios jsonb;
begin
  if not public.manda() then
    raise exception 'Solo un rol que administre la plataforma puede cambiar permisos';
  end if;
  if not exists (select 1 from public.roles where clave = p_rol) then
    raise exception 'Ese rol no existe';
  end if;

  select coalesce(jsonb_object_agg(seccion, nivel::text), '{}'::jsonb) into v_antes
    from public.rol_permisos where rol = p_rol;

  delete from public.rol_permisos where rol = p_rol;

  for v in select * from jsonb_array_elements(coalesce(p_permisos, '[]'::jsonb)) loop
    -- 'ninguno' no se guarda: la ausencia YA significa eso.
    if coalesce(v->>'nivel', 'ninguno') = 'ninguno' then continue; end if;
    insert into public.rol_permisos (rol, seccion, nivel)
    values (p_rol, btrim(v->>'seccion'), (v->>'nivel')::nivel_permiso)
    on conflict (rol, seccion) do update set nivel = excluded.nivel;
    n := n + 1;
  end loop;

  select coalesce(jsonb_object_agg(seccion, nivel::text), '{}'::jsonb) into v_despues
    from public.rol_permisos where rol = p_rol;

  select coalesce(jsonb_agg(jsonb_build_object(
           'seccion', s,
           'antes',   coalesce(v_antes->>s, 'ninguno'),
           'despues', coalesce(v_despues->>s, 'ninguno')) order by s), '[]'::jsonb)
    into v_cambios
    from (select jsonb_object_keys(v_antes) s union select jsonb_object_keys(v_despues)) k
   where coalesce(v_antes->>s, 'ninguno') <> coalesce(v_despues->>s, 'ninguno');

  if jsonb_array_length(v_cambios) > 0 then
    insert into public.roles_historial (rol, rol_nombre, accion, detalle)
    select p_rol, r.nombre, 'permisos', jsonb_build_object('cambios', v_cambios)
      from public.roles r where r.clave = p_rol;
  end if;

  return n;
end $$;

-- ---------------------------------------------------------------------
-- 2. CREAR, O DUPLICAR
-- ---------------------------------------------------------------------
create or replace function public.rol_crear(
  p_clave text, p_nombre text, p_descripcion text default null, p_copiar_de text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare v_clave text := btrim(coalesce(p_clave, '')); v_nombre text := btrim(coalesce(p_nombre, ''));
        v_origen public.roles%rowtype; v_n int := 0;
begin
  if not public.manda() then raise exception 'Solo un rol que administre la plataforma puede crear roles'; end if;
  if v_clave !~ '^[a-z0-9_]{2,40}$' then raise exception 'La clave del rol va en minúsculas, sin espacios ni tildes'; end if;
  if length(v_nombre) < 2 then raise exception 'Ponle un nombre al rol'; end if;
  if exists (select 1 from public.roles where clave = v_clave) then
    raise exception 'Ya hay un rol con la clave "%"', v_clave;
  end if;
  if exists (select 1 from public.roles where lower(nombre) = lower(v_nombre)) then
    raise exception 'Ya hay un rol que se llama "%"', v_nombre;
  end if;
  if p_copiar_de is not null then
    select * into v_origen from public.roles where clave = p_copiar_de;
    if v_origen.clave is null then raise exception 'El rol que se quiere duplicar no existe'; end if;
  end if;

  insert into public.roles (clave, nombre, descripcion, orden)
  values (v_clave, v_nombre, nullif(btrim(coalesce(p_descripcion, '')), ''),
          coalesce((select max(orden) from public.roles), 0) + 1);

  if p_copiar_de is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select v_clave, seccion, nivel from public.rol_permisos where rol = p_copiar_de;
    get diagnostics v_n = row_count;
    insert into public.roles_historial (rol, rol_nombre, accion, detalle)
    values (v_clave, v_nombre, 'duplicado',
            jsonb_build_object('de', p_copiar_de, 'de_nombre', v_origen.nombre, 'pantallas', v_n));
  else
    insert into public.roles_historial (rol, rol_nombre, accion) values (v_clave, v_nombre, 'creado');
  end if;
  return v_clave;
end $$;

-- ---------------------------------------------------------------------
-- 3. BORRAR, PASANDO A SUS USUARIOS A OTRO ROL
-- ---------------------------------------------------------------------
create or replace function public.rol_borrar(p_clave text, p_mover_a text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare v_rol public.roles%rowtype; v_destino public.roles%rowtype; v_n int := 0; v_quienes jsonb;
begin
  if not public.manda() then raise exception 'Solo un rol que administre la plataforma puede borrar roles'; end if;
  select * into v_rol from public.roles where clave = p_clave;
  if v_rol.clave is null then raise exception 'Ese rol no existe'; end if;
  if v_rol.sistema then
    raise exception 'El rol "%" es de sistema y no se puede borrar: la aplicación lo usa. Si no lo usas, quítale los permisos.', v_rol.nombre;
  end if;

  select coalesce(jsonb_agg(coalesce(nombre, usuario) order by nombre), '[]'::jsonb) into v_quienes
    from public.perfiles where rol = p_clave;

  if jsonb_array_length(v_quienes) > 0 then
    if p_mover_a is null then
      raise exception 'El rol "%" tiene % usuario(s). Di a qué rol pasarlos antes de borrarlo.',
        v_rol.nombre, jsonb_array_length(v_quienes);
    end if;
    select * into v_destino from public.roles where clave = p_mover_a;
    if v_destino.clave is null or v_destino.clave = p_clave then
      raise exception 'El rol al que se pasan los usuarios no sirve: escoge otro que exista';
    end if;
    update public.perfiles set rol = p_mover_a where rol = p_clave;
    get diagnostics v_n = row_count;
  end if;

  delete from public.roles where clave = p_clave;   -- sus permisos se van por la llave

  insert into public.roles_historial (rol, rol_nombre, accion, detalle)
  values (p_clave, v_rol.nombre, 'borrado', jsonb_build_object(
    'usuarios', v_n, 'quienes', v_quienes,
    'a', v_destino.clave, 'a_nombre', v_destino.nombre));
  return v_n;
end $$;

revoke all on function public.rol_crear(text, text, text, text) from public, anon;
revoke all on function public.rol_borrar(text, text) from public, anon;
grant execute on function public.rol_crear(text, text, text, text) to authenticated;
grant execute on function public.rol_borrar(text, text) to authenticated;
grant execute on function public.rol_permisos_guardar(text, jsonb) to authenticated;

do $$ begin raise notice 'LISTO: roles con borrar pasando usuarios, duplicar e historial.'; end $$;
commit;
