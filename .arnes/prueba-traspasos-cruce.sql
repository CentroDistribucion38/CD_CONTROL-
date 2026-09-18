\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL CRUCE CONTRA SAP
--
-- LOS DOS EJEMPLOS QUE SE DIERON, CON SUS NÚMEROS DE VERDAD, son las dos
-- primeras pruebas. Todo lo demás de este archivo existe para que esas
-- dos sigan siendo ciertas dentro de seis meses:
--
--   7687019429  -36 / +36 / -28  →  UN documento (neto -28)
--   7687019429  +36 / -36        →  NINGUNO (neto 0)
--
-- Y después, lo que puede salir mal alrededor:
--   · que «falta» sea de verdad lo que SAP tiene y nadie registró,
--   · que «sobra» cace el dedazo en el número del documento,
--   · que el cruce no se coma media bodega: encerrado en las fechas del
--     Excel, o todo viaje de otra semana saldría como «sobra»,
--   · que el guion no rompa el cruce —«7687-019429» es el mismo—,
--   · que un viaje ANULADO no cuente como registrado,
--   · que volver a importar el mismo archivo no duplique nada,
--   · y que un operador no pueda importar.
-- =====================================================================

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_falla text := ''; v_doc int; v_mov int; v_anu int;
  v_neto int; v_cnt boolean; v_n int; v_estado text;
