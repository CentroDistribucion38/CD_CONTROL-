-- =====================================================================
-- CONTROL · MÓDULO SIDER CERTIFICADO
-- Requiere: supabase/00-nucleo.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
--
-- QUÉ REEMPLAZA
-- La hoja "Base de Datos" de Sider Certificado. En esa hoja hay 16
-- columnas, pero solo CINCO se teclean: origen, fecha, estibas, placa y
-- SKU. Las otras once salen de fórmulas:
--
--   CD Origen  = VLOOKUP(origen)          Cajas     = cajas_x_estiba × estibas
--   Mes        = TEXT(fecha,"MMMM")       Unidades  = unidades_x_caja × cajas
--   Semana     = WEEKNUM(fecha)           HL        = hl_x_unidad × unidades
--   Año        = YEAR(fecha)              Sider     = estibas / 36
--   Descripción y Tipo de envase = VLOOKUP(sku)
--
-- Aquí se guardan SOLO las cinco que se teclean. Las once derivadas las
-- calcula la vista v_sider_viajes. Guardar una cifra que se puede
-- calcular es guardarse el derecho a que un día no cuadre con su
-- fórmula, y entonces nadie sabe cuál de las dos creer.
--
-- EL VIAJE TIENE DOS PUNTAS
-- Se certifica al SALIR del CD origen y al LLEGAR a Barranquilla. Cada
-- punta trae su ubicación, su hora y sus tres fotos, y las guarda quien
-- las hizo. El viaje va: en tránsito → recibido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Maestros — salen del Excel, no se inventan
-- ---------------------------------------------------------------------

-- Los centros que despachan. La hoja tenía 'Monteria ' con un espacio al
-- final, y quien escribiera "Monteria" sin él rompía el VLOOKUP en
-- silencio; aquí el nombre está limpio y se elige de una lista, así que
-- ese error deja de ser posible.
create table if not exists public.sider_origenes (
  planta    text primary key,
  cd_origen text not null,
  -- "Quitar" del maestro es DESACTIVAR, no borrar: un origen que ya usó
  -- un viaje no se puede borrar sin romper el histórico. Desactivado
  -- deja de salir en la lista pero los viajes viejos siguen leyéndose.
  activo    boolean not null default true,
  orden     smallint,
  creado_en timestamptz not null default now()
);

insert into public.sider_origenes (planta, cd_origen) values
  ('Galapa', 'CD Galapa'),
  ('Cucuta', 'CD OL Cúcuta Local'),
  ('Turbaco', 'CD Turbaco'),
  ('Monteria', 'CD Unión Monteria'),
  ('Corozal', 'CD Corozal'),
  ('Santa Marta', 'CD Santa Marta'),
  ('Arenosa', 'CD La Arenosa'),
  ('Valledupar', 'CD Valledupar'),
  ('Riohacha', 'CD OL Riohacha'),
  ('Magangue', 'CD OL Magangue'),
  ('Caucasia', 'CD Unión Caucasia'),
  ('Apartado', 'CD Unión Apartado'),
  ('Curumani', 'CD OL Curumani'),
  ('Fonseca', 'CD OL Fonseca'),
  ('Cartagena KA', 'KACartagena'),
  ('San Andres', 'CD OL San Andrés')
-- do nothing, NO do update: esto es una SEMILLA, no la verdad. Se puede
-- agregar, editar y quitar desde la app, y volver a correr este archivo
-- no debe pisar lo que alguien corrigió. Si dijera "do update" el
-- maestro seguiría quemado, solo que con más pasos.
on conflict (planta) do nothing;

