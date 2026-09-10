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

-- EL HISTÓRICO IMPORTADO
-- Los 200 renglones de abril a agosto de la hoja "Base de Datos" son
-- viajes que ya pasaron: no tienen fotos, ni GPS, ni quién certificó, y
-- nunca los van a tener. Entran igual porque son volumen real y sin
-- ellos el Real MTD del seguimiento arranca en cero, pero entran
-- MARCADOS, y esa marca es la que impide que alguien los cuente como
-- certificados con evidencia.
--
--   fecha      la del archivo. Un viaje importado no tiene certificación
--              de salida de donde sacarla, y creado_en sería la fecha en
--              que se subió el archivo: los cinco meses caerían en uno.
--   importado  true = vino de un archivo. No se puede certificar.
alter table public.sider_viajes add column if not exists fecha     date;
alter table public.sider_viajes add column if not exists importado boolean not null default false;

create index if not exists sider_viajes_estado_idx on public.sider_viajes (estado, creado_en desc);
create index if not exists sider_viajes_placa_idx  on public.sider_viajes (upper(placa));
create index if not exists sider_viajes_fecha_idx  on public.sider_viajes (creado_en desc);
create index if not exists sider_viajes_import_idx on public.sider_viajes (importado, fecha);

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
-- Las tres primeras son las OBLIGATORIAS: sin ellas el viaje no está
-- probado. 'observacion' es opcional y respalda la nota de la llegada
-- ("llegó con el sello roto"); no entra en el contador de 3 de 3 —ver
-- sider_fotos_contar() más abajo—.
do $$ begin
  create type ranura_foto as enum ('costado_izq', 'costado_der', 'placa', 'observacion');
exception when duplicate_object then null; end $$;
-- Para las bases que ya existían con las tres de siempre.
alter type ranura_foto add value if not exists 'observacion';

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
-- CUÁNTAS FOTOS TIENE CADA PUNTA — guardado, no contado cada vez.
--
-- Guardar algo que se puede calcular es lo que este módulo evita en
-- todas partes, y aquí se hace al revés a propósito. La vista de viajes
-- traía "(select count(*) from sider_fotos where certificacion_id = ...)"
-- por fila, y una subconsulta correlacionada en la lista de columnas le
-- impide a Postgres usar el índice: para devolver los 500 viajes más
-- recientes tenía que armar TODOS y después ordenar.
--
-- Medido, con la base llena:
--    12.000 viajes    180 ms  ->   41 ms
--   180.000 viajes  5.407 ms  ->  543 ms
--
-- El contador no se puede desfasar porque no lo escribe nadie a mano: lo
-- pone el disparador de abajo, y son tres fotos por punta, así que
-- recontar cuesta nada.
-- ---------------------------------------------------------------------
alter table public.sider_certificaciones add column if not exists fotos smallint not null default 0;
-- Aparte del contador: que la observación traiga foto no puede hacer que
-- un viaje con problemas se vea MÁS completo que uno sin ellos.
alter table public.sider_certificaciones add column if not exists foto_obs boolean not null default false;

create or replace function public.sider_fotos_contar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sider_certificaciones c
     set fotos = (select count(*) from public.sider_fotos f
                   where f.certificacion_id = c.id
                     and f.ranura in ('costado_izq', 'costado_der', 'placa')),
         foto_obs = exists (select 1 from public.sider_fotos f
                             where f.certificacion_id = c.id
                               and f.ranura not in ('costado_izq', 'costado_der', 'placa'))
   where c.id = coalesce(new.certificacion_id, old.certificacion_id);
  return null;
end $$;

drop trigger if exists sider_fotos_contar_tg on public.sider_fotos;
create trigger sider_fotos_contar_tg
  after insert or delete or update of certificacion_id on public.sider_fotos
  for each row execute function public.sider_fotos_contar();

