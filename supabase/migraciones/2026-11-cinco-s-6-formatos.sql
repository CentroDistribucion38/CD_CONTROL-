-- =====================================================================
-- 5S · PASO 6 — FORMATOS DE EVALUACIÓN: 5S, PTL Y LOS QUE VENGAN
--
-- «Que yo elija qué evaluar, si PTL o 5S, en la bodega (T1…), con puntos
--  específicos que arrojen porcentaje.»
--
-- El módulo de 5S ya evaluaba por puntos con peso, cumple / no cumple / N/A, fotos y plan de acción. Ahora el
-- checklist es de un FORMATO, y cada formato tiene sus SECCIONES (en 5S son las cinco S; en PTL, Ubicación,
-- FEFO, Estibas…). Al inspeccionar se escoge el formato y el área; el % se calcula igual (peso de lo que cumple
-- sobre peso de lo evaluado) y sale por sección y total.
--
--   s5_formatos     los formatos: 5S y PTL de entrada; se agregan más desde el Maestro.
--   s5_secciones    las secciones de cada formato (la columna «s» de los puntos guarda su clave).
--   s5_puntos       + formato_id (los de antes quedan en 5S).
--   s5_inspecciones + formato_id y formato (copia del nombre, para que el pasado no cambie).
--
-- Va después de 2026-11-cinco-s-5.sql. Se puede correr varias veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. FORMATOS Y SECCIONES
-- ---------------------------------------------------------------------
create table if not exists public.s5_formatos (
  id          uuid primary key default gen_random_uuid(),
  clave       text not null unique check (clave ~ '^[a-z0-9_]+$'),
  nombre      text not null check (length(trim(nombre)) > 0),
  descripcion text,
  meta        numeric(5,2) check (meta is null or meta between 1 and 100),
  activo      boolean not null default true,
  orden       integer not null default 0,
  creado      timestamptz not null default now()
);

create table if not exists public.s5_secciones (
  id          uuid primary key default gen_random_uuid(),
  formato_id  uuid not null references public.s5_formatos(id) on delete cascade,
  clave       text not null unique check (clave ~ '^[a-z0-9_]+$'),   -- única en todo: los puntos guardan solo la clave
  nombre      text not null check (length(trim(nombre)) > 0),
  corto       text not null check (length(trim(corto)) between 1 and 6),  -- la ficha: «1S», «UBI»
  que         text,
  jp          text,
  orden       integer not null default 0,
  activa      boolean not null default true
);
create index if not exists s5_secciones_formato on public.s5_secciones (formato_id, orden);

insert into public.s5_formatos (clave, nombre, descripcion, orden) values
  ('5s',  '5S · Orden y aseo',          'Clasificar, ordenar, limpiar, estandarizar y disciplina.', 1),
  ('ptl', 'PTL · Almacenamiento',        'Verificación por turno del almacenamiento: ubicación, FEFO, estibas, producto y pasillos.', 2)
on conflict (clave) do nothing;

insert into public.s5_secciones (formato_id, clave, nombre, corto, que, jp, orden)
select f.id, x.clave, x.nombre, x.corto, x.que, x.jp, x.orden
  from public.s5_formatos f
  join (values
    ('5s', 'clasificar',   'Clasificar',   '1S', 'Solo lo que se usa',                    'Seiri',    1),
    ('5s', 'ordenar',      'Ordenar',      '2S', 'Un lugar para cada cosa',               'Seiton',   2),
    ('5s', 'limpiar',      'Limpiar',      '3S', 'Limpio y sin fuentes de suciedad',      'Seiso',    3),
    ('5s', 'estandarizar', 'Estandarizar', '4S', 'Lo visual y lo acordado, al día',       'Seiketsu', 4),
    ('5s', 'disciplina',   'Disciplina',   '5S', 'Que se sostenga',                       'Shitsuke', 5),
    ('ptl', 'ptl_ubicacion',      'Ubicación',      'UBI',  'Cada producto en su módulo y por ABC', null, 1),
    ('ptl', 'ptl_fefo',           'FEFO',           'FEFO', 'Lo más viejo, accesible',              null, 2),
    ('ptl', 'ptl_estibas',        'Estibas',        'EST',  'Estibas sanas y bien arrumadas',       null, 3),
    ('ptl', 'ptl_producto',       'Producto',       'PRO',  'Sin golpes y lo averiado aparte',      null, 4),
    ('ptl', 'ptl_pasillos',       'Pasillos',       'PAS',  'Pasillos y bahías libres',             null, 5),
    ('ptl', 'ptl_identificacion', 'Identificación', 'IDE',  'Demarcación y señales a la vista',     null, 6)
  ) as x(formato, clave, nombre, corto, que, jp, orden) on x.formato = f.clave
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 2. PUNTOS E INSPECCIONES LLEVAN SU FORMATO
-- ---------------------------------------------------------------------
alter table public.s5_puntos       add column if not exists formato_id uuid references public.s5_formatos(id) on delete cascade;
alter table public.s5_inspecciones add column if not exists formato_id uuid references public.s5_formatos(id) on delete set null;
alter table public.s5_inspecciones add column if not exists formato    text;

