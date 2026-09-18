\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- UN VIAJE CON VARIOS TIPOS
--
-- Lo que se comprueba no es «¿se guardaron los tipos?» sino lo que de
-- verdad decide:
--
--   · que UN camión con tres tipos avance el plan de LOS TRES, uno cada
--     uno — que es lo que se escogió sobre repartirlo en fracciones,
--   · que siga siendo UN viaje con UN documento: el índice único no se
--     relajó, y esa es la razón de que los tipos cuelguen aparte,
--   · que los viajes de ANTES —sin tipos colgados— cuenten igual que
--     ayer por su columna `tipo`, sin migrar un solo dato,
--   · que la carga no se cuente dos veces,
--   · que no se pueda meter el mismo tipo dos veces en un viaje,
--   · y que el viaje con carga vaya siempre en 1.
-- =====================================================================

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_falla text := ''; v_id uuid; v_n int; v_c int;
  v_hoy date := public.traspaso_hoy();
begin
  /* ---------------------------------------------------------------
     UN VIAJE DE ANTES, registrado con la función de siempre y un solo
     tipo. Es lo que hay hoy en la base de la bodega: sin él no se puede
     comprobar que esto no le cambia el cumplido a nadie.
     --------------------------------------------------------------- */
  perform public.traspaso_registrar(v_hoy, 'A', 'pet', 'VJO111', 'ag01', 'planta', 1,
    false, 50, null, null, '8000000001');

  /* 1. UN CAMIÓN CON TRES TIPOS. */
  select r.id into v_id from public.traspaso_registrar_varios(
    v_hoy, 'A',
    '[{"tipo":"pet","cantidad":120},{"tipo":"casco","cantidad":80},{"tipo":"estibas"}]'::jsonb,
    'AAA111', 'ag01', 'planta', '8000000002', 'lleva de tres') r;

  if v_id is null then
    v_falla := v_falla || ' 1(no registro el viaje con tres tipos)';
  else
    /* SIGUE SIENDO UNA SOLA FILA DE VIAJE. Es la razón de que los tipos
       cuelguen aparte: tres filas con el mismo documento chocarían con
       el índice único, que es justo lo que no se puede tocar. */
    select count(*) into v_n from public.traspasos_viajes
     where documento_clave = '8000000002' and estado = 'registrado';
    if v_n <> 1 then
      v_falla := v_falla || ' 1b(el viaje quedo en ' || v_n || ' filas y debe ser una sola)'; end if;

    select count(*) into v_n from public.traspasos_viaje_tipos where viaje_id = v_id;
    if v_n <> 3 then
      v_falla := v_falla || ' 1c(colgo ' || v_n || ' tipos y son 3)'; end if;

    /* Y VA EN 1 VIAJE: un vehículo es un viaje. Lo que multiplica son
       los tipos, no el contador. */
    select viajes into v_n from public.traspasos_viajes where id = v_id;
    if v_n <> 1 then
      v_falla := v_falla || ' 1d(el viaje con carga quedo en ' || v_n || ' viajes y debe ser 1)'; end if;

    /* EL PRIMER TIPO TAMBIÉN VA EN LA COLUMNA DEL VIAJE, para que todo
       lo que ya lee esa columna —la lista, el cruce, los informes
       viejos— siga funcionando sin enterarse. */
    if (select tipo from public.traspasos_viajes where id = v_id) is distinct from 'pet' then
      v_falla := v_falla || ' 1e(el primer tipo no quedo en la columna del viaje)'; end if;
  end if;

  /* 2. EL PLAN DE LOS TRES AVANZA UNO CADA UNO.
        Es lo que se escogió: el camión salió una vez, pero el plan de
        casco pedía viajes de casco y avanzó uno; el de PET, uno; el de
        estibas, uno. */
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'casco';
  if coalesce(v_n, 0) <> 1 then
    v_falla := v_falla || ' 2(el plan de casco avanzo ' || coalesce(v_n, 0) || ' y debia avanzar 1)'; end if;

  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'estibas';
  if coalesce(v_n, 0) <> 1 then
    v_falla := v_falla || ' 2b(el plan de estibas avanzo ' || coalesce(v_n, 0) || ')'; end if;

  /* 3. Y EL VIAJE VIEJO SIGUE CONTANDO IGUAL QUE AYER.
        PET tiene dos: el viejo —sin tipos colgados, contado por su
        columna `tipo`— y el nuevo. Si el viejo dejara de contar, el
        cumplido de todos los días anteriores cambiaría de golpe. */
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'pet';
  if coalesce(v_n, 0) <> 2 then
    v_falla := v_falla || ' 3(PET cuenta ' || coalesce(v_n, 0) || ' y son 2: el viaje viejo y el nuevo)'; end if;

  /* 4. LA CARGA NO SE CUENTA DOS VECES.
        El primer tipo guarda su cantidad TAMBIÉN en `carga` del viaje,
        para que lo viejo siga leyéndola. Sumando las dos, el PET del
        viaje nuevo contaría 240 en vez de 120. */
  select carga into v_c from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'pet';
  if coalesce(v_c, 0) <> 170 then
    v_falla := v_falla || ' 4(la carga de PET dio ' || coalesce(v_c, 0) || ' y son 170: 50 del viejo y 120 del nuevo)'; end if;

  select carga into v_c from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'casco';
  if coalesce(v_c, 0) <> 80 then
    v_falla := v_falla || ' 4b(la carga de casco dio ' || coalesce(v_c, 0) || ' y son 80)'; end if;

  /* 5. UN TIPO SIN CANTIDAD ENTRA IGUAL. Es opcional, como la carga de
        siempre: obligarla trabaría el registro con un camión esperando. */
  if (select cantidad from public.traspasos_viaje_tipos
       where viaje_id = v_id and tipo = 'estibas') is not null then
    v_falla := v_falla || ' 5(le invento una cantidad al tipo que no la traia)'; end if;

  /* 6. EL MISMO TIPO DOS VECES: NO. El plan de ese tipo avanzaría dos
        con un solo camión, y ese es el número que nadie podría explicar
        después. */
  begin
    perform public.traspaso_registrar_varios(
      v_hoy, 'A', '[{"tipo":"pet","cantidad":10},{"tipo":"pet","cantidad":20}]'::jsonb,
      'BBB222', 'ag01', 'planta', '8000000003');
    v_falla := v_falla || ' 6(dejo meter el mismo tipo dos veces)';
  exception when others then
    if sqlerrm not like '%repetido%' then
      v_falla := v_falla || ' 6b(lo rechazo, pero no por repetido: ' || sqlerrm || ')'; end if;
  end;

  /* 7. SIN NINGÚN TIPO: NO. */
  begin
    perform public.traspaso_registrar_varios(
      v_hoy, 'A', '[]'::jsonb, 'CCC333', 'ag01', 'planta', '8000000004');
    v_falla := v_falla || ' 7(dejo registrar sin ningun tipo)';
  exception when others then
    if sqlerrm not like '%al menos un tipo%' then
      v_falla := v_falla || ' 7b(lo rechazo, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  /* 8. EL DOCUMENTO SIGUE SIN PODERSE REPETIR. Es la regla que esta
        migración no podía romper, y la razón entera de que los tipos
        cuelguen aparte en vez de ser tres filas de viaje. */
  begin
    perform public.traspaso_registrar_varios(
      v_hoy, 'B', '[{"tipo":"casco"}]'::jsonb,
      'DDD444', 'ag01', 'planta', '8000000002');
    v_falla := v_falla || ' 8(dejo repetir el documento)';
  exception when others then
    if sqlerrm not like '%ya está registrado%' and sqlerrm not like '%duplicate key%' then
      v_falla := v_falla || ' 8b(lo rechazo, pero no por el documento: ' || sqlerrm || ')'; end if;
  end;

  /* 9. ANULAR EL VIAJE LO SACA DE LOS TRES PLANES. Si los tipos
        colgados siguieran contando después de anular, anular dejaría de
        servir para lo que sirve. */
  perform public.traspaso_anular_viaje(v_id, 'prueba');
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'casco';
  if coalesce(v_n, 0) <> 0 then
    v_falla := v_falla || ' 9(anulado y casco sigue contando ' || coalesce(v_n, 0) || ')'; end if;
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'pet';
  if coalesce(v_n, 0) <> 1 then
    v_falla := v_falla || ' 9b(anulado el nuevo, PET debia quedar en 1 y quedo en ' || coalesce(v_n, 0) || ')'; end if;

  if v_falla <> '' then raise exception 'TIPOS:%', v_falla; end if;
  raise notice 'TIPOS ok';
end $$;
reset role;

do $$ begin raise notice 'VARIOS TIPOS POR VIAJE: todo en orden'; end $$;