-- Poner al día lo que ya estaba. Solo toca lo que no cuadra, así que
-- correr el archivo otra vez no reescribe la tabla entera.
update public.sider_certificaciones c
   set fotos = x.n, foto_obs = x.obs
  from (select c2.id,
               (select count(*) from public.sider_fotos f
                 where f.certificacion_id = c2.id
                   and f.ranura in ('costado_izq', 'costado_der', 'placa')) as n,
               exists (select 1 from public.sider_fotos f
                        where f.certificacion_id = c2.id
                          and f.ranura not in ('costado_izq', 'costado_der', 'placa')) as obs
          from public.sider_certificaciones c2) x
 where x.id = c.id
   and (c.fotos is distinct from x.n or c.foto_obs is distinct from x.obs);

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
-- El seguimiento LEE de esta vista, así que hay que botarlo primero: sin
-- esto, la segunda vez que se corre el archivo Postgres para todo con
--   ERROR: cannot drop view v_sider_viajes because other objects depend on it
-- Se bota explícitamente y no con "cascade", porque cascade se lleva por
-- delante lo que encuentre sin decir qué era; aquí se nombra lo que se
-- bota y se vuelve a crear abajo, en la sección 9.
drop view if exists public.v_sider_seguimiento;
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

-- =====================================================================
-- 9. SEGUIMIENTO — el informe de la hoja "Seguimiento"
--
-- Son tres tablas encadenadas, y el orden importa porque cada una come
-- de la anterior:
--
--   1. HL EER RECIBIDO  ·  sale de ZLDE (Planta = Barranquilla,
--      Clase = EER), agrupado por CD de origen. Es cuánto envase
--      retornable llegó de verdad desde cada centro.
--   2. REAL MTD  ·  sale de NUESTRA Fuente principal: los HL de los
--      viajes certificados de ese CD en ese mes. Antes salía de la hoja
--      "Base de Datos" que alguien llenaba a mano.
--   3. EL INFORME  ·  se calcula de las dos:
--        BU MTD          = HL recibido × meta            (la meta es 10%)
--        % Certificación = Real MTD ÷ HL recibido
--
-- OJO CON EL PORCENTAJE: es Real contra RECIBIDO, no contra el BU. Se
-- verificó contra el informe de agosto, fila por fila:
--   Curumani  697 / 3.937   = 17,7%   ✓
--   Turbaco 2.462 / 31.042  =  7,9%   ✓
--   Total   8.359 / 246.268 =  3,4%   ✓
-- Si fuera contra el BU, Curumani daría 177% y el informe diría otra
-- cosa. El BU queda igual porque responde la otra pregunta: cuántos HL
-- faltan, no qué fracción se logró.
-- =====================================================================

-- Lo que ZLDE dice que llegó. No se calcula: se importa.
create table if not exists public.sider_zlde (
  -- Primer día del mes. Un mes es la unidad del informe (MTD), y guardar
  -- el día exacto invitaría a sumar dos veces el mismo mes.
  mes           date not null,
  cd_origen     text not null,
  hl            numeric(16,3) not null,
  importado_por uuid references public.perfiles(id) on delete set null,
  importado_en  timestamptz not null default now(),
  primary key (mes, cd_origen)
);

-- El ZLDE crudo de SAP NO trae hectolitros: trae "Cantidad", que son
-- UNIDADES. Los HL y los vehículos salen de multiplicar por los factores
-- del maestro, igual que las columnas que el Excel calculaba al lado:
--   Hectolitros = Cantidad × hl_x_unidad
--   Cajas       = Cantidad ÷ unidades_x_caja
--   Estibas     = Cajas    ÷ cajas_x_estiba
--   Vehículos   = Estibas  ÷ 36
-- Se guardan resumidos por mes y CD, que es el grano del informe: las
-- 45.374 líneas del archivo de agosto se vuelven quince filas.
alter table public.sider_zlde add column if not exists vh_recibidos numeric(14,4) not null default 0;

