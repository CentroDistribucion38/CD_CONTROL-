-- =====================================================================
-- NOVEDADES DE T1 / T2 · CADA NOVEDAD ES UN CASO
--
-- Lo que pidió la hoja de la bodega:
--   · Turno (AUTOMÁTICO: sale de la hora de la novedad, nadie lo escribe).
--   · CD que reporta, y «planta origen → CD» (ya sale del viaje).
--   · SKU afectado, factura, lote, cantidad: ya existían; el SKU ahora se guarda.
--   · Foto 1 y foto 2 (opcional).
--   · Módulo de gestión: # de caso, estado (Abierto · En proceso · Cerrado) y observación.
--
-- CUÁNDO ES CADA ESTADO
--   Abierto     nace así. Nadie la ha respondido ni ha escrito gestión.
--   En proceso  pasa SOLA cuando alguien la responde, escribe la observación o
--               toca «Tomar el caso». Queda quién la tomó y cuándo. Se puede
--               devolver a Abierto a mano.
--   Cerrado     solo a mano y EXIGE decir qué se hizo (mínimo 10 letras). Ya no se mueve.
--
-- Correr en el editor SQL de Supabase. Se puede correr dos veces.
-- Si el editor se queja de «unsafe use of new value» al estrenar el estado,
-- corre primero SOLO la línea del paso 1 y después el resto.
-- =====================================================================

-- 1. El estado nuevo, ENTRE abierta y cerrada: así el orden de la lista
--    (abiertas, en proceso, cerradas) sale del propio tipo.
alter type estado_novedad add value if not exists 'en_proceso' before 'cerrada';

-- 2. Lo que se guarda de más.
alter table public.sider_novedades
  add column if not exists turno           text,
  add column if not exists cd_reporta      text,
  add column if not exists foto_ruta2      text,
  add column if not exists observacion     text,
  add column if not exists observacion_por uuid references public.perfiles(id) on delete set null,
  add column if not exists observacion_en  timestamptz,
  add column if not exists tomada_por      uuid references public.perfiles(id) on delete set null,
  add column if not exists tomada_en       timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'novedad_turno_conocido') then
    alter table public.sider_novedades add constraint novedad_turno_conocido
      check (turno is null or turno in ('A', 'B', 'C'));
  end if;
end $$;

-- 3. EL # DE CASO: consecutivo, uno por novedad, que no se repite.
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_novedades' and column_name = 'caso') then
    alter table public.sider_novedades add column caso bigint;
    -- Las que ya existen se numeran en el orden en que se reportaron.
    with o as (select id, row_number() over (order by creada_en, id) as rn from public.sider_novedades)
    update public.sider_novedades n set caso = o.rn from o where o.id = n.id;
  end if;
end $$;

create sequence if not exists public.sider_novedad_caso_seq;
select setval('public.sider_novedad_caso_seq',
              (select coalesce(max(caso), 0) from public.sider_novedades) + 1, false);
alter table public.sider_novedades alter column caso set default nextval('public.sider_novedad_caso_seq');
update public.sider_novedades set caso = nextval('public.sider_novedad_caso_seq') where caso is null;
alter table public.sider_novedades alter column caso set not null;
create unique index if not exists sider_novedades_caso_uq on public.sider_novedades (caso);

-- 4. Las fotos van al bucket `sider`, bajo novedades/<id>/. Se suben con la
--    sesión de quien reporta; verlas, cualquiera que entre (por enlace firmado).
drop policy if exists sider_novedad_foto_subir on storage.objects;
create policy sider_novedad_foto_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sider' and name like 'novedades/%'
              and public.puede_editar('/sider/novedades'));

drop policy if exists sider_novedad_foto_ver on storage.objects;
create policy sider_novedad_foto_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'sider' and name like 'novedades/%');

