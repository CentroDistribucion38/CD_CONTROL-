-- =====================================================================
-- INVENTARIO · RECEPCIÓN · PLAN DE ENVASE
--
-- «Subirte el plan —varias semanas, una por hoja—, fijarte en "Pendiente por
--  envasar específico" y, a partir de las unidades y el factor de estibado,
--  calcular el número de estibas de acuerdo al plan, y con la grilla cuadrar
--  las fechas.»
--
-- QUÉ GUARDA (lo que trae el Instructivo de Envase, SIN las estibas)
--   plan_envase_semanas    una fila por semana (año + número): fechas, escenario, archivo
--   plan_envase_pendiente  «Pendiente por envasar específico»: tren, SAP, SKU, formato,
--                          referencia, HL y unidades de la semana
--   plan_envase_bloques    la grilla: qué SKU envasa cada tren, qué día y en qué turno
--                          (hora de inicio, HL y unidades repartidas)
--
-- LAS ESTIBAS NO SE GUARDAN: se calculan al leer con el factor de estibado del
-- Maestro (cajas por estiba). Si se corrige un factor, el plan se corrige solo.
--
-- Subir y borrar exige poder editar «Recepción» (Roles); verlo, poder verlo.
-- Subir una semana que ya existe la REEMPLAZA entera (no se duplica nada).
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.plan_envase_semanas (
  id          uuid primary key default gen_random_uuid(),
  anio        integer not null check (anio between 2020 and 2100),
  semana      integer not null check (semana between 1 and 53),
  fecha_ini   date not null,
  fecha_fin   date not null,
  escenario   text,
  generado    date,
  archivo     text,
  cargado_por uuid references public.perfiles(id) on delete set null,
  cargado_en  timestamptz not null default now(),
  unique (anio, semana)
);

create table if not exists public.plan_envase_pendiente (
  semana_id   uuid not null references public.plan_envase_semanas(id) on delete cascade,
  tren        text not null,
  sap         text not null,
  sku         text,
  eficiencia  numeric,
  formato     integer,           -- cc por envase
  referencia  integer,           -- envases por caja
  hl          numeric not null default 0,
  unidades    bigint  not null default 0,
  primary key (semana_id, tren, sap)
);

create table if not exists public.plan_envase_bloques (
  id          bigint generated always as identity primary key,
  semana_id   uuid not null references public.plan_envase_semanas(id) on delete cascade,
  tren        text not null,
  sap         text not null,
  fecha       date not null,
  turno       smallint not null check (turno between 1 and 3),
  hora_ini    smallint not null check (hora_ini between 0 and 23),
  horas       smallint not null default 1 check (horas >= 1),
  hl          numeric not null default 0,
  unidades    bigint  not null default 0
);
create index if not exists plan_envase_bloques_semana_idx on public.plan_envase_bloques (semana_id, fecha, tren);

alter table public.plan_envase_semanas   enable row level security;
alter table public.plan_envase_pendiente enable row level security;
alter table public.plan_envase_bloques   enable row level security;

drop policy if exists plan_envase_semanas_ver   on public.plan_envase_semanas;
drop policy if exists plan_envase_pendiente_ver on public.plan_envase_pendiente;
drop policy if exists plan_envase_bloques_ver   on public.plan_envase_bloques;
create policy plan_envase_semanas_ver   on public.plan_envase_semanas   for select to authenticated using (public.puede_ver('/inventario/recibir'));
create policy plan_envase_pendiente_ver on public.plan_envase_pendiente for select to authenticated using (public.puede_ver('/inventario/recibir'));
create policy plan_envase_bloques_ver   on public.plan_envase_bloques   for select to authenticated using (public.puede_ver('/inventario/recibir'));

/* Se lee por la tabla; se escribe SOLO por las funciones de abajo. */
revoke insert, update, delete on public.plan_envase_semanas, public.plan_envase_pendiente, public.plan_envase_bloques from authenticated, anon;
grant select on public.plan_envase_semanas, public.plan_envase_pendiente, public.plan_envase_bloques to authenticated;

