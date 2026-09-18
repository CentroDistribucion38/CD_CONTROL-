-- =====================================================================
-- TRASPASOS · EL DOCUMENTO DEL VIAJE: OBLIGATORIO Y SIN REPETIR
--
-- «En el registro sí o sí deben colocar el documento asociado a ese
--  vehículo, y ningún documento se puede repetir — a menos que el
--  registro se anule.»
--
-- QUÉ FALTABA. Un viaje se registraba con placa, tipo, ruta y hora,
-- pero sin el papel que lo respalda. Cuando desde la planta preguntan
-- por un traslado, la pregunta nunca es «¿qué viajes hizo la ABC123 el
-- jueves?»: es «¿dónde está el 4500123456?». Sin esa columna había que
-- salir a buscarlo en la carpeta física, y un viaje sin documento no se
-- distinguía de uno cuyo documento nadie apuntó.
--
-- Y EL REPETIDO ES EL ERROR CARO. Un mismo documento digitado dos veces
-- son dos viajes contados donde hubo uno: el cumplido del turno queda
-- inflado, y el que se creyó registrado y no lo estaba nadie lo va a
-- notar, porque el número cuadra. Esta es la clase de error que no se
-- ve mirando la pantalla — solo se ve poniendo el candado.
--
-- ---------------------------------------------------------------------
-- LAS CUATRO DECISIONES DE ESTE ARCHIVO
-- ---------------------------------------------------------------------
--
-- 1. SOLO LOS VIAJES CON CARGA. El registro de vacíos es un número de
--    viajes del turno y ya: no lleva tipo, ni placa, ni ruta, porque no
--    los tiene. Pedirle un documento obligaría a inventarlo, y un dato
--    inventado es peor que un dato que falta. Es la misma regla que ya
--    gobierna las otras tres columnas.
--
-- 2. SE GUARDA COMO ESTÁ EN EL PAPEL, SE COMPARA SIN ADORNOS. La
--    columna `documento` conserva lo que dice el papel —«T-12345»— y
--    una segunda columna GENERADA, `documento_clave`, guarda la versión
--    sin guiones, sin espacios y en mayúscula. El candado va sobre la
--    clave: «t 12345», «T-12345» y «T12345» son el mismo documento y el
--    segundo se rechaza.
--
--    POR QUÉ DOS COLUMNAS Y NO UNA. Si se guardara solo la versión
--    pelada, la pantalla mostraría «T12345» y el papel diría «T-12345»:
--    quien compara a ojo tendría que traducir en la cabeza cada vez. Y
--    por qué GENERADA y no calculada al insertar: una columna generada
--    no se puede desajustar. No hay forma de escribir un `documento` y
--    una `documento_clave` que no se correspondan, ni desde aquí, ni
--    desde el SQL Editor, ni desde un import que alguien escriba dentro
--    de un año.
--
-- 3. EL CANDADO ES UN ÍNDICE, NO UN `if`. La comprobación también está
--    en la función —para poder decir CUÁL viaje ya tiene ese documento,
--    que es lo que la persona necesita saber—, pero lo que de verdad
--    impide el duplicado es el índice único. Un `if` que mira y después
--    inserta tiene un hueco entre las dos cosas, y dos supervisores
--    digitando el mismo documento en el mismo segundo se cuelan los
--    dos. No es teórico en este módulo: aquí hay tres turnos y varias
--    personas registrando a la vez, y el consecutivo TR- ya se tuvo que
--    resolver con una secuencia por exactamente esta razón.
--
-- 4. EL ÍNDICE ES PARCIAL: solo lo registrado. Anular un viaje libera
--    su documento, que es literalmente lo que se pidió. Si el índice
--    cubriera también lo anulado, anular y volver a registrar —el
--    camino normal cuando se digitó mal— chocaría contra el propio
--    viaje anulado y no habría manera de arreglarlo. Es el mismo
--    criterio del índice del plan, que ya está parcial por lo mismo.
--
--    Y no hay puerta de vuelta: no existe función que devuelva un viaje
--    anulado a «registrado», así que un documento liberado no puede
--    quedar duplicado por detrás. El día que se escriba esa función,
--    tendrá que volver a comprobar el documento antes de revivir la
--    fila. Queda dicho aquí para que quien la escriba lo lea.
--
-- ---------------------------------------------------------------------
-- LO QUE NO HACE: obligar a los viajes ya registrados.
-- ---------------------------------------------------------------------
-- Los que están en la base se quedan sin documento y la vista los marca
-- (`sin_documento`) para que la pantalla los muestre y se completen
-- cuando se pueda. No se les inventa un número, y tampoco se pone la
-- regla como CHECK en la tabla: un CHECK se evalúa también al
-- ACTUALIZAR, y entonces anular un viaje viejo —que es un update—
-- fallaría por una columna que no tiene nada que ver con anular. La
-- obligación vive en las dos funciones por las que se entra, que es
-- donde alguien está escribiendo el dato.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-registro-atrasado.sql
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.traspaso_hoy()') is null then
    raise exception
      'Falta supabase/migraciones/2026-09-traspasos-registro-atrasado.sql. Ese va primero.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA, SU CLAVE Y EL CANDADO