-- ---------------------------------------------------------------------
-- PLANTA Y CLASE SE GUARDAN, no se aplican y se botan.
--
-- Antes el importador filtraba Planta = Barranquilla y Clase = EER y
-- guardaba solo el total: la pantalla no podía volver a filtrar porque
-- el dato ya no estaba. En el Excel esos dos son SEGMENTADORES del
-- pivote —se mueven y la tabla cambia—, así que aquí también tienen que
-- poder moverse.
--
-- Sigue siendo diminuto: cuatro meses del archivo real son unos cientos
-- de filas, no las 45.374 líneas de SAP.
-- ---------------------------------------------------------------------
alter table public.sider_zlde add column if not exists planta text not null default 'Barranquilla';
alter table public.sider_zlde add column if not exists clase  text not null default 'EER';

-- La llave pasa a incluirlas: el mismo CD puede traer EER y cajas en el
-- mismo mes, y antes la segunda fila tumbaba a la primera.
do $$ begin
  if exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.sider_zlde'::regclass and c.contype = 'p'
       and (select count(*) from unnest(c.conkey)) = 2
  ) then
    alter table public.sider_zlde drop constraint sider_zlde_pkey;
    alter table public.sider_zlde add primary key (mes, cd_origen, planta, clase);
  end if;
end $$;
-- Cuántas líneas de SAP resumió esta fila. Sirve para creerle al número:
-- 401 líneas detrás de los 56.538 HL de Galapa es otra cosa que una.
alter table public.sider_zlde add column if not exists lineas integer not null default 0;

-- ---------------------------------------------------------------------
-- EL DÍA, NO EL MES.
--
-- Se guardaba una fila por MES porque el informe es MTD y el día no
-- hacía falta. Pero el archivo de ZLDE trae la fecha EN CADA LÍNEA —el
-- lector ya la busca para saber de qué mes es— y esa fecha se estaba
-- botando al resumir. Guardándola, el seguimiento se puede pedir por un
-- día, por un rango cualquiera, por un mes o por un año, y el mes deja
-- de ser el único corte posible.
--
-- Sigue siendo diminuto: las 45.374 líneas de un mes se vuelven unos
-- cientos de filas por día, CD, planta y clase, no decenas de miles.
--
-- La columna mes SE QUEDA, derivada de fecha: agrupar por mes es la
-- consulta más común y tenerla ya calculada evita un date_trunc por
-- fila en cada informe.
-- ---------------------------------------------------------------------
alter table public.sider_zlde add column if not exists fecha date;
-- Lo ya cargado tenía el primer día del mes: ese es su fecha.
update public.sider_zlde set fecha = mes where fecha is null;
alter table public.sider_zlde alter column fecha set not null;

-- La llave pasa del mes al día. Se hace en un bloque guardado porque
-- este archivo se corre varias veces y la segunda vez ya está hecho.
do $$ begin
  if exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.sider_zlde'::regclass and c.contype = 'p'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k join pg_attribute a
                on a.attrelid = c.conrelid and a.attnum = k)
           = array['cd_origen','clase','mes','planta']
  ) then
    alter table public.sider_zlde drop constraint sider_zlde_pkey;
    alter table public.sider_zlde add primary key (fecha, cd_origen, planta, clase);
  end if;
end $$;

-- El seguimiento pide rangos de fechas: sin este índice, cada consulta
-- lee la tabla entera.
create index if not exists sider_zlde_fecha on public.sider_zlde (fecha);

-- Cuatro CD salían del informe de agosto (Cúcuta, San Andrés, Caucasia,
-- KACartagena). En vez de escribir esos cuatro nombres en el código, la
-- razón se guarda como dato: un CD que no despacha sider se marca y el
-- informe lo deja fuera del total, pero lo sigue mostrando aparte. Nada
-- desaparece sin decir por qué.
alter table public.sider_origenes add column if not exists aplica_sider boolean not null default true;

