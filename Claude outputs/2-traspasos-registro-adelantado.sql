-- =====================================================================
-- TRASPASOS · SE PUEDE REGISTRAR UN VIAJE ADELANTADO
-- ---------------------------------------------------------------------
-- «Necesito que habilites las fechas en el registro, porque hay veces
--  que tengo un viaje del día siguiente y lo adelanto.»
--
-- QUÉ ESTABA MAL. Registrar rechazaba CUALQUIER fecha por delante de
-- hoy: «todavía no ha pasado, lo de adelante va en Planear». La regla
-- estaba pensada contra el error de dedo —escribir 2027 en vez de
-- 2026—, y de paso tapaba un caso que sí ocurre todos los días: el
-- viaje que le toca a mañana y que sale esta noche. La única salida era
-- esperar a que cambiara el día y meterlo después, con el renglón
-- marcado REGISTRADO DESPUÉS, que es justo lo que no era.
--
-- LA REGLA NUEVA, EN UNA LÍNEA:
--
--   Se registra desde un año atrás hasta SIETE DÍAS adelante.
--
-- El tope de adelante es para todos, administrador incluido, y el
-- porqué está escrito al lado del `if`: hacia atrás «la fecha de verdad
-- es esa» es un caso real; hacia adelante no lo es.
--
-- LO QUE NO SE TOCA —«solo las fechas»—:
-- · EL CANDADO DEL DÍA CERRADO. Un día que ya pasó su ventana lo sigue
--   tocando solo un administrador. Esto no lo mueve.
-- · EL PLAN. Planear sigue siendo donde se arma lo de adelante. Esto no
--   es una segunda forma de planear: es registrar un viaje que salió.
--
-- Y QUEDA MARCADO. La vista trae `adelantado` y `dias_adelante`, espejo
-- de `atrasado` y `dias_atras`. Quien mire el día de mañana ve cuáles
-- renglones se escribieron antes de que ese día llegara.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-sin-orden-cargue.sql
-- y de supabase/migraciones/2026-09-traspasos-facturacion.sql.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.traspaso_documento_donde(text)') is null then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-documento.sql. Ese va primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_traspasos_viajes'
                    and column_name = 'por_facturar') then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-facturacion.sql. Ese va primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. REGISTRAR, CON LA FECHA ABIERTA HACIA ADELANTE
