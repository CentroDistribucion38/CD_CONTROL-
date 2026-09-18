\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL CORTE DE SAP, MOVIMIENTO POR MOVIMIENTO
--
-- LO QUE SE COMPRUEBA NO ES «¿se guardaron los movimientos?» sino lo
-- que de verdad decide:
--
--   · QUE UN DOCUMENTO PARTIDO ENTRE DOS IMPORTACIONES SE SUME. Es el
--     error entero: antes la segunda importación reemplazaba a la
--     primera y el documento quedaba con el signo equivocado, sin dar
--     error y para siempre.
--
--   · QUE REIMPORTAR NO DUPLIQUE, ni el mismo archivo ni un rango que
--     se solape. Si duplicara, el arreglo sería peor que el problema:
--     todos los netos quedarían al doble.
--
--   · QUE UN ARCHIVO QUE NO TOCA UN DÍA NO LO BORRE. Cada importación
--     reemplaza los días que TRAE; si borrara de más, importar el 18
--     dejaría el 17 en blanco y el tablero de ayer se vaciaría solo.
--
--   · QUE DOS MOVIMIENTOS IDÉNTICOS SEAN DOS. El Excel no trae llave de
--     fila; si se dedujera una de sus columnas, dos salidas iguales del
--     mismo documento se colapsarían en una y el documento dejaría de
--     dar cero.
--
--   · QUE UN ARCHIVO EQUIVOCADO NO BORRE NADA. Se borra por día antes
--     de meter: un archivo que no es el corte tiene que reventar ANTES,
--     no dejar el día vacío.
--
--   · Y QUE EL CRUCE SIGA DICIENDO LO MISMO: falta, sobra, cuadra.
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  v_falla text := '';
  v_n int; v_neto int; v_mov int; v_cuenta boolean;
  r record;
