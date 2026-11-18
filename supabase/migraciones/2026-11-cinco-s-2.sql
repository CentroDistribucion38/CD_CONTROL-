-- =====================================================================
-- 5S · PASO 2 — CRONOGRAMA (Gantt), TABLERO Y ZONAS
--
-- Va DESPUÉS de 2026-11-cinco-s.sql. Agrega:
--   s5_zonas          zonas dentro de un área (calle 1, calle 2, muelle…):
--                     en cada «no cumple» se dice en qué zona fue.
--   s5_cronograma     las auditorías programadas: área, quién audita,
--                     desde/hasta, prioridad. Su estado NO se escribe:
--                     se calcula (programada, en curso, hecha, vencida,
--                     cancelada). «Hecha» = hay una inspección del área
--                     entre esas fechas.
--   v_s5_cronograma   el cronograma con su estado y la inspección que lo
--                     cumplió.
--   s5_guardar(jsonb) igual que antes, y ahora recibe la zona de cada punto.
--
-- PERMISOS: /5s/cronograma (con «Editar» programa) y /5s/tablero (ver).
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- Quien ve cualquiera de las pantallas de 5S, ve 5S.
create or replace function public.s5_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mi_nivel_pantalla('/5s') <> 'ninguno'
      or public.mi_nivel_pantalla('/5s/historial') <> 'ninguno'
      or public.mi_nivel_pantalla('/5s/tablero') <> 'ninguno'
      or public.mi_nivel_pantalla('/5s/cronograma') <> 'ninguno'
      or public.mi_nivel_pantalla('/5s/maestro') <> 'ninguno'
$$;

-- ---------------------------------------------------------------------
-- ZONAS
-- ---------------------------------------------------------------------
create table if not exists public.s5_zonas (
  id       uuid primary key default gen_random_uuid(),
  area_id  uuid not null references public.s5_areas(id) on delete cascade,
  nombre   text not null check (length(trim(nombre)) > 0),
  activa   boolean not null default true,
  orden    integer not null default 0,
  creado   timestamptz not null default now(),
  unique (area_id, nombre)
);
alter table public.s5_inspeccion_puntos add column if not exists zona_id uuid references public.s5_zonas(id) on delete set null;
alter table public.s5_inspeccion_puntos add column if not exists zona text;

-- ---------------------------------------------------------------------
-- CRONOGRAMA
-- ---------------------------------------------------------------------
create table if not exists public.s5_cronograma (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.s5_areas(id) on delete cascade,
  auditor_id  uuid references public.s5_responsables(id) on delete set null,
  actividad   text not null default 'Auditoría 5S' check (length(trim(actividad)) > 0),
  desde       date not null,
  hasta       date not null,
  prioridad   text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  nota        text,
  cancelada   boolean not null default false,
  creado      timestamptz not null default now(),
  creado_por  uuid default auth.uid(),
  check (hasta >= desde and hasta - desde <= 366)
);
create index if not exists s5_cronograma_fechas on public.s5_cronograma (desde, hasta);

do $$
declare t text;
begin
  foreach t in array array['s5_zonas', 's5_cronograma'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.s5_ve()))', t || '_ver', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists s5_zonas_maestro on public.s5_zonas;
create policy s5_zonas_maestro on public.s5_zonas for all to authenticated
  using ((select public.s5_edita('/5s/maestro'))) with check ((select public.s5_edita('/5s/maestro')));
drop policy if exists s5_cronograma_editar on public.s5_cronograma;
create policy s5_cronograma_editar on public.s5_cronograma for all to authenticated
  using ((select public.s5_edita('/5s/cronograma'))) with check ((select public.s5_edita('/5s/cronograma')));

-- EL ESTADO SE CALCULA: así nunca dice «programada» una auditoría que ya se hizo.
create or replace view public.v_s5_cronograma with (security_invoker = true) as
select c.*,
       a.nombre as area,
       r.nombre as auditor,
       h.id as inspeccion_id, h.fecha as hecha_el, h.cumplimiento, h.meta,
       case
         when c.cancelada then 'cancelada'
         when h.id is not null then 'hecha'
         when c.hasta < (now() at time zone 'America/Bogota')::date then 'vencida'
         when c.desde <= (now() at time zone 'America/Bogota')::date then 'en_curso'
         else 'programada'
       end as estado
  from public.s5_cronograma c
  join public.s5_areas a on a.id = c.area_id
  left join public.s5_responsables r on r.id = c.auditor_id
  left join lateral (
    select i.id, i.fecha, i.cumplimiento, i.meta
      from public.s5_inspecciones i
     where i.area_id = c.area_id and i.fecha between c.desde and c.hasta
     order by i.fecha, i.creado
     limit 1
  ) h on true;
grant select on public.v_s5_cronograma to authenticated;