--
-- Va ENTERA, como la dejó 2026-09-traspasos-sin-orden-cargue.sql, y no
-- como un parche: en PostgreSQL no se remienda el cuerpo de una
-- función, se vuelve a crear. Lo único distinto es el bloque de LA
-- FECHA y el comentario de LA HORA.
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

     HACIA ADELANTE, HASTA SIETE DÍAS. «Hay veces que tengo un viaje del
     día siguiente y lo adelanto.» Ese viaje SALIÓ —existe, tiene placa
     y ruta— y pertenece al día que le toca, no al día en que el camión
     arrancó: contarlo en hoy le sube el cumplido a un plan que no era
     el suyo y se lo baja al que sí. Antes aquí se rechazaba todo lo de
     adelante, y la única salida era esperar a que cambiara el día.

     EL TOPE DE SIETE DÍAS SE QUEDA, Y PARA TODOS —también para el
     administrador—. Hacia atrás el tope tiene excepción porque «la
     fecha de verdad es esa» es un caso real: un viaje de hace un mes
     que nadie metió. Hacia adelante no lo es: nadie adelanta un viaje
     de dentro de tres meses. Lo único que pasaría es que un dedo que
     escribe 2027 en vez de 2026 meta un cumplido en un día que ningún
     informe vuelve a mirar.

     HACIA ATRÁS, ABIERTO —con un tope de un año contra el error de
     dedo, que no es lo mismo que un permiso—. El administrador pasa
     por encima de ese tope: si dice que la fecha es correcta, es
     correcta. */
  if p_fecha is null then
    raise exception 'Hay que decir de qué día es el viaje';
  end if;

  v_hoy := public.traspaso_hoy();

  if p_fecha > v_hoy + 7 then
    raise exception 'Esa fecha (%) está a más de siete días. Se puede adelantar un viaje de los próximos días, no armar el mes: lo de más adelante va en Planear',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  v_atras := v_hoy - p_fecha;

  if v_atras > 365 and coalesce(public.mi_rol(), '') <> 'admin' then
    raise exception 'Esa fecha tiene más de un año (%). Si de verdad es correcta, tiene que meterla un administrador',
      to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  /* LA HORA. Hoy, la de verdad; cualquier otro día —atrás o adelante—,
     el arranque de su turno. Ponerle now() a un viaje de la semana
     pasada es escribir un dato falso en una columna que se llama
     "hora", y ponérselo a uno de mañana es escribir una hora que
     todavía no existe. `v_atras` es negativo hacia adelante, así que
     esta misma línea ya resuelve los dos lados. */
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
  /* LA ORDEN DE CARGUE YA NO SE PIDE AL REGISTRAR: «en el registro de
     traspaso elimina orden de cargue». Si alguna llamada la manda, se
     guarda y se sigue cuidando que no se repita; si no, queda vacía. */
  v_doc := nullif(upper(btrim(coalesce(p_documento, ''))), '');

  /* La comprobación amable: dice CUÁL viaje ya lo tiene. No es el
     candado —ese es el índice, más abajo, y es el que aguanta dos
     personas digitando a la vez—; es para que el mensaje sirva. */
  if v_doc is not null and public.traspaso_documento_donde(v_doc) is not null then
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
-- 2. LA VISTA, CON EL ESPEJO DE «ATRASADO»
--    (las columnas nuevas van al final: así `create or replace` sirve)
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_viajes as
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
  greatest(((v.registrado_en at time zone 'America/Bogota')::date - v.fecha), 0)::int
                                                as dias_atras,
  ((v.registrado_en at time zone 'America/Bogota')::date > v.fecha)
                                                as atrasado,
  v.estado::text as estado,
  (v.estado = 'registrado') as vale,
  v.motivo_anulacion, v.anulado_en, v.anulado_por,
  v.ediciones, v.editado_en, v.editado_por,
  /* LA SALIDA. `por_facturar` no se guarda: es «con carga, registrado y
     sin salida». Guardado se podría contradecir. */
  v.factura_documento,
  v.salida_en, v.salida_por, ps.nombre          as salida_nombre,
  v.salida_historica,
  (not v.vacio and v.estado = 'registrado' and v.salida_en is null) as por_facturar,
  /* ADELANTADO ES EL ESPEJO DE ATRASADO, y por el mismo motivo: quien
     mira el día tiene derecho a saber que ese renglón no se escribió
     ahí. Un viaje del 24 metido el 23 cuenta igual —salió— pero se ve
     marcado, y la hora que lleva al lado es la de arranque del turno.
     Se calcula, no se guarda: una columna guardada se puede
     contradecir con `registrado_en`. */
  ((v.registrado_en at time zone 'America/Bogota')::date < v.fecha)
                                                as adelantado,
  greatest((v.fecha - (v.registrado_en at time zone 'America/Bogota')::date), 0)::int
                                                as dias_adelante
from public.traspasos_viajes v
left join public.traspasos_tipos t on t.clave = v.tipo
left join public.traspasos_puntos po on po.clave = v.origen
left join public.traspasos_puntos pd on pd.clave = v.destino
left join public.perfiles ps on ps.id = v.salida_por;

