\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- ROTURAS EN SITIO · ÁREA, CAUSAS Y EER SIN MATERIAL
--
-- Lo que se comprueba son las tres cosas que se pidieron, y sobre todo
-- LAS QUE SE PUEDEN ROMPER AL HACERLAS:
--   · que el EER entre mandando solo el color, y guarde el material
--     que le toca —no uno cualquiera—;
--   · que el área sea obligatoria de verdad, y que una inventada no
--     entre;
--   · que las causas viejas ya no se puedan usar, pero que lo
--     registrado con ellas se siga leyendo;
--   · que el producto terminado no haya cambiado de comportamiento.
-- =====================================================================

/* EL ADMINISTRADOR VA PRIMERO. La base no deja quedarse sin nadie que
   mande, así que crear solo al supervisor la hace rebotar. */
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = 'supervisor', activo = true;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;

do $$
declare
  v_id uuid; v_falla text := '';
  v_mat text; v_tipo text; v_color text; v_area text; v_an text;
  v_foto boolean; v_uni int; v_bot int;
begin
  -- 1. EER MANDANDO SOLO EL COLOR. Es lo que hace la pantalla ahora.
  select id, exige_foto into v_id, v_foto from public.rotura_registrar(
    p_unidades => 15, p_proceso => 'lineas', p_causa => 'estibas_malas',
    p_area => 'plazoleta', p_color => 'ambar');
  if v_id is null then v_falla := v_falla || ' 1(no entro el EER sin material)'; end if;

  -- 2. Y GUARDÓ EL MATERIAL QUE LE TOCA, no uno cualquiera.
  select material, tipo, color, area, area_nombre, unidades, botellas
    into v_mat, v_tipo, v_color, v_area, v_an, v_uni, v_bot
    from public.v_roturas where id = v_id;
  if v_mat <> 'EER-AMBAR' then v_falla := v_falla || ' 2(material=' || v_mat || ')'; end if;
  if v_tipo <> 'eer' then v_falla := v_falla || ' 2b(tipo=' || v_tipo || ')'; end if;
  if v_color <> 'ambar' then v_falla := v_falla || ' 2c(color=' || v_color || ')'; end if;
  if v_uni <> 15 then v_falla := v_falla || ' 2d(unidades=' || v_uni || ')'; end if;
  if v_bot is not null then v_falla := v_falla || ' 2e(al EER le pusieron botellas)'; end if;
  if v_area <> 'plazoleta' then v_falla := v_falla || ' 2f(area=' || coalesce(v_area,'null') || ')'; end if;
  if v_an <> 'Plazoleta' then v_falla := v_falla || ' 2g(area_nombre=' || coalesce(v_an,'null') || ')'; end if;
  -- Y una causa asumida no pide foto.
  if v_foto then v_falla := v_falla || ' 2h(una causa asumida pidio foto)'; end if;

  -- 3. EL OTRO COLOR DA EL OTRO MATERIAL. Si la traducción estuviera
  --    al revés nadie lo notaría hasta el informe del mes.
  select id into v_id from public.rotura_registrar(
    p_unidades => 2, p_proceso => 'lineas', p_causa => 'estibas_malas',
    p_area => 'calle_c', p_color => 'green');
  select material into v_mat from public.v_roturas where id = v_id;
  if v_mat <> 'EER-GREEN' then v_falla := v_falla || ' 3(green dio ' || v_mat || ')'; end if;

  -- 4. SIN ÁREA NO ENTRA.
  begin
    perform public.rotura_registrar(
      p_unidades => 1, p_proceso => 'lineas', p_causa => 'estibas_malas',
      p_color => 'ambar');
    v_falla := v_falla || ' 4(entro sin area)';
  exception when others then
    if sqlerrm not like '%en qué área%' then
      v_falla := v_falla || ' 4(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 5. CON UN ÁREA INVENTADA, TAMPOCO.
  begin
    perform public.rotura_registrar(
      p_unidades => 1, p_proceso => 'lineas', p_causa => 'estibas_malas',
      p_area => 'la_esquina', p_color => 'ambar');
    v_falla := v_falla || ' 5(entro un area inventada)';
  exception when others then
    if sqlerrm not like '%área no existe%' then
      v_falla := v_falla || ' 5(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 6. LAS CAUSAS VIEJAS YA NO SE USAN.
  begin
    perform public.rotura_registrar(
      p_unidades => 1, p_proceso => 'lineas', p_causa => 'mal_estibado',
      p_area => 'sorting', p_color => 'ambar');
    v_falla := v_falla || ' 6(entro una causa vieja)';
  exception when others then
    if sqlerrm not like '%causa no existe o está desactivada%' then
      v_falla := v_falla || ' 6(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 7. LA NO ASUMIDA PIDE FOTO, y son las dos que se dijeron.
  select id, exige_foto into v_id, v_foto from public.rotura_registrar(
    p_unidades => 3, p_proceso => 'lineas', p_causa => 'falla_depa',
    p_area => 'estanteria', p_color => 'flint');
  if not v_foto then v_falla := v_falla || ' 7(falla_depa no pidio foto)'; end if;
  if (select grupo from public.v_roturas where id = v_id) <> 'no_asumida' then
    v_falla := v_falla || ' 7b(falla_depa no quedo como no asumida)'; end if;

  -- 8. EL PRODUCTO TERMINADO SIGUE IGUAL: material de verdad, y las
  --    botellas de adentro propuestas solas.
  select id into v_id from public.rotura_registrar(
    p_material => 'PT-COST-330', p_unidades => 2, p_contaminadas => 1,
    p_proceso => 'lineas', p_causa => 'comportamiento', p_area => 'maquila');
  select tipo, unidades, botellas into v_tipo, v_uni, v_bot
    from public.v_roturas where id = v_id;
  if v_tipo <> 'producto_terminado' then v_falla := v_falla || ' 8(tipo=' || v_tipo || ')'; end if;
  if v_bot <> 60 then v_falla := v_falla || ' 8b(botellas=' || coalesce(v_bot::text,'null') || ' y debian ser 60)'; end if;

  if v_falla = '' then
    raise notice 'EN SITIO: bien. El EER entra con solo el color y guarda el material que le toca; el area es obligatoria; las causas viejas ya no entran; el PT no cambio.';
  else
    raise exception 'EN SITIO FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------
