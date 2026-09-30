-- =====================================================================
-- SIDER · EL VH INTERNO DICE SI ES DE UN SOCIO O DE T1, Y LA REVISIÓN AI
--        YA NO LO PREGUNTA OTRA VEZ
--
-- «En el Vh Interno debemos agregar si es Socio o si es T1. Si es Socio
--  no tendremos número de documento o factura, sino qué socio es; si es
--  T1, el número de factura. Con el fin de que cuando se vaya a hacer la
--  Revisión AI de quién y de qué, nada más registremos de las botellas
--  recibidas cuántas se revisaron y el resto de la información ya viene
--  de las fichas.»
--
-- QUÉ CAMBIA
--   1. `sider_viajes.ai_canal` y `ai_socio`: el canal (socios / t1) y, si
--      es de un socio, cuál. Los llena el «+» de Vh Interno; los viajes
--      certificados por Sider quedan en NULL (ahí el canal se escoge en la
--      revisión, como siempre).
--   2. `sider_skus.envase_ai`: a qué tipo de envase de la Revisión AI
--      (CB320, F330, M750…) corresponde cada material. Se llena solo, con
--      la regla del nombre —«Envase Marron 330R» → M330—, y NO pisa lo que
--      alguien ya haya puesto a mano. Así la revisión trae el envase sin
--      que nadie lo escoja.
--   3. `sider_viaje_interno_crear` y `_varios` aceptan `p_canal` y
--      `p_socio`. REGLAS:
--        · canal «socios» → el socio es obligatorio y NO hay documento
--          (la factura queda vacía);
--        · canal «t1»     → el documento es obligatorio (solo números,
--          hasta 10 dígitos) y no lleva socio;
--        · sin canal (código viejo) → como siempre: documento obligatorio.
--      Las dos se recrean con la MISMA lista de parámetros y dos más con
--      valor por defecto: quien las llame como antes sigue funcionando, y
--      no queda una segunda versión que Postgres no sepa escoger.
--   4. `v_sider_revision_pendientes` trae `canal`, `socio` y `envase` al
--      final: la pantalla precarga el formulario con eso.
--
-- SE PUEDE CORRER VARIAS VECES. Va DESPUÉS de
-- 2026-09-sider-revision-ai-interna.sql y de
-- 2026-09-sider-interno-varios-materiales.sql: si alguien vuelve a correr
-- alguna de las dos, que corra esta otra vez al final.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.sider_viaje_interno_crear(text,text,text,text,numeric,text,text,text)') is null
     and to_regprocedure('public.sider_viaje_interno_crear(text,text,text,text,numeric,text,text,text,text,text)') is null then
    raise exception 'Falta 2026-09-sider-revision-ai-interna.sql: córrelo primero.';
  end if;
  if to_regclass('public.sider_ai_canales') is null or to_regclass('public.sider_ai_socios') is null
     or to_regclass('public.sider_ai_envases') is null then
    raise exception 'Falta supabase/modulos/sider-ai.sql: córrelo primero.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. EL CANAL Y EL SOCIO DEL VIAJE
-- ---------------------------------------------------------------------
alter table public.sider_viajes
  add column if not exists ai_canal text references public.sider_ai_canales(clave),
  add column if not exists ai_socio text references public.sider_ai_socios(clave);

comment on column public.sider_viajes.ai_canal is
  'Canal de envase del Vh Interno (socios / t1). NULL en los viajes certificados por Sider: ahí se escoge al revisar.';
comment on column public.sider_viajes.ai_socio is
  'Socio dueño de los envases, solo cuando ai_canal = socios.';

do $$ begin
  alter table public.sider_viajes
    add constraint sider_viaje_socio_solo_socios check (ai_socio is null or ai_canal = 'socios');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. QUÉ ENVASE DE LA REVISIÓN ES CADA MATERIAL
--
-- La regla es la del nombre: el color (Flint → F, Marrón → M, Costeñita
-- → G, Costeña Bacana → CB) y el litraje que trae escrito (330, 750,
-- 1000…). Solo se propone si ESA clave existe en los envases de la
-- Revisión AI, y solo a los materiales «EER» (las cajas, estibas y
-- cilindros no son botellas y no se revisan). No pisa una clave ya puesta.
-- ---------------------------------------------------------------------
alter table public.sider_skus
  add column if not exists envase_ai text references public.sider_ai_envases(clave);

comment on column public.sider_skus.envase_ai is
  'Tipo de envase de la Revisión AI que le corresponde a este material (precarga el formulario).';

