-- =====================================================================
-- 5S — INSPECCIONES DE ORDEN Y ASEO POR ÁREA
--
-- «Revisa el módulo de 5S (INOVA) y hazlo en el módulo de nuestro proyecto,
--  que se llame 5S.» Se toma lo que el de INOVA hacía bien —checklist por
-- área con peso, cumple / no cumple / N/A, severidad, observación, fotos y
-- meta— y se arregla lo que fallaba:
--   · las fotos iban como texto base64 dentro de la base: aquí van al
--     almacenamiento (bucket cinco-s), selladas con fecha y hora;
--   · el porcentaje lo calculaba la pantalla: aquí lo calcula la base;
--   · un punto sin responder contaba como N/A: aquí cada punto se responde;
--   · no se sabía a cuál de las 5 S pertenecía cada falla: cada punto es de
--     una S y la inspección da el % de cada una;
--   · el auditor se escogía de una lista: aquí es quien entró a la app.
--
--   s5_reglas              la meta general (90 %).
--   s5_responsables        los dueños de las áreas (nombre, cédula, cargo).
--   s5_areas               las áreas que se auditan, con su responsable y,
--                          si la tiene, su propia meta.
--   s5_puntos              el checklist: cada punto es de una S, con peso y
--                          si exige foto. Sin área = vale para todas.
--   s5_inspecciones        una auditoría: fecha, área, auditor, % y meta.
--   s5_inspeccion_puntos   cómo quedó cada punto (copia de la pregunta, para
--                          que cambiar el checklist no cambie el pasado).
--   s5_fotos               las fotos de cada punto (ruta en el bucket).
--   v_s5_inspecciones      la inspección con el % de cada S y sus fotos.
--
--   s5_guardar(jsonb)      guarda una inspección completa, revisada.
--   s5_borrar(uuid)        borra una inspección (y devuelve sus fotos).
--
-- PERMISOS (Admin › Roles): /5s inspecciona, /5s/historial consulta (y con
-- «Editar» borra), /5s/maestro configura. Se puede correr varias veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. QUIÉN VE Y QUIÉN EDITA
-- ---------------------------------------------------------------------
create or replace function public.s5_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  -- 5S es solo del super administrador (2026-11-cinco-s-5.sql).
  select public.manda()
$$;
grant execute on function public.s5_ve() to authenticated;