-- LO VIEJO SE SIGUE LEYENDO. Una rotura con una causa ya apagada y sin
-- área tiene que seguir saliendo en la pantalla: si el join del área
-- fuera normal en vez de LEFT, desaparecería, y nadie se enteraría
-- hasta que alguien preguntara por el informe del mes pasado.
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  insert into public.roturas
    (codigo, material, tipo, color, unidades, proceso, causa, grupo, estado)
  values
    ('RB-VIEJA', 'EER-AMBAR', 'eer', 'ambar', 9, 'lineas', 'mal_estibado',
     'asumida', 'cuenta')
  on conflict (codigo) do nothing;

  select count(*) into v_n from public.v_roturas where codigo = 'RB-VIEJA';
  if v_n <> 1 then
    raise exception 'La rotura vieja (causa apagada, sin area) desaparecio de v_roturas';
  end if;
  if (select causa_nombre from public.v_roturas where codigo = 'RB-VIEJA') is null then
    raise exception 'La rotura vieja perdio el nombre de su causa';
  end if;
  if (select area_nombre from public.v_roturas where codigo = 'RB-VIEJA') is not null then
    raise exception 'A la rotura vieja le inventaron un area';
  end if;
  raise notice 'LO VIEJO: bien. Sigue en la lista, con el nombre de su causa apagada y sin area inventada.';
end $$;

-- ---------------------------------------------------------------------
-- Y EL MAESTRO SABE CUÁNTAS VECES SE USÓ CADA ÁREA: es lo que decide
-- si sale el botón de borrar.
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  select usos into v_n from public.v_roturas_uso
   where tipo = 'area' and clave = 'plazoleta';
  if coalesce(v_n, 0) < 1 then
    raise exception 'v_roturas_uso no esta contando las areas';
  end if;
  raise notice 'MAESTRO: bien. El uso de las areas se cuenta como el de las causas.';
end $$;
