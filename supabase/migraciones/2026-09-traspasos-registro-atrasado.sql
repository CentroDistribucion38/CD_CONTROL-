-- =====================================================================
-- TRASPASOS · REGISTRAR DÍAS ANTERIORES, Y QUE SE NOTE
-- ---------------------------------------------------------------------
-- QUÉ ESTABA PASANDO. Nada impedía registrar un viaje de la semana
-- pasada: la fecha entraba tal cual y el viaje quedaba guardado. El
-- problema era el contrario — que NO SE NOTABA. Un viaje metido el
-- lunes con fecha del jueves anterior se veía exactamente igual que uno
-- registrado en su turno, y encima con la HORA del lunes: la tabla
-- decía que ese viaje salió a las 9:14 a. m. del lunes y contaba para
-- el jueves. Dos cosas que no pueden ser ciertas a la vez.
--
-- ESTE ARCHIVO HACE TRES COSAS, y ninguna le quita permisos a nadie:
--
--   1. LA HORA DEJA DE MENTIR. Si el viaje es de un día pasado, la hora
--      que se guarda es la de ARRANQUE DEL TURNO de ese día —06:00 para
--      el A, 14:00 para el B, 22:00 para el C—, no el momento en que
--      alguien lo digitó. A qué hora salió de verdad nadie lo sabe: eso
--      no se registró. El arranque del turno es lo único cierto que se
--      puede poner, y deja el viaje dentro de su propio día.
--
--   2. QUEDA MARCADO. La vista trae `atrasado` y `dias_atras`, que
--      salen de comparar la fecha del viaje contra el día en que se
--      digitó. No hace falta columna nueva: `registrado_en` y
--      `registrado_por` ya estaban ahí desde el primer día — lo que
--      faltaba era mirarlos. Un dato que ya se guarda y nadie ve es un
--      dato que no existe.
--
--   3. NO SE PUEDE REGISTRAR EL FUTURO. Un viaje de mañana no es un
--      registro, es un plan, y para eso está la pantalla de Planear.
--      Hasta hoy se podía meter un viaje del mes entrante y salía
--      contado como cumplido.
--
-- LO QUE NO HACE: cerrarle el día pasado a los supervisores. Se pensó
-- —el turno C entra a las 22:00 y sale a las 6:00, y muchas veces
-- digita al otro día; encerrarlos en "hoy" les partiría el turno en
-- dos—. Queda abierto para todos y marcado para todos; el
-- administrador además no tiene tope hacia atrás. Si más adelante hay
-- que apretarlo, se aprieta aquí y en un solo sitio.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA HORA DE UN VIAJE DE OTRO DÍA
--
-- Los horarios ya viven en traspaso_horario_turno; aquí solo hace falta
-- la hora de arranque, así que se escribe una vez y las dos quedan
-- juntas en este archivo para que nadie las cambie por separado.
--
-- LA ZONA HORARIA SE NOMBRA. `current_date` en Supabase es UTC: a las
-- 7 p. m. en Barranquilla el servidor ya cree que es mañana, y un viaje
-- del turno B quedaría "en el futuro" para su propia base de datos.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_hoy()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Bogota')::date $$;

grant execute on function public.traspaso_hoy() to authenticated;

create or replace function public.traspaso_arranque_turno(p_fecha date, p_turno text)
returns timestamptz
language sql
immutable
as $$
  select ((p_fecha + case upper(btrim(p_turno))
                       when 'A' then time '06:00'
                       when 'B' then time '14:00'
                       when 'C' then time '22:00'
                       else time '06:00'
                     end) at time zone 'America/Bogota')
$$;