create or replace function public.s5_edita(p_ruta text) returns boolean
language sql stable security definer set search_path = public
as $$ select public.manda() and p_ruta is not null $$;
grant execute on function public.s5_edita(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL MAESTRO
-- ---------------------------------------------------------------------
create table if not exists public.s5_reglas (
  id          integer primary key default 1 check (id = 1),
  meta        numeric(5,2) not null default 90 check (meta between 1 and 100),
  actualizado timestamptz not null default now()
);
insert into public.s5_reglas (id) values (1) on conflict (id) do nothing;

create table if not exists public.s5_responsables (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique check (length(trim(nombre)) > 0),
  cedula  text,
  cargo   text,
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

create table if not exists public.s5_areas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique check (length(trim(nombre)) > 0),
  descripcion     text,
  responsable_id  uuid references public.s5_responsables(id) on delete set null,
  meta            numeric(5,2) check (meta is null or meta between 1 and 100),
  activa          boolean not null default true,
  orden           integer not null default 0,
  creado          timestamptz not null default now()
);

create table if not exists public.s5_puntos (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid references public.s5_areas(id) on delete cascade,
  s           text not null check (s in ('clasificar', 'ordenar', 'limpiar', 'estandarizar', 'disciplina')),
  pregunta    text not null check (length(trim(pregunta)) > 0),
  peso        numeric(6,2) not null default 1 check (peso > 0 and peso <= 100),
  exige_foto  boolean not null default false,
  orden       integer not null default 0,
  activo      boolean not null default true,
  creado      timestamptz not null default now()
);
create index if not exists s5_puntos_area on public.s5_puntos (area_id) where activo;

-- ---------------------------------------------------------------------
-- 3. LAS INSPECCIONES
-- ---------------------------------------------------------------------
create table if not exists public.s5_inspecciones (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  area_id         uuid references public.s5_areas(id) on delete set null,
  area            text not null,
  responsable     text,
  auditor         uuid default auth.uid(),
  auditor_nombre  text,
  cumplimiento    numeric(5,2) not null check (cumplimiento between 0 and 100),
  meta            numeric(5,2) not null,
  evaluados       integer not null default 0,
  no_cumple       integer not null default 0,
  nota            text,
  creado          timestamptz not null default now()
);
create index if not exists s5_inspecciones_fecha on public.s5_inspecciones (fecha desc, creado desc);
create index if not exists s5_inspecciones_area on public.s5_inspecciones (area_id, fecha desc);

create table if not exists public.s5_inspeccion_puntos (
  id             uuid primary key default gen_random_uuid(),
  inspeccion_id  uuid not null references public.s5_inspecciones(id) on delete cascade,
  punto_id       uuid references public.s5_puntos(id) on delete set null,
  orden          integer not null default 0,
  s              text not null,
  pregunta       text not null,
  peso           numeric(6,2) not null,
  resultado      text not null check (resultado in ('cumple', 'no_cumple', 'na')),
  severidad      text check (severidad in ('baja', 'media', 'alta')),
  observacion    text
);
create index if not exists s5_inspeccion_puntos_insp on public.s5_inspeccion_puntos (inspeccion_id);

create table if not exists public.s5_fotos (
  id             uuid primary key default gen_random_uuid(),
  inspeccion_id  uuid not null references public.s5_inspecciones(id) on delete cascade,
  item_id        uuid not null references public.s5_inspeccion_puntos(id) on delete cascade,
  ruta           text not null unique,
  bytes          integer,
  creado         timestamptz not null default now()
);
create index if not exists s5_fotos_item on public.s5_fotos (item_id);

-- ---------------------------------------------------------------------
-- 4. RLS: se lee con permiso de 5S; el maestro lo cambia quien edita el
--    Maestro; las inspecciones solo entran por s5_guardar (revisadas).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['s5_reglas', 's5_responsables', 's5_areas', 's5_puntos',
                           's5_inspecciones', 's5_inspeccion_puntos', 's5_fotos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.s5_ve()))', t || '_ver', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  foreach t in array array['s5_reglas', 's5_responsables', 's5_areas', 's5_puntos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_maestro', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.s5_edita(''/5s/maestro''))) with check ((select public.s5_edita(''/5s/maestro'')))', t || '_maestro', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['s5_inspecciones', 's5_inspeccion_puntos', 's5_fotos'] loop
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. LA VISTA: la inspección con el % de cada S y cuántas fotos tiene.
-- ---------------------------------------------------------------------
create or replace view public.v_s5_inspecciones with (security_invoker = true) as
select i.*,
       coalesce((
         select jsonb_object_agg(x.s, x.pct)
           from (select p.s,
                        round(100 * sum(p.peso) filter (where p.resultado = 'cumple')
                              / nullif(sum(p.peso) filter (where p.resultado <> 'na'), 0), 1) as pct
                   from public.s5_inspeccion_puntos p
                  where p.inspeccion_id = i.id
                  group by p.s) x
       ), '{}'::jsonb) as por_s,
       (select count(*) from public.s5_fotos f where f.inspeccion_id = i.id)::integer as fotos
  from public.s5_inspecciones i;
grant select on public.v_s5_inspecciones to authenticated;

-- ---------------------------------------------------------------------
-- 6. GUARDAR UNA INSPECCIÓN
--    p = { id, fecha, area_id, nota,
--          puntos: [{ punto_id, resultado, severidad, observacion,
--                     fotos: [{ ruta, bytes }] }] }
--    Las fotos ya subieron al bucket con la ruta «<id>/…»; aquí se amarran.
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

    insert into public.s5_inspeccion_puntos (inspeccion_id, punto_id, orden, s, pregunta, peso, resultado, severidad, observacion)
    values (v_id, v_pt.id, v_pt.orden, v_pt.s, v_pt.pregunta, v_pt.peso, v_res, v_sev, v_obs)
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

-- ---------------------------------------------------------------------
-- 7. BORRAR UNA INSPECCIÓN (devuelve las rutas de sus fotos, para
--    quitarlas también del bucket).
-- ---------------------------------------------------------------------
create or replace function public.s5_borrar(p_id uuid) returns text[]
language plpgsql security definer set search_path = public
as $$
declare v_rutas text[];
begin
  if not public.s5_edita('/5s/historial') then
    raise exception 'No tienes permiso para borrar inspecciones 5S.';
  end if;
  select coalesce(array_agg(ruta), '{}') into v_rutas from public.s5_fotos where inspeccion_id = p_id;
  delete from public.s5_inspecciones where id = p_id;
  if not found then raise exception 'Esa inspección ya no existe.'; end if;
  return v_rutas;
end $$;
revoke all on function public.s5_borrar(uuid) from public, anon;
grant execute on function public.s5_borrar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. LAS FOTOS: bucket privado; ve quien ve 5S, sube quien inspecciona,
--    borra quien puede borrar inspecciones.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cinco-s', 'cinco-s', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists cinco_s_ver on storage.objects;
create policy cinco_s_ver on storage.objects
  for select to authenticated using (bucket_id = 'cinco-s' and public.s5_ve());
drop policy if exists cinco_s_subir on storage.objects;
create policy cinco_s_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'cinco-s' and public.s5_edita('/5s'));
drop policy if exists cinco_s_borrar on storage.objects;
create policy cinco_s_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'cinco-s' and public.s5_edita('/5s/historial'));

