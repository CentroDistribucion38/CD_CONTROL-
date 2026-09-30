-- =====================================================================
-- SIDER · REVISIÓN AI: NORMAL Y CERTIFICADA — Y EL «+» DE «VH INTERNO»
--
-- «Lo que se llama Sorting que se llame Revisión AI, y allí dentro lo
--  segregado: lo que llega como Revisión AI – normal, y lo que es por
--  Sider certificado como Revisión AI – certificada. Dentro del tránsito
--  debe haber un «+», un formulario donde la persona de control escriba
--  el origen, el destino, el material y la cantidad de estibas, y de esa
--  manera creamos las certificaciones internas.»
--
-- CAMBIO POSTERIOR: «el camión interno que se llame Vh Interno, que no
--  aparezca en Tránsito sino en Revisión AI, para que un rol lo cree ahí
--  mismo: no va a pedir certificación de llegada. Y que lleve el número
--  de documento, máximo 10 dígitos.»
--
-- ---------------------------------------------------------------------
-- QUÉ CAMBIA EN LA BASE
-- ---------------------------------------------------------------------
--   1. `sider_viajes.interno`: el camión lo creó alguien de control con
--      el «+», no llegó certificado por Sider. No tiene salida.
--   2. `sider_viaje_interno_crear(...)`: crea el «Vh Interno» YA RECIBIDO
--      y marcado para la revisión normal. NO pasa por Tránsito y NO pide
--      certificación de llegada (ni GPS ni fotos): cae directo en la lista
--      de «Revisión AI – normal». Lleva el número de documento: solo
--      dígitos, hasta 10.
--   3. `sider_certificar_llegada`: un interno no exige las tres fotos de
--      una salida que nunca existió (queda por los viejos que aún estén en
--      camino; los que ya existían en tránsito pasan a recibidos abajo).
--   4. `v_sider_ai` y `v_sider_ai_detalle` ahora traen LAS DOS revisiones
--      —la normal y la certificada— con la columna `tipo` para
--      separarlas. Esto CAMBIA EL COBRO: hasta ahora un Sorting no
--      entraba al informe, y por decisión de Cristian ahora sí, marcado.
--   5. `v_sider_revision_pendientes`: la lista de trabajo de la pantalla
--      «Revisión AI», con las dos clases. Solo entran camiones cuya
--      llegada YA está certificada, o que son Vh Interno (que no tienen).
--   6. Un solo permiso para guardar cualquiera de las dos: editar la
--      pantalla «Revisión AI» (/sider/sorting — la ruta no cambia para no
--      dejar huérfanos los permisos ya dados), o el de siempre en Tránsito.
--   9. El permiso del «+» pasa a llamarse «Vh Interno (+)» y a vivir en
--      `/sider/sorting/nuevo`; lo ya dado con la clave vieja se traslada.
--   7. El seguimiento (% de certificación) NO cuenta los internos: Sider
--      no los certificó.
--   8. Un interno no lleva revisión AI certificada, y su marca de
--      revisión normal no se quita: para que no exista, se anula.
--
-- LA RUTA Y LAS DOS CLAVES NO CAMBIAN: `tipo` sigue siendo 'ai' (la
-- certificada) y 'sorting' (la normal). Son claves internas; lo que se
-- ve en pantalla son los nombres nuevos.
--
-- Va DESPUÉS de 2026-09-sider-sorting.sql. Se puede correr varias veces.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.sider_viajes') is null then
    raise exception 'Falta la tabla sider_viajes: corre supabase/modulos/sider.sql primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_viajes'
                    and column_name = 'requiere_sorting') then
    raise exception 'Falta 2026-09-sider-sorting.sql: córrela primero y después esta.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_ai_revisiones'
                    and column_name = 'tipo') then
    raise exception 'Falta 2026-09-sider-sorting.sql: la revisión todavía no tiene «tipo».';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sider_ai_defectos'
                    and column_name = 'en_total_hoja') then
    raise exception 'Falta 2026-09-sider-ai-tres-totales.sql: los defectos todavía no traen las banderas de la hoja.';
  end if;
  if to_regprocedure('public.mi_nivel_pantalla(text)') is null
     or to_regprocedure('public.puede_editar(text)') is null then
    raise exception 'Faltan los permisos por pantalla (mi_nivel_pantalla / puede_editar): corre las migraciones de roles primero.';
  end if;
end $$;



-- ---------------------------------------------------------------------
-- 1. EL CAMIÓN INTERNO
-- ---------------------------------------------------------------------
alter table public.sider_viajes add column if not exists interno boolean not null default false;

comment on column public.sider_viajes.interno is
  'true = Vh Interno: lo creó alguien de control con el «+» de Revisión AI; Sider NO lo certificó '
  '(no tiene salida, ni llegada certificada, ni GPS, ni fotos). No cuenta en el % de certificación.';

create index if not exists sider_viajes_interno_idx
  on public.sider_viajes (interno, estado) where interno;

