\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL DÍA SE CIERRA
--
-- QUÉ ESTABA ABIERTO DE VERDAD, que no era lo que yo creía.
-- «Corregir» un viaje registrado YA era solo del administrador desde
-- 2026-09-traspasos-editar-viaje.sql: al supervisor le contesta «anúlalo
-- y vuelve a registrarlo». Lo que no tenía candado era lo otro dos:
--
--   · REGISTRAR con fecha de días atrás. Cualquiera podía meter un
--     viaje de la semana pasada. Quedaba marcado —`atrasado`— y nada
--     más; una marca que nadie mira no impide nada.
--   · ANULAR un viaje viejo. Quien lo registró podía anularlo un mes
--     después, y con eso desaparece del plan cumplido sin dejar más
--     rastro que un motivo escrito por él mismo.
--
-- Anular y volver a registrar es justamente la pareja con la que se
-- manipula: se anula lo de la semana pasada y se vuelve a meter con
-- otros números. Por eso las dos puertas se cierran juntas, y por eso
-- el candado vive en la TABLA y no en una función.
--
-- Lo que se comprueba:
--   · que DENTRO del día siga funcionando todo —registrar, anular,
--     volver a registrar— porque si el candado estorba el trabajo de
--     cada día, lo primero que pasa es que alguien pide quitarlo,
--   · que un turno pueda arreglar lo del otro turno del mismo día,
--   · que un día viejo quede cerrado para registrar y para anular,
--   · que no se pueda arrastrar un viaje viejo a la fecha de hoy,
--   · que quien administra no tenga tope,
--   · y que el turno C de AYER siga abierto antes de las 06:00.
-- =====================================================================

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_falla text := ''; v_id uuid; v_hoy date := public.traspaso_hoy();
begin
  /* 1. DENTRO DEL DÍA SE REGISTRA. */
  begin
    select r.id into v_id from public.traspaso_registrar(
      v_hoy, 'A','pet','HOY001','ag01','planta',1,
      false, null, null, null, '1000000001') r;
  exception when others then
    v_falla := v_falla || ' 1(no deja registrar un viaje de hoy: ' || sqlerrm || ')';
  end;

  /* 2. Y SE ANULA. Es el camino que se pidió dejar abierto: dentro del
        día se anula y se vuelve a hacer. */
  begin
    perform public.traspaso_anular_viaje(v_id, 'se anula en la prueba');
  exception when others then
    v_falla := v_falla || ' 2(no deja anular un viaje de hoy: ' || sqlerrm || ')';
  end;

  /* 3. Y SE VUELVE A REGISTRAR CON EL MISMO DOCUMENTO.
        Es la pareja entera —anular y rehacer— y tiene que funcionar
        completa: el índice único solo cubre lo registrado, así que
        anular libera el documento. Si esto falla, el candado dejó al
        turno sin forma de arreglar su propio error. */
  begin
    perform public.traspaso_registrar(
      v_hoy, 'A','pet','HOY001','ag01','planta',1,
      false, null, null, null, '1000000001');
  exception when others then
    v_falla := v_falla || ' 3(no deja rehacer el viaje con el mismo documento: ' || sqlerrm || ')';
  end;

  /* 4. UN TURNO ARREGLA LO DEL OTRO, EL MISMO DÍA.
        Es lo que se escogió sobre cerrarlo también por turno: el turno B
        que encuentra un error del turno A lo anula y lo rehace sin
        llamar a nadie. */
  begin
    select r.id into v_id from public.traspaso_registrar(
      v_hoy, 'A','pet','TURN01','ag01','planta',1,
      false, null, null, null, '1000000010') r;
    perform public.traspaso_anular_viaje(v_id, 'error del turno A');
    perform public.traspaso_registrar(
      v_hoy, 'B','pet','TURN01','ag01','planta',1,
      false, null, null, null, '1000000010');
  exception when others then
    v_falla := v_falla || ' 4(un turno no puede arreglar lo del otro del mismo dia: ' || sqlerrm || ')';
  end;

  /* 5. UN DÍA VIEJO NO SE REGISTRA. */
  begin
    perform public.traspaso_registrar(
      v_hoy - 9, 'A','pet','VJO001','ag01','planta',1,
      false, null, null, null, '1000000020');
    v_falla := v_falla || ' 5(dejo registrar un viaje de hace nueve dias)';
  exception when others then
    if sqlerrm not like '%ya está cerrado%' then
      v_falla := v_falla || ' 5b(lo rechazo, pero no por el candado: ' || sqlerrm || ')'; end if;
  end;

  /* 6. UN VIAJE VIEJO NO SE ANULA.
        El de la siembra: registrado hace nueve días, antes del candado.
        ES LA MITAD QUE IMPORTA. Anular es lo que sí podía hacer
        cualquiera, y anular lo viejo es como se le quita un viaje al
        cumplido de un día que ya se reportó. */
  select id into v_id from public.traspasos_viajes where documento_clave = '9000000001';
  if v_id is null then
    v_falla := v_falla || ' 6(no esta el viaje viejo de la siembra: la prueba no mide nada)';
  else
    begin
      perform public.traspaso_anular_viaje(v_id, 'manipulando');
      v_falla := v_falla || ' 6(dejo anular un viaje de hace nueve dias)';
    exception when others then
      if sqlerrm not like '%ya no se puede tocar%' then
        v_falla := v_falla || ' 6b(lo rechazo, pero no por el candado: ' || sqlerrm || ')'; end if;
    end;
  end if;

  /* 7. Y CORREGIR SIGUE SIENDO DEL ADMINISTRADOR, como antes. Este
        candado agrega el CUÁNDO; no cambia el QUIÉN, y comprobarlo aquí
        es lo que impide que un día alguien «simplifique» las dos reglas
        en una y abra la que no era. */
  begin
    perform public.traspaso_editar_viaje(
      v_id, v_hoy, 'A','pet','VIE001','ag01','planta',1,
      false, null, null, null, 'manipulando', '9000000001');
    v_falla := v_falla || ' 7(un supervisor pudo corregir un viaje registrado)';
  exception when others then
    if sqlerrm not like '%solo del administrador%' and sqlerrm not like '%ya no se puede tocar%' then
      v_falla := v_falla || ' 7b(lo rechazo, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'CANDADO:%', v_falla; end if;
  raise notice 'CANDADO ok';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- EL CANDADO ESTÁ EN LA TABLA, NO EN LAS FUNCIONES DE HOY
