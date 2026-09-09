-- =====================================================================
-- CORREGIR UN VIAJE DE LA FUENTE PRINCIPAL
-- =====================================================================
-- Se puede correr varias veces sin romper nada.
--
-- QUÉ HABILITA
--   · Editar lo que alguien TECLEÓ: placa, origen, material, estibas y
--     la observación. Nada más. Las cifras —sider, cajas, unidades,
--     HL— se calculan al leer, así que se corrigen solas. Los tiempos y
--     las fotos NO se tocan: son la evidencia, y una evidencia que se
--     puede editar deja de serlo.
--   · ANULAR en vez de borrar. El viaje se queda, con su motivo y con
--     quién lo anuló, y deja de contar. Borrarlo de verdad se llevaría
--     por delante sus certificaciones y sus seis fotos, y no habría
--     forma de saber que existió.
--   · DEVOLVER un viaje anulado por error.
--
-- Todo esto es SOLO para el rol que administra la plataforma, y el
-- candado está en la base y no en la pantalla: esconder un botón no es
-- un permiso.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. El rastro de la anulación.
--    Sin esto, un viaje anulado no dice quién ni por qué, y en tres
--    meses nadie va a poder responder por qué falta ese volumen.
-- ---------------------------------------------------------------------
alter table public.sider_viajes
  add column if not exists anulado_en  timestamptz,
  add column if not exists anulado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists motivo_anulacion text;

-- El motivo no es opcional cuando está anulado: "se anuló" sin decir
-- por qué no le sirve a nadie, y es justo lo que hay que explicar.
alter table public.sider_viajes
  drop constraint if exists sider_viajes_anulado_con_motivo;
alter table public.sider_viajes
  add constraint sider_viajes_anulado_con_motivo
  check (estado <> 'anulado' or btrim(coalesce(motivo_anulacion, '')) <> '');

