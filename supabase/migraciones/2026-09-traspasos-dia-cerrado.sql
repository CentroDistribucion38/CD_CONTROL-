-- =====================================================================
-- TRASPASOS · EL DÍA SE CIERRA
--
-- «Solo el super administrador puede editar o modificar algún registro
--  de días anteriores al de la fecha. Porque empiezan a manipular eso y
--  no puede ser así. Solo pueden anular y hacer otro dentro de la fecha
--  del día; después o antes, no.»
--
-- ---------------------------------------------------------------------
-- LO QUE CAMBIA
-- ---------------------------------------------------------------------
-- Hasta hoy, cualquiera con permiso podía registrar un viaje con fecha
-- de la semana pasada, o anular y rehacer uno de hace un mes. Quedaba
-- MARCADO —la vista trae `atrasado` y `dias_atras`— pero nada lo
-- impedía, y una marca que nadie mira no impide nada.
--
-- A partir de aquí, quien no administra la plataforma solo puede tocar
-- viajes del DÍA OPERATIVO ABIERTO. Lo de antes queda cerrado: ni
-- registrar con fecha vieja, ni anular, ni corregir.
--
-- Quien administra —`manda()`— no tiene tope, ni hacia atrás ni para
-- corregir. Es literalmente lo que se pidió.
--
-- ---------------------------------------------------------------------
-- QUÉ ES «EL DÍA OPERATIVO ABIERTO», Y POR QUÉ NO ES `fecha = hoy`
-- ---------------------------------------------------------------------
-- ESTO ES LO ÚNICO DELICADO DE TODO EL ARCHIVO.
--
-- El turno C entra a las 22:00 y sale a las 6:00 de la mañana
-- SIGUIENTE, y digita buena parte de sus viajes ya pasada la
-- medianoche. Para el reloj es otro día; para la bodega es el mismo
-- turno. Con la regla escrita como `fecha = hoy`, a las 00:01 el turno
-- C perdería de golpe todo lo que lleva de noche: no podría corregir un
-- documento mal tecleado a las 23:50, ni anular un viaje que no salió.
-- Le partiría el turno en dos, todas las noches.
--
-- Eso ya se había pensado al escribir 2026-09-traspasos-registro-atrasado.sql,
-- y por eso aquel archivo dejó el día pasado abierto para todos. Hoy se
-- cierra —porque se está manipulando— pero se cierra por el DÍA
-- OPERATIVO, no por el calendario:
--
--   El día operativo de una fecha D termina cuando termina el turno C
--   de D, es decir a las 06:00 de D+1.
--
-- De ahí sale una sola expresión, sin números inventados ni «horas de
-- gracia» a ojo:
--
--   abierto(D)  ⇔  ahora < arranque_turno(D, 'C') + 8 horas
--
--   · Viaje de HOY, cualquier turno → el tope es mañana a las 06:00:
--     abierto todo el día. El turno B puede arreglar el error del turno
--     A sin llamar a nadie, que es lo que se escogió.
--   · Viaje de AYER → el tope es hoy a las 06:00: abierto solo mientras
--     el turno C sigue digitando. A las 06:01 se cerró.
--   · Más viejo → cerrado.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UN DISPARADOR Y NO UN `if` EN CADA FUNCIÓN
-- ---------------------------------------------------------------------
-- Son TRES puertas —registrar, editar y anular— y mañana puede haber
-- una cuarta. Metiendo el `if` en cada una habría que reescribir
-- `traspaso_registrar` y `traspaso_editar_viaje` enteras, que son largas
-- y donde ya se me han perdido cosas al reescribirlas de memoria; y la
-- puerta nueva de dentro de seis meses nacería sin candado y nadie se
-- daría cuenta.
--
-- El disparador vive en la TABLA: vale para todo lo que escriba en ella,
-- hoy y mañana, venga de donde venga.
--
-- ---------------------------------------------------------------------
-- LO QUE NO SE TOCA
-- ---------------------------------------------------------------------
-- · LOS VIAJES QUE YA ESTÁN. No se anula nada, no se borra nada y no se
--   cambia ni una fila: esto solo decide lo que se puede hacer de aquí
--   en adelante.
-- · EL PLAN. Planear es otra cosa —es hacia adelante— y tiene sus
--   propias reglas. Este candado es solo para los viajes registrados.
-- · QUIÉN PUEDE ANULAR. Sigue siendo quien lo registró o un
--   administrador, como antes. Esto agrega el CUÁNDO, no cambia el
--   QUIÉN.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA EN UN SOLO BLOQUE
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción: un `begin;` arriba no lo agrupa como uno espera. Un
-- bloque anónimo es UNA sentencia: o pasa entero o no pasa nada.
--
-- Y por eso el delimitador del bloque no se escribe en ningún comentario
-- de este archivo: el editor cuenta esos signos para saber dónde acaba
-- cada sentencia, y uno suelto en un comentario parte el bloque por la
-- mitad.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-registro-atrasado.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ¿ESTÁ ABIERTO EL DÍA DE ESTA FECHA?
--
-- Una sola función, para que la pantalla y la base contesten LO MISMO.
-- Si la pantalla tuviera su propia cuenta, bastaría con que una redondee
-- distinto para que el botón se vea habilitado y el guardado reviente.
-- ---------------------------------------------------------------------
/* EL RELOJ ES UN PARÁMETRO, con `now()` por defecto.

   No es un adorno para pruebas: es lo único que permite comprobar la
   parte delicada. Escrita con `now()` por dentro, la regla del turno C
   —que el día cierra a las 06:00 del día siguiente y no a la
   medianoche— solo se puede comprobar corriendo el arnés a las tres de
   la mañana. Lo escribí así primero, y el arnés medía la fórmula copiada
   a mano en vez de la función: romper la función lo dejaba verde.

   Con el reloj afuera, la prueba pone las 00:01, las 03:00 y las 07:00 y
   pregunta a LA FUNCIÓN. Quien la llama de verdad no pasa nada y se
   queda con `now()`. */