--
-- Es la razón de escribirlo como disparador: vale para CUALQUIER cosa
-- que escriba en esa tabla, no solo para las tres puertas de hoy. Se
-- comprueba escribiendo DIRECTO, saltándose las funciones — que es
-- exactamente lo que haría una pantalla nueva escrita dentro de seis
-- meses sin acordarse de esta regla.
--
-- Y DE PASO SE PRUEBA EL `least()`: mover un viaje viejo a la fecha de
-- hoy. Mirando solo la fecha nueva, esa actualización pasaría el
-- candado y dejaría el viaje abierto con los datos ya cambiados. Es la
-- manipulación más obvia de todas y no se puede probar por las
-- funciones, porque corregir ya es del administrador.
-- ---------------------------------------------------------------------
do $$
declare
  v_falla text := ''; v_id uuid; v_hoy date := public.traspaso_hoy();
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select id into v_id from public.traspasos_viajes where documento_clave = '9000000001';

  begin
    update public.traspasos_viajes set nota = 'escrito directo' where id = v_id;
    v_falla := v_falla || ' 8(se pudo escribir directo en un viaje de dia cerrado)';
  exception when others then
    if sqlerrm not like '%ya no se puede tocar%' then
      v_falla := v_falla || ' 8b(lo rechazo, pero no por el candado: ' || sqlerrm || ')'; end if;
  end;

  begin
    update public.traspasos_viajes set fecha = v_hoy where id = v_id;
    v_falla := v_falla || ' 9(se pudo arrastrar un viaje viejo a la fecha de hoy)';
  exception when others then
    if sqlerrm not like '%ya no se puede tocar%' then
      v_falla := v_falla || ' 9b(lo rechazo, pero no por el candado: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'DIRECTO:%', v_falla; end if;
  raise notice 'DIRECTO ok';
end $$;