-- ---------------------------------------------------------------------
-- 2. Editar lo tecleado.
--
--    Va en una función y no en un update directo con RLS por dos
--    razones. Primero, la lista de columnas editables queda escrita en
--    UN sitio: con RLS a secas, la política deja escribir la fila
--    entera y habría que confiar en que la pantalla solo mande cinco
--    campos. Segundo, un viaje IMPORTADO no se edita —no vino de nadie
--    y corregirlo sería inventar historia—, y eso es una regla, no un
--    permiso.
-- ---------------------------------------------------------------------
create or replace function public.sider_viaje_editar(
  p_id          uuid,
  p_placa       text,
  p_planta      text,
  p_sku         text,
  p_estibas     numeric,
  p_observacion text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado estado_sider;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede corregir un viaje.';
  end if;

  select estado into v_estado from public.sider_viajes where id = p_id;
  if v_estado is null then
    raise exception 'Ese viaje ya no existe.';
  end if;
  if v_estado = 'anulado' then
    raise exception 'Ese viaje está anulado. Devuélvelo antes de corregirlo.';
  end if;

  if btrim(coalesce(p_placa, '')) = '' then
    raise exception 'La placa no puede quedar vacía.';
  end if;
  if p_estibas is null or p_estibas <= 0 then
    raise exception 'Las estibas tienen que ser un número mayor que cero.';
  end if;
  if not exists (select 1 from public.sider_origenes where planta = p_planta) then
    raise exception 'Ese CD de origen no está en el maestro.';
  end if;
  if not exists (select 1 from public.sider_skus where sku = p_sku) then
    raise exception 'Ese material no está en el maestro.';
  end if;

  update public.sider_viajes
     set placa       = upper(btrim(p_placa)),
         planta      = p_planta,
         sku         = p_sku,
         estibas     = p_estibas,
         -- Una observación en blanco se guarda como nulo y no como '':
         -- así "no hay nota" es una sola cosa y no dos.
         observacion = nullif(btrim(coalesce(p_observacion, '')), '')
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Anular y devolver.
-- ---------------------------------------------------------------------
create or replace function public.sider_viaje_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede anular un viaje.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe por qué se anula. En tres meses nadie va a acordarse.';
  end if;
  if not exists (select 1 from public.sider_viajes where id = p_id) then
    raise exception 'Ese viaje ya no existe.';
  end if;

  update public.sider_viajes
     set estado           = 'anulado',
         motivo_anulacion = btrim(p_motivo),
         anulado_por      = auth.uid(),
         anulado_en       = now()
   where id = p_id;
end;
$$;

-- Devolver: el estado al que vuelve NO se guarda en ninguna parte, se
-- deduce de la evidencia, que es la única fuente que no miente. Si
-- tiene certificación de llegada, llegó.
create or replace function public.sider_viaje_devolver(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_llego boolean;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede devolver un viaje.';
  end if;

  select exists (
    select 1 from public.sider_certificaciones
     where viaje_id = p_id and punta = 'llegada'
  ) into v_llego;

  update public.sider_viajes
     set estado           = case when v_llego then 'recibido' else 'en_transito' end::estado_sider,
         motivo_anulacion = null,
         anulado_por      = null,
         anulado_en       = null
   where id = p_id and estado = 'anulado';

  if not found then
    raise exception 'Ese viaje no estaba anulado.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. La observación de la llegada.
--    Quien certifica la llegada puede dejar una nota —"llegó con dos
--    estibas menos", "sello roto"—. Puede escribirla cualquiera que
--    certifique, no solo quien administra: es quien está viendo el
--    camión.
-- ---------------------------------------------------------------------
create or replace function public.sider_viaje_observar(p_id uuid, p_observacion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_editor() then
    raise exception 'No tienes permiso para dejar observaciones.';
  end if;
  update public.sider_viajes
     set observacion = nullif(btrim(coalesce(p_observacion, '')), '')
   where id = p_id and estado <> 'anulado';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. La vista tiene que devolver las tres columnas nuevas.
--    Va con «create or replace» y las columnas nuevas AL FINAL: es lo
--    único que create or replace admite. Botarla y rehacerla obligaría
--    a botar antes sider_seguimiento(date,date), que la usa, y una
--    migración que rehace media base para mover una columna de sitio es
--    una migración que puede salir mal.
--    Esto está copiado TAL CUAL de supabase/modulos/sider.sql: si algún
--    día cambia allá, cambia aquí.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_viajes as
with p as (select valor as estibas_sider from public.sider_parametros where clave = 'estibas_por_sider')
select
  v.id,
  v.placa,
  v.planta,
  o.cd_origen,
  v.cd_destino,
  v.sku,
  s.descripcion,
  s.clase                                       as tipo_envase,
  v.estibas,
  v.estado,
  v.observacion,
  v.creado_por,
  v.creado_en,

  v.importado,

  -- La fecha del viaje: la del archivo si vino importado, si no la de la
  -- certificación de SALIDA, y en último caso la de creación. Así la
  -- fila no cambia de mes cuando el vehículo llega tarde, y un mes
  -- importado no se amontona en el día en que se subió el archivo.
  coalesce(v.fecha::timestamptz, cs.hecha_en, v.creado_en)        as fecha,
  -- El NÚMERO del mes, no su nombre: to_char con TMMonth depende del
  -- idioma del servidor y salía "September". El nombre lo pone la app,
  -- que sí sabe en qué idioma está hablando.
  extract(month from coalesce(v.fecha::timestamptz, cs.hecha_en, v.creado_en))::int as num_mes,
  extract(week  from coalesce(v.fecha::timestamptz, cs.hecha_en, v.creado_en))::int as semana,
  extract(year  from coalesce(v.fecha::timestamptz, cs.hecha_en, v.creado_en))::int as anio,

  -- Las cuatro cifras derivadas. Si al SKU le faltan factores quedan en
  -- null: la app dice "a este material le faltan factores" en vez de
  -- mostrar un cero que parece un dato.
  round(v.estibas / (select estibas_sider from p), 4)             as sider,
  s.cajas_x_estiba  * v.estibas                                   as cajas,
  s.unidades_x_caja * s.cajas_x_estiba * v.estibas                as unidades,
  s.hl_x_unidad * s.unidades_x_caja * s.cajas_x_estiba * v.estibas as hl,
  (s.cajas_x_estiba is null or s.unidades_x_caja is null or s.hl_x_unidad is null)
                                                                  as faltan_factores,

  -- El estado de cada punta, para el tablero de tránsito.
  cs.id           as cert_salida_id,
  cs.hecha_en     as salida_en,
  cs.lat          as salida_lat,
  cs.lng          as salida_lng,
  cs.precision_m  as salida_precision,
  cs.direccion    as salida_direccion,
  cl.id           as cert_llegada_id,
  cl.hecha_en     as llegada_en,
  cl.lat          as llegada_lat,
  cl.lng          as llegada_lng,
  cl.precision_m  as llegada_precision,
  cl.direccion    as llegada_direccion,
  coalesce(cs.fotos, 0)::int                    as fotos_salida,
  coalesce(cl.fotos, 0)::int                    as fotos_llegada,
  -- Cuánto lleva en el camino: la pregunta del tablero de tránsito.
  case when cs.hecha_en is not null
       then coalesce(cl.hecha_en, now()) - cs.hecha_en end        as en_camino,

  -- El rastro de la anulación: quién, cuándo y por qué. Sin esto, un
  -- viaje anulado no le puede responder a nadie en tres meses.
  -- Van AL FINAL de la lista y no junto a v.observacion, que es donde
  -- se leerían mejor, porque «create or replace view» solo admite
  -- agregar columnas al final: metidas en el medio habría que botar la
  -- vista, y para botarla hay que botar antes la función de
  -- seguimiento que la usa. Una migración que rehace media base para
  -- mover una columna de sitio es una migración que puede salir mal.
  v.motivo_anulacion,
  v.anulado_en,
  v.anulado_por
from public.sider_viajes v
-- LEFT y no INNER aunque la llave ajena garantice que siempre hay
-- pareja: con INNER, Postgres tiene que suponer que el join puede botar
-- filas y deja de poder cortar temprano una consulta ordenada.
left join public.sider_origenes o on o.planta = v.planta
left join public.sider_skus     s on s.sku    = v.sku
left join public.sider_certificaciones cs on cs.viaje_id = v.id and cs.punta = 'salida'
left join public.sider_certificaciones cl on cl.viaje_id = v.id and cl.punta = 'llegada';

-- ---------------------------------------------------------------------
-- 6. La observación de la llegada sube al VIAJE.
--    Estaba solo en sider_certificaciones.nota, donde no la ve nadie:
--    la Fuente principal lee sider_viajes.observacion. Quien escribe
--    "llegó con dos estibas menos" lo escribe para que salga al lado de
--    la fila, no enterrado en el detalle de la evidencia.
--    Copiado TAL CUAL de supabase/modulos/sider.sql.
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
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede certificar';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Falta la ubicación: no se puede certificar sin saber dónde se hizo';
  end if;

  select estado into v_est from public.sider_viajes where id = p_viaje_id;
  if v_est is null then raise exception 'Ese viaje no existe'; end if;
  if v_est = 'recibido' then raise exception 'Ese viaje ya está recibido'; end if;
  if v_est = 'anulado'  then raise exception 'Ese viaje está anulado'; end if;

  -- Las tres fotos de la salida son obligatorias antes de recibir: si se
  -- pudiera cerrar un viaje al que le faltan, la evidencia se volvería
  -- opcional en la práctica.
  if (select count(*) from public.sider_fotos f
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

grant execute on function public.sider_viaje_editar(uuid, text, text, text, numeric, text) to authenticated;
grant execute on function public.sider_viaje_anular(uuid, text)                            to authenticated;
grant execute on function public.sider_viaje_devolver(uuid)                                to authenticated;
grant execute on function public.sider_viaje_observar(uuid, text)                          to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Comprobación.
-- ---------------------------------------------------------------------
do $comp$
declare
  falta text;
begin
  select string_agg(c, ', ') into falta
  from unnest(array['anulado_en','anulado_por','motivo_anulacion']) c
  where not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='sider_viajes' and column_name=c);
  if falta is not null then raise exception 'listo: faltan columnas: %', falta; end if;

  select string_agg(f, ', ') into falta
  from unnest(array['sider_viaje_editar','sider_viaje_anular',
                    'sider_viaje_devolver','sider_viaje_observar']) f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f);
  if falta is not null then raise exception 'listo: faltan funciones: %', falta; end if;

  select string_agg(c, ', ') into falta
  from unnest(array['motivo_anulacion','anulado_en','anulado_por']) c
  where not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='v_sider_viajes' and column_name=c);
  if falta is not null then
    raise exception 'listo: la vista no devuelve: %', falta;
  end if;

  raise notice 'listo: corregir, anular y devolver quedaron puestos';
end
$comp$;