-- ---------------------------------------------------------------------
-- GUARDAR UNA SEMANA (reemplaza la que ya estaba)
--   p_semana = { anio, semana, fecha_ini, fecha_fin, escenario, generado, archivo,
--                pendientes: [{tren, sap, sku, eficiencia, formato, referencia, hl, unidades}],
--                bloques:    [{tren, sap, fecha, turno, hora_ini, horas, hl, unidades}] }
-- ---------------------------------------------------------------------
create or replace function public.plan_envase_guardar(p_semana jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_anio int := (p_semana->>'anio')::int;
  v_sem  int := (p_semana->>'semana')::int;
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Subir el plan de envase requiere el permiso «Recepción» (Roles)';
  end if;
  if v_anio is null or v_sem is null or (p_semana->>'fecha_ini') is null then
    raise exception 'El plan no trae año, semana o fecha de inicio';
  end if;
  if jsonb_typeof(coalesce(p_semana->'pendientes', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_semana->'bloques', '[]'::jsonb)) <> 'array' then
    raise exception 'El plan viene mal formado';
  end if;

  delete from public.plan_envase_semanas where anio = v_anio and semana = v_sem;

  insert into public.plan_envase_semanas (anio, semana, fecha_ini, fecha_fin, escenario, generado, archivo, cargado_por)
  values (v_anio, v_sem, (p_semana->>'fecha_ini')::date, coalesce((p_semana->>'fecha_fin')::date, (p_semana->>'fecha_ini')::date + 6),
          nullif(p_semana->>'escenario', ''), nullif(p_semana->>'generado', '')::date, nullif(left(p_semana->>'archivo', 200), ''), auth.uid())
  returning id into v_id;

  insert into public.plan_envase_pendiente (semana_id, tren, sap, sku, eficiencia, formato, referencia, hl, unidades)
  select v_id, x->>'tren', x->>'sap', x->>'sku', nullif(x->>'eficiencia', '')::numeric, nullif(x->>'formato', '')::int, nullif(x->>'referencia', '')::int,
         coalesce(nullif(x->>'hl', '')::numeric, 0), coalesce(nullif(x->>'unidades', '')::numeric, 0)::bigint
    from jsonb_array_elements(coalesce(p_semana->'pendientes', '[]'::jsonb)) x
  on conflict (semana_id, tren, sap) do update
     set hl = public.plan_envase_pendiente.hl + excluded.hl, unidades = public.plan_envase_pendiente.unidades + excluded.unidades;

  insert into public.plan_envase_bloques (semana_id, tren, sap, fecha, turno, hora_ini, horas, hl, unidades)
  select v_id, x->>'tren', x->>'sap', (x->>'fecha')::date, (x->>'turno')::smallint, (x->>'hora_ini')::smallint,
         greatest(coalesce(nullif(x->>'horas', '')::int, 1), 1), coalesce(nullif(x->>'hl', '')::numeric, 0), coalesce(nullif(x->>'unidades', '')::numeric, 0)::bigint
    from jsonb_array_elements(coalesce(p_semana->'bloques', '[]'::jsonb)) x;

  return v_id;
end $$;
revoke all on function public.plan_envase_guardar(jsonb) from public, anon;
grant execute on function public.plan_envase_guardar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- BORRAR UNA SEMANA
-- ---------------------------------------------------------------------
create or replace function public.plan_envase_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Borrar el plan de envase requiere el permiso «Recepción» (Roles)';
  end if;
  delete from public.plan_envase_semanas where id = p_id;
end $$;
revoke all on function public.plan_envase_borrar(uuid) from public, anon;
grant execute on function public.plan_envase_borrar(uuid) to authenticated;

commit;
-- LISTO · plan de envase