-- ---------------------------------------------------------------------
alter table public.traspasos_viajes
  add column if not exists documento text;

/* La clave normalizada. `nullif(..., '')` para que un documento vacío
   sea NULL y no cadena vacía: en un índice único dos NULL conviven —que
   es lo que queremos para los vacíos y para lo viejo— pero dos cadenas
   vacías chocarían, y el segundo viaje vacío del día no se podría
   registrar. */
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'documento_clave') then
    alter table public.traspasos_viajes
      add column documento_clave text
        generated always as (
          nullif(upper(regexp_replace(coalesce(documento, ''), '[^A-Za-z0-9]', '', 'g')), '')
        ) stored;
  end if;
end $$;

create unique index if not exists traspasos_viajes_documento_unico
  on public.traspasos_viajes (documento_clave)
  where estado = 'registrado' and documento_clave is not null;

/* Buscar por documento es la consulta que va a hacer la gente («¿dónde
   está el 4500123456?»), y el índice único de arriba no sirve para eso:
   solo cubre lo registrado, y quien busca un documento quiere
   encontrarlo aunque el viaje se haya anulado —muchas veces busca
   justamente para saber si se anuló—. */
create index if not exists traspasos_viajes_documento_idx
  on public.traspasos_viajes (documento_clave)
  where documento_clave is not null;


-- ---------------------------------------------------------------------
-- 2. DÓNDE ESTÁ ESE DOCUMENTO
--
-- Para poder decir «ese documento ya está en el TR-0231 del 14/09 con
-- la placa ABC123» en vez de «duplicate key value violates unique
-- constraint traspasos_viajes_documento_unico», que es lo que el
-- índice dice por su cuenta y que no le sirve a nadie de pie al lado
-- de un camión.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_documento_donde(p_documento text)
returns text
language sql
stable
set search_path = public
as $$
  select 'Ese documento ya está registrado en el ' || coalesce(v.codigo, 'viaje')
         || ' del ' || to_char(v.fecha, 'DD/MM/YYYY')
         || coalesce(' con la placa ' || v.placa, '')
         || '. Si de verdad es otro viaje, revisa el número; si el otro'
         || ' registro está malo, anúlalo y este entra.'
    from public.traspasos_viajes v
   where v.estado = 'registrado'
     and v.documento_clave
       = nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^A-Za-z0-9]', '', 'g')), '')
   limit 1
$$;