-- ---------------------------------------------------------------------
-- QUIEN ADMINISTRA NO TIENE TOPE
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_falla text := ''; v_id uuid;
begin
  begin
    perform public.traspaso_registrar(
      public.traspaso_hoy() - 20, 'A','pet','ADM001','ag01','planta',1,
      false, null, null, null, '2000000001');
  exception when others then
    v_falla := v_falla || ' 10(el administrador no pudo registrar hacia atras: ' || sqlerrm || ')';
  end;

  select id into v_id from public.traspasos_viajes where documento_clave = '9000000001';
  begin
    perform public.traspaso_editar_viaje(
      v_id, public.traspaso_hoy() - 9, 'A','pet','VIE001','ag01','planta',1,
      false, null, null, null, 'el administrador sí puede', '9000000001');
  exception when others then
    v_falla := v_falla || ' 11(el administrador no pudo corregir un viaje viejo: ' || sqlerrm || ')';
  end;

  begin
    perform public.traspaso_anular_viaje(v_id, 'el administrador sí puede');
  exception when others then
    v_falla := v_falla || ' 12(el administrador no pudo anular un viaje viejo: ' || sqlerrm || ')';
  end;

  if v_falla <> '' then raise exception 'ADMIN:%', v_falla; end if;
  raise notice 'ADMIN ok';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- EL TURNO C DE AYER, QUE ES LO DELICADO
--
-- No se mide con el reloj de la máquina —que sería una prueba que pasa
-- o falla según la hora a la que se corra, y esas son peores que
-- ninguna—: se mide la FÓRMULA, que es lo que decide.
--
-- El día de una fecha D se cierra a las 06:00 de D+1. Así que:
--   · a las 03:00 de D+1, el día D sigue abierto,
--   · a las 07:00 de D+1, ya no.
-- ---------------------------------------------------------------------
do $$
declare
  v_falla text := ''; v_d date := date '2026-09-17';
  reloj timestamptz;
begin
  /* SE LE PREGUNTA A LA FUNCIÓN, no a la fórmula copiada aquí.
     La escribí copiando la cuenta —`arranque + 8 horas`— y esta prueba
     no medía nada: romper `traspaso_dia_abierto` la dejaba verde,
     porque estaba comprobando mi propia copia contra sí misma. Lo cazó
     la mutación. Por eso la función recibe el reloj. */

  /* A las 00:01 del 18, el turno C del 17 lleva dos horas digitando. Es
     EL caso: con el corte en la medianoche pierde de golpe la noche. */
  reloj := timestamp '2026-09-18 00:01' at time zone 'America/Bogota';
  if not public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 13(la medianoche cierra el dia: el turno C se parte en dos todas las noches)'; end if;

  /* A las 03:00 sigue abierto. */
  reloj := timestamp '2026-09-18 03:00' at time zone 'America/Bogota';
  if not public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 14(a las 03:00 del 18 el dia 17 ya sale cerrado)'; end if;

  /* A las 05:59, todavía. Es el último minuto del turno C. */
  reloj := timestamp '2026-09-18 05:59' at time zone 'America/Bogota';
  if not public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 15(a las 05:59 del 18 el dia 17 ya sale cerrado)'; end if;

  /* A las 06:00 se cerró: el turno C terminó. */
  reloj := timestamp '2026-09-18 06:00' at time zone 'America/Bogota';
  if public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 16(a las 06:00 del 18 el dia 17 sigue abierto)'; end if;

  /* Y a las 07:00, menos. */
  reloj := timestamp '2026-09-18 07:00' at time zone 'America/Bogota';
  if public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 17(a las 07:00 del 18 el dia 17 sigue abierto)'; end if;

  /* Y EL PROPIO DÍA, A CUALQUIER HORA. Si el 17 a las 23:00 saliera
     cerrado, el turno C no podría ni registrar lo suyo. */
  reloj := timestamp '2026-09-17 23:00' at time zone 'America/Bogota';
  if not public.traspaso_dia_abierto(v_d, reloj) then
    v_falla := v_falla || ' 18(el 17 a las 23:00 sale cerrado: el turno C no podria ni registrar)'; end if;

  if v_falla <> '' then raise exception 'TURNOC:%', v_falla; end if;
  raise notice 'TURNO C ok';
end $$;

do $$ begin raise notice 'EL DÍA SE CIERRA: todo en orden'; end $$;
