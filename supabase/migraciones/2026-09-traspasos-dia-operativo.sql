-- =====================================================================
-- TRASPASOS · EL DÍA OPERATIVO ARRANCA CON EL TURNO C, A LAS 22:00
-- ---------------------------------------------------------------------
-- «Toca revisar que el día 23/09 en la app empiece el 22/09 a las 22:00
-- con el turno C. No deja registrar hasta que cambie el día.»
--
-- QUÉ ESTABA MAL. La plataforma usaba el día del CALENDARIO: a las
-- 22:30 del 22, «hoy» era el 22, y el turno C que acababa de entrar
-- —que es el primer turno del 23— no podía registrar nada. La base lo
-- rechazaba con «todavía no ha pasado» y había que esperar a la
-- medianoche. Media noche de trabajo sin poder digitar.
--
-- LA REGLA, ESCRITA UNA VEZ:
--
--   El día 23 = turno C (22/09 22:00 → 06:00) + turno A (06:00 → 14:00)
--               + turno B (14:00 → 22:00 del 23).
--
--   O sea: EL TURNO C ABRE EL DÍA, no lo cierra. Antes era al revés y
--   por eso el orden de los turnos también cambia: C, A, B.
--
-- LO YA REGISTRADO NO SE TOCA —así se decidió—: cada viaje conserva la
-- fecha con la que se guardó. Queda una junta el día que se corra esto:
-- los turnos C de antes están en el día en que arrancaron. Cambiarlos
-- movería cifras de días ya cerrados y ya reportados.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. QUÉ DÍA ES HOY
--
-- Desde las 22:00, hoy es mañana: el turno que entra es el primero del
-- día siguiente. Es el único sitio donde se decide esto; todo lo demás
-- —registrar, el candado del día, el tablero— pregunta aquí.
-- ---------------------------------------------------------------------
/* EL RELOJ ES UN PARÁMETRO, con `now()` por defecto — como ya lo es en
   traspaso_dia_abierto, y por el mismo motivo: escrita con `now()` por
   dentro, la regla de las 22:00 solo se podría comprobar corriendo el
   arnés a las diez de la noche. Con el reloj afuera, la prueba pone las
   21:59 y las 22:00 y le pregunta A LA FUNCIÓN. Quien la llama de
   verdad no pasa nada y se queda con `now()`.

   ES UNA SOLA FUNCIÓN CON VALOR POR DEFECTO, no dos: dos firmas donde
   una no tiene argumentos dejarían a `traspaso_hoy()` sin saber a cuál
   ir. */
drop function if exists public.traspaso_hoy();

create or replace function public.traspaso_hoy(p_ahora timestamptz default now())
returns date
language sql
stable
as $$
  select case
    when (p_ahora at time zone 'America/Bogota')::time >= time '22:00'
      then ((p_ahora at time zone 'America/Bogota')::date + 1)
    else (p_ahora at time zone 'America/Bogota')::date
  end
$$;

comment on function public.traspaso_hoy(timestamptz) is
  'El día OPERATIVO, no el del calendario: desde las 22:00 ya es el día siguiente, porque a esa hora entra el turno C, que es el primero del día.';

