-- =====================================================================
-- TRASPASOS · UN VIAJE PUEDE LLEVAR VARIOS TIPOS
--
-- «Cuántos viajes: que siempre sea 1, así que bloquéalo. Que pueda
--  seleccionar varios a la vez y se despliegue la cantidad por tipo.»
--
-- ---------------------------------------------------------------------
-- QUÉ CAMBIA Y POR QUÉ NO ES UN CAMPO MÁS
-- ---------------------------------------------------------------------
-- Hasta hoy un registro era: un tipo, y un número de viajes. Un camión
-- que salía con casco y estibas había que registrarlo dos veces, con dos
-- documentos — y el documento es uno solo, el del papel que va con el
-- vehículo. Así que no se registraba dos veces: se escogía uno de los
-- dos tipos y el otro desaparecía del plan.
--
-- Ahora: UN registro es UN vehículo con SU documento, y lleva los tipos
-- que lleve. El contador de viajes queda en 1 para el viaje con carga
-- —un vehículo, un viaje— y lo que se escoge es cuántos tipos van
-- encima. Los vacíos conservan su contador: un vacío no es un vehículo
-- con papel, es un número de viajes del turno.
--
-- ---------------------------------------------------------------------
-- CÓMO CUENTA EN EL PLAN: UNO DE CADA TIPO
-- ---------------------------------------------------------------------
-- Se escogió esto sobre repartir el viaje en fracciones. El plan de
-- casco pide cuatro viajes de casco; si un camión llevó casco, el plan
-- de casco avanzó uno. Que en el mismo camión viniera PET no le quita
-- nada a eso — el PET también avanzó uno.
--
-- El total del turno dirá tres viajes donde salió un camión, y eso es
-- correcto EN LA UNIDAD EN QUE ESTÁ ESCRITO EL PLAN, que son viajes por
-- tipo. La alternativa —un tercio para cada uno— deja el cumplido en
-- «2,33 de 4», que no se reporta.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA TABLA HIJA Y NO VARIAS FILAS DE VIAJE
-- ---------------------------------------------------------------------
-- Lo obvio sería meter una fila de viaje por tipo. No se puede, y por
-- una razón que ya está escrita en la base: `documento_clave` tiene un
-- índice ÚNICO sobre lo registrado. Tres filas con el mismo documento
-- —que es lo correcto: es un solo papel— chocarían contra él.
--
-- Relajar ese índice para dejarlas pasar sería deshacer justo lo que se
-- pidió hace dos días: que ningún documento se repita. Así que el viaje
-- sigue siendo UNA fila con UN documento, y los tipos cuelgan de él.
--
-- ---------------------------------------------------------------------
-- LO VIEJO SIGUE FUNCIONANDO SIN TOCARLO
-- ---------------------------------------------------------------------
-- Los viajes de antes no tienen filas hijas, y no se les inventan: la
-- vista los lee por su columna `tipo` de siempre, con un LEFT JOIN. Un
-- viaje con hijos cuenta por sus hijos; uno sin hijos, por su tipo. No
-- hay migración de datos, no hay fila que reescribir, y el cumplido de
-- ayer sale exactamente igual que ayer.
--
-- ---------------------------------------------------------------------
-- Y `traspaso_registrar` NO SE REESCRIBE
-- ---------------------------------------------------------------------
-- Es larga y ya se me han perdido cosas dentro al rehacerla de memoria.
-- La nueva función la LLAMA y después cuelga los tipos: una sola
-- llamada desde la pantalla, una sola transacción, y la función de
-- siempre intacta.
--
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción, así que cada pieza va en su sentencia; y el delimitador
-- del bloque no se escribe en ningún comentario, porque el editor cuenta
-- esos signos para trocear.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-documento.sql
-- y de 2026-09-traspasos-plan-rejilla.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

create table if not exists public.traspasos_viaje_tipos (
  viaje_id uuid not null references public.traspasos_viajes(id) on delete cascade,
  tipo     text not null references public.traspasos_tipos(clave) on delete restrict,
  /* LA CANTIDAD DE ESE TIPO —canastas, estibas, lo que sea—. Opcional,
     como la carga de siempre: nadie la llena todas las veces, y
     volverla obligatoria traba el registro con un camión esperando. */
  cantidad integer check (cantidad is null or cantidad >= 0),
  primary key (viaje_id, tipo)
);

