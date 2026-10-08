\set ON_ERROR_STOP on
set client_min_messages = notice;
-- FÁBRICA · RETORNO se puede volver a poner y se suma. Fuera de FABRICA, o con otro estado, el repetido se rechaza como siempre.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  v_falla text := '';
  v_bod uuid; v_l2 uuid; v_a uuid; v_c uuid; v_id1 uuid; v_id2 uuid; v_id3 uuid; v_r record; v_n int;
  v_sku text; v_sku2 text; v_ok boolean;
begin
  select id into v_bod from public.bodegas order by creado_en limit 1;
  select sku into v_sku from public.productos where activo order by sku limit 1;
  select sku into v_sku2 from public.productos where activo order by sku offset 1 limit 1;
  v_l2 := public.conteo_ubicacion_asegurar(v_bod, 'FABRICA', 'L2', null);
  v_a  := public.conteo_ubicacion_asegurar(v_bod, 'A', '05', 'IZQ');
  insert into public.conteos (codigo, bodega_id, estado, responsable_id, iniciado_en)
  values ('FAB-1', v_bod, 'en_proceso', auth.uid(), now()) returning id into v_c;

  /* 1 · primera vez: renglón normal */
  v_id1 := public.conteo_fefo_agregar(v_c, v_sku, v_l2, false, 2, null, null, null, null, false, false, 'RETORNO', null, 10);
  /* 2 · segunda vez, mismo estado: se SUMA al mismo renglón (no error, no renglón nuevo) */
  v_id2 := public.conteo_fefo_agregar(v_c, v_sku, v_l2, false, 3, null, null, null, null, false, false, 'RETORNO', 'otra tanda', 5);
  if v_id1 is distinct from v_id2 then v_falla := v_falla || ' 1(la segunda vez creó otro renglón)'; end if;
  select * into v_r from public.conteo_lineas where id = v_id1;
  if v_r.estibas <> 5 or v_r.saldo <> 15 then v_falla := v_falla || ' 2(no sumó estibas y saldo: ' || v_r.estibas || '/' || v_r.saldo || ')'; end if;
  select count(*) into v_n from public.conteo_lineas where conteo_id = v_c and ubicacion_id = v_l2 and estado_envase = 'RETORNO';
  if v_n <> 1 then v_falla := v_falla || ' 3(hay ' || v_n || ' renglones RETORNO, debía ser 1)'; end if;
  if v_r.cantidad_contada <> (select cajas_por_estiba from public.productos where sku = v_sku) * 5 + 15 then v_falla := v_falla || ' 4(cantidad_contada mal)'; end if;
  if v_r.nota is distinct from 'otra tanda' then v_falla := v_falla || ' 4b(nota)'; end if;
  /* 3 · cajas sueltas sobre un renglón en estibas van al saldo */
  perform public.conteo_fefo_agregar(v_c, v_sku, v_l2, false, null, 7, null, null, null, false, false, 'RETORNO', null, null);
  select * into v_r from public.conteo_lineas where id = v_id1;
  if v_r.saldo <> 22 or v_r.cajas is not null then v_falla := v_falla || ' 5(cajas sueltas no fueron al saldo: ' || coalesce(v_r.saldo::text,'-') || ')'; end if;
  /* 4 · otro código en la misma línea: renglón aparte */
  v_id3 := public.conteo_fefo_agregar(v_c, v_sku2, v_l2, false, null, 40, null, null, null, false, false, 'RETORNO', null, null);
  if v_id3 = v_id1 then v_falla := v_falla || ' 6(otro código se mezcló)'; end if;
  /* 5 · y cajas sobre cajas */
  perform public.conteo_fefo_agregar(v_c, v_sku2, v_l2, false, null, 10, null, null, null, false, false, 'RETORNO', null, null);
  if (select cajas from public.conteo_lineas where id = v_id3) <> 50 then v_falla := v_falla || ' 7(cajas con cajas)'; end if;
  /* 6 · estibas sobre un renglón en cajas pasan a cajas */
  perform public.conteo_fefo_agregar(v_c, v_sku2, v_l2, false, 1, null, null, null, null, false, false, 'RETORNO', null, 3);
  if (select cajas from public.conteo_lineas where id = v_id3) <> 50 + (select cajas_por_estiba from public.productos where sku = v_sku2) + 3
    then v_falla := v_falla || ' 8(estibas sobre cajas)'; end if;
  /* 7 · otro estado en FABRICA sigue sin repetirse */
  perform public.conteo_fefo_agregar(v_c, v_sku, v_l2, false, 1, null, null, null, null, false, false, 'LAVADO', null, null);
  v_ok := false;
  begin
    perform public.conteo_fefo_agregar(v_c, v_sku, v_l2, false, 1, null, null, null, null, false, false, 'LAVADO', null, null);
  exception when unique_violation then v_ok := true; end;
  if not v_ok then v_falla := v_falla || ' 9(LAVADO repetido en FABRICA debía rechazarse)'; end if;
  /* 8 · RETORNO en otra calle sigue rechazándose */
  perform public.conteo_fefo_agregar(v_c, v_sku, v_a, false, 1, null, null, null, null, false, false, 'RETORNO', null, null);
  v_ok := false;
  begin
    perform public.conteo_fefo_agregar(v_c, v_sku, v_a, false, 1, null, null, null, null, false, false, 'RETORNO', null, null);
  exception when unique_violation then v_ok := true; end;
  if not v_ok then v_falla := v_falla || ' 10(RETORNO repetido fuera de FABRICA debía rechazarse)'; end if;

  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'FABRICA RETORNO: todo en orden';
end $$;