-- 5. La vista, con lo nuevo.
drop view if exists public.v_sider_novedades;
create view public.v_sider_novedades as
select
  n.id, n.caso, n.tramo, n.tipo, n.motivo,
  m.nombre                                   as motivo_nombre,
  n.viaje_id, n.placa, n.fecha, n.hora, n.turno, n.cd_reporta,
  n.factura, n.lote, n.sku, n.cantidad, n.unidad,
  n.descripcion, n.foto_ruta, n.foto_ruta2,
  n.cd_responsable, n.compromiso, n.fecha_compromiso,
  n.estado, n.que_se_hizo, n.cerrada_por, n.cerrada_en,
  n.observacion, n.observacion_por, n.observacion_en,
  n.tomada_por, n.tomada_en,
  n.creada_por, n.creada_en,
  case when n.estado = 'cerrada'
       then (n.cerrada_en::date - n.fecha)
       else (current_date - n.fecha) end          as dias,
  (n.estado <> 'cerrada' and n.fecha_compromiso is not null
   and n.fecha_compromiso < current_date)         as vencida,
  (select count(*) from public.sider_novedad_hilo h where h.novedad_id = n.id) as respuestas,
  o.cd_origen,
  s.descripcion                              as material,
  v.estado::text                             as estado_viaje,
  (n.viaje_id is not null)                   as pegada_a_viaje
from public.sider_novedades n
join public.sider_novedad_motivos m on m.clave = n.motivo
left join public.sider_viajes   v on v.id     = n.viaje_id
left join public.sider_origenes o on o.planta = v.planta
left join public.sider_skus     s on s.sku    = v.sku;

grant select on public.v_sider_novedades to authenticated;

-- 6. Reportar: ahora guarda el turno (AUTOMÁTICO), el CD que reporta y la foto 2.
drop function if exists public.sider_novedad_reportar(
  text, text, text, text, date, text, uuid, text, text,
  text, text, text, numeric, text, time);

