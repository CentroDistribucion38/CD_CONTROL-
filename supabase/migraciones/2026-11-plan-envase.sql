-- =====================================================================
-- INVENTARIO › PLAN VS NOTIFICADO (producción contra envase)
--
-- «Cómo cruzo el plan de producción inicial de la semana con la MB51, y otro plan que actualizo cuando
--  quiera, para saber qué le falta al envase por notificar.» + «yo valido las notificaciones por día» +
-- «si mi inventario es a las 6 debo tomar mis existencias a las 6; para su análisis debo tener en cuenta
--  partidas como las notificaciones».
--
-- Tres cosas se guardan, tal como salen:
--   pe_planes / pe_plan_filas  el Instructivo de Envase de Suite 360, una fila por bloque de la rejilla
--                              (tren, día, hora, SKU, HL). Cada hoja «Semana NN» es un plan. El primero que
--                              cubre la semana desde el lunes es el PLAN INICIAL; los demás son CORTES.
--                              Eso se decide al leer, no se guarda: subir en otro orden no lo daña.
--   pe_mb51                    la MB51 (Z01, Z02, Z09, 261, 262, 531, 532…). Se sube completa cada vez; lo
--                              repetido se reconoce por su clave y no se duplica.
--
-- Se puede correr varias veces.
-- =====================================================================

create table if not exists public.pe_planes (
  id          uuid primary key default gen_random_uuid(),
  anio        int  not null,
  semana      int  not null check (semana between 1 and 53),
  generado    timestamp not null,              -- hora local del archivo (Instructivo_..._2026-11-18_21.40.13)
  archivo     text,
  desde       date not null,                   -- primer día con HL en la rejilla
  hasta       date not null,
  lunes       date not null,                   -- el lunes de esa semana (según el instructivo)
  total_hl    numeric not null default 0,
  subido_por  uuid default auth.uid(),
  subido_en   timestamptz not null default now(),
  unique (anio, semana, generado)
);

create table if not exists public.pe_plan_filas (
  id          bigint generated always as identity primary key,
  plan_id     uuid not null references public.pe_planes(id) on delete cascade,
  fecha       date not null,
  tren        text not null,
  hora        int  not null,
  etiqueta    text,
  sku         text,
  nombre      text,
  formato_ml  numeric,
  referencia  int,
  hl          numeric not null,
  unidades    numeric
);
create index if not exists pe_plan_filas_plan on public.pe_plan_filas (plan_id, fecha);

create table if not exists public.pe_mb51 (
  id             bigint generated always as identity primary key,
  clave          text not null unique,         -- documento|material|almacén|clase|cantidad|ocurrencia
  fecha_contab   date not null,
  fecha_entrada  date not null,
  hora_entrada   time not null,
  centro         text,
  almacen        text,
  clase          text not null,
  material       text not null,
  texto          text,
  documento      text,
  usuario        text,
  cantidad       numeric not null,
  um             text,
  orden          text,
  subido_en      timestamptz not null default now()
);
create index if not exists pe_mb51_contab  on public.pe_mb51 (fecha_contab);
create index if not exists pe_mb51_entrada on public.pe_mb51 (fecha_entrada, hora_entrada);
create index if not exists pe_mb51_orden   on public.pe_mb51 (orden);

alter table public.pe_planes     enable row level security;
alter table public.pe_plan_filas enable row level security;
alter table public.pe_mb51       enable row level security;

create or replace function public.pe_ve() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.puede_ver('/inventario/envase'), false)
      or coalesce(public.puede_ver('/inventario/envase/cargar'), false)
      or coalesce(public.puede_ver('/inventario/envase/corte'), false)
$$;
create or replace function public.pe_carga() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.puede_editar('/inventario/envase/cargar'), false)
$$;

do $$ declare t text; begin
  foreach t in array array['pe_planes','pe_plan_filas','pe_mb51'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_cargar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pe_ve())', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.pe_carga())', t || '_cargar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.pe_carga())', t || '_borrar', t);
  end loop;
end $$;

grant select, insert, delete on public.pe_planes, public.pe_plan_filas, public.pe_mb51 to authenticated;

/* GUARDAR UN PLAN (una hoja «Semana NN»): si ya estaba ese mismo archivo (misma semana y misma hora de
   generado) se reemplaza; todo en una sola transacción para que nunca quede un plan a medias. */
create or replace function public.pe_guardar_plan(p_cabeza jsonb, p_filas jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.pe_carga() then raise exception 'Sin permiso para cargar el plan.'; end if;
  delete from public.pe_planes
   where anio = (p_cabeza->>'anio')::int and semana = (p_cabeza->>'semana')::int
     and generado = (p_cabeza->>'generado')::timestamp;
  insert into public.pe_planes (anio, semana, generado, archivo, desde, hasta, lunes, total_hl)
  values ((p_cabeza->>'anio')::int, (p_cabeza->>'semana')::int, (p_cabeza->>'generado')::timestamp,
          left(p_cabeza->>'archivo', 200), (p_cabeza->>'desde')::date, (p_cabeza->>'hasta')::date,
          (p_cabeza->>'lunes')::date, coalesce((p_cabeza->>'total_hl')::numeric, 0))
  returning id into v_id;
  insert into public.pe_plan_filas (plan_id, fecha, tren, hora, etiqueta, sku, nombre, formato_ml, referencia, hl, unidades)
  select v_id, (f->>'fecha')::date, f->>'tren', coalesce((f->>'hora')::int, 0), left(f->>'etiqueta', 60),
         nullif(f->>'sku', ''), left(f->>'nombre', 120), nullif(f->>'formato_ml', '')::numeric,
         nullif(f->>'referencia', '')::int, (f->>'hl')::numeric, nullif(f->>'unidades', '')::numeric
    from jsonb_array_elements(p_filas) f
   where (f->>'hl')::numeric > 0;
  return v_id;
end $$;
revoke all on function public.pe_guardar_plan(jsonb, jsonb) from public, anon;
grant execute on function public.pe_guardar_plan(jsonb, jsonb) to authenticated;

/* GUARDAR LA MB51 por tandas: lo que ya estaba (misma clave) se salta. Devuelve cuántos entraron nuevos. */
create or replace function public.pe_guardar_mb51(p_filas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.pe_carga() then raise exception 'Sin permiso para cargar la MB51.'; end if;
  insert into public.pe_mb51 (clave, fecha_contab, fecha_entrada, hora_entrada, centro, almacen, clase, material,
                              texto, documento, usuario, cantidad, um, orden)
  select f->>'clave', (f->>'fecha_contab')::date, (f->>'fecha_entrada')::date, (f->>'hora_entrada')::time,
         f->>'centro', f->>'almacen', f->>'clase', f->>'material', left(f->>'texto', 120), f->>'documento',
         f->>'usuario', (f->>'cantidad')::numeric, f->>'um', nullif(f->>'orden', '')
    from jsonb_array_elements(p_filas) f
  on conflict (clave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pe_guardar_mb51(jsonb) from public, anon;
grant execute on function public.pe_guardar_mb51(jsonb) to authenticated;

notify pgrst, 'reload schema';