-- CUÁLES SON ESOS CUATRO. Se comprobó contra tu informe de agosto: el
-- pivote de ZLDE suma 248.486,118 HL con los quince CD, y la tabla del
-- informe suma 246.267,906. La diferencia son exactamente estos cuatro:
--   Cúcuta 2.019,357 + Caucasia 154,080 + KACartagena 25,866
--   + San Andrés 18,909 = 2.218,212
-- Se marcan UNA sola vez y se deja la constancia en los parámetros: si
-- mañana alguien vuelve a poner Caucasia en el total desde la app, este
-- archivo no se lo va a deshacer la próxima vez que se corra.
do $$ begin
  if not exists (select 1 from public.sider_parametros where clave = 'excluidos_agosto_aplicados') then
    update public.sider_origenes set aplica_sider = false
     where cd_origen in ('CD OL Cúcuta Local', 'CD Unión Caucasia', 'KACartagena', 'CD OL San Andrés');
    insert into public.sider_parametros (clave, valor, nota) values
      ('excluidos_agosto_aplicados', 1,
       'Marca de que ya se excluyeron del total los cuatro CD que el informe de agosto dejaba fuera. Solo existe para no volver a pisarlos: el que manda es aplica_sider en el maestro.');
  end if;
end $$;

insert into public.sider_parametros (clave, valor, nota) values
  ('meta_certificacion', 0.10,
   'Fracción del HL EER recibido que debe venir certificada. El BU MTD es esto por el HL recibido. En el Excel era el 10% escrito dentro de la fórmula.')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- La vista del informe. FULL JOIN a propósito: un CD que certificó pero
-- no aparece en ZLDE tiene que verse igual —es volumen real— y uno que
-- aparece en ZLDE sin certificar nada es justo el que hay que perseguir.
-- Con un join normal, uno de los dos casos se caería en silencio.
-- ---------------------------------------------------------------------
/* DEJA DE SER UNA VISTA Y PASA A SER UNA FUNCIÓN CON RANGO.
   Una vista no recibe parámetros, así que el informe estaba clavado al
   mes: era la única unidad que se podía pedir. Con la fecha guardada por
   día, el corte lo elige quien mira —un día, una semana, del 3 al 17, un
   mes, un año— y eso solo cabe en una función.
   Sigue siendo security invoker (el default): la función no salta el RLS,
   lee con los permisos de quien pregunta, igual que la vista. */
drop view if exists public.v_sider_seguimiento;
drop function if exists public.sider_seguimiento(date, date);

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

-- ---------------------------------------------------------------------
-- QUÉ DÍAS TIENEN ALGO.
-- El calendario necesita saberlo para apagar los días vacíos: un
-- calendario que deja tocar cualquier día y contesta "no hay nada" hace
-- buscar a ciegas. Se contestan las dos puntas por separado, porque un
-- día puede tener ZLDE y no viajes o al revés, y las dos cosas son
-- información.
-- ---------------------------------------------------------------------
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
   group by 1
)
select coalesce(z.fecha, c.fecha)   as fecha,
       coalesce(z.hl_zlde, 0)       as hl_zlde,
       coalesce(c.viajes, 0)::int   as viajes
  from z
  full join c on c.fecha = z.fecha;

-- ---------------------------------------------------------------------
-- 10. IMPORTAR
--
-- Dos archivos entran a la plataforma y los dos se resumen ANTES de
-- llegar aquí, en el navegador: el de ZLDE porque son 45.374 líneas y
-- mandarlas crudas sería mandar veinte megas para guardar quince filas,
-- y el de la Base de Datos porque hay que resolver el origen y el SKU
-- contra el maestro y decir qué renglones no cuadran antes de escribir
-- nada. Aquí llega lo ya cuadrado.
--
-- LOS DOS REEMPLAZAN POR MES, no fila por fila. Un archivo es la foto
-- completa de los meses que trae: si un CD dejó de aparecer es porque ya
-- no tiene movimiento, y actualizar solo lo que llegó dejaría el viejo
-- ahí para siempre. Volver a subir el mismo archivo deja lo mismo.
-- ---------------------------------------------------------------------

-- La firma vieja tomaba un mes suelto; ahora el archivo puede traer
-- varios (el de prueba trae mayo, junio, julio y agosto). No se puede
-- "create or replace" cambiando los argumentos: hay que botarla.
drop function if exists public.sider_zlde_guardar(date, jsonb);