grant execute on function public.traspaso_documento_donde(text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. REGISTRAR
--
-- Va entera, como la dejó registro-atrasado.sql, y no como un parche:
-- una función se reemplaza, no se amplía. Tenerla escrita completa aquí
-- es lo que permite leerla de un vistazo dentro de tres meses sin ir
-- saltando entre cinco archivos.
--
-- `p_documento` va de ÚLTIMO en la firma. No porque sea lo último que
-- se llena —en la pantalla va con la placa, que es donde corresponde—
-- sino porque agregar un parámetro en la mitad corre todos los demás, y
-- cualquier llamada que vaya por posición empezaría a mandar la nota en
-- el lugar de la unidad sin que nada avise. El orden de una firma no es
-- el orden de una pantalla.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_registrar(
  date, text, text, text, text, text, integer, boolean, integer, text, text);

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
  p_nota     text    default null,
  p_documento text   default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_placa text; v_doc text;
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
     por turno y ya. No lleva tipo, ni placa, ni ruta, NI DOCUMENTO —
     pedirlos obligaría a inventarlos, y datos inventados son peores
     que datos que faltan. */
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

  /* EL DOCUMENTO. Se guarda en mayúscula y sin espacios de sobra —tal
     como está en el papel por lo demás—, y lo que decide si dos son el
     mismo es la columna generada, no esto. */
  v_doc := nullif(upper(btrim(coalesce(p_documento, ''))), '');
  if v_doc is null then
    raise exception 'Hay que decir el documento del viaje. Es el número del papel que va con el vehículo';
  end if;

  /* La comprobación amable: dice CUÁL viaje ya lo tiene. No es el
     candado —ese es el índice, más abajo, y es el que aguanta dos
     personas digitando a la vez—; es para que el mensaje sirva. */
  if public.traspaso_documento_donde(v_doc) is not null then
    raise exception '%', public.traspaso_documento_donde(v_doc);
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

  /* EL CANDADO DE VERDAD. Entre el `if` de arriba y este insert caben
     microsegundos, y en esos microsegundos entra el otro supervisor.
     El índice no tiene ese hueco; lo que se hace aquí es traducir su
     error a algo que se pueda leer de pie al lado del camión. */
  begin
    insert into public.traspasos_viajes
      (codigo, fecha, turno, tipo, placa, documento, origen, destino,
       origen_texto, destino_texto, viajes, vacio, carga, unidad, nota,
       hora, registrado_por)
    values
      (v_cod, p_fecha, v_turno, p_tipo, v_placa, v_doc, v_o, v_d,
       v_ot, v_dt, coalesce(p_viajes, 1), false,
       p_carga, nullif(btrim(coalesce(p_unidad, '')), ''),
       nullif(btrim(coalesce(p_nota, '')), ''), v_hora, auth.uid())
    returning traspasos_viajes.id into v_id;
  exception when unique_violation then
    raise exception '%', coalesce(
      public.traspaso_documento_donde(v_doc),
      'Ese documento ya está registrado en otro viaje.');
  end;

  return query select v_id, v_cod;
end $$;

grant execute on function
  public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text, text)
to authenticated;


-- ---------------------------------------------------------------------
-- 4. CORREGIR
--
-- LAS MISMAS REGLAS QUE AL REGISTRAR, y por el mismo motivo de siempre:
-- si fueran dos juegos de reglas, por la puerta de «corregir» entrarían
-- viajes que por la de «registrar» no pasan.
--
-- Y ES AQUÍ DONDE SE ARREGLAN LOS VIEJOS. Un viaje de antes de esta
-- migración no tiene documento; el administrador que lo corrige tiene
-- que ponérselo. No es un obstáculo de más: es el único momento en que
-- alguien está mirando ese viaje con el papel al lado.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text);