grant execute on function public.traspaso_hoy(timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. A QUÉ HORA ARRANCA CADA TURNO
--
-- El turno C del día 23 arranca el 22 a las 22:00 — el día ANTERIOR—.
-- Los otros dos no se mueven. Esta función es la que le pone la hora a
-- un viaje que se registra en otro día, así que si el C se quedara en
-- «23 a las 22:00» los viajes de la noche quedarían con una hora que
-- no existió.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_arranque_turno(p_fecha date, p_turno text)
returns timestamptz
language sql
immutable
as $$
  select case upper(btrim(p_turno))
           when 'C' then ((p_fecha - 1) + time '22:00')
           when 'A' then (p_fecha + time '06:00')
           when 'B' then (p_fecha + time '14:00')
           else (p_fecha + time '06:00')
         end at time zone 'America/Bogota'
$$;

comment on function public.traspaso_arranque_turno(date, text) is
  'Cuándo arranca ese turno de ese día operativo. El C arranca a las 22:00 del día ANTERIOR: es el primer turno del día.';

grant execute on function public.traspaso_arranque_turno(date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. HASTA CUÁNDO SE PUEDE TOCAR UN DÍA
--
-- El día operativo termina cuando termina su turno B, a las 22:00. Pero
-- se deja abierto hasta las 06:00 del día siguiente —ocho horas más—
-- porque el turno C que entra a las 22:00 sigue cerrando lo del día que
-- acaba de terminar mientras arranca el suyo.
--
-- ES EXACTAMENTE EL MISMO INSTANTE DE RELOJ QUE ANTES: el día 23 se
-- cerraba el 24 a las 06:00 y se sigue cerrando el 24 a las 06:00. Lo
-- que cambió es de dónde sale esa hora, no cuál es. Nadie pierde tiempo
-- de digitación con este cambio.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_dia_abierto(
  p_fecha date,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
as $$
  select p_fecha is not null
     and p_ahora < public.traspaso_arranque_turno(p_fecha + 1, 'C') + interval '8 hours'
$$;

comment on function public.traspaso_dia_abierto(date, timestamptz) is
  'Si el día operativo de esa fecha sigue abierto. Termina a las 06:00 del día siguiente: el turno C que entra a las 22:00 todavía está cerrando lo del día que acaba.';

grant execute on function public.traspaso_dia_abierto(date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4. EL ORDEN DE LOS TURNOS
--
-- C, A, B. No es estética: de este orden salen los renglones del plan,
-- las columnas del control y los anillos del tablero. Si el C abre el
-- día y se sigue pintando de último, el tablero cuenta el día al revés.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_orden_turno(p_turno text)
returns smallint
language sql
immutable
as $$ select case upper(btrim(p_turno))
              when 'C' then 1 when 'A' then 2 when 'B' then 3
              else 9 end::smallint $$;

comment on function public.traspaso_orden_turno(text) is
  'En qué orden va el turno dentro del día operativo: C abre (22:00), después A (06:00) y después B (14:00).';

grant execute on function public.traspaso_orden_turno(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. COMPROBACIÓN, AQUÍ MISMO
--
-- Tres relojes que antes daban la respuesta equivocada. Si alguna falla,
-- la migración se deshace entera: es preferible eso a dejar la mitad
-- puesta y que nadie se entere.
-- ---------------------------------------------------------------------
do $$
declare
  v_c timestamptz;
begin
  /* El turno C del 23 arranca el 22 a las 22:00. */
  v_c := public.traspaso_arranque_turno(date '2026-09-23', 'C');
  if v_c <> (timestamp '2026-09-22 22:00' at time zone 'America/Bogota') then
    raise exception 'El turno C del 23 arranca en % y tiene que arrancar el 22 a las 22:00', v_c;
  end if;

  /* El día 23 sigue abierto a las 05:00 del 24 y cerrado a las 07:00. */
  if not public.traspaso_dia_abierto(date '2026-09-23',
       timestamp '2026-09-24 05:00' at time zone 'America/Bogota') then
    raise exception 'El día 23 tiene que seguir abierto a las 05:00 del 24';
  end if;
  if public.traspaso_dia_abierto(date '2026-09-23',
       timestamp '2026-09-24 07:00' at time zone 'America/Bogota') then
    raise exception 'El día 23 tiene que estar cerrado a las 07:00 del 24';
  end if;

  /* Y el orden: C abre. */
  if public.traspaso_orden_turno('C') >= public.traspaso_orden_turno('A') then
    raise exception 'El turno C tiene que ir antes que el A';
  end if;

  /* Las 21:59 son el 22; las 22:00 ya son el 23. Es el minuto exacto
     que estaba mal. */
  if public.traspaso_hoy(timestamp '2026-09-22 21:59' at time zone 'America/Bogota') <> date '2026-09-22' then
    raise exception 'A las 21:59 del 22 el día operativo tiene que seguir siendo el 22';
  end if;
  if public.traspaso_hoy(timestamp '2026-09-22 22:00' at time zone 'America/Bogota') <> date '2026-09-23' then
    raise exception 'A las 22:00 del 22 el día operativo tiene que ser el 23';
  end if;
end $$;

do $$ begin raise notice 'LISTO: el día operativo arranca a las 22:00 con el turno C.'; end $$;
commit;