update public.sider_skus k
   set envase_ai = c.clave
  from (
    select s.sku,
           (case
              when upper(s.descripcion) like '%COSTE_A%BACANA%' then 'CB'
              when upper(s.descripcion) like '%COSTE_ITA%'      then 'G'
              when upper(s.descripcion) like '%FLINT%'          then 'F'
              when upper(s.descripcion) like '%MARR%N%'         then 'M'
            end)
           || substring(s.descripcion from '([0-9]{3,4})') as clave
      from public.sider_skus s
     where s.clase = 'EER'
  ) c
 where k.sku = c.sku
   and k.envase_ai is null
   and c.clave is not null
   and exists (select 1 from public.sider_ai_envases e where e.clave = c.clave);


-- ---------------------------------------------------------------------
-- 3. CREAR EL VH INTERNO — CON CANAL Y SOCIO
--
-- Se borran las versiones sin canal para que quede UNA sola función con
-- ese nombre: dos versiones que solo se distinguen por parámetros con
-- valor por defecto hacen que Postgres responda «function is not unique».
-- ---------------------------------------------------------------------
drop function if exists public.sider_viaje_interno_crear(text, text, text, text, numeric, text, text, text);
drop function if exists public.sider_viaje_interno_crear_varios(text, text, text, text, jsonb);