update public.s5_puntos       set formato_id = (select id from public.s5_formatos where clave = '5s') where formato_id is null;
update public.s5_inspecciones set formato_id = (select id from public.s5_formatos where clave = '5s'),
                                  formato    = (select nombre from public.s5_formatos where clave = '5s')
 where formato_id is null;
alter table public.s5_puntos alter column formato_id set not null;
create index if not exists s5_puntos_formato on public.s5_puntos (formato_id) where activo;
create index if not exists s5_inspecciones_formato on public.s5_inspecciones (formato_id, fecha desc);

/* La «s» de un punto ya no es solo una de las cinco S: es la clave de una sección de su formato. */
alter table public.s5_puntos drop constraint if exists s5_puntos_s_check;
create or replace function public.s5_punto_seccion() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not exists (select 1 from public.s5_secciones where clave = new.s and formato_id = new.formato_id) then
    raise exception 'La sección «%» no es de ese formato.', new.s;
  end if;
  return new;
end $$;
drop trigger if exists s5_punto_seccion on public.s5_puntos;
create trigger s5_punto_seccion before insert or update of s, formato_id on public.s5_puntos
  for each row execute function public.s5_punto_seccion();

-- ---------------------------------------------------------------------
-- 3. EL CHECKLIST DE PTL (borrador: se ajusta en Maestro)
-- ---------------------------------------------------------------------
insert into public.s5_puntos (formato_id, area_id, s, pregunta, peso, exige_foto, orden)
select f.id, null, x.s, x.pregunta, x.peso, x.foto, x.orden
  from public.s5_formatos f
  cross join (values
    ('ptl_ubicacion',      'El producto está en el módulo que le corresponde (no hay producto trocado).', 2, true,  1),
    ('ptl_ubicacion',      'Se respeta el ABC: el producto de alta rotación está adelante.',              1, false, 2),
    ('ptl_fefo',           'El lote más viejo está accesible (no hay producto tapado).',                  2, true,  3),
    ('ptl_fefo',           'El envase cumple FIFO y el módulo está demarcado.',                           1, false, 4),
    ('ptl_estibas',        'No hay estibas en mal estado en el almacenamiento.',                          2, true,  5),
    ('ptl_estibas',        'Paletizado correcto: altura y arrume según el estándar.',                     1, false, 6),
    ('ptl_producto',       'No hay cajas golpeadas, rotas o averiadas en el módulo.',                     2, true,  7),
    ('ptl_producto',       'Lo averiado o PNC está separado e identificado.',                             1, false, 8),
    ('ptl_pasillos',       'Pasillos y bahías libres, sin producto fuera de módulo.',                     1, false, 9),
    ('ptl_identificacion', 'La demarcación y la señalización del módulo se ven.',                         1, false, 10)
  ) as x(s, pregunta, peso, foto, orden)
 where f.clave = 'ptl'
   and not exists (select 1 from public.s5_puntos p where p.formato_id = f.id);