create or replace function public.traspaso_editar_viaje(
  p_id      uuid,
  p_fecha   date,
  p_turno   text,
  p_tipo    text    default null,
  p_placa   text    default null,
  p_origen  text    default null,
  p_destino text    default null,
  p_viajes  integer default 1,
  p_vacio   boolean default false,
  p_carga   integer default null,
  p_unidad  text    default null,
  p_nota    text    default null,
  p_motivo  text    default null,
  p_documento text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_estado traspaso_estado;
  v_placa  text; v_doc text;
  v_o text; v_d text; v_ot text; v_dt text;
begin
  /* COALESCE, Y NO ES ADORNO. mi_rol() devuelve NULL para quien no
     tiene perfil —una cuenta recién creada, un perfil borrado—, y en SQL
     `null <> 'admin'` no es cierto NI falso: es NULL, así que el `if` no
     dispara y la función SIGUE DE LARGO. El candado se abría justo para
     el caso que menos se conoce. Lo cazó la prueba, no el ojo. */
  if coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Corregir un viaje registrado es solo del administrador. Si te equivocaste al registrar, anúlalo y vuelve a registrarlo';
  end if;

  select to_jsonb(v), v.estado into v_antes, v_estado
    from public.traspasos_viajes v where v.id = p_id;
  if v_antes is null then raise exception 'Ese viaje no existe'; end if;

  /* UN VIAJE ANULADO NO SE EDITA. Corregir algo que ya se declaró que
     no pasó deja una fila que se contradice a sí misma. */
  if v_estado = 'anulado' then
    raise exception 'Ese viaje está anulado. Un viaje anulado no se corrige: se registra de nuevo';
  end if;

  if upper(btrim(coalesce(p_turno, ''))) not in ('A','B','C') then
    raise exception 'El turno tiene que ser A, B o C';
  end if;
  if p_fecha is null then
    raise exception 'Hay que decir de qué día es el viaje';
  end if;
  if coalesce(p_viajes, 1) < 1 then
    raise exception 'Un registro tiene que representar al menos un viaje';
  end if;

  /* ------------------------------------------------------------------
     VIAJE VACÍO. No lleva tipo, ni placa, ni ruta, ni documento: se
     limpian en vez de dejarlos como estaban. Un vacío que conserva el
     documento del viaje con carga que fue antes es un dato que miente
     —y peor: es un documento ocupado por un viaje que no lo tiene—. */
  if p_vacio then
    update public.traspasos_viajes
       set fecha = p_fecha, turno = upper(btrim(p_turno)),
           tipo = null, placa = null, documento = null,
           origen = null, destino = null, origen_texto = null, destino_texto = null,
           carga = null, unidad = null,
           viajes = coalesce(p_viajes, 1), vacio = true,
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           editado_en = now(), editado_por = auth.uid(), ediciones = ediciones + 1
     where id = p_id;

  else
    /* ---------------------------------------------------------------- */
    if not exists (select 1 from public.traspasos_tipos
                    where clave = p_tipo and activo) then
      raise exception 'Ese tipo de viaje no existe o está desactivado';
    end if;

    v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_placa = '' then
      raise exception 'Hay que decir la placa del vehículo';
    end if;

    v_doc := nullif(upper(btrim(coalesce(p_documento, ''))), '');
    if v_doc is null then
      raise exception 'Hay que decir el documento del viaje. Si este viaje es de antes y no lo tiene, este es el momento de ponérselo';
    end if;

    /* «Ya está en otro viaje» — EN OTRO. Guardar el viaje sin cambiarle
       el documento no puede fallar contra sí mismo, que es el error que
       convierte «corregir la placa» en imposible. */
    if exists (
      select 1 from public.traspasos_viajes w
       where w.estado = 'registrado' and w.id <> p_id
         and w.documento_clave
           = nullif(upper(regexp_replace(v_doc, '[^A-Za-z0-9]', '', 'g')), '')
    ) then
      raise exception '%', public.traspaso_documento_donde(v_doc);
    end if;

    /* LAS MISMAS REGLAS QUE AL REGISTRAR, y salen de las mismas
       funciones. */
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
    if upper(regexp_replace(coalesce(v_o, v_ot), '[^A-Za-z0-9]', '', 'g'))
     = upper(regexp_replace(coalesce(v_d, v_dt), '[^A-Za-z0-9]', '', 'g')) then
      raise exception 'El viaje sale y llega al mismo sitio. Revisa el origen y el destino';
    end if;

    begin
      update public.traspasos_viajes
         set fecha = p_fecha, turno = upper(btrim(p_turno)),
             tipo = p_tipo, placa = v_placa, documento = v_doc,
             origen = v_o, destino = v_d, origen_texto = v_ot, destino_texto = v_dt,
             viajes = coalesce(p_viajes, 1), vacio = false,
             carga = p_carga, unidad = nullif(btrim(coalesce(p_unidad, '')), ''),
             nota = nullif(btrim(coalesce(p_nota, '')), ''),
             editado_en = now(), editado_por = auth.uid(), ediciones = ediciones + 1
       where id = p_id;
    exception when unique_violation then
      raise exception '%', coalesce(
        public.traspaso_documento_donde(v_doc),
        'Ese documento ya está registrado en otro viaje.');
    end;
  end if;

  /* ------------------------------------------------------------------
     EL RASTRO. Va después del update para poder guardar el DESPUÉS de
     verdad —lo que quedó en la tabla— y no lo que se pidió. */
  insert into public.traspasos_viajes_ediciones (viaje, editado_por, motivo, antes, despues)
  select p_id, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''),
         v_antes, to_jsonb(v)
    from public.traspasos_viajes v where v.id = p_id;
