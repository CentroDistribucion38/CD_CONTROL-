-- =====================================================================
-- CONTROL · TRASPASOS
--
-- Correr DESPUÉS de 00-nucleo.sql, 01-perfil.sql, 02-roles.sql y
-- 03-usuarios.sql. Es idempotente: se puede correr las veces que sea.
--
-- LOS VIAJES ENTRE PUNTOS: lo que se planea mover en un turno y lo que
-- de verdad se movió.
--
--   01 SE PLANEA     cuántos viajes de cada tipo lleva el turno
--   02 SE REGISTRA   cada viaje que sale, con su placa y su ruta
--   03 SE COMPARA    plan contra real, en el mismo renglón
--   04 EL MAESTRO    los tipos de viaje y los puntos
--
-- EL CUMPLIDO NO SE ESCRIBE: SE CUENTA.
--
-- La versión anterior tenía dos números que hablaban de lo mismo y no
-- se hablaban entre sí: un "cumplido" que alguien tecleaba en la
-- planeación, y aparte una lista de viajes con placa que registraba el
-- supervisor. Si el supervisor registraba siete viajes y alguien había
-- escrito "cumplido: 5", no existía manera de saber cuál de los dos
-- era el bueno — y las dos pantallas mostraban su número con la misma
-- cara de seguridad.
--
-- Aquí el cumplido SALE de contar los viajes registrados. Es una sola
-- verdad, no puede contradecirse, y de yapa queda escrito qué placa
-- hizo cada viaje: "se cumplió 5 de 7" pasa a poderse abrir y ver
-- cuáles cinco.
--
-- LOS VACÍOS SON VIAJES SIN CARGA. Cuestan lo mismo —el vehículo, el
-- conductor, el tiempo— pero no mueven producto. Por eso se cuentan
-- aparte y nunca se suman a los viajes cargados: sumarlos haría ver
-- productivo un turno que movió aire.
--
-- LAS REGLAS QUE EL SOFTWARE IMPONE:
--
--   1. ORIGEN Y DESTINO SALEN DE UN MAESTRO. Escritos a mano, "Ag01",
--      "AG-01" y "ag01" son tres sitios distintos y ningún informe por
--      ruta cuadra jamás. Si el punto no está en la lista se puede
--      escribir, pero queda MARCADO para que alguien lo agregue al
--      maestro — el dato no se pierde y la lista no se ensucia sola.
--
--   2. UN VIAJE NO SALE Y LLEGA AL MISMO SITIO. Es casi siempre un
--      error de dedo, y un viaje de Ag01 a Ag01 en el informe no
--      significa nada.
--
--   3. NADA SE BORRA: SE ANULA CON MOTIVO. El script viejo borraba la
--      fila de la hoja. Un viaje que existió y se borró deja el plan
--      cuadrando por arte de magia y sin nadie a quien preguntarle.
--
--   4. LA CANTIDAD DE UN VIAJE VACÍO ES CERO. No se puede registrar un
--      viaje "sin carga" que mueve 40 canastas: o mueve algo, o va
--      vacío.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOS TIPOS
-- ---------------------------------------------------------------------
do $$ begin
  create type traspaso_estado as enum ('registrado', 'anulado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. EL MAESTRO: TIPOS DE VIAJE
--
-- Son los mismos nueve que ya venían de la hoja. Se siembran porque
-- son los que hay hoy en Ag01 y porque un maestro vacío hace que la
-- primera pantalla no sirva para nada; pero se pueden desactivar y
-- agregar los que sean, sin tocar código.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_tipos (
  clave   text primary key,
  nombre  text not null,
  /* Un tipo desactivado NO se borra: las planeaciones viejas lo siguen
     nombrando. Desactivado solo quiere decir "ya no se puede escoger". */
  activo  boolean not null default true,
  orden   smallint
);

insert into public.traspasos_tipos (clave, nombre, orden) values
  ('casco_vidrio',      'Casco vidrio',       1),
  ('envase',            'Envase',             2),
  ('estibas',           'Estibas',            3),
  ('plastico',          'Plástico',           4),
  ('pet',               'PET',                5),
  ('lavado',            'Lavado',             6),
  ('pt_expo',           'PT Expo',            7),
  ('material',          'Material',           8),
  ('averias_isotanque', 'Averías/Isotanque',  9)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 3. EL MAESTRO: PUNTOS
--
-- De dónde sale y a dónde llega un viaje. Nace VACÍO a propósito: los
-- puntos de este centro son un dato de este centro, y sembrar nombres
-- inventados haría que alguien escoja "Planta 1" sin que exista.
--
-- Mientras esté vacío, el registro deja escribir el sitio a mano y lo
-- marca: la primera semana de uso arma sola la lista de los puntos que
-- de verdad se usan.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_puntos (
  clave   text primary key,
  nombre  text not null,
  /* Para separar lo de adentro de la bodega de lo de afuera en los
     informes: "cuántos viajes internos" es otra pregunta que "cuántos
     salieron del centro". */
  externo boolean not null default false,
  activo  boolean not null default true,
  orden   smallint
);

-- ---------------------------------------------------------------------
-- 4. LA PLANEACIÓN
--
-- Cuántos viajes de un tipo lleva un turno. Una fila por
-- (fecha, turno, tipo): planear dos veces lo mismo el mismo turno es
-- siempre un error de dedo, y la llave única lo impide en vez de
-- dejar dos renglones que después nadie sabe sumar o escoger.
--
-- ADICIONAL es lo que se metió después de cerrada la planeación del
-- turno. Se marca y no se esconde: un turno que cumplió 10 de 10
-- planeados y metió 6 adicionales no planeó bien, y esa es justamente
-- la cifra que el plan tiene que dejar ver.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_plan (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  turno         smallint not null,
  tipo          text not null references public.traspasos_tipos(clave),
  planeado      integer not null,
  /* Viajes SIN CARGA previstos. Se cuentan aparte y nunca se suman a
     `planeado`: sumarlos haría ver productivo un turno que movió aire. */
  vacios        integer not null default 0,
  es_adicional  boolean not null default false,
  nota          text,
  creado_por    uuid references public.perfiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  estado        traspaso_estado not null default 'registrado',
  motivo_anulacion text,
  anulado_en    timestamptz,
  anulado_por   uuid references public.perfiles(id) on delete set null,

  constraint traspasos_plan_turno_valido check (turno between 1 and 3),
  constraint traspasos_plan_planeado_valido check (planeado >= 0),
  constraint traspasos_plan_vacios_valido check (vacios >= 0)
);

/* Uno por turno y tipo. El índice es PARCIAL —solo lo no anulado—
   porque si no, anular una línea y volver a planearla chocaría contra
   la anulada, y "ya existe" sería mentira: la que existe está muerta. */
create unique index if not exists traspasos_plan_unico
  on public.traspasos_plan (fecha, turno, tipo)
  where estado = 'registrado';

create index if not exists traspasos_plan_fecha_idx
  on public.traspasos_plan (fecha desc, turno);

-- ---------------------------------------------------------------------
-- 5. LOS VIAJES
--
-- Lo que de verdad salió. Cada uno con su placa y su ruta.
--
-- NO tiene llave al plan a propósito. Un viaje existe aunque nadie
-- haya planeado ese tipo ese turno —pasa, y esconderlo sería peor—;
-- se junta con el plan por (fecha, turno, tipo), que es lo que los dos
-- tienen. Así el seguimiento puede decir las tres cosas que importan:
-- lo planeado que se cumplió, lo planeado que no, y lo que se movió
-- sin estar en el plan.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_viajes (
  id         uuid primary key default gen_random_uuid(),
  codigo     text unique,
  fecha      date not null,
  turno      smallint not null,
  tipo       text not null references public.traspasos_tipos(clave),

  /* La placa normalizada: sin guiones ni espacios y en mayúsculas. Se
     guarda así y no como la escribieron, porque "ABC 123", "abc-123" y
     "ABC123" son el mismo vehículo y el informe por placa tiene que
     verlos como uno solo. Es el mismo criterio del módulo Sider. */
  placa      text not null,

  origen     text references public.traspasos_puntos(clave),
  destino    text references public.traspasos_puntos(clave),
  /* Cuando el punto todavía no está en el maestro. Queda marcado para
     que alguien lo agregue; el dato no se pierde y la lista no se
     ensucia sola. */
  origen_texto  text,
  destino_texto text,

  /* Cuánto movió. En un viaje vacío es cero, y la regla de abajo lo
     obliga: o mueve algo, o va vacío. */
  cantidad   integer not null default 0,
  vacio      boolean not null default false,
  /* En qué se cuenta lo que movió: canastas, estibas, unidades. Va en
     el viaje y no en el tipo porque el mismo tipo se mide distinto
     según de dónde a dónde va. */
  unidad     text,

  hora       timestamptz not null default now(),
  nota       text,
  registrado_por uuid references public.perfiles(id) on delete set null,
  registrado_en  timestamptz not null default now(),

  estado     traspaso_estado not null default 'registrado',
  motivo_anulacion text,
  anulado_en timestamptz,
  anulado_por uuid references public.perfiles(id) on delete set null,

  constraint traspasos_viajes_turno_valido check (turno between 1 and 3),
  constraint traspasos_viajes_cantidad_valida check (cantidad >= 0),

  /* REGLA 4: un viaje vacío no mueve nada. */
  constraint traspasos_viajes_vacio_sin_carga
    check (not vacio or cantidad = 0),

  /* REGLA 2: no se sale y se llega al mismo sitio. Se comprueba sobre
     las dos formas —la clave del maestro y el texto suelto— porque si
     no, escribirlo a mano sería la puerta de atrás para saltarse la
     regla. */
  constraint traspasos_viajes_ruta_distinta
    check (origen is null or destino is null or origen <> destino),

  /* Que haya SIEMPRE un origen y un destino, de la lista o escrito.
     Un viaje sin ruta no se puede contar en ningún informe. */
  constraint traspasos_viajes_tiene_origen
    check (origen is not null or btrim(coalesce(origen_texto, '')) <> ''),
  constraint traspasos_viajes_tiene_destino
    check (destino is not null or btrim(coalesce(destino_texto, '')) <> '')
);

create index if not exists traspasos_viajes_fecha_idx
  on public.traspasos_viajes (fecha desc, turno);
create index if not exists traspasos_viajes_plan_idx
  on public.traspasos_viajes (fecha, turno, tipo) where estado = 'registrado';
create index if not exists traspasos_viajes_placa_idx
  on public.traspasos_viajes (placa);

/* El consecutivo TR-0001. Se usa una secuencia y no un "max + 1"
   porque max+1 con dos supervisores registrando al tiempo entrega el
   mismo número dos veces, y el número es el que la gente dice en voz
   alta. */
create sequence if not exists public.traspasos_codigo_seq;

-- ---------------------------------------------------------------------
-- 6. REGISTRAR UN VIAJE
--
-- Es la función que usa el supervisor, de pie al lado del vehículo.
-- Normaliza la placa, resuelve el punto contra el maestro y, si no
-- está, lo guarda como texto marcado.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_punto(p_texto text)
returns text
language sql
stable
set search_path = public
as $$
  /* ¿Ese texto es un punto del maestro? Se compara sin acentos, sin
     espacios y sin mayúsculas: quien escribe "ag 01" se refiere a
     AG01, y obligarlo a escribirlo igualito sería inventar trabajo. */
  select p.clave from public.traspasos_puntos p
   where p.activo
     and upper(regexp_replace(p.clave,  '[^A-Za-z0-9]', '', 'g'))
       = upper(regexp_replace(coalesce(p_texto, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1
$$;

create or replace function public.traspaso_registrar(
  p_fecha    date,
  p_turno    smallint,
  p_tipo     text,
  p_placa    text,
  p_origen   text,
  p_destino  text,
  p_cantidad integer default 0,
  p_vacio    boolean default false,
  p_unidad   text    default null,
  p_nota     text    default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_cod  text;
  v_placa text;
  v_o    text;
  v_d    text;
  v_ot   text;
  v_dt   text;
begin
  if not public.es_editor() then
    raise exception 'Registrar un viaje requiere rol de supervisor o administrador';
  end if;

  if not exists (select 1 from public.traspasos_tipos
                  where clave = p_tipo and activo) then
    raise exception 'Ese tipo de viaje no existe o está desactivado';
  end if;

  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_placa = '' then
    raise exception 'Hay que decir la placa del vehículo';
  end if;

  /* El punto se busca en el maestro. Si está, se guarda la clave —que
     es lo que después agrupa los informes—; si no, se guarda el texto
     marcado, para que el viaje se pueda registrar igual y el punto
     aparezca en la lista de "faltan en el maestro". */
  v_o := public.traspaso_punto(p_origen);
  v_d := public.traspaso_punto(p_destino);
  v_ot := case when v_o is null then nullif(btrim(coalesce(p_origen, '')), '') end;
  v_dt := case when v_d is null then nullif(btrim(coalesce(p_destino, '')), '') end;

  if v_o is null and v_ot is null then
    raise exception 'Hay que decir de dónde sale el viaje';
  end if;
  if v_d is null and v_dt is null then
    raise exception 'Hay que decir a dónde va el viaje';
  end if;

  /* REGLA 2, también para lo escrito a mano: "Ag01" a "ag 01" es el
     mismo sitio aunque el maestro no lo tenga. */
  if upper(regexp_replace(coalesce(v_o, v_ot), '[^A-Za-z0-9]', '', 'g'))
   = upper(regexp_replace(coalesce(v_d, v_dt), '[^A-Za-z0-9]', '', 'g')) then
    raise exception 'El viaje sale y llega al mismo sitio. Revisa el origen y el destino';
  end if;

  if p_vacio and coalesce(p_cantidad, 0) <> 0 then
    raise exception 'Un viaje vacío no mueve carga: o va vacío, o dice cuánto movió';
  end if;
  if not p_vacio and coalesce(p_cantidad, 0) = 0 then
    raise exception 'Di cuánto movió, o márcalo como viaje vacío';
  end if;

  v_cod := 'TR-' || lpad(nextval('public.traspasos_codigo_seq')::text, 4, '0');

  insert into public.traspasos_viajes
    (codigo, fecha, turno, tipo, placa, origen, destino,
     origen_texto, destino_texto, cantidad, vacio, unidad, nota, registrado_por)
  values
    (v_cod, p_fecha, p_turno, p_tipo, v_placa, v_o, v_d,
     v_ot, v_dt, coalesce(p_cantidad, 0), p_vacio,
     nullif(btrim(coalesce(p_unidad, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''),
     auth.uid())
  returning traspasos_viajes.id into v_id;

  return query select v_id, v_cod;
end $$;

grant execute on function
  public.traspaso_registrar(date, smallint, text, text, text, text, integer, boolean, text, text)
to authenticated;

-- ---------------------------------------------------------------------
-- 7. PLANEAR
-- ---------------------------------------------------------------------
create or replace function public.traspaso_planear(
  p_fecha      date,
  p_turno      smallint,
  p_tipo       text,
  p_planeado   integer,
  p_vacios     integer default 0,
  p_adicional  boolean default false,
  p_nota       text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.es_editor() then
    raise exception 'Planear requiere rol de supervisor o administrador';
  end if;

  if not exists (select 1 from public.traspasos_tipos
                  where clave = p_tipo and activo) then
    raise exception 'Ese tipo de viaje no existe o está desactivado';
  end if;

  /* Planear dos veces lo mismo el mismo turno es siempre un error de
     dedo. En vez de rechazarlo —que obligaría a buscar y borrar la
     otra línea— se ACTUALIZA la que hay: es lo que la persona quería
     hacer. */
  insert into public.traspasos_plan
    (fecha, turno, tipo, planeado, vacios, es_adicional, nota, creado_por)
  values
    (p_fecha, p_turno, p_tipo, p_planeado, coalesce(p_vacios, 0),
     p_adicional, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  on conflict (fecha, turno, tipo) where estado = 'registrado'
  do update set planeado = excluded.planeado,
                vacios   = excluded.vacios,
                es_adicional = excluded.es_adicional,
                nota     = excluded.nota
  returning traspasos_plan.id into v_id;

  return v_id;
end $$;

grant execute on function
  public.traspaso_planear(date, smallint, text, integer, integer, boolean, text)
to authenticated;

-- ---------------------------------------------------------------------
-- 8. ANULAR — NADA SE BORRA
--
-- El script viejo borraba la fila. Un viaje que existió y se borró deja
-- el plan cuadrando por arte de magia y sin nadie a quien preguntarle.
-- Aquí se anula con motivo y sigue estando, marcado.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_anular_viaje(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_quien uuid; v_estado traspaso_estado;
begin
  select registrado_por, estado into v_quien, v_estado
    from public.traspasos_viajes where id = p_id;
  if not found then raise exception 'Ese viaje no existe'; end if;
  if v_estado = 'anulado' then raise exception 'Ese viaje ya está anulado'; end if;

  /* Lo anula quien lo registró o un administrador. El supervisor del
     turno de al lado no debería poder borrar lo del otro turno. */
  if not (public.mi_rol() = 'admin' or v_quien = auth.uid()) then
    raise exception 'Solo quien registró el viaje o un administrador puede anularlo';
  end if;

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula. Anular sin motivo es borrar';
  end if;

  update public.traspasos_viajes
     set estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_en = now(), anulado_por = auth.uid()
   where id = p_id;
end $$;

grant execute on function public.traspaso_anular_viaje(uuid, text) to authenticated;

create or replace function public.traspaso_anular_plan(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado traspaso_estado;
begin
  if not public.es_editor() then
    raise exception 'Anular una línea del plan requiere rol de supervisor o administrador';
  end if;
  select estado into v_estado from public.traspasos_plan where id = p_id;
  if not found then raise exception 'Esa línea del plan no existe'; end if;
  if v_estado = 'anulado' then raise exception 'Esa línea ya está anulada'; end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se anula';
  end if;

  update public.traspasos_plan
     set estado = 'anulado', motivo_anulacion = btrim(p_motivo),
         anulado_en = now(), anulado_por = auth.uid()
   where id = p_id;
end $$;

grant execute on function public.traspaso_anular_plan(uuid, text) to authenticated;

-- =====================================================================
-- 9. LAS VISTAS
-- =====================================================================
drop view if exists public.v_traspasos_seguimiento;
drop view if exists public.v_traspasos_viajes;
drop view if exists public.v_traspasos_puntos_faltantes;

-- ---------------------------------------------------------------------
-- LOS VIAJES, con los nombres ya resueltos.
-- ---------------------------------------------------------------------
create view public.v_traspasos_viajes as
select
  v.id, v.codigo, v.fecha, v.turno,
  v.tipo, t.nombre as tipo_nombre,
  v.placa,
  v.origen, coalesce(po.nombre, v.origen_texto)  as origen_nombre,
  v.destino, coalesce(pd.nombre, v.destino_texto) as destino_nombre,
  /* Marcados: el punto todavía no está en el maestro. La pantalla lo
     puede enseñar distinto para que alguien lo agregue. */
  (v.origen  is null) as origen_suelto,
  (v.destino is null) as destino_suelto,
  v.cantidad, v.vacio, v.unidad, v.nota,
  v.hora, v.registrado_por, v.registrado_en,
  v.estado::text as estado,
  (v.estado = 'registrado') as vale,
  v.motivo_anulacion, v.anulado_en, v.anulado_por
from public.traspasos_viajes v
join public.traspasos_tipos t on t.clave = v.tipo
left join public.traspasos_puntos po on po.clave = v.origen
left join public.traspasos_puntos pd on pd.clave = v.destino;

grant select on public.v_traspasos_viajes to authenticated;

-- ---------------------------------------------------------------------
-- EL SEGUIMIENTO: PLAN CONTRA REAL, EN EL MISMO RENGLÓN.
--
-- Es la vista que contesta la pregunta del turno. Sale de un FULL JOIN
-- y no de un left join a propósito: hay tres casos y los tres importan.
--
--   planeado y cumplido   ..... lo normal
--   planeado sin viajes   ..... lo que se prometió y no se hizo
--   viajes sin planear    ..... lo que se movió fuera del plan
--
-- Con un left join desde el plan, el tercero desaparecería —y es
-- justamente el que dice que la planeación no está sirviendo—.
--
-- LOS VIAJES VACÍOS SE CUENTAN APARTE Y NO ENTRAN EN "CUMPLIDO".
-- Cuestan lo mismo pero no mueven producto: meterlos en el cumplido
-- haría ver cumplido un turno que movió aire.
-- ---------------------------------------------------------------------
create view public.v_traspasos_seguimiento as
with plan as (
  select fecha, turno, tipo, planeado, vacios, es_adicional, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado'
),
real as (
  select fecha, turno, tipo,
         count(*) filter (where not vacio)::int as cumplido,
         count(*) filter (where vacio)::int     as vacios_hechos,
         coalesce(sum(cantidad) filter (where not vacio), 0)::int as cantidad,
         count(distinct placa)::int             as placas
    from public.traspasos_viajes
   where estado = 'registrado'
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha)   as fecha,
  coalesce(p.turno, r.turno)   as turno,
  coalesce(p.tipo,  r.tipo)    as tipo,
  t.nombre                     as tipo_nombre,
  t.orden                      as tipo_orden,
  p.plan_id,
  coalesce(p.planeado, 0)      as planeado,
  coalesce(p.vacios, 0)        as vacios_planeados,
  coalesce(p.es_adicional, false) as es_adicional,
  p.nota,
  coalesce(r.cumplido, 0)      as cumplido,
  coalesce(r.vacios_hechos, 0) as vacios_hechos,
  coalesce(r.cantidad, 0)      as cantidad,
  coalesce(r.placas, 0)        as placas,

  /* Lo que falta. Nunca negativo: si se hicieron más de los planeados,
     lo que sobra es "de más", que es otra cosa y tiene su columna. */
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0) as faltan,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0) as de_mas,

  /* SIN PLANEAR: se movió y nadie lo había planeado. Es el renglón que
     dice que la planeación no está sirviendo, y por eso tiene nombre
     propio en vez de aparecer como un cumplimiento de 0 planeados. */
  (p.plan_id is null)          as sin_planear,

  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int, 999)
  end                          as pct
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo);

grant select on public.v_traspasos_seguimiento to authenticated;

-- ---------------------------------------------------------------------
-- LOS PUNTOS QUE FALTAN EN EL MAESTRO.
--
-- Todo lo que se escribió a mano porque no estaba en la lista, con
-- cuántas veces se usó. Es la pantalla que convierte el texto suelto
-- en maestro: lo que se escribió nueve veces esta semana es un punto
-- real que hay que agregar.
-- ---------------------------------------------------------------------
create view public.v_traspasos_puntos_faltantes as
select texto, count(*)::int as veces, max(fecha) as ultima
from (
  select origen_texto  as texto, fecha from public.traspasos_viajes
   where origen_texto is not null and estado = 'registrado'
  union all
  select destino_texto, fecha from public.traspasos_viajes
   where destino_texto is not null and estado = 'registrado'
) x
group by texto
order by count(*) desc;

grant select on public.v_traspasos_puntos_faltantes to authenticated;

-- =====================================================================
-- 10. LA SEGURIDAD
-- =====================================================================
alter table public.traspasos_tipos   enable row level security;
alter table public.traspasos_puntos  enable row level security;
alter table public.traspasos_plan    enable row level security;
alter table public.traspasos_viajes  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['traspasos_tipos','traspasos_puntos',
                           'traspasos_plan','traspasos_viajes']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)', t, t);
  end loop;
end $$;

/* Los maestros se editan desde la pantalla de Maestro, sin pasar por
   una función: son listas cortas y no tienen regla que proteger más
   allá de quién puede tocarlas. */
do $$
declare t text;
begin
  foreach t in array array['traspasos_tipos','traspasos_puntos']
  loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      'using (public.es_editor()) with check (public.es_editor())', t, t);
  end loop;
end $$;

/* El plan y los viajes NO se escriben directo: solo por las funciones,
   que son las que traen las reglas. Sin política de escritura, un
   insert suelto desde el navegador se rechaza — y las reglas dejan de
   ser una recomendación de la pantalla. */

grant select on public.traspasos_tipos, public.traspasos_puntos,
                public.traspasos_plan, public.traspasos_viajes to authenticated;
grant insert, update, delete on public.traspasos_tipos, public.traspasos_puntos
  to authenticated;
grant usage on sequence public.traspasos_codigo_seq to authenticated;

-- =====================================================================
-- 11. LOS PERMISOS DE LAS PANTALLAS
-- =====================================================================
do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, s.ruta,
           (case when r.clave in ('admin', 'supervisor') then 'editar' else 'ver' end)
             ::public.nivel_permiso
      from public.roles r
      cross join (values
        ('/traspasos'),
        ('/traspasos/plan'),
        ('/traspasos/seguimiento'),
        ('/traspasos/maestro')) as s(ruta)
    on conflict (rol, seccion) do nothing;
  end if;
end $$;

-- =====================================================================
-- 12. COMPROBACIÓN. Todas tienen que decir 'ok'.
-- =====================================================================
do $$
declare
  v_tablas integer; v_fun integer; v_vistas integer; v_tipos integer;
begin
  select count(*) into v_tablas from information_schema.tables
   where table_schema = 'public'
     and table_name in ('traspasos_tipos','traspasos_puntos',
                        'traspasos_plan','traspasos_viajes');

  select count(*) into v_fun from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('traspaso_registrar','traspaso_planear','traspaso_punto',
                       'traspaso_anular_viaje','traspaso_anular_plan');

  select count(*) into v_vistas from information_schema.views
   where table_schema = 'public'
     and table_name in ('v_traspasos_viajes','v_traspasos_seguimiento',
                        'v_traspasos_puntos_faltantes');

  select count(*) into v_tipos from public.traspasos_tipos;

  raise notice 'las cuatro tablas ........ %', case when v_tablas = 4 then 'ok' else 'MAL (' || v_tablas || ')' end;
  raise notice 'las cinco funciones ...... %', case when v_fun = 5 then 'ok' else 'MAL (' || v_fun || ')' end;
  raise notice 'las tres vistas .......... %', case when v_vistas = 3 then 'ok' else 'MAL (' || v_vistas || ')' end;
  raise notice 'tipos sembrados .......... % (%)', case when v_tipos >= 9 then 'ok' else 'MAL' end, v_tipos;
  raise notice 'puntos ................... nacen vacíos, se llenan en el Maestro';
end $$;
