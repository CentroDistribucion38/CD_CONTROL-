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
  nombre    text not null default '',
  rol       rol_usuario not null default 'operador',
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Alta automática de perfil al registrarse. El PRIMER usuario queda admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
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