end $$;

revoke all on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text, text)
  from public, anon;
grant execute on function public.traspaso_editar_viaje(
  uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text, text)
  to authenticated;


-- ---------------------------------------------------------------------
-- 5. LA VISTA
--
-- `sin_documento` no es una columna guardada: es «viaje con carga,
-- registrado, sin documento». Guardarla sería poder contradecirla, y
-- entonces habría que decidir cuál de las dos manda. Calculada, esa
-- pregunta no existe.
--
-- Un vacío NUNCA sale marcado: no le falta nada, es que no lleva. Y un
-- anulado tampoco: no hay nada que completar en un viaje que no pasó.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_viajes;

create view public.v_traspasos_viajes as
select
  v.id, v.codigo, v.fecha, v.turno,
  public.traspaso_orden_turno(v.turno)          as turno_orden,
  v.tipo, t.nombre                              as tipo_nombre,
  v.placa,
  v.documento,
  (not v.vacio and v.estado = 'registrado' and v.documento is null) as sin_documento,
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
-- 6. QUEDÓ ASÍ
--
-- Se comprueba lo que de verdad importa —que el candado sea un índice
-- PARCIAL y GENERADA la clave—, no solo que las columnas existan. Un
-- índice sobre toda la tabla también «existe» y rompería anular y
-- volver a registrar; una clave escrita a mano también «existe» y se
-- desajusta el primer día.
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_pred text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'documento') then
    v_falta := v_falta || ' traspasos_viajes.documento'; end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'documento_clave'
                    and is_generated = 'ALWAYS') then
    v_falta := v_falta || ' documento_clave(generada)'; end if;

  select pg_get_expr(i.indpred, i.indrelid) into v_pred
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'traspasos_viajes_documento_unico';

  if v_pred is null then
    v_falta := v_falta || ' indice_unico_parcial';
  elsif v_pred not like '%registrado%' then
    v_falta := v_falta || ' el_indice_no_es_parcial_por_estado';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_traspasos_viajes'
                    and column_name = 'sin_documento') then
    v_falta := v_falta || ' v_traspasos_viajes.sin_documento'; end if;

  if to_regprocedure('public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text, text)') is null then
    v_falta := v_falta || ' traspaso_registrar(con_documento)'; end if;

  /* La firma vieja tiene que haber DESAPARECIDO. Si quedaran las dos,
     PostgREST escogería una y sería la de siempre: el documento se
     mandaría y no llegaría a ninguna parte. */
  if to_regprocedure('public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text)') is not null then
    v_falta := v_falta || ' quedo_la_firma_vieja_de_registrar'; end if;
  if to_regprocedure('public.traspaso_editar_viaje(uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text)') is not null then
    v_falta := v_falta || ' quedo_la_firma_vieja_de_editar'; end if;

  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  raise notice 'Listo. El documento es obligatorio en los viajes con carga y no se puede repetir; anular lo libera.';
  raise notice 'Viajes ya registrados sin documento: %',
    (select count(*) from public.traspasos_viajes
      where not vacio and estado = 'registrado' and documento is null);
end $$;

commit;
