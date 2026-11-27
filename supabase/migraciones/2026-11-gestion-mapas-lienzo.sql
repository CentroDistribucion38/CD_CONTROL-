-- =====================================================================
-- GESTIÓN · EL MAPA DE PROCESOS COMO LIENZO EDITABLE
--
-- «Necesito poder ampliar, entrar, y que eso dentro sea literal un canvas: que estén las figuras del flujograma,
--  que pueda editar, mover, agregar.»
--
-- Cada diagrama del Mapa de procesos (mapa N1·N2·N3, clasificación de envase, vehículos, estibas, contenedor) se
-- guarda aquí entero, como un documento: figuras, zonas y uniones. Mientras un diagrama no se haya editado, la app
-- lo muestra como viene del Excel (ya ordenado); al primer cambio queda guardado aquí.
--
--   · Lo ve quien ve Gestión. Lo edita quien tiene «Mapa de procesos» en editar (Roles).
--   · version: cada guardado la sube; si dos personas editan a la vez, la segunda no pisa a la primera.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.gestion_mapas (
  id          text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  doc         jsonb not null,
  version     integer not null default 1,
  editado_por uuid references public.perfiles(id) on delete set null,
  editado_en  timestamptz not null default now()
);

alter table public.gestion_mapas enable row level security;
drop policy if exists gestion_mapas_ver on public.gestion_mapas;
create policy gestion_mapas_ver on public.gestion_mapas for select using (public.gestion_puede_ver());
drop policy if exists gestion_mapas_esc on public.gestion_mapas;
create policy gestion_mapas_esc on public.gestion_mapas for all
  using (public.mi_nivel_pantalla('/gestion/procesos') = 'editar')
  with check (public.mi_nivel_pantalla('/gestion/procesos') = 'editar');
grant select, insert, update, delete on public.gestion_mapas to authenticated;

notify pgrst, 'reload schema';
commit;
