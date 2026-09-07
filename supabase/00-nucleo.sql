-- =====================================================================
-- CONTROL · NÚCLEO
-- Se ejecuta UNA sola vez por proyecto, antes de cualquier módulo.
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Roles de la plataforma
-- ---------------------------------------------------------------------
do $$ begin
  create type rol_usuario as enum ('admin', 'supervisor', 'operador');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Perfiles (extiende auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  usuario   text,
  nombre    text not null default '',
  rol       rol_usuario not null default 'operador',
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Por si la tabla ya existía sin la columna (versión anterior del esquema)
alter table public.perfiles add column if not exists usuario text;

-- Rellena el usuario de perfiles antiguos a partir del correo interno
update public.perfiles p
   set usuario = split_part(u.email, '@', 1)
  from auth.users u
 where u.id = p.id and p.usuario is null;

create unique index if not exists perfiles_usuario_key
  on public.perfiles (lower(usuario)) where usuario is not null;

-- Alta automática de perfil al registrarse. El PRIMER usuario queda admin.
-- El login es por USUARIO: la app arma un correo interno <usuario>@cdcontrol.local
-- que Supabase Auth necesita, pero que el usuario nunca ve.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text;
begin
  v_usuario := lower(coalesce(
    nullif(new.raw_user_meta_data->>'usuario', ''),
    split_part(new.email, '@', 1)
  ));

  insert into public.perfiles (id, usuario, nombre, rol)
  values (
    new.id,
    v_usuario,
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), v_usuario),
    case
      when (select count(*) from public.perfiles) = 0 then 'admin'::rol_usuario
      else 'operador'::rol_usuario
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Helpers de permisos — los usan las políticas RLS de TODOS los módulos
-- ---------------------------------------------------------------------
create or replace function public.mi_rol()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$ select rol from public.perfiles where id = auth.uid() $$;

create or replace function public.es_editor()
returns boolean
language sql
stable
as $$ select public.mi_rol() in ('admin', 'supervisor') $$;

-- ---------------------------------------------------------------------
-- RLS de perfiles
-- ---------------------------------------------------------------------
alter table public.perfiles enable row level security;

drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (true);

drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles
  for update to authenticated
  using (id = auth.uid() or public.mi_rol() = 'admin')
  with check (id = auth.uid() or public.mi_rol() = 'admin');