/* Un interno SIEMPRE lleva la revisión normal: es para lo que existe. Si
   alguien lo desmarcara a mano quedaría un camión recibido que nadie
   revisa y que tampoco es certificado — un camión fantasma. */
do $$ begin
  alter table public.sider_viajes
    add constraint sider_interno_pasa_a_revision check (not interno or requiere_sorting);
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. CREAR EL VH INTERNO — EL «+» DE REVISIÓN AI
--
-- Lo llama la persona de control desde la pantalla «Revisión AI», con el
-- permiso propio «Vh Interno (+)» (`/sider/sorting/nuevo`).
--
-- TODO SE VALIDA CONTRA LOS MAESTROS. El origen y el material salen de
-- desplegables, pero la base no se fía del desplegable: alguien que llame
-- la función a mano no puede inventar un CD ni un material. El destino
-- también es un CD del maestro (o Barranquilla, que es la planta).
--
-- NACE RECIBIDO, NO EN TRÁNSITO. Un Vh Interno no viaja con Sider: lo
-- crea control cuando el camión ya está en el muelle. No pide
-- certificación de llegada —ni GPS ni fotos— y por eso la lista de
-- pendientes lo acepta sin ella. Cae directo en «Revisión AI – normal».
--
-- EL DOCUMENTO (`factura`): solo dígitos, de 1 a 10. La pantalla ya lo
-- exige; aquí se vuelve a exigir porque alguien llama la función a mano.
-- PLACA: tres letras y tres números.
--
-- `fecha` es la de HOY EN COLOMBIA. Sin salida certificada no hay de
-- dónde sacarla, y `creado_en` en UTC cae en el día de mañana después de
-- las 7 de la noche.
-- ---------------------------------------------------------------------
create or replace function public.sider_viaje_interno_crear(
  p_placa   text,
  p_planta  text,
  p_destino text,
  p_sku     text,
  p_estibas numeric,
  p_factura text default null,
  p_lote    text default null,
  p_nota    text default null
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
begin
  /* EL «+» TIENE SU PROPIO PERMISO, no el de Tránsito: quien recibe los
     camiones no tiene por qué poder inventar uno. Sale en Roles como
     «Vh Interno (+)»; nadie lo trae de fábrica salvo quien administra
     la plataforma. */
  if not public.puede_editar('/sider/sorting/nuevo') then
    raise exception 'Crear un Vh Interno requiere el permiso «Vh Interno» (Roles)';
  end if;

  if v_placa = '' then
    raise exception 'Falta la placa';
  end if;
  /* EL DOCUMENTO (factura) ES OBLIGATORIO: solo números, de 1 a 10. Lo que
     está escrito se valida aquí; que falte se dice al final, después de
     los demás datos, para que cada error salga por su nombre. */
  if v_doc <> '' and v_doc !~ '^[0-9]{1,10}$' then
    raise exception 'El documento son solo números, hasta 10 dígitos';
  end if;
  /* LA PLACA SON TRES LETRAS Y TRES NÚMEROS, y nada más. La pantalla ya
     lo exige; aquí se vuelve a exigir porque alguien llama la función a mano. */
  if v_placa !~ '^[A-Z]{3}[0-9]{3}$' then
    raise exception 'La placa son 3 letras y 3 números, sin más (por ejemplo ABC123)';
  end if;

  select o.cd_origen into v_origen
    from public.sider_origenes o where o.planta = p_planta and o.activo;
  if v_origen is null then
    raise exception 'Ese origen no existe o está apagado';
  end if;

  if v_destino = '' then
    raise exception 'Falta el destino';
  end if;
  /* Se guarda el nombre TAL COMO ESTÁ EN EL MAESTRO, no como lo tecleó
     quien llamó: «barranquilla» y «Barranquilla» serían dos destinos en
     cualquier agrupación. */
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

  if v_doc = '' then
    raise exception 'Falta el documento (número de factura, solo números, hasta 10 dígitos)';
  end if;

  insert into public.sider_viajes
    (placa, planta, cd_destino, sku, estibas, factura, lote, observacion,
     fecha, creado_por, interno, requiere_sorting, sorting_pedido_por, sorting_pedido_en, estado)
  values
    (v_placa, p_planta, v_dest_ok, btrim(p_sku), p_estibas,
     nullif(v_doc, ''),
     nullif(upper(btrim(coalesce(p_lote, ''))), ''),
     nullif(btrim(coalesce(p_nota, '')), ''),
     (now() at time zone 'America/Bogota')::date,
     auth.uid(), true, true, auth.uid(), now(), 'recibido')
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.sider_viaje_interno_crear(text, text, text, text, numeric, text, text, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA LLEGADA: UN INTERNO NO EXIGE LAS FOTOS DE UNA SALIDA QUE NO HUBO
-- ---------------------------------------------------------------------
create or replace function public.sider_certificar_llegada(
  p_viaje_id    uuid,
  p_lat         numeric,
  p_lng         numeric,
  p_precision_m numeric,
  p_ubicado_en  timestamptz,
  p_nota        text default null,
  p_direccion   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert uuid;
  v_est  estado_sider;
  v_int  boolean;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede certificar';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Falta la ubicación: no se puede certificar sin saber dónde se hizo';
  end if;

  select estado, interno into v_est, v_int from public.sider_viajes where id = p_viaje_id;
  if v_est is null then raise exception 'Ese viaje no existe'; end if;
  if v_est = 'recibido' then raise exception 'Ese viaje ya está recibido'; end if;
  if v_est = 'anulado'  then raise exception 'Ese viaje está anulado'; end if;

  -- Las tres fotos de la salida son obligatorias antes de recibir: si se
  -- pudiera cerrar un viaje al que le faltan, la evidencia se volvería
  -- opcional en la práctica.
  /* UN CAMIÓN INTERNO NO TIENE SALIDA QUE PROBAR. Lo creó alguien de
     control con el «+» de Revisión AI (hoy ya nace recibido; esto queda
     por los que se crearon antes) para poder recibirlo y pasarlo a la
     Revisión AI: nunca hubo una certificación de salida ni sus tres
     fotos, y exigirlas lo dejaría trancado para siempre. La LLEGADA sí
     se prueba entera —ubicación y sus tres fotos—, eso no cambia.
     Con `coalesce`: un viaje sin la columna marcada no puede saltarse
     la regla por ser NULL. */
  if not coalesce(v_int, false) and (select count(*) from public.sider_fotos f
        join public.sider_certificaciones c on c.id = f.certificacion_id
       where c.viaje_id = p_viaje_id and c.punta = 'salida') < 3 then
    raise exception 'A la salida de ese viaje le faltan fotos: no se puede cerrar todavía';
  end if;

  insert into public.sider_certificaciones
    (viaje_id, punta, lat, lng, precision_m, ubicado_en, direccion, nota, hecha_por)
  values
    (p_viaje_id, 'llegada', p_lat, p_lng, p_precision_m, p_ubicado_en,
     nullif(btrim(coalesce(p_direccion, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_cert;

  /* La observación de la llegada sube también al VIAJE, que es lo que
     lee la Fuente principal. Estaba solo en la certificación, y ahí no
     la ve nadie: quien escribe "llegó con dos estibas menos" lo escribe
     para que aparezca al lado de la fila, no enterrado en el detalle de
     la evidencia.
     No se agrega un segundo campo "observación" en la pantalla: dos
     campos con el mismo nombre y distinto destino son una trampa. Es el
     mismo texto, en los dos sitios.
     Solo pisa lo que hubiera si viene con algo: certificar sin nota no
     puede borrar una observación que el administrador ya corrigió. */
  update public.sider_viajes
     set estado = 'recibido',
         observacion = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), observacion)
   where id = p_viaje_id;
  return v_cert;
end $$;


-- ---------------------------------------------------------------------
-- 4. LAS DOS REVISIONES ENTRAN AL INFORME, CADA UNA CON SU MARCA
--
-- Antes v_sider_ai solo traía tipo 'ai'. Ahora trae las dos y agrega
-- `tipo` AL FINAL —`create or replace view` solo deja agregar columnas
-- al final, y las demás no se mueven de sitio—. Quien la lea sin mirar
-- `tipo` suma las dos, que es lo que se decidió; quien quiera separarlas
-- filtra por `tipo`.
--
-- El cuerpo va COPIADO de 2026-09-sider-sorting.sql, no reescrito: una
-- vista «parecida» revienta con «cannot change name of view column».
-- ---------------------------------------------------------------------
create or replace view public.v_sider_ai as
select
  r.id, r.viaje_id, r.origen, r.fecha, r.planta, r.placa, r.turno,
  r.canal,  c.nombre  as canal_nombre,
  r.socio,  s.nombre  as socio_nombre,
  r.envase, e.descripcion as envase_nombre, e.litros,
  r.certificado, r.recibidas, r.revisadas, r.zcl3, r.comentarios,
  r.revisado_por, r.revisado_en, r.editado_por, r.editado_en, r.ediciones,

  coalesce(t.defectos, 0)::integer  as defectos,
  coalesce(t.otros,    0)::integer  as otros,
  coalesce(t.total,    0)::integer  as marcadas,
  round(coalesce(t.defectos, 0)::numeric / r.revisadas, 6) as indice,
  round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as no_abono,
  r.recibidas
    - round(r.recibidas * coalesce(t.defectos, 0)::numeric / r.revisadas)::integer as abono_sap,
  round(coalesce(t.defectos, 0) * e.litros / 100, 4) as hl_defectos,

  coalesce(t.total_hoja, 0)::integer as defectos_hoja,
  round(coalesce(t.total_hoja, 0)::numeric / r.revisadas, 6) as pct_hoja,
  round(coalesce(t.hl_hoja, 0) * e.litros / 100, 4) as hl_hoja,

  r.tipo
from public.sider_ai_revisiones r
join public.sider_ai_envases  e on e.clave = r.envase
join public.sider_ai_canales  c on c.clave = r.canal
left join public.sider_ai_socios s on s.clave = r.socio
left join (
  select k.revision_id,
         sum(k.unidades) filter (where d.cobra)         as defectos,
         sum(k.unidades) filter (where not d.cobra)     as otros,
         sum(k.unidades)                                as total,
         sum(k.unidades) filter (where d.en_total_hoja) as total_hoja,
         sum(k.unidades) filter (where d.en_hl_hoja)    as hl_hoja
    from public.sider_ai_conteos k
    join public.sider_ai_defectos d on d.clave = k.defecto
   group by k.revision_id
) t on t.revision_id = r.id;

grant select on public.v_sider_ai to authenticated;

create or replace view public.v_sider_ai_detalle as
select
  k.revision_id, k.defecto, d.nombre as defecto_nombre,
  d.cobra, d.en_total_hoja, d.en_hl_hoja, d.orden,
  k.unidades,
  round(k.unidades::numeric / r.revisadas, 6) as pct,
  round(k.unidades * e.litros / 100, 4)       as hl
from public.sider_ai_conteos k
join public.sider_ai_defectos d on d.clave = k.defecto
join public.sider_ai_revisiones r on r.id = k.revision_id
join public.sider_ai_envases e on e.clave = r.envase;

grant select on public.v_sider_ai_detalle to authenticated;


-- ---------------------------------------------------------------------
-- 5. LA LISTA DE TRABAJO DE «REVISIÓN AI»: LAS DOS CLASES, YA LLEGADAS
--
-- Una fila por (camión, tipo). Un camión certificado con la AI pedida
-- aparece como 'ai' —«certificada»—; uno con la revisión normal pedida,
-- como 'sorting' —«normal»—. Solo entran los que YA llegaron: mientras
-- el camión viene en la vía no hay nada que revisar.
--
-- «YA LLEGÓ» SE PREGUNTA IGUAL QUE EN `sider_ai_guardar`: por la
-- certificación de llegada —o por ser Vh Interno, que no la tiene—, no por el estado del viaje. Así la lista y
-- la función que guarda no pueden discrepar. Los anulados no esperan.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_revision_pendientes as
select
  v.id as viaje_id, 'ai'::text as tipo, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.ai_pedido_en as pedido_en, v.ai_pedido_por as pedido_por, v.ai_motivo as motivo,
  v.interno,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en
from public.sider_viajes v
left join public.perfiles p on p.id = v.ai_pedido_por
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
  /* Un Vh Interno no tiene llegada certificada: «llegó» es cuando lo crearon. */
  coalesce((select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada'), case when v.interno then v.creado_en end)
from public.sider_viajes v
left join public.perfiles p on p.id = v.sorting_pedido_por
where v.requiere_sorting
  and v.estado <> 'anulado'
  and (v.interno or exists (select 1 from public.sider_certificaciones c
               where c.viaje_id = v.id and c.punta = 'llegada'))
  and not exists (select 1 from public.sider_ai_revisiones r
                   where r.viaje_id = v.id and r.tipo = 'sorting');

grant select on public.v_sider_revision_pendientes to authenticated;


-- ---------------------------------------------------------------------
-- 6. PEDIR Y QUITAR — CON LA REGLA DEL INTERNO
-- ---------------------------------------------------------------------
create or replace function public.sider_sorting_marcar(
  p_viaje  uuid,
  p_marcar boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_interno boolean;
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Pedir una revisión normal es solo del administrador';
  end if;

  select estado::text, interno into v_estado, v_interno from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  /* EL INTERNO NACE PARA LA REVISIÓN NORMAL. Quitarle la marca lo dejaría
     como un camión recibido que nadie revisa y que tampoco certificó
     Sider. Si no debe existir, se anula. */
  if not p_marcar and coalesce(v_interno, false) then
    raise exception 'Un camión interno siempre pasa a Revisión AI normal. Si no debe existir, anúlalo';
  end if;

  /* QUITAR LA MARCA CON EL SORTING YA HECHO sería borrar el trabajo de los
     muchachos sin que quede rastro: la revisión seguiría en la tabla y el
     viaje diría que nunca le tocaba. Solo se mira el Sorting: que ya
     tenga su AI hecha no tiene nada que ver con esto. */
  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones
        where viaje_id = p_viaje and tipo = 'sorting') then
    raise exception 'Ese viaje ya tiene la revisión normal hecha. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_sorting   = p_marcar,
         sorting_pedido_por = case when p_marcar then auth.uid() end,
         sorting_pedido_en  = case when p_marcar then now() end
   where id = p_viaje;
end $$;

grant execute on function public.sider_sorting_marcar(uuid, boolean) to authenticated;

create or replace function public.sider_ai_marcar(
  p_viaje  uuid,
  p_marcar boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_interno boolean;
begin
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Pedir una revisión AI es solo del administrador';
  end if;

  select estado::text, interno into v_estado, v_interno from public.sider_viajes where id = p_viaje;
  if v_estado is null then
    raise exception 'Ese viaje no existe';
  end if;

  /* LA REVISIÓN CERTIFICADA ES DE LO QUE LLEGÓ CERTIFICADO POR SIDER. Un
     interno no lo es: pedirle la certificada haría que el mismo camión
     tuviera dos revisiones y que en el informe se contara como de los
     dos mundos. */
  if p_marcar and coalesce(v_interno, false) then
    raise exception 'Un camión interno no lleva revisión AI certificada: pasa a la normal';
  end if;

  if not p_marcar and exists (
       select 1 from public.sider_ai_revisiones
        where viaje_id = p_viaje and tipo = 'ai') then
    raise exception 'Ese viaje ya tiene la revisión AI hecha. Primero hay que anular la revisión';
  end if;

  update public.sider_viajes
     set requiere_ai   = p_marcar,
         ai_pedido_por = case when p_marcar then auth.uid() end,
         ai_pedido_en  = case when p_marcar then now() end,
         ai_motivo     = case when p_marcar then nullif(btrim(coalesce(p_motivo, '')), '') end
   where id = p_viaje;
end $$;

grant execute on function public.sider_ai_marcar(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------
-- 7. GUARDAR — UN SOLO PERMISO PARA LAS DOS
--
-- Misma firma de doce parámetros: `create or replace` la reemplaza sin
-- dejar una segunda función (y una llamada quedaría «not unique»).
-- ---------------------------------------------------------------------
create or replace function public.sider_ai_guardar(
  p_viaje       uuid,
  p_turno       text,
  p_canal       text,
  p_socio       text,
  p_envase      text,
  p_certificado boolean,
  p_recibidas   integer,
  p_revisadas   integer,
  p_conteos     jsonb,            -- {"rota": 4, "faltante": 0, ...}
  p_zcl3        text default null,
  p_comentarios text default null,
  p_tipo        text default 'ai'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_fecha date; v_placa text; v_planta text;
  v_pidio boolean; v_llego boolean;
  v_clave text; v_n integer; v_suma integer := 0;
  v_nombre text;
begin
  if p_tipo is null or p_tipo not in ('ai', 'sorting') then
    raise exception 'El tipo de revisión tiene que ser ai o sorting';
  end if;
  v_nombre := case p_tipo when 'ai' then 'revisión AI certificada' else 'revisión AI normal' end;

  /* UN SOLO PERMISO PARA LAS DOS REVISIONES. Las dos se hacen en la misma
     pantalla —«Revisión AI»— y las dos cobran, así que ya no hay una que
     un operador pueda guardar «sin querer» y la otra no: quien tiene
     «editar» en esa pantalla guarda las dos, y quien no, ninguna.

     Se sigue aceptando el permiso de antes —editor con «editar» en
     Tránsito— para que el supervisor que hacía la AI dentro de Tránsito
     no pierda nada. `es_editor()` solo, sin mirar la pantalla, NO alcanza:
     es cierto con cualquier «editar» en cualquier módulo. */
  if not (public.puede_editar('/sider/sorting')
          or (public.es_editor() and public.puede_editar('/sider/transito'))) then
    raise exception 'Registrar una revisión requiere permiso de edición en Revisión AI';
  end if;

  select coalesce(v.fecha, v.creado_en::date), v.placa, v.planta,
         case p_tipo when 'ai' then v.requiere_ai else v.requiere_sorting end,
         (v.interno or exists (select 1 from public.sider_certificaciones c
                  where c.viaje_id = v.id and c.punta = 'llegada'))
    into v_fecha, v_placa, v_planta, v_pidio, v_llego
    from public.sider_viajes v where v.id = p_viaje;

  if v_fecha is null then raise exception 'Ese viaje no existe'; end if;
  if not v_pidio then
    raise exception 'Ese viaje no está marcado para %. Un administrador tiene que pedirlo primero (o crearse con el «+» de Vh Interno)', v_nombre;
  end if;
  /* LA REVISIÓN ES DE LO QUE LLEGÓ. Sin certificar la llegada no hay
     camión que revisar. */
  if not v_llego then
    raise exception 'Todavía no está certificada la llegada de ese viaje';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('T1','T2','T3') then
    raise exception 'El turno tiene que ser T1, T2 o T3';
  end if;
  if coalesce(p_recibidas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas llegaron de la referencia a revisar';
  end if;
  if coalesce(p_revisadas, 0) <= 0 then
    raise exception 'Hay que decir cuántas botellas se revisaron';
  end if;
  if p_revisadas > p_recibidas then
    raise exception 'Se revisaron % botellas de % que llegaron: la muestra no puede ser mayor que lo recibido',
      p_revisadas, p_recibidas;
  end if;

  if not exists (select 1 from public.sider_ai_envases where clave = p_envase and activo) then
    raise exception 'Ese tipo de envase no existe o está apagado';
  end if;
  if not exists (select 1 from public.sider_ai_canales where clave = p_canal and activo) then
    raise exception 'Ese canal de envase no existe o está apagado';
  end if;
  if p_canal = 'socios' and nullif(btrim(coalesce(p_socio, '')), '') is null then
    raise exception 'Una revisión del canal Socios tiene que decir de qué socio es';
  end if;
  if p_socio is not null and not exists (
       select 1 from public.sider_ai_socios where clave = p_socio and activo) then
    raise exception 'Ese socio no existe o está apagado';
  end if;

  for v_clave, v_n in select k.key, (k.value)::text::integer
                        from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
  loop
    if not exists (select 1 from public.sider_ai_defectos where clave = v_clave and activo) then
      raise exception 'El defecto «%» no existe en el maestro', v_clave;
    end if;
    if v_n < 0 then
      raise exception 'El defecto «%» no puede venir en negativo', v_clave;
    end if;
    v_suma := v_suma + v_n;
  end loop;

  if v_suma > p_revisadas then
    raise exception 'Se marcaron % botellas con defecto de % revisadas', v_suma, p_revisadas;
  end if;

  insert into public.sider_ai_revisiones as r
    (viaje_id, tipo, fecha, planta, placa, turno, canal, socio, envase, certificado,
     recibidas, revisadas, zcl3, comentarios, revisado_por)
  values
    (p_viaje, p_tipo, v_fecha, v_planta, v_placa, upper(btrim(p_turno)),
     p_canal, nullif(btrim(coalesce(p_socio, '')), ''), p_envase,
     coalesce(p_certificado, false),
     p_recibidas, p_revisadas,
     nullif(btrim(coalesce(p_zcl3, '')), ''),
     nullif(btrim(coalesce(p_comentarios, '')), ''),
     auth.uid())
  /* LA LLAVE ES (VIAJE, TIPO): corregir el Sorting reescribe el Sorting y
     no toca la AI del mismo camión, ni al revés. */
  on conflict (viaje_id, tipo) do update set
     turno = excluded.turno, canal = excluded.canal, socio = excluded.socio,
     envase = excluded.envase, certificado = excluded.certificado,
     recibidas = excluded.recibidas, revisadas = excluded.revisadas,
     zcl3 = excluded.zcl3, comentarios = excluded.comentarios,
     editado_por = auth.uid(), editado_en = now(), ediciones = r.ediciones + 1
  returning r.id into v_id;

  delete from public.sider_ai_conteos where revision_id = v_id;
  insert into public.sider_ai_conteos (revision_id, defecto, unidades)
  select v_id, k.key, (k.value)::text::integer
    from jsonb_each(coalesce(p_conteos, '{}'::jsonb)) k
   where (k.value)::text::integer > 0;

  return v_id;
end $$;

grant execute on function public.sider_ai_guardar(
  uuid, text, text, text, text, boolean, integer, integer, jsonb, text, text, text
) to authenticated;


-- ---------------------------------------------------------------------
-- 8. EL SEGUIMIENTO NO CUENTA LOS INTERNOS
--
-- Copiada de 2026-09-zlde-por-dia.sql con UNA condición más. El % de
-- certificación dice qué fracción del envase que llegó vino certificada
-- por Sider; un camión que creó control con el «+» no lo está.
-- ---------------------------------------------------------------------
create or replace function public.sider_seguimiento(p_desde date, p_hasta date)
returns table (
  cd_origen text, planta text, aplica_sider boolean, fuera_del_maestro boolean,
  vh_recibidos numeric, vh_bu_mtd numeric, vh_real_mtd numeric, pct_cumplimiento_vh numeric,
  hl_recibido numeric, bu_mtd numeric, real_mtd numeric,
  pct_cumplimiento numeric, pct_certificacion numeric,
  viajes bigint, estibas numeric, lineas_zlde bigint, meta numeric
)
language sql
stable
as $$
with m as (select valor as meta from public.sider_parametros where clave = 'meta_certificacion'),
recibido as (
  /* EL INDICADOR ES ESO: envase retornable que llegó a Barranquilla. No
     es un número mágico escondido en una fórmula —es la definición del
     % de certificación, y es el mismo filtro que tiene tu pivote—. La
     pantalla de ZLDE sí deja moverlo para explorar; el informe no, o
     dejaría de ser el informe. */
  select z.cd_origen,
         sum(z.hl) as hl, sum(z.vh_recibidos) as vh_recibidos, sum(z.lineas) as lineas
    from public.sider_zlde z
   where lower(btrim(z.planta)) = 'barranquilla'
     and lower(btrim(z.clase))  = 'eer'
     and z.fecha between p_desde and p_hasta
   group by 1
),
certificado as (
  select v.cd_origen,
         sum(coalesce(v.hl, 0))    as hl,
         count(*)                  as viajes,
         sum(v.estibas)            as estibas,
         -- Vehículos equivalentes, no renglones: es lo mismo que cuenta
         -- ZLDE del otro lado (estibas ÷ 36). Comparar renglones contra
         -- vehículos daría un porcentaje que no significa nada.
         sum(coalesce(v.sider, 0)) as vh
  from public.v_sider_viajes v
  -- Un viaje anulado no certificó nada. Uno en tránsito sí: la salida ya
  -- quedó certificada con su ubicación y sus fotos, y es lo que la hoja
  -- "Base de Datos" registraba al despachar.
  where v.estado <> 'anulado'
    /* UN CAMIÓN INTERNO NO CERTIFICÓ NADA CON SIDER. Lo creó alguien de
       control con el «+» de Revisión AI: no tiene salida, ni GPS, ni fotos de
       salida. Contarlo aquí subiría el % de certificación con camiones que
       Sider nunca certificó. */
    and not exists (select 1 from public.sider_viajes x where x.id = v.id and x.interno)
    /* El rango es de FECHAS, y v.fecha es un timestamptz: el día de
       cierre entra completo con < hasta+1, no con <= hasta, que se
       comería las horas de ese día. */
    and v.fecha >= p_desde::timestamptz
    and v.fecha <  (p_hasta + 1)::timestamptz
  group by 1
)
select
  coalesce(r.cd_origen, c.cd_origen)        as cd_origen,
  o.planta,
  coalesce(o.aplica_sider, true)            as aplica_sider,
  -- Un nombre de CD que viene en el archivo de ZLDE y no está en el
  -- maestro: se muestra marcado en vez de descartarlo, porque puede ser
  -- un CD nuevo o un nombre escrito distinto, y las dos cosas hay que
  -- verlas.
  (o.planta is null)                        as fuera_del_maestro,

  -- BLOQUE 1 · VEHÍCULOS
  coalesce(r.vh_recibidos, 0)               as vh_recibidos,
  round(coalesce(r.vh_recibidos, 0) * (select meta from m), 4) as vh_bu_mtd,
  coalesce(c.vh, 0)                         as vh_real_mtd,
  case when coalesce(r.vh_recibidos, 0) * (select meta from m) > 0
       then round(coalesce(c.vh, 0) / (r.vh_recibidos * (select meta from m)), 6)
  end                                       as pct_cumplimiento_vh,

  -- BLOQUE 2 y 3 · HECTOLITROS
  -- En el Excel eran dos bloques con las mismas tres primeras columnas y
  -- solo el porcentaje distinto. Aquí van las tres columnas UNA vez y
  -- los dos porcentajes al lado, que es la misma información sin
  -- repetirla: repetida, el día que una copia se mueva y la otra no,
  -- nadie sabe cuál creer.
  coalesce(r.hl, 0)                         as hl_recibido,
  round(coalesce(r.hl, 0) * (select meta from m), 3) as bu_mtd,
  coalesce(c.hl, 0)                         as real_mtd,
  -- % Cumplimiento: contra la META. Dice si se llegó a lo que tocaba.
  case when coalesce(r.hl, 0) * (select meta from m) > 0
       then round(coalesce(c.hl, 0) / (r.hl * (select meta from m)), 6)
  end                                       as pct_cumplimiento,
  -- % Certificación: contra lo RECIBIDO. Dice qué fracción del envase
  -- que llegó vino certificada. Es el número del informe.
  -- Sin HL recibido no hay contra qué comparar: queda en null y la app
  -- lo pinta neutro. Un 0% ahí diría "no cumpliste" cuando lo cierto es
  -- "no sé".
  case when coalesce(r.hl, 0) > 0
       then round(coalesce(c.hl, 0) / r.hl, 6) end as pct_certificacion,

  coalesce(c.viajes, 0)                     as viajes,
  coalesce(c.estibas, 0)                    as estibas,
  coalesce(r.lineas, 0)                     as lineas_zlde,
  (select meta from m)                      as meta
from recibido r
full join certificado c on c.cd_origen = r.cd_origen
left join public.sider_origenes o on o.cd_origen = coalesce(r.cd_origen, c.cd_origen)
$$;

grant execute on function public.sider_seguimiento(date, date) to authenticated;

create or replace view public.v_sider_dias as
with z as (
  select fecha, sum(hl) as hl_zlde
    from public.sider_zlde
   group by 1
),
c as (
  select coalesce(v.fecha::date, v.creado_en::date) as fecha, count(*) as viajes
    from public.sider_viajes v
   where v.estado <> 'anulado'
     and not v.interno
   group by 1
)
select coalesce(z.fecha, c.fecha)   as fecha,
       coalesce(z.hl_zlde, 0)       as hl_zlde,
       coalesce(c.viajes, 0)::int   as viajes
  from z
  full join c on c.fecha = z.fecha;

grant select on public.v_sider_dias to authenticated;


-- ---------------------------------------------------------------------
-- 8b. LO QUE YA ESTABA CREADO
--
-- · Los internos que se crearon antes seguían «en tránsito» esperando una
--   llegada que ya no se pide: pasan a recibidos y caen en Revisión AI.
--   (Los que ya certificaron su llegada no se tocan: ya estaban recibidos.)
-- · El permiso del «+» cambió de clave —de `/sider/transito/nuevo` a
--   `/sider/sorting/nuevo`— porque ya no vive en Tránsito. Lo ya dado a un
--   rol o a una persona se traslada: sin esto quien lo tenía lo perdería
--   EN SILENCIO. Se puede correr dos veces: la segunda no encuentra nada.
-- ---------------------------------------------------------------------
do $$
declare n_rec int; n_rol int := 0; n_pers int := 0;
begin
  update public.sider_viajes set estado = 'recibido'
   where interno and estado = 'en_transito';
  get diagnostics n_rec = row_count;

  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
      select rol, '/sider/sorting/nuevo', nivel
        from public.rol_permisos where seccion = '/sider/transito/nuevo'
      on conflict (rol, seccion) do nothing;
    delete from public.rol_permisos where seccion = '/sider/transito/nuevo';
    get diagnostics n_rol = row_count;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = (permisos_extra - '/sider/transito/nuevo')
                            || jsonb_build_object('/sider/sorting/nuevo', permisos_extra -> '/sider/transito/nuevo')
     where permisos_extra ? '/sider/transito/nuevo';
    get diagnostics n_pers = row_count;
  end if;

  raise notice 'Vh Interno: % internos pasaron a recibidos; permiso trasladado en % roles y % personas.', n_rec, n_rol, n_pers;
end $$;


-- ---------------------------------------------------------------------
-- 9. COMPROBACIÓN FINAL — SE PARA, NO AVISA
-- ---------------------------------------------------------------------
do $$
declare v_antes int; v_ai int; v_ss int; v_sv int; v_sobre int; v_src text;
begin
  /* LA CIFRA DE CONTROL SE LEE AQUÍ Y NO ANTES. Se guardaba en una tabla
     temporal al principio y el editor de Supabase la perdía en el camino
     («relation _interna_antes does not exist»). Esta migración no inserta
     ni borra revisiones, así que contar ahora da lo mismo que contar
     antes: v_sider_ai tiene que traerlas TODAS, y si da menos, alguna se
     quedó sin su envase o su canal en el maestro y desapareció del
     informe sin un solo error. */
  select count(*)::int into v_antes from public.sider_ai_revisiones;
  select count(*) into v_ai from public.v_sider_ai;
  if v_ai <> v_antes then
    raise exception 'v_sider_ai da % filas y hay % revisiones: alguna se quedó sin envase o canal en el maestro.',
      v_ai, v_antes;
  end if;

  select count(*) into v_ss from public.v_sider_ai where tipo = 'sorting';
  select count(*) into v_sv from public.sider_ai_revisiones where tipo = 'sorting';
  if v_ss <> v_sv then
    raise exception 'v_sider_ai trae % revisiones normales y la tabla tiene %.', v_ss, v_sv;
  end if;

  select count(*) into v_sobre from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sider_ai_guardar';
  if v_sobre <> 1 then
    raise exception 'sider_ai_guardar tiene % versiones: con más de una, la llamada del muelle falla con «function is not unique».', v_sobre;
  end if;

  select pg_get_functiondef(to_regprocedure(
    'public.sider_viaje_interno_crear(text,text,text,text,numeric,text,text,text)')) into v_src;
  if v_src not like '%/sider/sorting/nuevo%' then
    raise exception 'sider_viaje_interno_crear no pide su permiso propio (Vh Interno).';
  end if;
  if v_src not like '%''recibido''%' or v_src not like '%{1,10}%' then
    raise exception 'sider_viaje_interno_crear no nace recibido o no limita el documento a 10 dígitos.';
  end if;

  select pg_get_functiondef(to_regprocedure(
    'public.sider_ai_guardar(uuid,text,text,text,text,boolean,integer,integer,jsonb,text,text,text)')) into v_src;
  if v_src not like '%/sider/sorting%' then
    raise exception 'sider_ai_guardar no pide el permiso de la pantalla Revisión AI: siguen con el candado de antes.';
  end if;

  select pg_get_functiondef(to_regprocedure(
    'public.sider_certificar_llegada(uuid,numeric,numeric,numeric,timestamptz,text,text)')) into v_src;
  if v_src not like '%interno%' then
    raise exception 'sider_certificar_llegada no conoce a los camiones internos: quedarían trancados sin fotos de salida.';
  end if;

  select pg_get_functiondef(to_regprocedure('public.sider_seguimiento(date,date)')) into v_src;
  if v_src not like '%interno%' then
    raise exception 'sider_seguimiento sigue contando los camiones internos como certificados por Sider.';
  end if;

  raise notice 'Listo: % revisiones en el informe (% normales), camión interno creado y permiso unificado.', v_ai, v_ss;
end $$;

commit;