-- Los materiales. En el Excel estos factores viven TRIPLICADOS: en
-- 'Tabla UMN', en 'Fuente ZLDE'!A:F y en 'Fuente ZLDE'!T:U. Tres copias
-- del mismo número es tres oportunidades de que se separen; aquí hay una.
--
-- Varios SKU (cajas plásticas, barriles, la estiba de
-- madera, el cilindro de CO2) NO tienen factores en el Excel — nueve de
-- veintiuno, contados. Se dejan
-- en null a propósito en vez de poner un 1 que mentiría: la app avisa
-- que a ese material le faltan factores en vez de calcular basura.
create table if not exists public.sider_skus (
  sku             text primary key,
  descripcion     text not null,
  clase           text,
  cajas_x_estiba  numeric(12,4),
  unidades_x_caja numeric(12,4),
  hl_x_unidad     numeric(12,8),
  -- Igual que en los orígenes: se desactiva, no se borra.
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

insert into public.sider_skus
  (sku, descripcion, clase, cajas_x_estiba, unidades_x_caja, hl_x_unidad) values
  ('3500005', 'Envase Costeñita 175R',            'EER',      54, 38, 0.00175),
  ('3500024', 'CILINDRO CO2 20 kg',               'Cilindro', null, null, null),
  ('3500025', 'Barril Acero INOX DIN 30 LT',      'Cajas',    null, null, null),
  ('3500159', 'Caja Plástica Café 330cc X 30',    'Cajas',    null, null, null),
  ('3500162', 'Envase Marron 330R',               'EER',      45, 30, 0.0033),
  ('3500163', 'Estiba Cerv Madera 1280X1080X120', 'Estibas',  null, null, null),
  ('3500213', 'Envase Flint 330R',                'EER',      45, 30, 0.0033),
  ('3500231', 'Caja Plástica Café 225cc X 38',    'Cajas',    null, null, null),
  ('3500373', 'Envase Marron 750R',               'EER',      36, 16, 0.0075),
  ('3500374', 'CAJA PLASTICA MARRON 750cc x 16',  'Cajas',    null, null, null),
  ('3500383', 'Envase Flint 750R',                'EER',      36, 16, 0.0075),
  ('3500446', 'Envase Marron Club Col 330R',      'EER',      45, 30, 0.0033),
  ('3500587', 'BBC BARRIL ACERO INOX DIN 30 LT',  'Cajas',    null, null, null),
  ('3500887', 'BOTELLA FLINT 1000R',              'EER',      36, 13, 0.01),
  ('3500888', 'BOTELLA MARRON 1000CC',            'EER',      36, 13, 0.01),
  ('3501211', 'CAJA PLASTICA MARRON 1000cc x13',  'Cajas',    null, null, null),
  ('3501224', 'CAJA PLASTICA MARRON 250cc x38',   'Cajas',    null, null, null),
  ('3501225', 'BOTELLA FLINT 250 CC',             'EER',      45, 38, 0.0025),
  ('3501226', 'BOTELLA MARRON 250 CC',            'EER',      45, 38, 0.0025),
  ('3501430', 'ENVASE COSTENA BACANA 320CC R',    'EER',      45, 30, 0.0032),
  ('3501539', 'BOTELLA MARRON 850 ML R',          'EER',      36, 13, 0.0085)
-- Semilla, igual que los orígenes: re-correr el archivo no pisa lo que
-- se haya corregido desde la app.
on conflict (sku) do nothing;

-- Cuántas estibas caben en un sider. En el Excel es el 36 escrito a mano
-- dentro de la fórmula =J2/36; aquí es un parámetro con nombre, para que
-- el día que cambie el equipo no haya que buscarlo dentro de una fórmula.
create table if not exists public.sider_parametros (
  clave text primary key,
  valor numeric not null,
  nota  text
);
insert into public.sider_parametros (clave, valor, nota) values
  ('estibas_por_sider', 36, 'Estibas que caben en un sider completo. En el Excel era el 36 de =estibas/36.')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 2. El viaje — solo lo que se teclea
-- ---------------------------------------------------------------------
do $$ begin
  create type estado_sider as enum ('en_transito', 'recibido', 'anulado');
exception when duplicate_object then null; end $$;

create table if not exists public.sider_viajes (
  id          uuid primary key default gen_random_uuid(),
  placa       text not null,
  planta      text not null references public.sider_origenes(planta),
  sku         text not null references public.sider_skus(sku),
  estibas     numeric(10,2) not null check (estibas > 0),
  cd_destino  text not null default 'Barranquilla',
  estado      estado_sider not null default 'en_transito',
  observacion text,
  creado_por  uuid references public.perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);

create index if not exists sider_viajes_estado_idx on public.sider_viajes (estado, creado_en desc);
create index if not exists sider_viajes_placa_idx  on public.sider_viajes (upper(placa));
create index if not exists sider_viajes_fecha_idx  on public.sider_viajes (creado_en desc);

-- ---------------------------------------------------------------------
-- 3. Las dos puntas: salida y llegada
--    Cada una guarda DÓNDE y CUÁNDO se hizo. La precisión se guarda
--    también: una ubicación con dos kilómetros de error no es evidencia
--    de nada, y sin el número nadie puede saber que lo era.
-- ---------------------------------------------------------------------
do $$ begin
  create type punta_sider as enum ('salida', 'llegada');
exception when duplicate_object then null; end $$;

create table if not exists public.sider_certificaciones (
  id           uuid primary key default gen_random_uuid(),
  viaje_id     uuid not null references public.sider_viajes(id) on delete cascade,
  punta        punta_sider not null,
  lat          numeric(10,7) not null,
  lng          numeric(10,7) not null,
  precision_m  numeric(8,2),
  -- Cuándo lo dijo el GPS del teléfono, que no es lo mismo que cuándo
  -- llegó la fila a la base.
  ubicado_en   timestamptz,
  -- La dirección es la TRADUCCIÓN del punto, no el punto. La resuelve un
  -- servicio de mapas a partir de lat/lng y puede fallar, quedar en la
  -- calle de al lado o no existir; por eso se guarda ADEMÁS de las
  -- coordenadas y nunca en vez de ellas. La evidencia son lat, lng y la
  -- precisión: eso no depende de que un tercero responda.
  direccion    text,
  nota         text,
  hecha_por    uuid references public.perfiles(id) on delete set null,
  hecha_en     timestamptz not null default now(),
  -- Una sola certificación por punta y por viaje.
  unique (viaje_id, punta)
);

create index if not exists sider_cert_viaje_idx on public.sider_certificaciones (viaje_id);

-- Por si la tabla ya existía sin la columna.
alter table public.sider_certificaciones add column if not exists direccion text;

-- ---------------------------------------------------------------------
-- 4. Las tres fotos por punta
--    Las ranuras son fijas y obligatorias: costado izquierdo, costado
--    derecho y placa. Con ranura fija se sabe qué falta; con una lista
--    suelta de adjuntos, no.
-- ---------------------------------------------------------------------
do $$ begin
  create type ranura_foto as enum ('costado_izq', 'costado_der', 'placa');
exception when duplicate_object then null; end $$;

create table if not exists public.sider_fotos (
  id                uuid primary key default gen_random_uuid(),
  certificacion_id  uuid not null references public.sider_certificaciones(id) on delete cascade,
  ranura            ranura_foto not null,
  -- Ruta dentro del bucket 'sider'. El archivo no vive en la base.
  ruta              text not null,
  ancho             integer,
  alto              integer,
  bytes             integer,
  subida_en         timestamptz not null default now(),
  unique (certificacion_id, ranura)
);

create index if not exists sider_fotos_cert_idx on public.sider_fotos (certificacion_id);

-- ---------------------------------------------------------------------
-- 5. FUENTE PRINCIPAL — aquí viven las once fórmulas del Excel
--    Es la hoja "Base de Datos" del archivo, pero con las derivadas
--    calculadas en vez de guardadas. En la app esta es la pantalla
--    "Fuente principal": donde llega toda la información.
-- ---------------------------------------------------------------------
-- OJO: drop y luego create, NO "create or replace view".
-- "create or replace view" solo permite AGREGAR columnas al final: no
-- deja meter una en el medio ni renombrar ninguna. Cuando se agregaron
-- salida_direccion y llegada_direccion —que van pegadas a su precisión,
-- que es donde se leen, y no arrumadas al final— una base que YA tenía
-- la vista vieja se caía con:
--   ERROR 42P16: cannot change name of view column "cert_llegada_id"
--                to "salida_direccion"
-- que es Postgres comparando la vista vieja contra la nueva columna por
-- columna y encontrando la primera que se corrió de puesto.
--
-- Botarla no pierde nada: una vista no guarda filas, es una consulta con
-- nombre. Los datos están en sider_viajes y sider_certificaciones, que
-- no se tocan. El grant de más abajo la vuelve a dejar legible.
drop view if exists public.v_sider_viajes;
create view public.v_sider_viajes as
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

  -- La fecha del viaje es la de la certificación de SALIDA si ya la hay;
  -- si no, la de creación. Así la fila no cambia de mes cuando el
  -- vehículo llega tarde.
  coalesce(cs.hecha_en, v.creado_en)            as fecha,
  -- El NÚMERO del mes, no su nombre: to_char con TMMonth depende del
  -- idioma del servidor y salía "September". El nombre lo pone la app,
  -- que sí sabe en qué idioma está hablando.
  extract(month from coalesce(cs.hecha_en, v.creado_en))::int     as num_mes,
  extract(week from coalesce(cs.hecha_en, v.creado_en))::int      as semana,
  extract(year from coalesce(cs.hecha_en, v.creado_en))::int      as anio,

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
  (select count(*) from public.sider_fotos f where f.certificacion_id = cs.id) as fotos_salida,
  (select count(*) from public.sider_fotos f where f.certificacion_id = cl.id) as fotos_llegada,
  -- Cuánto lleva en el camino: la pregunta del tablero de tránsito.
  case when cs.hecha_en is not null
       then coalesce(cl.hecha_en, now()) - cs.hecha_en end        as en_camino
from public.sider_viajes v
join public.sider_origenes o on o.planta = v.planta
join public.sider_skus     s on s.sku    = v.sku
left join public.sider_certificaciones cs on cs.viaje_id = v.id and cs.punta = 'salida'
left join public.sider_certificaciones cl on cl.viaje_id = v.id and cl.punta = 'llegada';

-- ---------------------------------------------------------------------
-- 6. Certificar — una llamada, todo o nada
--    El viaje y su primera certificación nacen juntos: un viaje sin
--    ubicación ni fotos no debería poder existir ni un instante.
-- ---------------------------------------------------------------------
create or replace function public.sider_certificar_salida(
  p_placa       text,
  p_planta      text,
  p_sku         text,
  p_estibas     numeric,
  p_lat         numeric,
  p_lng         numeric,
  p_precision_m numeric,
  p_ubicado_en  timestamptz,
  p_nota        text default null,
  p_direccion   text default null
)
returns table (viaje_id uuid, certificacion_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viaje uuid;
  v_cert  uuid;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede certificar';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Falta la ubicación: no se puede certificar sin saber dónde se hizo';
  end if;

  insert into public.sider_viajes (placa, planta, sku, estibas, creado_por)
  values (upper(btrim(p_placa)), p_planta, btrim(p_sku), p_estibas, auth.uid())
  returning id into v_viaje;

  insert into public.sider_certificaciones
    (viaje_id, punta, lat, lng, precision_m, ubicado_en, direccion, nota, hecha_por)
  values
    (v_viaje, 'salida', p_lat, p_lng, p_precision_m, p_ubicado_en,
     nullif(btrim(coalesce(p_direccion, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_cert;

  return query select v_viaje, v_cert;
end $$;

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

  update public.sider_viajes set estado = 'recibido' where id = p_viaje_id;
  return v_cert;
end $$;

-- ---------------------------------------------------------------------
-- 6b. Borrar del maestro solo si nadie lo usó
--     Si ya hay viajes con ese origen o ese material, borrarlo se
--     llevaría el histórico por delante; en ese caso se desactiva y se
--     dice por qué, en vez de fallar con un error de llave ajena que no
--     le explica nada a nadie.
-- ---------------------------------------------------------------------
create or replace function public.sider_quitar_origen(p_planta text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede tocar el maestro';
  end if;
  select count(*) into n from public.sider_viajes where planta = p_planta;
  if n > 0 then
    update public.sider_origenes set activo = false where planta = p_planta;
    return format('Desactivado: %s viaje(s) ya lo usan, así que no se borra para no perder el histórico.', n);
  end if;
  delete from public.sider_origenes where planta = p_planta;
  return 'Borrado.';
end $$;

create or replace function public.sider_quitar_sku(p_sku text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede tocar el maestro';
  end if;
  select count(*) into n from public.sider_viajes where sku = p_sku;
  if n > 0 then
    update public.sider_skus set activo = false where sku = p_sku;
    return format('Desactivado: %s viaje(s) ya lo usan, así que no se borra para no perder el histórico.', n);
  end if;
  delete from public.sider_skus where sku = p_sku;
  return 'Borrado.';
end $$;

-- ---------------------------------------------------------------------
-- 7. RLS — todos leen, solo editores certifican
-- ---------------------------------------------------------------------
alter table public.sider_origenes        enable row level security;
alter table public.sider_skus            enable row level security;
alter table public.sider_parametros      enable row level security;
alter table public.sider_viajes          enable row level security;
alter table public.sider_certificaciones enable row level security;
alter table public.sider_fotos           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sider_origenes','sider_skus','sider_parametros',
                           'sider_viajes','sider_certificaciones','sider_fotos'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_editor()) with check (public.es_editor())',
      t||'_write', t);
  end loop;
end $$;

grant select on public.v_sider_viajes to authenticated;
grant execute on function
  public.sider_certificar_salida(text, text, text, numeric, numeric, numeric, numeric, timestamptz, text, text)
to authenticated;
grant execute on function
  public.sider_certificar_llegada(uuid, numeric, numeric, numeric, timestamptz, text, text)
to authenticated;

-- La firma vieja (sin dirección) queda regada si ya se corrió este
-- archivo antes: se quita para que no haya dos funciones con el mismo
-- nombre y PostgREST no tenga que adivinar cuál llamar.
drop function if exists public.sider_certificar_salida(text, text, text, numeric, numeric, numeric, numeric, timestamptz, text);
drop function if exists public.sider_certificar_llegada(uuid, numeric, numeric, numeric, timestamptz, text);
grant execute on function public.sider_quitar_origen(text) to authenticated;
grant execute on function public.sider_quitar_sku(text)    to authenticated;

-- ---------------------------------------------------------------------
-- 8. Las fotos — bucket privado
--    Privado a propósito: son placas de vehículos con hora y
--    coordenadas. La app las sirve con URL firmada de rato corto.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sider', 'sider', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists sider_fotos_ver on storage.objects;
create policy sider_fotos_ver on storage.objects
  for select to authenticated using (bucket_id = 'sider');

drop policy if exists sider_fotos_subir on storage.objects;
create policy sider_fotos_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'sider' and public.es_editor());

-- Las fotos no se reemplazan ni se borran: son la evidencia. Si una
-- salió mal se sube otra y quedan las dos, con su hora.
drop policy if exists sider_fotos_borrar on storage.objects;
create policy sider_fotos_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'sider' and public.mi_rol() = 'admin');