create or replace function public.sider_zlde_importar(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses date[];
  n integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede importar ZLDE';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No llegó ninguna fila que guardar';
  end if;

  /* SE BORRA POR MES, AUNQUE SE GUARDE POR DÍA.
     Importar un mes REEMPLAZA ese mes: si se borrara solo por los días
     que trae el archivo, un archivo corregido al que le falta el día 7
     dejaría vivo el día 7 viejo, y el total del mes saldría con datos de
     dos importaciones distintas. Se borra el mes completo y se vuelve a
     escribir. */
  select array_agg(distinct date_trunc('month', (f->>'fecha')::date)::date)
    into v_meses
    from jsonb_array_elements(p_filas) f;

  delete from public.sider_zlde where mes = any(v_meses);

  insert into public.sider_zlde
    (fecha, mes, cd_origen, planta, clase, hl, vh_recibidos, lineas, importado_por)
  select (f->>'fecha')::date,
         date_trunc('month', (f->>'fecha')::date)::date,
         btrim(f->>'cd_origen'),
         coalesce(nullif(btrim(f->>'planta'), ''), 'sin planta'),
         coalesce(nullif(btrim(f->>'clase'),  ''), 'sin clase'),
         (f->>'hl')::numeric,
         coalesce((f->>'vh')::numeric, 0),
         coalesce((f->>'lineas')::integer, 0),
         auth.uid()
  from jsonb_array_elements(p_filas) f
  where btrim(coalesce(f->>'cd_origen', '')) <> ''
  -- Si el archivo trae la misma combinación dos veces, se suman en vez
  -- de que la segunda tumbe a la primera sin avisar.
  on conflict (fecha, cd_origen, planta, clase) do update
     set hl           = public.sider_zlde.hl           + excluded.hl,
         vh_recibidos = public.sider_zlde.vh_recibidos + excluded.vh_recibidos,
         lineas       = public.sider_zlde.lineas       + excluded.lineas;

  get diagnostics n = row_count;
  return jsonb_build_object('filas', n, 'meses', to_jsonb(v_meses));
end $$;

-- ---------------------------------------------------------------------
-- El histórico de la hoja "Base de Datos".
--
-- Solo borra lo IMPORTADO de esos meses. Un viaje certificado en la app,
-- con sus fotos y su GPS, no lo puede tocar un archivo: sería borrar
-- evidencia con un clic y sin preguntar.
-- ---------------------------------------------------------------------
create or replace function public.sider_viajes_importar(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses date[];
  v_borrados integer := 0;
  n integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede importar la base de datos';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No llegó ninguna fila que guardar';
  end if;

  select array_agg(distinct date_trunc('month', (f->>'fecha')::date)::date)
    into v_meses
    from jsonb_array_elements(p_filas) f;

  delete from public.sider_viajes
   where importado
     and fecha is not null
     and date_trunc('month', fecha)::date = any(v_meses);
  get diagnostics v_borrados = row_count;

  insert into public.sider_viajes
    (placa, planta, sku, estibas, fecha, estado, importado, observacion, creado_por)
  select upper(btrim(f->>'placa')),
         btrim(f->>'planta'),
         btrim(f->>'sku'),
         (f->>'estibas')::numeric,
         (f->>'fecha')::date,
         'recibido'::estado_sider,
         true,
         nullif(btrim(coalesce(f->>'observacion', '')), ''),
         auth.uid()
  from jsonb_array_elements(p_filas) f;

  get diagnostics n = row_count;
  return jsonb_build_object('filas', n, 'borrados', v_borrados, 'meses', to_jsonb(v_meses));
end $$;

alter table public.sider_zlde enable row level security;
drop policy if exists sider_zlde_select on public.sider_zlde;
create policy sider_zlde_select on public.sider_zlde for select to authenticated using (true);
drop policy if exists sider_zlde_write on public.sider_zlde;
create policy sider_zlde_write on public.sider_zlde for all to authenticated
  using (public.es_editor()) with check (public.es_editor());

grant select on public.v_sider_dias to authenticated;
grant execute on function public.sider_seguimiento(date, date) to authenticated;
grant execute on function public.sider_zlde_importar(jsonb)   to authenticated;
grant execute on function public.sider_viajes_importar(jsonb) to authenticated;
