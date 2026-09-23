\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- REGISTRAR UN VIAJE ADELANTADO
--
-- «Hay veces que tengo un viaje del día siguiente y lo adelanto.»
--
-- LO QUE SE COMPRUEBA no es «¿deja registrar mañana?» sino las cinco
-- cosas que se pueden romper al abrirlo:
--   · que mañana entre, con la hora de SU turno y marcado ADELANTADO;
--   · que el tope de siete días exista de verdad;
--   · que el tope valga también para el administrador;
--   · que lo de atrás siga como estaba —marca ATRASADO incluida—;
--   · que el candado del día cerrado no se haya aflojado de paso.
--
-- LAS FECHAS SON RELATIVAS A HOY, nunca literales: una prueba con una
-- fecha escrita a mano pasa hoy y falla sola el mes entrante.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.traspasos_tipos (clave, nombre, activo, orden) values
  ('pet','PET',true,1)
on conflict (clave) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2)
on conflict (clave) do update set activo = true;


-- ===================== EL SUPERVISOR =====================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare
  v_id uuid; v_falla text := '';
  v_hoy date := public.traspaso_hoy();
  v_hora timestamptz; v_ade boolean; v_dias int; v_atr boolean;
begin
  -- 1. MAÑANA ENTRA. Es lo que se vino a arreglar.
  select id into v_id from public.traspaso_registrar(
    v_hoy + 1,'A','pet','ADE001','ag01','planta',1);
  if v_id is null then v_falla := v_falla || ' 1(no entro el viaje de manana)'; end if;

  -- 2. CON LA HORA DE SU TURNO, no con la de ahora. Un viaje de mañana
  --    con hora de hoy es una hora que todavía no existió.
  select hora, adelantado, dias_adelante into v_hora, v_ade, v_dias
    from public.v_traspasos_viajes where id = v_id;
  if v_hora <> public.traspaso_arranque_turno(v_hoy + 1, 'A') then
    v_falla := v_falla || ' 2(la hora no es la de arranque del turno A de manana)'; end if;

  -- 3. Y MARCADO. Quien mire mañana tiene que ver que ese renglón se
  --    escribió antes de que el día llegara.
  if not coalesce(v_ade, false) then
    v_falla := v_falla || ' 3(no quedo marcado adelantado)'; end if;
  if v_dias <> 1 then
    v_falla := v_falla || ' 3b(dias_adelante=' || coalesce(v_dias::text,'null') || ')'; end if;

  -- 4. EL SÉPTIMO DÍA ENTRA —el tope es «hasta siete», no «menos de».
  select id into v_id from public.traspaso_registrar(
    v_hoy + 7,'B','pet','ADE007','ag01','planta',1);
  if v_id is null then v_falla := v_falla || ' 4(no entro el septimo dia)'; end if;

  -- 5. EL OCTAVO NO. Si no, el 2027 escrito por error entra igual.
  begin
    perform public.traspaso_registrar(v_hoy + 8,'A','pet','ADE008','ag01','planta',1);
    v_falla := v_falla || ' 5(entro un viaje a ocho dias)';
  exception when others then
    if sqlerrm not like '%más de siete días%' then
      v_falla := v_falla || ' 5(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 6. Y UN AÑO ADELANTE, MENOS TODAVÍA.
  begin
    perform public.traspaso_registrar(v_hoy + 365,'A','pet','ADE365','ag01','planta',1);
    v_falla := v_falla || ' 6(entro un viaje a un ano)';
  exception when others then
    if sqlerrm not like '%más de siete días%' then
      v_falla := v_falla || ' 6(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 7. HOY SIGUE SIENDO HOY: hora de verdad y sin ninguna marca.
  select id into v_id from public.traspaso_registrar(
    v_hoy,'B','pet','HOY001','ag01','planta',1);
  select hora, adelantado, atrasado into v_hora, v_ade, v_atr
    from public.v_traspasos_viajes where id = v_id;
  if coalesce(v_ade, false) then
    v_falla := v_falla || ' 7(marco adelantado un viaje de hoy)'; end if;
  if coalesce(v_atr, false) then
    v_falla := v_falla || ' 7b(marco atrasado un viaje de hoy)'; end if;
  if abs(extract(epoch from (now() - v_hora))) > 60 then
    v_falla := v_falla || ' 7c(la hora de hoy no es ahora)'; end if;

  -- 8. EL CANDADO DEL DÍA CERRADO NO SE AFLOJÓ. «Solo las fechas»:
  --    un día viejo lo sigue tocando solo el administrador.
  begin
    perform public.traspaso_registrar(v_hoy - 9,'A','pet','VIE009','ag01','planta',1);
    v_falla := v_falla || ' 8(un supervisor registro en un dia cerrado)';
  exception when others then
    if sqlerrm not like '%ya está cerrado%' then
      v_falla := v_falla || ' 8(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla = '' then
    raise notice 'SUPERVISOR: bien. Manana entra con la hora de su turno y marcado; el octavo dia no; hoy y el dia cerrado siguen igual.';
  else
    raise exception 'SUPERVISOR FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;


-- ===================== EL ADMINISTRADOR =====================
-- Hacia atrás no tiene tope; hacia adelante SÍ, y es a propósito: «la
-- fecha de verdad es esa» es un caso real hacia atrás y no lo es hacia
-- adelante.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  v_id uuid; v_falla text := '';
  v_hoy date := public.traspaso_hoy();
  v_atr boolean; v_dias int;
begin
  -- 9. AL ADMINISTRADOR TAMBIÉN SE LE PARA A LOS OCHO DÍAS.
  begin
    perform public.traspaso_registrar(v_hoy + 8,'A','pet','JEF008','ag01','planta',1);
    v_falla := v_falla || ' 9(el admin metio un viaje a ocho dias)';
  exception when others then
    if sqlerrm not like '%más de siete días%' then
      v_falla := v_falla || ' 9(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 10. PERO MAÑANA SÍ, igual que el supervisor.
  select id into v_id from public.traspaso_registrar(
    v_hoy + 1,'C','pet','JEF001','ag01','planta',1);
  if v_id is null then v_falla := v_falla || ' 10(al admin no le entro manana)'; end if;

  -- 11. Y LO DE ATRÁS SIGUE COMO ESTABA: entra y queda marcado ATRASADO.
  select id into v_id from public.traspaso_registrar(
    v_hoy - 9,'A','pet','JEF009','ag01','planta',1);
  select atrasado, dias_atras into v_atr, v_dias
    from public.v_traspasos_viajes where id = v_id;
  if not coalesce(v_atr, false) then
    v_falla := v_falla || ' 11(se perdio la marca de atrasado)'; end if;
  if v_dias <> 9 then
    v_falla := v_falla || ' 11b(dias_atras=' || coalesce(v_dias::text,'null') || ')'; end if;

  if v_falla = '' then
    raise notice 'ADMIN: bien. El tope de siete dias es para todos; manana entra; lo de atras sigue marcado ATRASADO.';
  else
    raise exception 'ADMIN FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;