-- ---------------------------------------------------------------------
-- 4. RLS (igual que el resto del maestro de 5S)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['s5_formatos', 's5_secciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.s5_ve()))', t || '_ver', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_maestro', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.s5_edita(''/5s/maestro''))) with check ((select public.s5_edita(''/5s/maestro'')))', t || '_maestro', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. LAS VISTAS TRAEN EL FORMATO
-- ---------------------------------------------------------------------
drop view if exists public.v_s5_inspecciones;
create view public.v_s5_inspecciones with (security_invoker = true) as
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
       (select count(*) from public.s5_fotos f where f.inspeccion_id = i.id and f.momento = 'antes')::integer as fotos
  from public.s5_inspecciones i;
grant select on public.v_s5_inspecciones to authenticated;

create or replace view public.v_s5_hallazgos with (security_invoker = true) as
select p.id, p.inspeccion_id, i.fecha, i.area_id, i.area, i.responsable as area_responsable,
       p.orden, p.s, p.pregunta, p.severidad, p.observacion, p.zona,
       p.accion, p.accion_resp_id, p.accion_resp, p.accion_fecha,
       p.cerrada_el, p.cerrada_por, p.cierre_nota,
       case
         when p.cerrada_el is not null then 'cerrada'
         when p.accion is null then 'sin_plan'
         when p.accion_fecha < (now() at time zone 'America/Bogota')::date then 'vencida'
         else 'abierta'
       end as estado,
       ((coalesce((p.cerrada_el at time zone 'America/Bogota')::date, (now() at time zone 'America/Bogota')::date)) - i.fecha) as dias,
       (select count(*) from public.s5_fotos f where f.item_id = p.id and f.momento = 'antes')::integer   as fotos_antes,
       (select count(*) from public.s5_fotos f where f.item_id = p.id and f.momento = 'despues')::integer as fotos_despues,
       i.formato_id, i.formato
  from public.s5_inspeccion_puntos p
  join public.s5_inspecciones i on i.id = p.inspeccion_id
 where p.resultado = 'no_cumple';
grant select on public.v_s5_hallazgos to authenticated;

-- ---------------------------------------------------------------------
-- 6. GUARDAR UNA INSPECCIÓN — ahora con su formato
--    p = { id, fecha, area_id, formato_id, nota, puntos: [...] }  (sin formato_id = 5S, como antes)
-- ---------------------------------------------------------------------
create or replace function public.s5_guardar(p jsonb) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_fecha   date := (p->>'fecha')::date;
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_area    public.s5_areas%rowtype;
  v_fmt     public.s5_formatos%rowtype;
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
    raise exception 'No tienes permiso para registrar inspecciones.';
  end if;
  if v_fecha is null then raise exception 'Falta la fecha de la inspección.'; end if;
  if v_fecha > v_hoy then raise exception 'La fecha no puede ser de un día que no ha llegado.'; end if;

  select * into v_area from public.s5_areas where id = (p->>'area_id')::uuid;
  if not found or not v_area.activa then raise exception 'Escoge un área activa.'; end if;
  if nullif(p->>'formato_id', '') is null then
    select * into v_fmt from public.s5_formatos where clave = '5s';
  else
    select * into v_fmt from public.s5_formatos where id = (p->>'formato_id')::uuid;
  end if;
  if not found or not v_fmt.activo then raise exception 'Escoge un formato activo.'; end if;
  if exists (select 1 from public.s5_inspecciones where id = v_id) then
    raise exception 'Esta inspección ya quedó guardada.';
  end if;

  /* La meta: la del área, si no la del formato, si no la general. */
  select coalesce(v_area.meta, v_fmt.meta, (select meta from public.s5_reglas where id = 1), 90) into v_meta;
  select nombre into v_resp from public.s5_responsables where id = v_area.responsable_id;
  select nullif(trim(nombre), '') into v_aud from public.perfiles where id = auth.uid();

  insert into public.s5_inspecciones (id, fecha, area_id, area, responsable, auditor, auditor_nombre, cumplimiento, meta, nota, formato_id, formato)
  values (v_id, v_fecha, v_area.id, v_area.nombre, v_resp, auth.uid(), v_aud, 0, v_meta, nullif(trim(p->>'nota'), ''), v_fmt.id, v_fmt.nombre);

  for r in select * from jsonb_array_elements(coalesce(p->'puntos', '[]'::jsonb)) loop
    select * into v_pt from public.s5_puntos
     where id = (r->>'punto_id')::uuid and activo and formato_id = v_fmt.id and (area_id is null or area_id = v_area.id);
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
   where activo and formato_id = v_fmt.id and (area_id is null or area_id = v_area.id) and not (id = any(v_vistos));
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
declare v_f int; v_s int; v_p int;
begin
  select count(*) into v_f from public.s5_formatos;
  select count(*) into v_s from public.s5_secciones;
  select count(*) into v_p from public.s5_puntos p join public.s5_formatos f on f.id = p.formato_id where f.clave = 'ptl';
  raise notice '----------------------------------------------------------';
  raise notice 'formatos ............. % (5S y PTL)', v_f;
  raise notice 'secciones ............ % (5 de 5S + 6 de PTL)', v_s;
  raise notice 'puntos de PTL ........ %', v_p;
  raise notice '----------------------------------------------------------';
end $$;