create or replace function public.sider_novedad_reportar(
  p_tramo       text,
  p_tipo        text,
  p_motivo      text,
  p_placa       text,
  p_fecha       date,
  p_descripcion text default null,
  p_viaje_id    uuid default null,
  p_foto_ruta   text default null,
  p_responsable text default null,
  p_factura     text default null,
  p_lote        text default null,
  p_sku         text default null,
  p_cantidad    numeric default null,
  p_unidad      text default null,
  p_hora        time default null,
  p_cd_reporta  text default null,
  p_foto_ruta2  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa text; v_resp text; v_id uuid; v_fact text; v_lote text; v_sku text;
  v_hora  time; v_turno text;
begin
  if not public.es_editor() then
    raise exception 'Reportar una novedad requiere rol de supervisor o administrador';
  end if;

  if p_viaje_id is not null then
    select upper(btrim(v.placa)), o.cd_origen, v.factura, v.lote, v.sku
      into v_placa, v_resp, v_fact, v_lote, v_sku
      from public.sider_viajes v
      left join public.sider_origenes o on o.planta = v.planta
     where v.id = p_viaje_id;
    if v_placa is null then raise exception 'Ese viaje no existe'; end if;
    v_fact := coalesce(nullif(upper(btrim(coalesce(p_factura, ''))), ''), v_fact);
    v_lote := coalesce(nullif(upper(btrim(coalesce(p_lote,    ''))), ''), v_lote);
    v_sku  := coalesce(nullif(btrim(coalesce(p_sku, '')), ''), v_sku);
  else
    v_placa := upper(btrim(coalesce(p_placa, '')));
    v_resp  := nullif(btrim(coalesce(p_responsable, '')), '');
    v_fact  := nullif(upper(btrim(coalesce(p_factura, ''))), '');
    v_lote  := nullif(upper(btrim(coalesce(p_lote,    ''))), '');
    v_sku   := nullif(btrim(coalesce(p_sku, '')), '');
    if v_placa = '' then raise exception 'Sin viaje hay que escribir la placa'; end if;
  end if;

  if p_fecha > current_date then
    raise exception 'La fecha de la novedad no puede ser futura';
  end if;
  if p_cantidad is not null and p_cantidad <= 0 then
    raise exception 'La cantidad afectada tiene que ser mayor que cero';
  end if;
  if (p_foto_ruta  is not null and p_foto_ruta  not like 'novedades/%')
  or (p_foto_ruta2 is not null and p_foto_ruta2 not like 'novedades/%') then
    raise exception 'Esa ruta de foto no es de una novedad';
  end if;

  /* EL TURNO SE DEDUCE, NO SE ESCRIBE: de la hora de la novedad; si no se
     dio, de la hora de ahora en Colombia. A 06–14, B 14–22, C 22–06. */
  v_hora  := coalesce(p_hora, (now() at time zone 'America/Bogota')::time);
  v_turno := case when v_hora >= time '06:00' and v_hora < time '14:00' then 'A'
                  when v_hora >= time '14:00' and v_hora < time '22:00' then 'B'
                  else 'C' end;

  insert into public.sider_novedades
    (tramo, tipo, motivo, viaje_id, placa, fecha, hora, turno, cd_reporta, descripcion,
     foto_ruta, foto_ruta2, cd_responsable, factura, lote, sku, cantidad, unidad, creada_por)
  values
    (p_tramo::tramo_novedad, p_tipo::tipo_novedad, p_motivo, p_viaje_id, v_placa,
     p_fecha, p_hora, v_turno, nullif(btrim(coalesce(p_cd_reporta, '')), ''),
     nullif(btrim(coalesce(p_descripcion, '')), ''),
     p_foto_ruta, p_foto_ruta2, v_resp, v_fact, v_lote, v_sku, p_cantidad,
     case when p_cantidad is not null
          then coalesce(nullif(btrim(coalesce(p_unidad, '')), ''), 'estibas') end,
     auth.uid())
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.sider_novedad_reportar(
  text, text, text, text, date, text, uuid, text, text,
  text, text, text, numeric, text, time, text, text) to authenticated;

-- 7. Responder: además de guardar la respuesta, TOMA el caso (abierta → en proceso).
create or replace function public.sider_novedad_responder(
  p_id          uuid,
  p_texto       text,
  p_desde       text default null,
  p_compromiso  text default null,
  p_fecha_comp  date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado estado_novedad;
begin
  if not public.es_editor() then
    raise exception 'Responder una novedad requiere rol de supervisor o administrador';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'La respuesta no puede ir vacía';
  end if;

  select estado into v_estado from public.sider_novedades where id = p_id;
  if v_estado is null then raise exception 'Esa novedad ya no está'; end if;
  if v_estado = 'cerrada' then
    raise exception 'Esa novedad ya está cerrada: si hay algo más que decir, se abre una nueva';
  end if;

  insert into public.sider_novedad_hilo (novedad_id, texto, desde, escrita_por)
  values (p_id, btrim(p_texto), nullif(btrim(coalesce(p_desde, '')), ''), auth.uid());

  if btrim(coalesce(p_compromiso, '')) <> '' or p_fecha_comp is not null then
    update public.sider_novedades
       set compromiso = nullif(btrim(coalesce(p_compromiso, '')), ''),
           fecha_compromiso = p_fecha_comp
     where id = p_id;
  end if;

  /* Responder es atender: si estaba abierta, pasa a en proceso. */
  update public.sider_novedades
     set estado = 'en_proceso'::estado_novedad,
         tomada_por = coalesce(tomada_por, auth.uid()),
         tomada_en  = coalesce(tomada_en, now())
   where id = p_id and estado = 'abierta';
end $$;

grant execute on function public.sider_novedad_responder(uuid, text, text, text, date) to authenticated;

-- 8. GESTIONAR: cambiar el estado entre Abierto y En proceso, y escribir la observación.
--    Cerrar sigue siendo sider_novedad_cerrar (obliga a decir qué se hizo).
create or replace function public.sider_novedad_gestionar(
  p_id          uuid,
  p_estado      text default null,
  p_observacion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado estado_novedad; v_nuevo estado_novedad; v_obs text;
begin
  if not public.es_editor() then
    raise exception 'Gestionar una novedad requiere rol de supervisor o administrador';
  end if;
  select estado into v_estado from public.sider_novedades where id = p_id;
  if v_estado is null then raise exception 'Esa novedad ya no está'; end if;
  if v_estado = 'cerrada' then raise exception 'Esa novedad ya está cerrada'; end if;

  if p_estado is not null and p_estado not in ('abierta', 'en_proceso') then
    raise exception 'Para cerrarla usa «Cerrar»: hay que decir qué se hizo';
  end if;
  v_obs := nullif(btrim(coalesce(p_observacion, '')), '');
  v_nuevo := coalesce(p_estado::estado_novedad, v_estado);
  /* Escribir la observación también es atender: abierta pasa a en proceso. */
  if v_obs is not null and v_nuevo = 'abierta' and p_estado is null then
    v_nuevo := 'en_proceso'::estado_novedad;
  end if;

  update public.sider_novedades
     set estado = v_nuevo,
         tomada_por = case when v_nuevo = 'en_proceso'::estado_novedad
                           then coalesce(tomada_por, auth.uid()) else tomada_por end,
         tomada_en  = case when v_nuevo = 'en_proceso'::estado_novedad
                           then coalesce(tomada_en, now()) else tomada_en end,
         observacion     = case when p_observacion is null then observacion else v_obs end,
         observacion_por = case when p_observacion is null then observacion_por else auth.uid() end,
         observacion_en  = case when p_observacion is null then observacion_en  else now() end
   where id = p_id;
end $$;

grant execute on function public.sider_novedad_gestionar(uuid, text, text) to authenticated;

-- 8b. CERRAR EXIGE ALGO: decir qué se hizo, con un poco de detalle (no un «ok»).
--     Una novedad cerrada tiene que poder leerse seis meses después y entenderse.
create or replace function public.sider_novedad_cerrar(
  p_id uuid,
  p_que_se_hizo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado estado_novedad;
begin
  if not public.es_editor() then
    raise exception 'Cerrar una novedad requiere rol de supervisor o administrador';
  end if;
  if btrim(coalesce(p_que_se_hizo, '')) = '' then
    raise exception 'Para cerrar hay que decir qué se hizo';
  end if;
  if char_length(btrim(p_que_se_hizo)) < 10 then
    raise exception 'Cuenta qué se hizo con un poco más de detalle (mínimo 10 letras)';
  end if;

  select estado into v_estado from public.sider_novedades where id = p_id;
  if v_estado is null then raise exception 'Esa novedad ya no está'; end if;
  if v_estado = 'cerrada' then raise exception 'Esa novedad ya estaba cerrada'; end if;

  update public.sider_novedades
     set estado = 'cerrada',
         que_se_hizo = btrim(p_que_se_hizo),
         cerrada_por = auth.uid(),
         cerrada_en = now()
   where id = p_id;
end $$;

grant execute on function public.sider_novedad_cerrar(uuid, text) to authenticated;

-- 9. Comprobación. Todo tiene que decir 'ok'.
do $$
declare v_vista boolean; v_fns integer; v_sin integer;
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_sider_novedades' and column_name = 'caso') into v_vista;
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('sider_novedad_reportar', 'sider_novedad_cerrar', 'sider_novedad_responder', 'sider_novedad_gestionar');
  select count(*) into v_sin from public.sider_novedades where caso is null;
  raise notice 'vista con # de caso ..... %', case when v_vista then 'ok' else 'MAL' end;
  raise notice 'las cuatro funciones .... % (%)', case when v_fns = 4 then 'ok' else 'MAL' end, v_fns;
  raise notice 'novedades sin # de caso . % (%)', case when v_sin = 0 then 'ok' else 'MAL' end, v_sin;
  raise notice 'estado en_proceso ....... %',
    case when exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                       where t.typname = 'estado_novedad' and e.enumlabel = 'en_proceso') then 'ok' else 'MAL' end;
end $$;
