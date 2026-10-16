-- =====================================================================
-- GESTIÓN · 5 WHY + PLAN DE ACCIÓN (dentro de /gestion/disparadores)
--
-- Cuando un disparador salta, queda PENDIENTE. De ahí:
--   PENDIENTE   → no tiene análisis todavía (no hay fila en gestion_analisis).
--   EN ANÁLISIS → alguien lo tomó: tiene responsable, los 5 por qué y la causa raíz, y su plan de acción.
--   CERRADO     → la causa raíz está escrita y todas las acciones del plan están hechas.
-- No se toca nada de lo que ya hay: gestion_disparadores sigue igual (activo / cerrado / descartado).
--
-- Crea dos tablas nuevas: gestion_analisis (el 5 Why, uno por disparador) y gestion_acciones (el plan).
-- Los ve quien vea Gestión y los edita quien tenga «Disparadores» en «editar». Se puede correr varias veces.
-- Correr DESPUÉS de supabase/modulos/gestion.sql.
-- =====================================================================
begin;

create table if not exists public.gestion_analisis (
  disparador_id  uuid primary key references public.gestion_disparadores (id) on delete cascade,
  responsable    text not null default '',
  porque1        text not null default '',
  porque2        text not null default '',
  porque3        text not null default '',
  porque4        text not null default '',
  porque5        text not null default '',
  causa_raiz     text not null default '',
  iniciado_en    timestamptz not null default now(),
  iniciado_por   uuid,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.gestion_acciones (
  id             uuid primary key default gen_random_uuid(),
  disparador_id  uuid not null references public.gestion_disparadores (id) on delete cascade,
  accion         text not null check (length(btrim(accion)) > 0),
  responsable    text not null check (length(btrim(responsable)) > 0),
  fecha_limite   date not null,
  estado         text not null default 'abierta' check (estado in ('abierta', 'hecha')),
  hecha_en       timestamptz,
  creado_en      timestamptz not null default now(),
  creado_por     uuid
);
create index if not exists gestion_acciones_disparador on public.gestion_acciones (disparador_id);
create index if not exists gestion_acciones_estado on public.gestion_acciones (estado, fecha_limite);

do $$
declare t text;
begin
  foreach t in array array['gestion_analisis', 'gestion_acciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select using (public.gestion_puede_ver())', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_esc', t);
    execute format('create policy %I on public.%I for all
      using (public.mi_nivel_pantalla(''/gestion/disparadores'') = ''editar'')
      with check (public.mi_nivel_pantalla(''/gestion/disparadores'') = ''editar'')', t || '_esc', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

commit;

-- COMPROBACIÓN: dos tablas, con 0 filas la primera vez.
select 'gestion_analisis' as tabla, count(*) as filas from public.gestion_analisis
union all
select 'gestion_acciones', count(*) from public.gestion_acciones;
