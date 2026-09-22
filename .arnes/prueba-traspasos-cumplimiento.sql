\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- QUÉ CUENTA EN EL CUMPLIMIENTO
--
--   · las estibas cuentan SOLO si el viaje es de Arenosa;
--   · las tolvas de vidrio no cuentan nunca, ni en el plan;
--   · lo demás cuenta igual que antes —y eso es lo que más importa:
--     una regla nueva que le cambie el cumplido al casco sería un daño
--     silencioso—;
--   · un viaje de estibas que NO es de Arenosa se sigue registrando:
--     la regla es de medición, no de permiso.
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_falla text := ''; v_id uuid; v_n int;
  v_hoy date := public.traspaso_hoy();
begin
  /* EL PLAN DEL TURNO: 2 de casco, 2 de estibas, 1 de tolvas. */
  perform public.traspaso_plan_a_varios(array[v_hoy],
    '[{"turno":"A","tipo":"casco","planeado":2},
      {"turno":"A","tipo":"estibas","planeado":2},
      {"turno":"A","tipo":"tolvas_vidrio","planeado":1}]'::jsonb);

  /* 1. ESTIBAS DE ARENOSA: cuenta. */
  select x.id into v_id from public.traspaso_registrar_varios(
    v_hoy, 'A', '[{"tipo":"estibas","cantidad":10}]'::jsonb,
    'AAA111', 'ag01', 'planta', '9000000001', null, true) x;
  if not (select arenosa from public.traspasos_viajes where id = v_id) then
    v_falla := v_falla || ' 1(el viaje de Arenosa no quedo marcado)'; end if;

  /* 2. ESTIBAS QUE NO SON DE ARENOSA: se registra, no cuenta. */
  perform public.traspaso_registrar_varios(
    v_hoy, 'A', '[{"tipo":"estibas","cantidad":10}]'::jsonb,
    'BBB222', 'ag01', 'planta', '9000000002', null, false);
  select count(*) into v_n from public.traspasos_viajes
   where fecha = v_hoy and tipo = 'estibas' and estado = 'registrado';
  if v_n <> 2 then
    v_falla := v_falla || ' 2(se registraron ' || v_n || ' viajes de estibas y deben ser 2)'; end if;

  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'estibas';
  if coalesce(v_n, -1) <> 1 then
    v_falla := v_falla || ' 2b(el cumplido de estibas es ' || coalesce(v_n, -1) || ' y debe ser 1: solo la de Arenosa)'; end if;

  /* 3. TOLVAS DE VIDRIO: se registran y no miden. */
  perform public.traspaso_registrar_varios(
    v_hoy, 'A', '[{"tipo":"tolvas_vidrio","cantidad":4}]'::jsonb,
    'CCC333', 'ag01', 'planta', '9000000003', null, true);
  select count(*) into v_n from public.traspasos_viajes
   where fecha = v_hoy and tipo = 'tolvas_vidrio' and estado = 'registrado';
  if v_n <> 1 then
    v_falla := v_falla || ' 3(la tolva no se registro)'; end if;

  select count(*) into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'tolvas_vidrio';
  if v_n <> 0 then
    v_falla := v_falla || ' 3b(las tolvas salen en el control y no deben medir)'; end if;

  /* 4. LO DEMÁS, IGUAL QUE ANTES: el casco cuenta sin preguntas. */
  perform public.traspaso_registrar_varios(
    v_hoy, 'A', '[{"tipo":"casco","cantidad":100}]'::jsonb,
    'DDD444', 'ag01', 'planta', '9000000004', null, false);
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'casco';
  if coalesce(v_n, -1) <> 1 then
    v_falla := v_falla || ' 4(el casco cuenta ' || coalesce(v_n, -1) || ' y debe contar 1)'; end if;

  /* 5. UN CAMIÓN CON CASCO Y ESTIBAS, sin Arenosa: el casco cuenta, las
     estibas no. Es el caso que rompe una regla escrita por viaje. */
  perform public.traspaso_registrar_varios(
    v_hoy, 'A', '[{"tipo":"casco","cantidad":50},{"tipo":"estibas","cantidad":5}]'::jsonb,
    'EEE555', 'ag01', 'planta', '9000000005', null, false);
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'casco';
  if coalesce(v_n, -1) <> 2 then
    v_falla := v_falla || ' 5(el casco del camion mixto no conto: va en ' || coalesce(v_n, -1) || ')'; end if;
  select cumplido into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'estibas';
  if coalesce(v_n, -1) <> 1 then
    v_falla := v_falla || ' 5b(las estibas del camion mixto contaron sin ser de Arenosa: ' || coalesce(v_n, -1) || ')'; end if;

  /* 6. EL PORCENTAJE: 1 de 2 estibas = 50 %. */
  select cumplimiento into v_n from public.v_traspasos_control
   where fecha = v_hoy and turno = 'A' and tipo = 'estibas';
  if coalesce(v_n, -1) <> 50 then
    v_falla := v_falla || ' 6(el % de estibas es ' || coalesce(v_n, -1) || ' y debe ser 50)'; end if;

  if v_falla = '' then raise notice 'BIEN: estibas solo de Arenosa, tolvas fuera del cumplimiento, lo demas igual.';
  else raise exception 'MAL:%', v_falla; end if;
end $$;
reset role;
