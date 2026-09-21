\set ON_ERROR_STOP on
set client_min_messages = notice;
-- =====================================================================
-- «EN EL REGISTRO DE TRASPASO ELIMINA ORDEN DE CARGUE»
--   · el patio registra SIN orden de cargue, y varios seguidos;
--   · el viaje queda por facturar, y facturación lo confirma igual;
--   · si alguien manda una orden repetida, se sigue frenando;
--   · el administrador corrige un viaje sin orden, y uno viejo con orden
--     no la pierde si se le vuelve a mandar.
-- =====================================================================
do $prueba$
declare
  v_falla text := '';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  FAC  constant text := '55555555-5555-5555-5555-555555555555';
  v_hoy date := public.traspaso_hoy();
  a uuid; b uuid; v_old uuid; t text;
begin
  perform set_config('request.jwt.claim.sub', SUP, true);
  set local role probador;
  begin
    select id into a from public.traspaso_registrar(v_hoy, 'B', 'pet', 'SIN111', 'ag01', 'planta', 1, false, 30, null, null);
    select id into b from public.traspaso_registrar(v_hoy, 'B', 'pet', 'SIN222', 'ag01', 'planta', 1, false, 20, null, null, null);
  exception when others then v_falla := v_falla || ' 1(registrar sin orden de cargue falla: ' || sqlerrm || ')'; end;
  if a is null or b is null then v_falla := v_falla || ' 1b(no quedaron los dos viajes sin orden)'; end if;
  if (select documento from public.traspasos_viajes where id = a) is not null then
    v_falla := v_falla || ' 1c(se inventó una orden de cargue)'; end if;
  if not coalesce((select por_facturar from public.v_traspasos_viajes where id = a), false) then
    v_falla := v_falla || ' 2(el viaje sin orden no llega a la bandeja de facturación)'; end if;

  /* UNA ORDEN REPETIDA SE SIGUE FRENANDO */
  begin
    perform public.traspaso_registrar(v_hoy, 'B', 'pet', 'REP111', 'ag01', 'planta', 1, false, 10, null, null,
      (select documento from public.traspasos_viajes where documento is not null and estado = 'registrado' limit 1));
    v_falla := v_falla || ' 3(una orden de cargue repetida entró)';
  exception when others then
    if sqlerrm !~* 'ya est' then v_falla := v_falla || ' 3b(la repetida no dice dónde está: ' || sqlerrm || ')'; end if;
  end;
  reset role;

  /* FACTURACIÓN LO CONFIRMA */
  perform set_config('request.jwt.claim.sub', FAC, true);
  set local role probador;
  begin
    perform public.traspaso_confirmar_salida(a, '9100000001');
  exception when others then v_falla := v_falla || ' 4(facturación no pudo confirmar un viaje sin orden: ' || sqlerrm || ')'; end;
  reset role;

  /* EL ADMINISTRADOR CORRIGE */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    perform public.traspaso_editar_viaje(b, v_hoy, 'B', 'pet', 'SIN223', 'ag01', 'planta', 1, false, 20, null, null, 'placa mal', null);
  exception when others then v_falla := v_falla || ' 5(corregir un viaje sin orden falla: ' || sqlerrm || ')'; end;
  if (select placa from public.traspasos_viajes where id = b) <> 'SIN223' then
    v_falla := v_falla || ' 5b(la corrección no quedó)'; end if;
  select id, documento into v_old, t from public.traspasos_viajes
   where documento is not null and estado = 'registrado' and salida_en is null limit 1;
  if v_old is not null then
    begin
      perform public.traspaso_editar_viaje(v_old, (select fecha from public.traspasos_viajes where id = v_old),
        (select turno from public.traspasos_viajes where id = v_old), 'pet', 'VIE999', 'ag01', 'planta', 1, false, 5, null, null, 'x', t);
    exception when others then v_falla := v_falla || ' 6(corregir uno viejo con su orden falla contra sí mismo: ' || sqlerrm || ')'; end;
    if (select documento from public.traspasos_viajes where id = v_old) is distinct from t then
      v_falla := v_falla || ' 6b(al corregir, el viaje viejo perdió su orden de cargue)'; end if;
  end if;
  reset role;

  if v_falla <> '' then raise exception 'SIN ORDEN:%', v_falla; end if;
  raise notice 'SIN ORDEN ok';
end $prueba$;