begin
  -- -------------------------------------------------------------------
  -- 1. EL EJEMPLO DE LOS TRES MOVIMIENTOS: -36, +36, -28 → UN documento
  -- -------------------------------------------------------------------
  select r.documentos, r.movimientos_leidos, r.anulados into v_doc, v_mov, v_anu
    from public.traspaso_sap_importar('[
      {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:26","cantidad":"-36","material":"3500163","descripcion":"Estiba Cerv Madera","centro":"AG01","almacen":"AG18"},
      {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:36","cantidad":"36","material":"3500163","descripcion":"Estiba Cerv Madera","centro":"AG01","almacen":"AG18"},
      {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:58","cantidad":"-28","material":"3500163","descripcion":"Estiba Cerv Madera","centro":"AG01","almacen":"AG18"},
      {"referencia":"7687019657","fecha":"2026-09-17","hora":"00:40:03","cantidad":"-28","material":"3500163","descripcion":"Estiba Cerv Madera","centro":"AG01","almacen":"AG18"},
      {"referencia":"7687023377","fecha":"2026-09-17","hora":"02:08:52","cantidad":"-28","material":"3500163","descripcion":"Estiba Cerv Madera","centro":"AG01","almacen":"AG18"}
    ]'::jsonb) r;

  if v_doc <> 3 then
    v_falla := v_falla || ' 1(cinco movimientos dieron ' || v_doc || ' documentos y son 3)'; end if;
  if v_mov <> 5 then
    v_falla := v_falla || ' 1b(conto ' || v_mov || ' movimientos y son 5)'; end if;

  select neto, cuenta, movimientos into v_neto, v_cnt, v_n
    from public.traspasos_sap where referencia = '7687019429';
  if v_neto <> -28 then
    v_falla := v_falla || ' 1c(el neto de 7687019429 dio ' || v_neto || ' y -36+36-28 son -28)'; end if;
  if not v_cnt then
    v_falla := v_falla || ' 1d(7687019429 salio como que no cuenta, y quedo en -28)'; end if;
  if v_n <> 3 then
    v_falla := v_falla || ' 1e(guardo ' || v_n || ' movimientos para 7687019429 y son 3)'; end if;

  /* LA HORA ES LA DEL PRIMER MOVIMIENTO. Con la del último, un
     documento anulado y rehecho se movería de hora y podría cambiar de
     turno — y ahí deja de cuadrar con el turno en que de verdad salió. */
  if (select hora from public.traspasos_sap where referencia = '7687019429') <> time '00:37:26' then
    v_falla := v_falla || ' 1f(la hora no es la del primer movimiento)'; end if;

  -- -------------------------------------------------------------------
  -- 2. EL OTRO EJEMPLO: +36 y -36 → NINGUNO
  -- -------------------------------------------------------------------
  perform public.traspaso_sap_importar('[
    {"referencia":"7699999999","fecha":"2026-09-17","hora":"03:00:00","cantidad":"36"},
    {"referencia":"7699999999","fecha":"2026-09-17","hora":"03:05:00","cantidad":"-36"}
  ]'::jsonb);

  select neto, cuenta into v_neto, v_cnt
    from public.traspasos_sap where referencia = '7699999999';
  if v_neto <> 0 then
    v_falla := v_falla || ' 2(el neto de +36 -36 dio ' || v_neto || ')'; end if;
  if v_cnt then
    v_falla := v_falla || ' 2b(un documento anulado del todo salio contando)'; end if;

  /* Y NO SE TIRA: se marca. Borrarlo dejaría a alguien buscando en el
     Excel por qué un documento que ve con sus ojos no aparece. */
  if not exists (select 1 from public.traspasos_sap where referencia = '7699999999') then
    v_falla := v_falla || ' 2c(el documento anulado se borro en vez de marcarse)'; end if;

  /* Y NO SALE EN EL CRUCE como algo que falta. */
  if exists (select 1 from public.v_traspasos_cruce where documento = '7699999999') then
    v_falla := v_falla || ' 2d(el documento anulado del todo sale en el cruce)'; end if;

  /* Y AL REIMPORTAR SIGUE ANULADO. El corte se sube dos veces —pasa, y
     más cuando llega corregido— y si el `on conflict` no arrastra
     `cuenta`, lo anulado reaparece contando y se sale a buscar un viaje
     que nunca existió. Es un camino distinto del de arriba: aquel entra
     por el `insert`, este por el `update`. */
  perform public.traspaso_sap_importar('[
    {"referencia":"7699999999","fecha":"2026-09-17","hora":"03:00:00","cantidad":"36"},
    {"referencia":"7699999999","fecha":"2026-09-17","hora":"03:05:00","cantidad":"-36"}
  ]'::jsonb);
  select cuenta into v_cnt from public.traspasos_sap where referencia = '7699999999';
  if v_cnt then
    v_falla := v_falla || ' 2e(al reimportar, el documento anulado volvio a contar)'; end if;

  if v_falla <> '' then raise exception 'REGLA:%', v_falla; end if;
  raise notice 'REGLA ok';
end $$;

-- ---------------------------------------------------------------------
-- LOS DOS LADOS
-- ---------------------------------------------------------------------
do $$
declare
  v_falla text := ''; v_estado text; v_n int;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

  /* Se registran dos viajes de esos días:
       · 7687019657 con el documento BIEN     → tiene que CUADRAR
       · 7687023378 —un dígito cambiado—      → tiene que SOBRAR, y
         7687023377 tiene que salir como que FALTA. Es el dedazo. */
  perform public.traspaso_registrar(date '2026-09-17','A','pet','AAA111','ag01','planta',1,
    false, null, null, null, '7687019657');
  perform public.traspaso_registrar(date '2026-09-17','A','pet','BBB222','ag01','planta',1,
    false, null, null, null, '7687023378');

  select estado into v_estado from public.v_traspasos_cruce where documento = '7687019657';
  if v_estado is distinct from 'cuadra' then
    v_falla := v_falla || ' 3(el documento bien registrado salio «' || coalesce(v_estado,'nada') || '»)'; end if;

  select estado into v_estado from public.v_traspasos_cruce where documento = '7687023377';
  if v_estado is distinct from 'falta' then
    v_falla := v_falla || ' 4(el documento que nadie registro salio «' || coalesce(v_estado,'nada') || '»)'; end if;

  /* EL DEDAZO. Sin este lado del cruce, 7687023378 no aparece por
     ningún sitio: se ve «falta 7687023377» y nadie sabe que el malo
     está ahí al lado, registrado y contando. */
  select estado into v_estado from public.v_traspasos_cruce where documento = '7687023378';
  if v_estado is distinct from 'sobra' then
    v_falla := v_falla || ' 5(el documento tecleado mal salio «' || coalesce(v_estado,'nada') || '» y debia sobrar)'; end if;

  /* 6. EL GUION NO ROMPE EL CRUCE, Y SE PRUEBA DEL LADO DE SAP.
        El viaje se normaliza solo —`documento_clave` es una columna
        generada— así que poner el guion AHÍ no probaba nada: lo escribí
        así primero y la mutación pasó en verde. Lo que hay que probar es
        el lado de SAP, que es el que normaliza ESTA migración: si su
        regla se separa de la del viaje, el cruce dice que falta un
        documento que está registrado justo al lado. */
  /* CON UN NÚMERO QUE NO HAYA ENTRADO ANTES. Lo probé con el 7687019429
     y no medía nada: ese ya lo había importado la prueba 1 SIN guion,
     así que existía en SAP de todas formas y el cruce cuadraba aunque
     la normalización estuviera rota. */
  perform public.traspaso_registrar(date '2026-09-17','C','pet','CCC333','ag01','planta',1,
    false, null, null, null, '7687030759');
  perform public.traspaso_sap_importar('[
    {"referencia":"7687-030 759","fecha":"2026-09-17","hora":"09:35:05","cantidad":"-28"}
  ]'::jsonb);
  select estado into v_estado from public.v_traspasos_cruce where documento = '7687030759';
  if v_estado is distinct from 'cuadra' then
    v_falla := v_falla || ' 6(«7687-030 759» de SAP no cruzo con «7687030759» registrado: salio «' || coalesce(v_estado,'nada') || '»)'; end if;

  /* 7. EL CRUCE NO SE COME MEDIA BODEGA. Un viaje de otra semana no es
        un problema, es de otra semana: encerrado en las fechas del
        Excel, no sale. */
  perform public.traspaso_registrar(date '2026-08-01','A','pet','DDD444','ag01','planta',1,
    false, null, null, null, '5000000001');
  if exists (select 1 from public.v_traspasos_cruce where documento = '5000000001') then
    v_falla := v_falla || ' 7(un viaje de otra semana sale en el cruce)'; end if;

  /* 8. UN VIAJE ANULADO NO CUENTA COMO REGISTRADO. Si contara, anular
        un viaje sería la forma de hacer desaparecer un «falta». */
  perform public.traspaso_registrar(date '2026-09-17','B','pet','EEE555','ag01','planta',1,
    false, null, null, null, '7687025529');
  perform public.traspaso_anular_viaje(
    (select id from public.traspasos_viajes where documento_clave = '7687025529'), 'prueba');
  perform public.traspaso_sap_importar('[
    {"referencia":"7687025529","fecha":"2026-09-17","hora":"04:03:10","cantidad":"-28"}
  ]'::jsonb);
  select estado into v_estado from public.v_traspasos_cruce where documento = '7687025529';
  if v_estado is distinct from 'falta' then
    v_falla := v_falla || ' 8(un viaje anulado cuenta como registrado: salio «' || coalesce(v_estado,'nada') || '»)'; end if;

  /* 9. MISMO DOCUMENTO, DÍA DISTINTO. Cuadra, pero descuadra el
        cumplido de los dos días a la vez y ninguna de las dos listas lo
        diría. */
  perform public.traspaso_sap_importar('[
    {"referencia":"7687019657","fecha":"2026-09-16","hora":"23:00:00","cantidad":"-28"}
  ]'::jsonb);
  if not (select dia_distinto from public.v_traspasos_cruce where documento = '7687019657') then
    v_falla := v_falla || ' 9(el mismo documento en dos dias distintos no se marca)'; end if;

  if v_falla <> '' then raise exception 'CRUCE:%', v_falla; end if;
  raise notice 'CRUCE ok';
end $$;

-- ---------------------------------------------------------------------
-- IMPORTAR DOS VECES NO DUPLICA
-- ---------------------------------------------------------------------
do $$
declare v_falla text := ''; v_antes int; v_despues int; v_neto int;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into v_antes from public.traspasos_sap;

  perform public.traspaso_sap_importar('[
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:26","cantidad":"-36"},
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:36","cantidad":"36"},
    {"referencia":"7687019429","fecha":"2026-09-17","hora":"00:37:58","cantidad":"-28"}
  ]'::jsonb);

  select count(*) into v_despues from public.traspasos_sap;
  if v_despues <> v_antes then
    v_falla := v_falla || ' 10(volver a importar dejo ' || v_despues || ' documentos y habia ' || v_antes || ')'; end if;

  select neto into v_neto from public.traspasos_sap where referencia = '7687019429';
  if v_neto <> -28 then
    v_falla := v_falla || ' 10b(volver a importar dejo el neto en ' || v_neto || ' en vez de -28: se esta sumando encima)'; end if;

  if v_falla <> '' then raise exception 'REPETIR:%', v_falla; end if;
  raise notice 'REPETIR ok';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- UN OPERADOR NO IMPORTA
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role probador;
do $$
declare v_falla text := '';
begin
  begin
    perform public.traspaso_sap_importar('[
      {"referencia":"7600000001","fecha":"2026-09-17","cantidad":"-28"}
    ]'::jsonb);
    v_falla := v_falla || ' 11(un operador pudo importar el corte de SAP)';
  exception when others then
    if sqlerrm not like '%supervisor o administrador%' then
      v_falla := v_falla || ' 11b(lo rechazo, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  if v_falla <> '' then raise exception 'PERMISO:%', v_falla; end if;
  raise notice 'PERMISO ok';
end $$;
reset role;

do $$ begin raise notice 'EL CRUCE CONTRA SAP: todo en orden'; end $$;