grant execute on function public.traspaso_arranque_turno(date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. REGISTRAR
--
-- Va entera y no con un parche: una función se reemplaza, no se amplía,
-- y tenerla escrita completa aquí es lo que permite leerla de un
-- vistazo dentro de tres meses sin ir saltando entre cuatro archivos.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_registrar(
  p_fecha    date,
  p_turno    text,
  p_tipo     text,
  p_placa    text,
  p_origen   text,
  p_destino  text,
  p_viajes   integer default 1,
  p_vacio    boolean default false,
  p_carga    integer default null,
  p_unidad   text    default null,
  p_nota     text    default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_placa text;
  v_o text; v_d text; v_ot text; v_dt text;
  v_hoy date; v_turno text; v_hora timestamptz; v_atras integer;
begin
  if not public.es_editor() then
    raise exception 'Registrar un viaje requiere rol de supervisor o administrador';
  end if;

  v_turno := upper(btrim(coalesce(p_turno, '')));
  if v_turno not in ('A','B','C') then
    raise exception 'El turno tiene que ser A, B o C';
  end if;

  if coalesce(p_viajes, 1) < 1 then
    raise exception 'Un registro tiene que representar al menos un viaje';
  end if;

  /* ------------------------------------------------------------------
     LA FECHA.

     HACIA ADELANTE, CERRADO. Un viaje que no ha salido no se registra,
     se planea: son dos pantallas distintas justamente porque son dos
     cosas distintas. Sin este tope, un dedo que escribe 2027 en vez de
     2026 mete un cumplido que ningún informe vuelve a mirar.

     HACIA ATRÁS, ABIERTO —con un tope de un año contra el error de
     dedo, que no es lo mismo que un permiso—. El administrador pasa
     por encima de ese tope: si dice que la fecha es correcta, es
     correcta. */
  if p_fecha is null then
    raise exception 'Hay que decir de qué día es el viaje';
  end if;

  v_hoy := public.traspaso_hoy();

  if p_fecha > v_hoy then
    raise exception 'No se puede registrar un viaje de % : todavía no ha pasado. Lo de adelante va en Planear',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  v_atras := v_hoy - p_fecha;

  if v_atras > 365 and coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Esa fecha tiene más de un año (%). Si de verdad es correcta, tiene que meterla un administrador',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  /* LA HORA. Hoy, la de verdad; otro día, el arranque de su turno.
     Ponerle now() a un viaje de la semana pasada es escribir un dato
     falso en una columna que se llama "hora". */
  v_hora := case when v_atras = 0 then now()
                 else public.traspaso_arranque_turno(p_fecha, v_turno) end;

  /* ------------------------------------------------------------------
     EL REGISTRO DE VACÍOS es corto a propósito: es un número de viajes
     por turno y ya. No lleva tipo, ni placa, ni ruta — pedirlos
     obligaría a inventarlos, y datos inventados son peores que datos
     que faltan. */
  if p_vacio then
    v_cod := 'TR-' || lpad(nextval('public.traspasos_codigo_seq')::text, 4, '0');
    insert into public.traspasos_viajes
      (codigo, fecha, turno, viajes, vacio, nota, hora, registrado_por)
    values
      (v_cod, p_fecha, v_turno, coalesce(p_viajes, 1), true,
       nullif(btrim(coalesce(p_nota, '')), ''), v_hora, auth.uid())
    returning traspasos_viajes.id into v_id;
    return query select v_id, v_cod;
    return;
  end if;

  /* ------------------------------------------------------------------ */
  if not exists (select 1 from public.traspasos_tipos
                  where clave = p_tipo and activo) then
    raise exception 'Ese tipo de viaje no existe o está desactivado';
  end if;

  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_placa = '' then
    raise exception 'Hay que decir la placa del vehículo';
  end if;

  /* El punto se busca en el maestro. Si está, se guarda la clave —que
     es lo que agrupa los informes—; si no, se guarda el texto marcado,
     para que el viaje se registre igual y el punto aparezca en la lista
     de "faltan en el maestro". */
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

  /* REGLA 2, también para lo escrito a mano: "Ag01" y "ag 01" son el
     mismo sitio aunque el maestro no los tenga. */
  if upper(regexp_replace(coalesce(v_o, v_ot), '[^A-Za-z0-9]', '', 'g'))
   = upper(regexp_replace(coalesce(v_d, v_dt), '[^A-Za-z0-9]', '', 'g')) then
    raise exception 'El viaje sale y llega al mismo sitio. Revisa el origen y el destino';
  end if;

  v_cod := 'TR-' || lpad(nextval('public.traspasos_codigo_seq')::text, 4, '0');

  insert into public.traspasos_viajes
    (codigo, fecha, turno, tipo, placa, origen, destino,
     origen_texto, destino_texto, viajes, vacio, carga, unidad, nota,
     hora, registrado_por)
  values
    (v_cod, p_fecha, v_turno, p_tipo, v_placa, v_o, v_d,
     v_ot, v_dt, coalesce(p_viajes, 1), false,
     p_carga, nullif(btrim(coalesce(p_unidad, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), v_hora, auth.uid())
  returning traspasos_viajes.id into v_id;

  return query select v_id, v_cod;
end $$;

grant execute on function
  public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text)
to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA VISTA, CON LA MARCA
--
-- `atrasado` no es una columna guardada: se calcula comparando el día
-- del viaje con el día en que se digitó. Guardarla sería poder
-- contradecirla —una fila con atrasado = false y registrado_en de tres
-- días después— y entonces habría que decidir cuál de las dos manda.
-- Calculada, esa pregunta no existe.
--
-- SE MIDE EN DÍAS DE BARRANQUILLA, no en días de UTC. Un viaje del
-- turno B digitado a las 7 p. m. se registró el mismo día; para UTC ya
-- era el siguiente, y saldría marcado como atrasado sin serlo.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_viajes;

create view public.v_traspasos_viajes as
select
  v.id, v.codigo, v.fecha, v.turno,
  public.traspaso_orden_turno(v.turno)          as turno_orden,
  v.tipo, t.nombre                              as tipo_nombre,
  v.placa,
  v.origen,  coalesce(po.nombre, v.origen_texto)  as origen_nombre,
  v.destino, coalesce(pd.nombre, v.destino_texto) as destino_nombre,
  (v.origen  is null and v.origen_texto  is not null) as origen_suelto,
  (v.destino is null and v.destino_texto is not null) as destino_suelto,
  v.viajes, v.vacio, v.carga, v.unidad, v.nota,
  v.hora, v.registrado_por, v.registrado_en,

  /* Cuántos días después del viaje se digitó, y si fue después. */
  greatest(((v.registrado_en at time zone 'America/Bogota')::date - v.fecha), 0)::int
                                                as dias_atras,
  ((v.registrado_en at time zone 'America/Bogota')::date > v.fecha)
                                                as atrasado,

  v.estado::text as estado,
  (v.estado = 'registrado') as vale,
  v.motivo_anulacion, v.anulado_en, v.anulado_por,
  v.ediciones, v.editado_en, v.editado_por
from public.traspasos_viajes v
left join public.traspasos_tipos t on t.clave = v.tipo
left join public.traspasos_puntos po on po.clave = v.origen
left join public.traspasos_puntos pd on pd.clave = v.destino;

grant select on public.v_traspasos_viajes to authenticated;


-- ---------------------------------------------------------------------
-- 4. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regprocedure('public.traspaso_hoy()') is null then
    v_falta := v_falta || ' traspaso_hoy'; end if;
  if to_regprocedure('public.traspaso_arranque_turno(date, text)') is null then
    v_falta := v_falta || ' traspaso_arranque_turno'; end if;
  if to_regclass('public.v_traspasos_viajes') is null then
    v_falta := v_falta || ' v_traspasos_viajes'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_traspasos_viajes'
                    and column_name = 'atrasado') then
    v_falta := v_falta || ' v_traspasos_viajes.atrasado'; end if;

  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;
  raise notice 'Listo: los días anteriores se registran con la hora de su turno y quedan marcados.';
end $$;
