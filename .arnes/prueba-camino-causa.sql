-- =====================================================================
-- CADA CAUSA POR SU CAMINO — lo que la migración tiene que dejar cierto.
-- =====================================================================
-- QUIEN REGISTRA TIENE QUE SER SUPERVISOR: la función lo exige, y el
-- arnés tiene que entrar por la misma puerta que la pantalla.
-- EL ADMIN VA PRIMERO: la base no deja que quede nadie mandando, así que
-- degradar al único que manda para poner un supervisor se rechaza.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local') on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe Admin','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = 'supervisor', activo = true;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $prueba$
declare v_id uuid; v_cod text; v_est text; v_et text; r record;
begin

  -- 1 · UNA CAUSA DEL OL ESPERA AL OL
  select id, codigo into v_id, v_cod from public.rotura_registrar(
    p_material => 'PRUEBA-PT', p_unidades => 200, p_contaminadas => 100,
    p_proceso => 'lineas', p_causa => 'estibas_malas', p_area => 'bahias_t1');
  select estado into v_est from public.roturas where id = v_id;
  select etapa  into v_et  from public.v_roturas where id = v_id;
  raise notice '  · asumida (estibas en mal estado) -> estado %, etapa %', v_est, v_et;
  if v_est <> 'esperando' or v_et <> 'espera_ol' then
    raise exception 'FALLA: una causa del OL no fue a su bandeja (% / %)', v_est, v_et;
  end if;

  -- 2 · Y LAS CONTAMINADAS VIAJAN CON ELLA, en el mismo renglón
  select unidades, contaminadas, unidades_liquido, unidades_vidrio into r
    from public.v_roturas where id = v_id;
  raise notice '  · 200 rotas + 100 contaminadas -> liquido %, vidrio %', r.unidades_liquido, r.unidades_vidrio;
  if r.unidades <> 200 or r.contaminadas <> 100 then
    raise exception 'FALLA: no se guardaron las dos cifras (% rotas, % contaminadas)', r.unidades, r.contaminadas;
  end if;
  /* EN PRODUCTO SE COBRA LÍQUIDO Y ENVASE: el líquido son las rotas MÁS
     las contaminadas —las dos lo pierden— y el envase son solo las
     botellas rotas, porque la contaminada vuelve entera. */
  if r.unidades_liquido <> 300 then
    raise exception 'FALLA: el liquido perdido son 300 (200 rotas + 100 contaminadas) y dice %', r.unidades_liquido;
  end if;

  -- 3 · UNA CAUSA QUE NO ES DEL OL NACE DECIDIDA
  select id, codigo into v_id, v_cod from public.rotura_registrar(
    p_material => 'PRUEBA-PT', p_unidades => 10,
    p_proceso => 'lineas', p_causa => 'falla_maquinas', p_area => 'bahias_t1');
  select estado into v_est from public.roturas where id = v_id;
  select etapa  into v_et  from public.v_roturas where id = v_id;
  raise notice '  · no asumida (falla de las maquinas) -> estado %, etapa %', v_est, v_et;
  if v_est <> 'no_cuenta' or v_et <> 'no_cuenta' then
    raise exception 'FALLA: una causa que no es del OL fue igual a su bandeja (% / %)', v_est, v_et;
  end if;

  -- 4 · Y NO APARECE EN LA BANDEJA DEL OL
  if exists (select 1 from public.v_roturas where id = v_id and etapa = 'espera_ol') then
    raise exception 'FALLA: la que no es del OL sigue saliendo en su bandeja';
  end if;

  -- 5 · EN EER NO HAY CONTAMINADAS: es envase vacío, no hay líquido.
  --     OJO: lo que de verdad lo impide es la restricción de la tabla
  --     (roturas_contaminadas_solo_pt), no esta comprobación. Quitando la
  --     línea de la función el insert se cae igual, pero con el mensaje
  --     de Postgres y no con el de aquí. Se deja porque falla ANTES y
  --     más claro, no porque sea el candado.
  select id into v_id from public.rotura_registrar(
    p_material => 'PRUEBA-EER', p_unidades => 50, p_contaminadas => 30,
    p_proceso => 'lineas', p_causa => 'estibas_malas', p_area => 'bahias_t1');
  select unidades, contaminadas, unidades_liquido, unidades_vidrio into r
    from public.v_roturas where id = v_id;
  raise notice '  · EER: % rotas, contaminadas %, liquido %, vidrio %',
    r.unidades, coalesce(r.contaminadas::text, 'null'), r.unidades_liquido, r.unidades_vidrio;
  if r.contaminadas is not null then
    raise exception 'FALLA: al EER se le guardaron contaminadas (%) y no hay liquido que contaminar', r.contaminadas;
  end if;
  if r.unidades_vidrio <> 50 then
    raise exception 'FALLA: en EER el envase son las 50 unidades y dice %', r.unidades_vidrio;
  end if;
end $prueba$;