create or replace function public.traspaso_dia_abierto(
  p_fecha date,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
as $$
  select p_fecha is not null
     and p_ahora < public.traspaso_arranque_turno(p_fecha, 'C') + interval '8 hours'
$$;

comment on function public.traspaso_dia_abierto(date, timestamptz) is
  'Si el día operativo de esa fecha sigue abierto. Termina cuando termina el turno C —06:00 del día siguiente—, no a la medianoche: el turno C digita pasada la medianoche y con el corte en el calendario perdería media noche de trabajo.';

grant execute on function public.traspaso_dia_abierto(date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL CANDADO
-- ---------------------------------------------------------------------
create or replace function public.traspaso_candado_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_cuando text;
begin
  -- QUIEN ADMINISTRA NO TIENE TOPE. Es lo que se pidió, y además es la
  -- única forma de poder arreglar un error de la semana pasada: si el
  -- candado fuera para todos, un viaje mal registrado quedaría mal para
  -- siempre y la única salida sería tocar la tabla a mano.
  if public.manda() then return coalesce(new, old); end if;

  -- LA FECHA QUE MANDA ES LA MÁS VIEJA DE LAS DOS.
  -- En un UPDATE hay dos: la que tenía la fila y la que va a quedar.
  -- Mirando solo la nueva, mover un viaje de hace un mes a la fecha de
  -- hoy pasaría el candado —y eso es exactamente la manipulación que se
  -- viene a impedir—. Mirando solo la vieja, se podría empujar un viaje
  -- de hoy hacia atrás y dejarlo cerrado con datos cambiados.
  v_fecha := least(coalesce(new.fecha, old.fecha), coalesce(old.fecha, new.fecha));

  if public.traspaso_dia_abierto(v_fecha) then
    return new;
  end if;

  v_cuando := to_char(v_fecha, 'DD/MM/YYYY');
  if tg_op = 'INSERT' then
    raise exception 'El día % ya está cerrado: no se pueden registrar viajes de días anteriores. Si de verdad falta ese viaje, lo registra un administrador.', v_cuando;
  else
    raise exception 'El viaje del % ya no se puede tocar: ese día está cerrado. Dentro del día se anula y se vuelve a registrar; después, lo corrige un administrador.', v_cuando;
  end if;
end $$;

do $$
begin
  if to_regclass('public.traspasos_viajes') is null then
    raise exception 'Falta supabase/modulos/traspasos.sql. Ese va primero.';
  end if;
  if to_regprocedure('public.traspaso_arranque_turno(date, text)') is null then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-registro-atrasado.sql. Ese va primero.';
  end if;

  drop trigger if exists traspasos_viajes_candado_dia on public.traspasos_viajes;
  create trigger traspasos_viajes_candado_dia
    before insert or update on public.traspasos_viajes
    for each row execute function public.traspaso_candado_dia();

  -- -------------------------------------------------------------------
  -- 3. QUEDÓ ASÍ
  -- -------------------------------------------------------------------
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.traspasos_viajes'::regclass
                    and tgname = 'traspasos_viajes_candado_dia'
                    and not tgisinternal) then
    raise exception 'El candado no quedó puesto.';
  end if;

  -- Y QUE LA CUENTA DEL DÍA ABIERTO SEA LA QUE SE ESCRIBIÓ. Tres casos,
  -- comprobados contra la función y no contra lo que dice el comentario.
  if not public.traspaso_dia_abierto(public.traspaso_hoy()) then
    raise exception 'El día de hoy sale cerrado. La cuenta del día operativo está mal.';
  end if;
  if public.traspaso_dia_abierto(public.traspaso_hoy() - 7) then
    raise exception 'Un día de hace una semana sale abierto. La cuenta del día operativo está mal.';
  end if;

  raise notice 'Listo. Los viajes de días cerrados solo los toca quien administra.';
  raise notice 'El día de una fecha se cierra cuando termina su turno C —06:00 del día siguiente—, no a la medianoche: el turno C digita pasada la medianoche.';
  raise notice 'Dentro del día abierto todo sigue igual: se anula y se vuelve a registrar, sea el turno que sea.';
end $$;