-- ---------------------------------------------------------------------
-- 3. LA PORTADA DE ADMINISTRACIÓN TIENE QUE PODER VER ESTE ARCHIVO
--
-- `admin_existe` solo sabía preguntar por TABLAS y por FUNCIONES, y
-- esta migración no crea ninguna de las dos: vuelve a crear una función
-- que ya existía y le agrega dos columnas a una vista. Sin una tercera
-- forma de preguntar, la portada diría «base al día» con este archivo
-- sin correr —que es la única mentira que esa pantalla no se puede
-- permitir, porque es la pantalla que existe para no tener que llevar
-- la cuenta a mano—.
--
-- Se agrega 'col:esquema.tabla.columna'. Sirve para cualquier archivo
-- futuro que solo agregue una columna, que es el caso más común de
-- todos.
-- ---------------------------------------------------------------------
create or replace function public.admin_existe(p_objetos text[])
returns table (objeto text, existe boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare o text; e boolean; v_p text[];
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  foreach o in array coalesce(p_objetos, '{}') loop
    begin
      if o like 'tabla:%' then e := to_regclass(substr(o, 7)) is not null;
      elsif o like 'fn:%' then e := to_regproc(substr(o, 4)) is not null;
      elsif o like 'col:%' then
        /* 'col:public.v_traspasos_viajes.adelantado' → tres pedazos.
           Se parte por puntos y se piden los tres: sin esquema no se
           podría distinguir dos tablas con el mismo nombre. */
        v_p := string_to_array(substr(o, 5), '.');
        e := array_length(v_p, 1) = 3 and exists (
               select 1 from information_schema.columns c
                where c.table_schema = v_p[1]
                  and c.table_name   = v_p[2]
                  and c.column_name  = v_p[3]);
      else e := false; end if;
    exception when others then e := true;   -- varias con el mismo nombre: existe
    end;
    objeto := o; existe := e; return next;
  end loop;
end $$;
revoke all on function public.admin_existe(text[]) from public, anon;
grant execute on function public.admin_existe(text[]) to authenticated;


-- ---------------------------------------------------------------------
-- 4. COMPROBACIÓN, AQUÍ MISMO
--
-- Si alguna falla, la migración se deshace entera.
-- ---------------------------------------------------------------------
do $$
declare
  v_src text;
  v_admin uuid;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'traspaso_registrar';

  /* El tope viejo —cualquier día de adelante rechazado— no puede
     quedar vivo. */
  if v_src like '%if p_fecha > v_hoy then%' then
    raise exception 'La función quedó con el tope viejo: sigue rechazando todo lo de adelante';
  end if;
  if v_src not like '%if p_fecha > v_hoy + 7 then%' then
    raise exception 'La función no quedó con el tope de siete días';
  end if;

  /* Y el candado del día cerrado sigue en pie: esto no lo tocó. */
  if to_regprocedure('public.traspaso_dia_abierto(date, timestamptz)') is null then
    raise exception 'Se perdió traspaso_dia_abierto: el candado del día cerrado tiene que seguir';
  end if;

  /* Las dos columnas nuevas de la vista. */
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_traspasos_viajes'
                    and column_name = 'adelantado') then
    raise exception 'Falta la columna adelantado en v_traspasos_viajes';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'v_traspasos_viajes'
                    and column_name = 'dias_adelante') then
    raise exception 'Falta la columna dias_adelante en v_traspasos_viajes';
  end if;

  /* Y QUE LA PORTADA SEPA PREGUNTAR POR UNA COLUMNA. Se comprueba con
     una que existe y con una que no: una forma nueva que siempre
     dijera «sí» sería peor que no tenerla.

     HAY QUE PRESTARLE UN ADMINISTRADOR. `admin_existe` empieza
     rechazando a quien no manda, y aquí no hay nadie entrando: la
     migración la corre el editor de Supabase, sin sesión. Se toma
     cualquier administrador activo, se pone su id en la sesión con
     `set_config(..., true)` —local, se deshace al terminar la
     transacción— y se pregunta. Si la base no tiene ninguno todavía,
     la comprobación se salta: es una base recién montada, no un
     error. */
  select id into v_admin from public.perfiles
   where rol = 'admin' and activo limit 1;

  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);

    if not (select existe from public.admin_existe(
              array['col:public.v_traspasos_viajes.adelantado'])) then
      raise exception 'admin_existe no reconoce col: para una columna que sí está';
    end if;
    if (select existe from public.admin_existe(
          array['col:public.v_traspasos_viajes.no_existe_esta'])) then
      raise exception 'admin_existe dice que sí a una columna que no existe';
    end if;
  end if;
end $$;

do $$ begin raise notice 'LISTO: se puede registrar hasta siete dias adelante, y queda marcado ADELANTADO.'; end $$;
commit;
