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
-- 5. LA VISTA NO SE RECREA AQUÍ — SE COMPRUEBA
--
-- ESTE ARCHIVO ESTUVO ROTO Y NO SE PODÍA CORRER. Traía una COPIA de
-- `v_sider_viajes` «copiada tal cual de supabase/modulos/sider.sql», y
-- con ella intentaba agregar las tres columnas nuevas al final con
-- `create or replace view`. El módulo cambió después; la copia se quedó
-- vieja; y Postgres contestaba:
--
--     ERROR: cannot drop columns from view
--
-- que no menciona ni el archivo ni la columna. El archivo entero se
-- caía ahí y nunca llegaba a crear las funciones de corregir y anular,
-- que es para lo que existe.
--
-- LA CAUSA NO ERA LA LÍNEA, ERA LA COPIA. Mantener la misma vista
-- escrita en dos sitios solo funciona mientras nadie toque ninguno de
-- los dos, y eso no dura. El módulo `sider.sql` ya la borra y la vuelve
-- a crear CON las tres columnas —y borrando antes
-- `v_sider_seguimiento`, que cuelga de ella—, así que aquí no hace
-- falta ninguna copia: hace falta comprobar que el módulo ya pasó.
--
-- SE CAE CON EL NOMBRE DEL ARCHIVO, que es lo que deja arreglarlo en
-- dos minutos en vez de adivinar.
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.v_sider_viajes') is null then
    raise exception 'Falta la vista v_sider_viajes: corre supabase/modulos/sider.sql primero.';
  end if;

  foreach v_falta in array array['anulado_en', 'anulado_por', 'motivo_anulacion'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'v_sider_viajes'
                      and column_name = v_falta) then
      raise exception
        'A la vista v_sider_viajes le falta la columna %. La define supabase/modulos/sider.sql: corre ese archivo y vuelve a correr este.',
        v_falta;
    end if;
  end loop;
end $bloque$;

-- ---------------------------------------------------------------------
-- 6. LA OBSERVACIÓN DE LA LLEGADA — TAMPOCO SE COPIA AQUÍ
--
-- Este archivo traía también una copia de `sider_certificar_llegada`,
-- «copiada tal cual» del módulo. Hoy son idénticas, comprobadas letra
-- por letra — pero eso es justo lo que se decía de la vista de arriba
-- antes de que dejara de ser cierto. Una copia idéntica hoy es una
-- copia vieja mañana, y esta, al correrse, PISARÍA la buena con la
-- versión antigua sin que nada avisara.
--
-- La define `supabase/modulos/sider.sql` y se comprueba que exista.
-- ---------------------------------------------------------------------
do $bloque$
begin
  if to_regprocedure('public.sider_certificar_llegada(uuid, numeric, numeric, numeric, timestamptz, text, text)') is null then
    raise exception
      'Falta la función sider_certificar_llegada: la define supabase/modulos/sider.sql. Corre ese archivo primero.';
  end if;
end $bloque$;

do $$
begin
  raise notice 'Corregir viajes listo: editar lo tecleado, anular con motivo y devolver.';
  raise notice 'La vista y la certificacion de llegada las define supabase/modulos/sider.sql: aqui solo se comprueban.';
end $$;

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