create or replace function public.sider_viaje_interno_crear(
  p_placa   text,
  p_planta  text,
  p_destino text,
  p_sku     text,
  p_estibas numeric,
  p_factura text default null,
  p_lote    text default null,
  p_nota    text default null,
  p_canal   text default null,
  p_socio   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_placa   text := upper(btrim(coalesce(p_placa, '')));
  v_origen  text;
  v_destino text := btrim(coalesce(p_destino, ''));
  v_dest_ok text;
  v_doc     text := btrim(coalesce(p_factura, ''));
  v_canal   text := nullif(lower(btrim(coalesce(p_canal, ''))), '');
  v_socio   text := nullif(btrim(coalesce(p_socio, '')), '');
begin
  /* EL «+» TIENE SU PROPIO PERMISO, no el de Tránsito. */
  if not public.puede_editar('/sider/sorting/nuevo') then
    raise exception 'Crear un Vh Interno requiere el permiso «Vh Interno» (Roles)';
  end if;

  if v_placa = '' then
    raise exception 'Falta la placa';
  end if;
  if v_doc <> '' and v_doc !~ '^[0-9]{1,10}$' then
    raise exception 'El documento son solo números, hasta 10 dígitos';
  end if;
  if v_placa !~ '^[A-Z]{3}[0-9]{3}$' then
    raise exception 'La placa son 3 letras y 3 números, sin más (por ejemplo ABC123)';
  end if;

  /* EL CANAL SE VALIDA CONTRA EL MAESTRO, y de él depende qué más se pide:
     socios → el socio, sin documento; t1 → el documento, sin socio. */
  if v_canal is not null and not exists (
       select 1 from public.sider_ai_canales where clave = v_canal and activo) then
    raise exception 'Ese canal no existe o está apagado';
  end if;
  if v_canal = 'socios' then
    if v_socio is null then
      raise exception 'Falta el socio';
    end if;
    if not exists (select 1 from public.sider_ai_socios where clave = v_socio and activo) then
      raise exception 'Ese socio no existe o está apagado';
    end if;
  else
    v_socio := null;
  end if;

  select o.cd_origen into v_origen
    from public.sider_origenes o where o.planta = p_planta and o.activo;
  if v_origen is null then
    raise exception 'Ese origen no existe o está apagado';
  end if;

  if v_destino = '' then
    raise exception 'Falta el destino';
  end if;
  select o.cd_origen into v_dest_ok
    from public.sider_origenes o
   where o.activo and lower(btrim(o.cd_origen)) = lower(v_destino)
   limit 1;
  if v_dest_ok is null and lower(v_destino) = 'barranquilla' then
    v_dest_ok := 'Barranquilla';
  end if;
  if v_dest_ok is null then
    raise exception 'Ese destino no es un CD del maestro';
  end if;
  if lower(btrim(v_dest_ok)) = lower(btrim(v_origen)) then
    raise exception 'El origen y el destino son el mismo CD';
  end if;

  if not exists (select 1 from public.sider_skus where sku = btrim(coalesce(p_sku, '')) and activo) then
    raise exception 'Ese material no existe en el maestro o está apagado';
  end if;

  if p_estibas is null or p_estibas <= 0 then
    raise exception 'Las estibas tienen que ser más de cero';
  end if;

  /* EL DOCUMENTO: obligatorio salvo en un socio, que no lo tiene. */
  if v_doc = '' and v_canal is distinct from 'socios' then
    raise exception 'Falta el documento (número de factura, solo números, hasta 10 dígitos)';
  end if;

  insert into public.sider_viajes
    (placa, planta, cd_destino, sku, estibas, factura, lote, observacion,
     fecha, creado_por, interno, requiere_sorting, sorting_pedido_por, sorting_pedido_en, estado,
     ai_canal, ai_socio)
  values
    (v_placa, p_planta, v_dest_ok, btrim(p_sku), p_estibas,
     nullif(v_doc, ''),
     nullif(upper(btrim(coalesce(p_lote, ''))), ''),
     nullif(btrim(coalesce(p_nota, '')), ''),
     (now() at time zone 'America/Bogota')::date,
     auth.uid(), true, true, auth.uid(), now(), 'recibido',
     v_canal, v_socio)
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.sider_viaje_interno_crear(text, text, text, text, numeric, text, text, text, text, text)
  to authenticated;


create or replace function public.sider_viaje_interno_crear_varios(
  p_placa   text,
  p_planta  text,
  p_destino text,
  p_factura text,
  p_lineas  jsonb,
  p_canal   text default null,
  p_socio   text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[] := '{}';
  v_l     jsonb;
  v_sku   text;
  v_est   numeric;
  v_vistos text[] := '{}';
begin
  if not public.puede_editar('/sider/sorting/nuevo') then
    raise exception 'Crear un Vh Interno requiere el permiso «Vh Interno» (Roles)';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Falta al menos un material con sus estibas';
  end if;
  if jsonb_array_length(p_lineas) > 10 then
    raise exception 'Un Vh Interno lleva máximo 10 materiales';
  end if;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_l) <> 'object' then
      raise exception 'Cada material debe traer su código y sus estibas';
    end if;
    v_sku := btrim(coalesce(v_l ->> 'sku', ''));
    if v_sku = '' then
      raise exception 'A un material le falta el código';
    end if;
    if v_sku = any (v_vistos) then
      raise exception 'El material % está repetido: suma sus estibas en una sola línea', v_sku;
    end if;
    v_vistos := v_vistos || v_sku;

    begin
      v_est := (v_l ->> 'estibas')::numeric;
    exception when others then
      raise exception 'Las estibas del material % no son un número', v_sku;
    end;

    v_ids := v_ids || public.sider_viaje_interno_crear(
      p_placa, p_planta, p_destino, v_sku, v_est, p_factura, null, null, p_canal, p_socio);
  end loop;

  return v_ids;
end $$;

grant execute on function public.sider_viaje_interno_crear_varios(text, text, text, text, jsonb, text, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 4. LA LISTA DE «REVISIÓN AI» TRAE LO QUE EL FORMULARIO PRECARGA
--
-- Solo se AGREGAN columnas al final: `create or replace view` no deja
-- mover ni quitar las que ya estaban. El cuerpo es el de
-- 2026-09-sider-revision-ai-interna.sql, sin tocar.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_revision_pendientes as
select
  v.id as viaje_id, 'ai'::text as tipo, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.ai_pedido_en as pedido_en, v.ai_pedido_por as pedido_por, v.ai_motivo as motivo,
  v.interno,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en,
  v.ai_canal as canal, v.ai_socio as socio, k.envase_ai as envase
from public.sider_viajes v
left join public.perfiles p on p.id = v.ai_pedido_por
left join public.sider_skus k on k.sku = v.sku
where v.requiere_ai
  and v.estado <> 'anulado'
  and (v.interno or exists (select 1 from public.sider_certificaciones c
               where c.viaje_id = v.id and c.punta = 'llegada'))
  and not exists (select 1 from public.sider_ai_revisiones r
                   where r.viaje_id = v.id and r.tipo = 'ai')
union all
select
  v.id, 'sorting'::text, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date),
  v.sorting_pedido_en, v.sorting_pedido_por, null::text,
  v.interno,
  p.nombre,
  coalesce((select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada'), case when v.interno then v.creado_en end),
  v.ai_canal, v.ai_socio, k.envase_ai
from public.sider_viajes v
left join public.perfiles p on p.id = v.sorting_pedido_por
left join public.sider_skus k on k.sku = v.sku
where v.requiere_sorting
  and v.estado <> 'anulado'
  and (v.interno or exists (select 1 from public.sider_certificaciones c
               where c.viaje_id = v.id and c.punta = 'llegada'))
  and not exists (select 1 from public.sider_ai_revisiones r
                   where r.viaje_id = v.id and r.tipo = 'sorting');

grant select on public.v_sider_revision_pendientes to authenticated;


do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('sider_viaje_interno_crear', 'sider_viaje_interno_crear_varios');
  if v_n <> 2 then
    raise exception 'Quedaron % funciones de Vh Interno y deben ser exactamente 2: una versión vieja sigue viva.', v_n;
  end if;
  raise notice 'Listo: el Vh Interno guarda si es de un socio o de T1 y la revisión lo trae precargado.';
end $$;

commit;