create index if not exists traspasos_viaje_tipos_tipo_idx
  on public.traspasos_viaje_tipos (tipo);

alter table public.traspasos_viaje_tipos enable row level security;

/* EL GRANT Y LA POLÍTICA SON DOS COSAS Y HACEN FALTA LAS DOS: sin el
   GRANT la política no llega a evaluarse y el error es «permission
   denied for table», que no menciona ninguna política y manda a buscar
   el problema donde no está. */
grant select on public.traspasos_viaje_tipos to authenticated;
grant insert, update, delete on public.traspasos_viaje_tipos to authenticated;

do $$
begin
  drop policy if exists traspasos_viaje_tipos_select on public.traspasos_viaje_tipos;
  create policy traspasos_viaje_tipos_select on public.traspasos_viaje_tipos
    for select to authenticated using (true);
  drop policy if exists traspasos_viaje_tipos_write on public.traspasos_viaje_tipos;
  create policy traspasos_viaje_tipos_write on public.traspasos_viaje_tipos
    for all to authenticated using (true) with check (true);
end $$;

-- ---------------------------------------------------------------------
-- REGISTRAR UN VIAJE CON VARIOS TIPOS
--
-- `p_tipos` llega como [{"tipo":"casco","cantidad":120}, …]. El PRIMERO
-- se guarda también en la columna `tipo` del viaje: así el viaje sigue
-- teniendo un tipo propio y todo lo que ya lee esa columna —la lista de
-- viajes, el cruce, los informes viejos— sigue funcionando sin
-- enterarse de nada.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_registrar_varios(
  p_fecha     date,
  p_turno     text,
  p_tipos     jsonb,
  p_placa     text,
  p_origen    text,
  p_destino   text,
  p_documento text,
  p_nota      text default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_primero text; v_carga integer; v_n int;
begin
  if p_tipos is null or jsonb_typeof(p_tipos) <> 'array' or jsonb_array_length(p_tipos) = 0 then
    raise exception 'Hay que escoger al menos un tipo de viaje.';
  end if;

  /* NINGÚN TIPO REPETIDO. Dos veces el mismo tipo en el mismo viaje
     haría que el plan de ese tipo avanzara dos con un solo camión, que
     es exactamente el número que nadie podría explicar después. */
  select count(*) into v_n from (
    select distinct lower(btrim(e->>'tipo')) as t
      from jsonb_array_elements(p_tipos) e
     where nullif(btrim(coalesce(e->>'tipo', '')), '') is not null
  ) x;
  if v_n <> jsonb_array_length(p_tipos) then
    raise exception 'Hay un tipo repetido o vacío en la lista. Cada tipo va una sola vez.';
  end if;

  v_primero := btrim(p_tipos->0->>'tipo');
  v_carga   := nullif(p_tipos->0->>'cantidad', '')::integer;

  /* SE LLAMA A LA FUNCIÓN DE SIEMPRE, no se copia lo que hace. Ahí
     viven el código del viaje, la hora del turno cuando es de otro día,
     la validación del documento y la de la placa; reescribirlas aquí
     sería tener dos versiones esperando a separarse.

     Y LOS VIAJES VAN EN 1: un vehículo es un viaje. Lo que multiplica
     ahora son los tipos, no el contador. */
  select r.id, r.codigo into v_id, v_cod
    from public.traspaso_registrar(
      p_fecha, p_turno, v_primero, p_placa, p_origen, p_destino,
      1, false, v_carga, null, p_nota, p_documento) r;

  insert into public.traspasos_viaje_tipos (viaje_id, tipo, cantidad)
  select v_id, btrim(e->>'tipo'), nullif(e->>'cantidad', '')::integer
    from jsonb_array_elements(p_tipos) e
  on conflict (viaje_id, tipo) do update set cantidad = excluded.cantidad;

  return query select v_id, v_cod;
end $$;

revoke all on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text) from public;
grant execute on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- EL CONTROL, LEYENDO LOS TIPOS DE CADA VIAJE
--
-- El LEFT JOIN es todo el truco: un viaje CON hijos produce una línea
-- por tipo; uno SIN hijos —todos los de antes de hoy— produce una sola
-- línea con su propio tipo. No hay dato que migrar y el cumplido de
-- ayer sale igual que ayer.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
lineas as (
  select v.id, v.fecha, v.turno, v.placa, v.viajes,
         coalesce(vt.tipo, v.tipo)          as tipo,
         /* LA CARGA DEL TIPO cuando el viaje tiene tipos; la del viaje
            cuando no. Sumar las dos contaría dos veces lo mismo: el
            primer tipo guarda su cantidad TAMBIÉN en `carga`, para que
            lo viejo siga leyéndola. */
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
   where v.estado = 'registrado' and not v.vacio
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from lineas
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha)   as fecha,
  coalesce(p.turno, r.turno)   as turno,
  public.traspaso_orden_turno(coalesce(p.turno, r.turno)) as turno_orden,
  coalesce(p.tipo,  r.tipo)    as tipo,
  t.nombre                     as tipo_nombre,
  t.orden                      as tipo_orden,
  p.plan_id,
  coalesce(p.planeado, 0)      as planeado,
  coalesce(pv.vacios, 0)       as vacios_planeados,
  p.nota,
  coalesce(r.cumplido, 0)      as cumplido,
  coalesce(r.registros, 0)     as registros,
  coalesce(r.carga, 0)         as carga,
  coalesce(r.placas, 0)        as placas,
  least(coalesce(r.cumplido, 0), coalesce(p.planeado, 0))          as adheridos,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0)   as adicionales,
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0)   as faltan,
  (p.plan_id is null)          as sin_planear,
  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * least(coalesce(r.cumplido, 0), p.planeado) / p.planeado)::int, 100)
  end                          as adherencia,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int
  end                          as cumplimiento
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo)
left join public.traspasos_plan_vacios pv
  on pv.fecha = coalesce(p.fecha, r.fecha) and pv.turno = coalesce(p.turno, r.turno);