-- ---------------------------------------------------------------------
-- 9. EL CHECKLIST DE ARRANQUE (solo si no hay ninguno): tres puntos por
--    S que valen para todas las áreas. Se editan en 5S › Maestro.
-- ---------------------------------------------------------------------
insert into public.s5_puntos (area_id, s, pregunta, peso, exige_foto, orden)
select null, x.s, x.pregunta, 1, x.foto, x.orden
  from (values
    ('clasificar',   'No hay materiales, herramientas ni equipos que no se usen en el área.', false, 1),
    ('clasificar',   'Lo dañado, vencido o para baja está identificado y separado.', true, 2),
    ('clasificar',   'No hay estibas, cajas ni envase fuera de su lugar o abandonados.', false, 3),
    ('ordenar',      'Cada cosa tiene un lugar marcado y está en su lugar.', false, 4),
    ('ordenar',      'Pasillos, salidas de emergencia y extintores libres y señalizados.', true, 5),
    ('ordenar',      'Las ubicaciones y la demarcación del piso están visibles y completas.', false, 6),
    ('limpiar',      'Pisos, estanterías y equipos limpios, sin derrames ni vidrio.', true, 7),
    ('limpiar',      'Las canecas están identificadas y no rebosan.', false, 8),
    ('limpiar',      'Se cumple el cronograma de aseo del área.', false, 9),
    ('estandarizar', 'Los estándares visuales (fotos, rótulos, demarcación) están al día.', false, 10),
    ('estandarizar', 'Las novedades de la auditoría anterior están cerradas.', false, 11),
    ('estandarizar', 'Los responsables del área están publicados y vigentes.', false, 12),
    ('disciplina',   'El personal usa la dotación y los EPP completos.', false, 13),
    ('disciplina',   'El personal conoce y aplica las 5S del área.', false, 14),
    ('disciplina',   'Se respetan las normas del área (no comer, no fumar, celulares).', false, 15)
  ) as x(s, pregunta, foto, orden)
 where not exists (select 1 from public.s5_puntos);

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------
-- 10. LO QUE QUEDÓ
-- ---------------------------------------------------------------------
do $$
declare v_t int; v_p int; v_b boolean;
begin
  select count(*) into v_t from information_schema.tables
   where table_schema = 'public' and table_name in ('s5_reglas', 's5_responsables', 's5_areas', 's5_puntos',
         's5_inspecciones', 's5_inspeccion_puntos', 's5_fotos');
  select count(*) into v_p from public.s5_puntos where activo;
  select exists (select 1 from storage.buckets where id = 'cinco-s') into v_b;
  raise notice '----------------------------------------------------------';
  raise notice 'las siete tablas ........ %', case when v_t = 7 then 'ok' else 'MAL (' || v_t || ')' end;
  raise notice 'puntos del checklist .... %', v_p;
  raise notice 'bucket de fotos ......... %', case when v_b then 'ok' else 'MAL' end;
  raise notice 'Siguiente: 5S › Maestro → crea las áreas y sus responsables.';
  raise notice '----------------------------------------------------------';
end $$;