-- ---------------------------------------------------------------------
-- GUARDAR, ahora con la zona de cada punto (opcional; debe ser del área).
-- ---------------------------------------------------------------------
create or replace function public.s5_guardar(p jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_fecha   date := (p->>'fecha')::date;
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_area    public.s5_areas%rowtype;
  v_meta    numeric;
  v_resp    text;
  v_aud     text;
  r         jsonb;
  f         jsonb;
  v_pt      public.s5_puntos%rowtype;
  v_item    uuid;
  v_res     text;
  v_sev     text;
  v_obs     text;
  v_zid     uuid;
  v_znom    text;
  v_nfotos  integer;
  v_eval    numeric := 0;
  v_ok      numeric := 0;
  v_n       integer := 0;
  v_nc      integer := 0;
  v_vistos  uuid[] := '{}';
  v_falta   integer;
begin
  if not public.s5_edita('/5s') then
    raise exception 'No tienes permiso para registrar inspecciones 5S.';
  end if;
  if v_fecha is null then raise exception 'Falta la fecha de la inspección.'; end if;
  if v_fecha > v_hoy then raise exception 'La fecha no puede ser de un día que no ha llegado.'; end if;

  select * into v_area from public.s5_areas where id = (p->>'area_id')::uuid;
  if not found or not v_area.activa then raise exception 'Escoge un área activa.'; end if;
  if exists (select 1 from public.s5_inspecciones where id = v_id) then
    raise exception 'Esta inspección ya quedó guardada.';
  end if;

  select coalesce(v_area.meta, (select meta from public.s5_reglas where id = 1), 90) into v_meta;
  select nombre into v_resp from public.s5_responsables where id = v_area.responsable_id;
  select nullif(trim(nombre), '') into v_aud from public.perfiles where id = auth.uid();

  insert into public.s5_inspecciones (id, fecha, area_id, area, responsable, auditor, auditor_nombre, cumplimiento, meta, nota)
  values (v_id, v_fecha, v_area.id, v_area.nombre, v_resp, auth.uid(), v_aud, 0, v_meta, nullif(trim(p->>'nota'), ''));

  for r in select * from jsonb_array_elements(coalesce(p->'puntos', '[]'::jsonb)) loop
    select * into v_pt from public.s5_puntos
     where id = (r->>'punto_id')::uuid and activo and (area_id is null or area_id = v_area.id);
    if not found then raise exception 'Uno de los puntos ya no está en el checklist de %. Vuelve a abrir la inspección.', v_area.nombre; end if;
    if v_pt.id = any(v_vistos) then raise exception 'Un punto vino dos veces.'; end if;
    v_vistos := v_vistos || v_pt.id;

    v_res := r->>'resultado';
    if v_res is null or v_res not in ('cumple', 'no_cumple', 'na') then
      raise exception 'Falta responder: «%».', v_pt.pregunta;
    end if;
    v_obs := nullif(trim(r->>'observacion'), '');
    v_sev := case when v_res = 'no_cumple' then coalesce(nullif(r->>'severidad', ''), 'media') end;
    if v_sev is not null and v_sev not in ('baja', 'media', 'alta') then raise exception 'Severidad no válida.'; end if;
    if v_res = 'no_cumple' and v_obs is null then
      raise exception 'Escribe qué se encontró en «%» (no cumple).', v_pt.pregunta;
    end if;
    v_nfotos := jsonb_array_length(coalesce(r->'fotos', '[]'::jsonb));
    if v_pt.exige_foto and v_res <> 'na' and v_nfotos = 0 then
      raise exception '«%» exige foto.', v_pt.pregunta;
    end if;

    v_zid := null; v_znom := null;
    if nullif(r->>'zona_id', '') is not null and v_res <> 'na' then
      select id, nombre into v_zid, v_znom from public.s5_zonas where id = (r->>'zona_id')::uuid and area_id = v_area.id;
      if v_zid is null then raise exception 'La zona de «%» no es de %.', v_pt.pregunta, v_area.nombre; end if;
    end if;

    insert into public.s5_inspeccion_puntos (inspeccion_id, punto_id, orden, s, pregunta, peso, resultado, severidad, observacion, zona_id, zona)
    values (v_id, v_pt.id, v_pt.orden, v_pt.s, v_pt.pregunta, v_pt.peso, v_res, v_sev, v_obs, v_zid, v_znom)
    returning id into v_item;

    for f in select * from jsonb_array_elements(coalesce(r->'fotos', '[]'::jsonb)) loop
      if coalesce(f->>'ruta', '') not like v_id::text || '/%' then raise exception 'Ruta de foto no válida.'; end if;
      insert into public.s5_fotos (inspeccion_id, item_id, ruta, bytes)
      values (v_id, v_item, f->>'ruta', nullif(f->>'bytes', '')::integer);
    end loop;

    if v_res <> 'na' then
      v_eval := v_eval + v_pt.peso; v_n := v_n + 1;
      if v_res = 'cumple' then v_ok := v_ok + v_pt.peso; else v_nc := v_nc + 1; end if;
    end if;
  end loop;

  select count(*) into v_falta from public.s5_puntos
   where activo and (area_id is null or area_id = v_area.id) and not (id = any(v_vistos));
  if v_falta > 0 then
    raise exception '%', case when v_falta = 1 then 'Falta 1 punto del checklist por responder.'
                              else 'Faltan ' || v_falta || ' puntos del checklist por responder.' end;
  end if;
  if v_eval = 0 then raise exception 'Todo quedó en N/A: no hay nada que calificar.'; end if;

  update public.s5_inspecciones
     set cumplimiento = round(100 * v_ok / v_eval, 2), evaluados = v_n, no_cumple = v_nc
   where id = v_id;
  return v_id;
end $$;
revoke all on function public.s5_guardar(jsonb) from public, anon;
grant execute on function public.s5_guardar(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

do $$
declare v_t int;
begin
  select count(*) into v_t from information_schema.tables
   where table_schema = 'public' and table_name in ('s5_zonas', 's5_cronograma');
  raise notice '----------------------------------------------------------';
  raise notice 'zonas y cronograma ...... %', case when v_t = 2 then 'ok' else 'MAL (' || v_t || ')' end;
  raise notice 'Siguiente: Admin › Roles → dar 5S › Tablero y 5S › Cronograma.';
  raise notice '----------------------------------------------------------';
end $$;
