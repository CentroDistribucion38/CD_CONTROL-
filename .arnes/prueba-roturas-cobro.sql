-- =====================================================================
-- LO QUE SE COBRA — lo que la migración tiene que dejar cierto.
-- =====================================================================
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
declare v_id uuid; r record; v_n int;
begin
  -- 1 · UNA UNIDAD ES UNA BOTELLA: ya no se multiplica por el empaque.
  select id into v_id from public.rotura_registrar(
    p_material => '2182', p_unidades => 200, p_contaminadas => 100,
    p_proceso => 'lineas', p_causa => 'estibas_malas', p_area => 'bahias_t1');
  select unidades, contaminadas, botellas, unidades_vidrio, unidades_liquido into r
    from public.v_roturas where id = v_id;
  raise notice '  · 200 rotas -> botellas %, vidrio %, liquido %', r.botellas, r.unidades_vidrio, r.unidades_liquido;
  if r.botellas <> 200 then
    raise exception 'FALLA: 200 unidades se guardaron como % botellas (se multiplico por el empaque)', r.botellas;
  end if;
  if r.unidades_vidrio <> 200 then
    raise exception 'FALLA: el vidrio dice % y son 200', r.unidades_vidrio;
  end if;

  -- 2 · EL EJEMPLO DE CRISTIAN, EN PLATA.
  --     2182: producto $233,50, su envase 3500162 $100,00.
  --     rotas        200 x 100,00              =  20.000,00
  --     contaminadas 100 x (100,00 + 233,50)   =  33.350,00
  --     total                                     53.350,00
  select precio_envase, precio_producto, cobro_rotas, cobro_contaminadas, cobro_total into r
    from public.v_roturas where id = v_id;
  raise notice '  · envase $%, producto $% -> rotas $%, contaminadas $%, total $%',
    r.precio_envase, r.precio_producto, r.cobro_rotas, r.cobro_contaminadas, r.cobro_total;
  if r.precio_envase <> 100.00 then raise exception 'FALLA: el envase quedo en %', r.precio_envase; end if;
  if r.precio_producto <> 233.50 then raise exception 'FALLA: el producto quedo en %', r.precio_producto; end if;
  if r.cobro_rotas <> 20000.00 then raise exception 'FALLA: las rotas dan % y son 20.000', r.cobro_rotas; end if;
  if r.cobro_contaminadas <> 33350.00 then raise exception 'FALLA: las contaminadas dan % y son 33.350', r.cobro_contaminadas; end if;
  if r.cobro_total <> 53350.00 then raise exception 'FALLA: el total da % y son 53.350', r.cobro_total; end if;

  -- 3 · EN EER SE COBRA SOLO EL ENVASE, Y ES EL MATERIAL MISMO.
  --     3500162 vale $100,00: 50 rotas = 5.000,00, sin producto.
  select id into v_id from public.rotura_registrar(
    p_material => '3500162', p_unidades => 50,
    p_proceso => 'lineas', p_causa => 'estibas_malas', p_area => 'bahias_t1');
  select precio_envase, precio_producto, cobro_rotas, cobro_contaminadas, cobro_total into r
    from public.v_roturas where id = v_id;
  raise notice '  · EER 50 -> envase $%, producto %, total $%',
    r.precio_envase, coalesce(r.precio_producto::text, 'null'), r.cobro_total;
  if r.precio_producto is not null then
    raise exception 'FALLA: a un EER se le puso precio de producto (%): no hay liquido que cobrar', r.precio_producto;
  end if;
  if r.cobro_total <> 5000.00 then raise exception 'FALLA: el EER da % y son 5.000', r.cobro_total; end if;

  -- 4 · SIN PRECIO, LA PLATA ES NULA Y NO CERO. Un cero se suma sin
  --     hacer ruido y deja un cobro corto que nadie nota.
  update public.productos set precio_botella = null where sku = '3500162';
  select cobro_total into r from public.v_roturas where id = v_id;
  if r.cobro_total is not null then
    raise exception 'FALLA: sin precio el cobro dio % en vez de nulo', r.cobro_total;
  end if;
  raise notice '  · sin precio el cobro sale nulo, no cero ✓';
  update public.productos set precio_botella = 100.00 where sku = '3500162';

  -- 5 · LO VIEJO QUEDO CORREGIDO. La fila sembrada a mano con las
  --     botellas multiplicadas tiene que haber bajado a las unidades.
  select unidades, botellas into r from public.roturas where codigo = 'RB-VIEJA';
  raise notice '  · la vieja: % unidades, % botellas', r.unidades, r.botellas;
  if r.botellas <> r.unidades then
    raise exception 'FALLA: la rotura vieja sigue con % botellas para % unidades', r.botellas, r.unidades;
  end if;

  -- 6 · Y LA QUE ALGUIEN CONTO A MANO NO SE TOCA. 77 no es 10 x 30.
  select botellas into r from public.roturas where codigo = 'RB-AMANO';
  if r.botellas <> 77 then
    raise exception 'FALLA: se piso una cuenta hecha a mano: quedo en %', r.botellas;
  end if;
  raise notice '  · la contada a mano (77) se quedo como estaba ✓';
end $prueba$;