grant select on public.v_traspasos_control to authenticated;

-- ---------------------------------------------------------------------
-- LOS TIPOS DE CADA VIAJE, PARA LA LISTA
--
-- La lista de viajes muestra el tipo, y con varios mostrar solo el
-- primero sería una media verdad. Va como vista aparte y no metiendo
-- una columna en v_traspasos_viajes: esa vista la recrean cuatro
-- archivos distintos y añadirle algo aquí obliga a acordarse de
-- repetirlo en el siguiente que la toque.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_viaje_tipos as
select vt.viaje_id, vt.tipo, vt.cantidad, t.nombre as tipo_nombre, t.orden as tipo_orden
  from public.traspasos_viaje_tipos vt
  join public.traspasos_tipos t on t.clave = vt.tipo;

grant select on public.v_traspasos_viaje_tipos to authenticated;

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.traspasos_viaje_tipos') is null then
    raise exception 'La tabla de tipos por viaje no quedó.';
  end if;
  if to_regprocedure('public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text)') is null then
    raise exception 'La función de registrar con varios tipos no quedó.';
  end if;

  /* AQUÍ HUBO UN GUARDIÁN Y LO QUITÉ, QUE ES LO HONESTO.
     Comprobaba que el nombre `traspasos_viaje_tipos` APARECIERA en la
     definición de v_traspasos_control. La mutación lo desnudó: cambiar
     el join a `on false` deja la vista sin leer nada y el nombre sigue
     apareciendo igual, así que el guardián pasaba tan tranquilo. Un
     guardián que no distingue «lo lee» de «lo nombra» no protege nada y
     además da confianza de que sí.

     Lo que de verdad lo comprueba es el arnés, que registra un camión
     con tres tipos y mira si los tres planes avanzaron —y esa prueba se
     pone roja con la mutación, que es lo que se le pide—. Lo que no se
     puede comprobar desde aquí no se finge que se comprueba. */

  raise notice 'Listo. Un viaje puede llevar varios tipos, y cada tipo avanza su propio plan.';
  raise notice 'El viaje con carga va en 1: un vehículo es un viaje. Lo que multiplica son los tipos.';
  raise notice 'Los viajes de antes no se tocaron: sin tipos colgados, cuentan por su columna «tipo» de siempre.';
end $$;