begin
  /* ---------------------------------------------------------------
     EL LUNES SE IMPORTA EL 17. El documento sale: -36.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"23:50:00","cantidad":"-36","descripcion":"POKER 330"},
    {"referencia":"7687019500","fecha":"2026-09-17","hora":"10:00:00","cantidad":"-28","descripcion":"AGUILA 330"}
  ]'::jsonb);

  select neto, movimientos, cuenta into v_neto, v_mov, v_cuenta
    from public.v_traspasos_sap where referencia = '7687019429';
  if coalesce(v_neto, 0) <> -36 or coalesce(v_mov, 0) <> 1 or not coalesce(v_cuenta, false) then
    v_falla := v_falla || ' 0(el lunes no quedó como debía: neto ' || coalesce(v_neto, 0)
                       || ', movimientos ' || coalesce(v_mov, 0) || ')';
  end if;

  /* ---------------------------------------------------------------
     1 · EL MARTES SE IMPORTA EL 18, y ahí viene la anulación.

     ESTE ES EL CASO QUE ORIGINÓ TODO. Turno C cruza la medianoche:
     anulan a las 23:50 y rehacen a las 00:10, y eso cae en dos cortes
     distintos. Antes, el archivo del 18 REEMPLAZABA al documento
     entero y quedaba en +36 — contado como que salió, cuando lo que
     pasó fue que se anuló.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019429","fecha":"2026-09-18","hora":"00:10:00","cantidad":"36","descripcion":"POKER 330"}
  ]'::jsonb);

  select neto, movimientos, cuenta into v_neto, v_mov, v_cuenta
    from public.v_traspasos_sap where referencia = '7687019429';
  if coalesce(v_mov, 0) <> 2 then
    v_falla := v_falla || ' 1(el documento quedó con ' || coalesce(v_mov, 0)
                       || ' movimientos y son 2: el del 17 y el del 18)'; end if;
  if coalesce(v_neto, -99) <> 0 then
    v_falla := v_falla || ' 1b(el neto dio ' || coalesce(v_neto, -99)
                       || ' y tiene que dar 0: -36 el 17 y +36 el 18)'; end if;
  if coalesce(v_cuenta, true) then
    v_falla := v_falla || ' 1c(se anuló y quedó en cero, y sigue contando como documento)'; end if;

  /* UNA SOLA FILA POR DOCUMENTO, y se revienta AQUÍ, no al final. Si
     el agrupado se partiera por día, todo lo que viene después mediría
     otra cosa —y las subconsultas de más abajo revientan con un error
     de Postgres que no menciona el agrupado por ningún lado. */
  if (select count(*) from public.v_traspasos_sap where referencia = '7687019429') <> 1 then
    raise exception 'MOVIMIENTOS: 1e(el documento salió en varios renglones: el agrupado se partió por día)';
  end if;

  /* Y NO APARECE EN EL CRUCE, que es lo que se ve en pantalla. */
  if exists (select 1 from public.v_traspasos_cruce
              where documento = '7687019429' and estado = 'falta') then
    v_falla := v_falla || ' 1d(un documento anulado sigue saliendo como que falta)'; end if;

  /* ---------------------------------------------------------------
     2 · EL QUE SE ANULÓ Y SE REHIZO CUENTA UNA VEZ.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019600","fecha":"2026-09-19","hora":"23:55:00","cantidad":"-36"}
  ]'::jsonb);
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019600","fecha":"2026-09-20","hora":"00:05:00","cantidad":"36"},
    {"referencia":"7687019600","fecha":"2026-09-20","hora":"00:20:00","cantidad":"-28"}
  ]'::jsonb);

  select neto, movimientos, cuenta into v_neto, v_mov, v_cuenta
    from public.v_traspasos_sap where referencia = '7687019600';
  if coalesce(v_mov, 0) <> 3 then
    v_falla := v_falla || ' 2(quedó con ' || coalesce(v_mov, 0) || ' movimientos y son 3)'; end if;
  if coalesce(v_neto, 0) <> -28 then
    v_falla := v_falla || ' 2b(el neto dio ' || coalesce(v_neto, 0) || ' y son -28)'; end if;
  if not coalesce(v_cuenta, false) then
    v_falla := v_falla || ' 2c(se rehízo y no cuenta)'; end if;
  /* Y LA FECHA ES LA DEL PRIMER MOVIMIENTO, no la del último: el
     documento existió el 19, aunque lo arreglaran el 20. Con la del
     último se movería de día y dejaría de cuadrar con su turno. */
  /* `is distinct from` Y NO `<>`. Si la subconsulta no devuelve fila,
     `null <> algo` es NULL y el `if` NO entra: la comprobación se salta
     sola justo en el caso que tiene que cazar. */
  if (select fecha from public.v_traspasos_sap where referencia = '7687019600')
       is distinct from date '2026-09-19' then
    v_falla := v_falla || ' 2d(el documento se movió al día en que lo arreglaron)'; end if;

  /* ---------------------------------------------------------------
     3 · REIMPORTAR EL MISMO ARCHIVO NO DUPLICA.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"23:50:00","cantidad":"-36"},
    {"referencia":"7687019500","fecha":"2026-09-17","hora":"10:00:00","cantidad":"-28"}
  ]'::jsonb);

  select count(*) into v_n from public.traspasos_sap_mov where fecha = date '2026-09-17';
  if v_n <> 2 then
    v_falla := v_falla || ' 3(el 17 quedó con ' || v_n || ' movimientos y son 2: se duplicó al reimportar)'; end if;
  select neto into v_neto from public.v_traspasos_sap where referencia = '7687019500';
  if coalesce(v_neto, 0) <> -28 then
    v_falla := v_falla || ' 3b(el neto se dobló al reimportar: ' || coalesce(v_neto, 0) || ')'; end if;

  /* ---------------------------------------------------------------
     4 · UN RANGO QUE SE SOLAPA TAMPOCO DUPLICA — y es lo que va a
         pasar de verdad: «ayer se me olvidó, importo del 15 al 18».
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"23:50:00","cantidad":"-36"},
    {"referencia":"7687019500","fecha":"2026-09-17","hora":"10:00:00","cantidad":"-28"},
    {"referencia":"7687019429","fecha":"2026-09-18","hora":"00:10:00","cantidad":"36"},
    {"referencia":"7687-019700","fecha":"2026-09-16","hora":"08:00:00","cantidad":"-28"}
  ]'::jsonb);

  select count(*) into v_n from public.traspasos_sap_mov
   where fecha between date '2026-09-16' and date '2026-09-18';
  if v_n <> 4 then
    v_falla := v_falla || ' 4(del 16 al 18 quedaron ' || v_n || ' movimientos y son 4)'; end if;
  select neto into v_neto from public.v_traspasos_sap where referencia = '7687019429';
  if coalesce(v_neto, -99) <> 0 then
    v_falla := v_falla || ' 4b(el documento partido dejó de dar cero al reimportar solapado: '
                       || coalesce(v_neto, -99) || ')'; end if;

  /* ---------------------------------------------------------------
     5 · UN ARCHIVO QUE NO TOCA UN DÍA NO LO BORRA.
         Se reemplazan los días que TRAE el archivo. Si borrara de más,
         importar el 21 dejaría el 19 en blanco y el tablero de ese día
         se vaciaría solo.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019900","fecha":"2026-09-21","hora":"09:00:00","cantidad":"-28"}
  ]'::jsonb);

  select count(*) into v_n from public.traspasos_sap_mov where fecha = date '2026-09-19';
  if v_n <> 1 then
    v_falla := v_falla || ' 5(importar el 21 se llevó por delante el 19)'; end if;
  select count(*) into v_n from public.traspasos_sap_mov where fecha = date '2026-09-16';
  if v_n <> 1 then
    v_falla := v_falla || ' 5b(importar el 21 se llevó por delante el 16)'; end if;

  /* ---------------------------------------------------------------
     6 · DOS MOVIMIENTOS IDÉNTICOS SON DOS.
         El Excel no trae identificador de fila. Si se dedujera una
         llave de sus columnas, dos salidas iguales del mismo documento
         se colapsarían en una: el documento daría -28 en vez de -56 y
         nadie lo notaría.
     --------------------------------------------------------------- */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687020000","fecha":"2026-09-22","hora":"07:00:00","cantidad":"-28"},
    {"referencia":"7687020000","fecha":"2026-09-22","hora":"07:00:00","cantidad":"-28"}
  ]'::jsonb);

  select neto, movimientos into v_neto, v_mov
    from public.v_traspasos_sap where referencia = '7687020000';
  if coalesce(v_mov, 0) <> 2 or coalesce(v_neto, 0) <> -56 then
    v_falla := v_falla || ' 6(dos movimientos idénticos quedaron en ' || coalesce(v_mov, 0)
                       || ' con neto ' || coalesce(v_neto, 0) || ', y son 2 con -56)'; end if;

  /* ---------------------------------------------------------------
     7 · UN ARCHIVO EQUIVOCADO NO BORRA NADA.
         Se borra por día ANTES de meter. Un archivo que no es el corte
         —la hoja de al lado, una portada— tiene que reventar antes de
         tocar la tabla; si no, deja el día vacío y parece que ese día
         no salió nada.
     --------------------------------------------------------------- */
  select count(*) into v_n from public.traspasos_sap_mov;
  begin
    perform public.traspaso_sap_importar('[{"cosa":"otra"},{"cosa":"mas"}]'::jsonb);
    v_falla := v_falla || ' 7(tragó un archivo que no es el corte)';
  exception when others then
    if sqlerrm not like '%referencia y fecha%' then
      v_falla := v_falla || ' 7b(lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  /* EL NÚMERO NO SE ESCRIBE A MANO: se cuenta antes. Escrito a mano,
     esta comprobación se cae —o peor, pasa— en cuanto la base de la
     prueba trae un movimiento más, y entonces mide otra cosa. */
  if (select count(*) from public.traspasos_sap_mov) <> v_n then
    v_falla := v_falla || ' 7c(el archivo equivocado borró movimientos: quedaban ' || v_n
                       || ' y ahora hay ' || (select count(*) from public.traspasos_sap_mov) || ')'; end if;

  /* ---------------------------------------------------------------
     8 · LO QUE DEVUELVE LA FUNCIÓN. La pantalla lo muestra, así que
         tiene que ser verdad. `reemplazados` mayor que `guardados` es
         lo único que delata un corte FILTRADO —un solo material— que
         dejaría el día a medias.
     --------------------------------------------------------------- */
  select * into r from public.traspaso_sap_importar('[
    {"referencia":"7687020000","fecha":"2026-09-22","hora":"07:00:00","cantidad":"-28"}
  ]'::jsonb);

  if r.movimientos_guardados <> 1 then
    v_falla := v_falla || ' 8(dijo que guardó ' || r.movimientos_guardados || ' y era 1)'; end if;
  if r.reemplazados <> 2 then
    v_falla := v_falla || ' 8b(dijo que reemplazó ' || r.reemplazados
                       || ' y eran 2: sin ese número, un corte filtrado pasa sin que nadie lo vea)'; end if;
  if r.dias <> 1 then
    v_falla := v_falla || ' 8c(dijo ' || r.dias || ' días y era 1)'; end if;
  if r.desde <> date '2026-09-22' or r.hasta <> date '2026-09-22' then
    v_falla := v_falla || ' 8d(el rango que devuelve no es el del archivo)'; end if;

  /* ---------------------------------------------------------------
     9 · EL CRUCE SIGUE DICIENDO LO MISMO.
     --------------------------------------------------------------- */
  perform public.traspaso_registrar(date '2026-09-17', 'A', 'pet', 'AAA111', 'ag01', 'planta', 1,
    false, 28, null, null, '7687019500');
  /* UN DEDAZO: se tecleó un número que SAP no tiene. */
  perform public.traspaso_registrar(date '2026-09-17', 'A', 'pet', 'BBB222', 'ag01', 'planta', 1,
    false, 28, null, null, '7687019501');
  /* EL GUION LO TRAE SAP —arriba, en el archivo— y el viaje va limpio.
     AL REVÉS NO PRUEBA NADA: `documento_clave` es una columna generada
     que normaliza sola, así que un guion del lado del viaje se limpia
     aunque la función de importar hubiera dejado de normalizar. Este
     proyecto ya pagó ese error una vez, en esta misma prueba. */
  perform public.traspaso_registrar(date '2026-09-16', 'A', 'pet', 'CCC333', 'ag01', 'planta', 1,
    false, 28, null, null, '7687019700');

  if (select estado from public.v_traspasos_cruce where documento = '7687019500')
       is distinct from 'cuadra' then
    v_falla := v_falla || ' 9(el documento registrado no cuadra)'; end if;
  if (select estado from public.v_traspasos_cruce where documento = '7687019501')
       is distinct from 'sobra' then
    v_falla := v_falla || ' 9b(el dedazo no sale como que sobra)'; end if;
  if (select estado from public.v_traspasos_cruce where documento = '7687019700')
       is distinct from 'cuadra' then
    v_falla := v_falla || ' 9c(el documento tecleado con guion no cruzó: se separaron las dos normalizaciones)'; end if;
  if (select estado from public.v_traspasos_cruce where documento = '7687019900')
       is distinct from 'falta' then
    v_falla := v_falla || ' 9d(un documento de SAP que nadie registró no sale como que falta)'; end if;

  if v_falla <> '' then raise exception 'MOVIMIENTOS:%', v_falla; end if;
  raise notice 'MOVIMIENTOS ok';
end $$;
reset role;

-- =====================================================================
-- Y QUE SOLO IMPORTE QUIEN EDITA. La función es `security definer`: sin
-- la comprobación de adentro, cualquiera con cuenta podría reescribir
-- el corte de la bodega entera.
-- =====================================================================
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
begin
  begin
    perform public.traspaso_sap_importar('[
      {"referencia":"7687099999","fecha":"2026-09-23","cantidad":"-28"}
    ]'::jsonb);
    raise exception 'PERMISO: un operador pudo importar el corte';
  exception when others then
    if sqlerrm like 'PERMISO:%' then raise;
    elsif sqlerrm not like '%supervisor o administrador%' then
      raise exception 'PERMISO: lo rechazó, pero no por el rol: %', sqlerrm;
    end if;
  end;
  raise notice 'PERMISO ok';
end $$;
reset role;

do $$ begin raise notice 'EL CORTE MOVIMIENTO POR MOVIMIENTO: todo en orden'; end $$;
