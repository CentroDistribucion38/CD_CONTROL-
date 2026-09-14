\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.traspasos_tipos (clave, nombre, activo, orden) values
  ('pet','PET',true,1), ('casco','Casco vidrio',true,2)
on conflict (clave) do update set activo = true;
insert into public.traspasos_puntos (clave, nombre, activo, orden) values
  ('ag01','Ag01',true,1), ('planta','Planta',true,2), ('galapa','CD Galapa',true,3)
on conflict (clave) do update set activo = true;

-- ===================== EL SUPERVISOR =====================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_id uuid; v_falla text := '';
begin
  select id into v_id from public.traspaso_registrar(
    date '2026-09-25','A','pet','ABC 123','ag01','planta',1);

  -- 1. UN SUPERVISOR NO CORRIGE. Registra, anula lo suyo, pero no reescribe.
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-25','A','pet','XXX999','ag01','planta',1);
    v_falla := v_falla || ' 1(el supervisor pudo editar)';
  exception when others then
    if sqlerrm not like '%solo del administrador%' then
      v_falla := v_falla || ' 1(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 2. Y lo que registró sigue intacto.
  if (select placa from public.traspasos_viajes where id = v_id) <> 'ABC123' then
    v_falla := v_falla || ' 2(le cambiaron la placa)'; end if;
  if (select ediciones from public.traspasos_viajes where id = v_id) <> 0 then
    v_falla := v_falla || ' 2b(conto una edicion)'; end if;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'supervisor rechazado: 2 de 2';
end $$;

-- ===================== EL ADMINISTRADOR =====================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_id uuid; v_vac uuid; v_falla text := ''; v_j jsonb; n int;
begin
  select id into v_id from public.traspaso_registrar(
    date '2026-09-26','A','pet','ABC 123','ag01','planta',1,false,null,null,'la nota');

  -- 3. Corrige placa, tipo, ruta, turno, cantidad y fecha de un golpe.
  perform public.traspaso_editar_viaje(
    v_id, date '2026-09-27','B','casco','bhg-156','planta','galapa',3,false,null,null,null,
    'se digito la placa del otro camion');
  select to_jsonb(v) into v_j from public.traspasos_viajes v where v.id = v_id;
  if v_j->>'placa'   <> 'BHG156'     then v_falla := v_falla || ' 3(placa)'; end if;
  if v_j->>'tipo'    <> 'casco'      then v_falla := v_falla || ' 3(tipo)'; end if;
  if v_j->>'origen'  <> 'planta'     then v_falla := v_falla || ' 3(origen)'; end if;
  if v_j->>'destino' <> 'galapa'     then v_falla := v_falla || ' 3(destino)'; end if;
  if v_j->>'turno'   <> 'B'          then v_falla := v_falla || ' 3(turno)'; end if;
  if (v_j->>'viajes')::int <> 3      then v_falla := v_falla || ' 3(viajes)'; end if;
  if v_j->>'fecha'   <> '2026-09-27' then v_falla := v_falla || ' 3(fecha)'; end if;
  if v_j->>'nota'    is not null     then v_falla := v_falla || ' 3(la nota no se limpio)'; end if;
  if (v_j->>'ediciones')::int <> 1   then v_falla := v_falla || ' 3(ediciones)'; end if;

  -- 4. EL CÓDIGO NO CAMBIA NUNCA: es el nombre del viaje.
  if v_j->>'codigo' is null or v_j->>'codigo' not like 'TR-%' then
    v_falla := v_falla || ' 4(codigo)'; end if;

  -- 5. QUEDA EL RASTRO, con el antes de verdad.
  select count(*) into n from public.traspasos_viajes_ediciones where viaje = v_id;
  if n <> 1 then v_falla := v_falla || ' 5(rastros=' || n || ')'; end if;
  if (select antes->>'placa' from public.traspasos_viajes_ediciones where viaje = v_id)
     <> 'ABC123' then v_falla := v_falla || ' 5b(el antes no es el antes)'; end if;
  if (select despues->>'placa' from public.traspasos_viajes_ediciones where viaje = v_id)
     <> 'BHG156' then v_falla := v_falla || ' 5c(el despues no es el despues)'; end if;
  if (select motivo from public.traspasos_viajes_ediciones where viaje = v_id) is null then
    v_falla := v_falla || ' 5d(se perdio el motivo)'; end if;

  -- 6. Las mismas reglas que al registrar: ni origen = destino,
  --    ni un tipo apagado, ni turno inventado, ni cero viajes.
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','casco','BHG156','ag01','ag01',1);
    v_falla := v_falla || ' 6(dejo salir y llegar al mismo sitio)';
  exception when others then
    if sqlerrm not like '%mismo sitio%' then v_falla := v_falla || ' 6(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','Z','casco','BHG156','ag01','planta',1);
    v_falla := v_falla || ' 6b(acepto turno Z)';
  exception when others then
    if sqlerrm not like '%A, B o C%' then v_falla := v_falla || ' 6b(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','noexiste','BHG156','ag01','planta',1);
    v_falla := v_falla || ' 6c(acepto un tipo inventado)';
  exception when others then
    if sqlerrm not like '%no existe o está desactivado%' then v_falla := v_falla || ' 6c(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','casco','BHG156','ag01','planta',0);
    v_falla := v_falla || ' 6d(acepto cero viajes)';
  exception when others then
    if sqlerrm not like '%al menos un viaje%' then v_falla := v_falla || ' 6d(' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','casco','','ag01','planta',1);
    v_falla := v_falla || ' 6e(acepto sin placa)';
  exception when others then
    if sqlerrm not like '%placa del vehículo%' then v_falla := v_falla || ' 6e(' || sqlerrm || ')'; end if;
  end;

  -- 7. NINGÚN INTENTO FALLIDO DEJA RASTRO NI CUENTA COMO EDICIÓN.
  select count(*) into n from public.traspasos_viajes_ediciones where viaje = v_id;
  if n <> 1 then v_falla := v_falla || ' 7(los fallidos dejaron rastro: ' || n || ')'; end if;
  if (select ediciones from public.traspasos_viajes where id = v_id) <> 1 then
    v_falla := v_falla || ' 7b(los fallidos contaron)'; end if;

  -- 8. Pasarlo a VACÍO limpia tipo, placa y ruta: un vacío no mueve nada.
  perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B',null,null,null,null,2,true);
  select to_jsonb(v) into v_j from public.traspasos_viajes v where v.id = v_id;
  if not (v_j->>'vacio')::boolean then v_falla := v_falla || ' 8(no quedo vacio)'; end if;
  if v_j->>'tipo' is not null or v_j->>'placa' is not null
     or v_j->>'origen' is not null or v_j->>'destino' is not null then
    v_falla := v_falla || ' 8b(se quedo con datos del viaje con carga)'; end if;

  -- 9. Y de vuelta a con carga, pidiendo lo que un viaje con carga necesita.
  perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','pet','ABC123','ag01','planta',1,false);
  if (select vacio from public.traspasos_viajes where id = v_id) then
    v_falla := v_falla || ' 9(siguio vacio)'; end if;

  -- 10. UN VIAJE ANULADO NO SE EDITA.
  perform public.traspaso_anular_viaje(v_id, 'prueba');
  begin
    perform public.traspaso_editar_viaje(v_id, date '2026-09-27','B','pet','ABC123','ag01','planta',1);
    v_falla := v_falla || ' 10(edito un anulado)';
  exception when others then
    if sqlerrm not like '%está anulado%' then v_falla := v_falla || ' 10(' || sqlerrm || ')'; end if;
  end;

  -- 11. Un viaje que no existe se dice claro.
  begin
    perform public.traspaso_editar_viaje(gen_random_uuid(), date '2026-09-27','B','pet','ABC123','ag01','planta',1);
    v_falla := v_falla || ' 11(edito la nada)';
  exception when others then
    if sqlerrm not like '%no existe%' then v_falla := v_falla || ' 11(' || sqlerrm || ')'; end if;
  end;

  -- 12. EL CUMPLIDO DEL TURNO SIGUE A LA CORRECCIÓN. Es el punto de todo
  --     esto: corregir el turno tiene que mover el número del turno.
  declare v2 uuid; v_c0 int; v_a0 int; v_c1 int; v_a1 int;
  begin
    /* Se mide el ANTES y el DESPUÉS, no un número absoluto: si no, la
       prueba solo pasa la primera vez que se corre. */
    select coalesce(sum(c.cumplido),0) into v_c0 from public.v_traspasos_control c
      where c.fecha = date '2026-09-28' and c.turno = 'C';
    select coalesce(sum(c.cumplido),0) into v_a0 from public.v_traspasos_control c
      where c.fecha = date '2026-09-28' and c.turno = 'A';

    select id into v2 from public.traspaso_registrar(
      date '2026-09-28','A','pet','ABC123','ag01','planta',1);
    perform public.traspaso_editar_viaje(v2, date '2026-09-28','C','pet','ABC123','ag01','planta',1);

    select coalesce(sum(c.cumplido),0) into v_c1 from public.v_traspasos_control c
      where c.fecha = date '2026-09-28' and c.turno = 'C';
    select coalesce(sum(c.cumplido),0) into v_a1 from public.v_traspasos_control c
      where c.fecha = date '2026-09-28' and c.turno = 'A';
    if v_c1 - v_c0 <> 1 then
      v_falla := v_falla || ' 12(el turno C no subio: ' || (v_c1 - v_c0) || ')'; end if;
    if v_a1 <> v_a0 then
      v_falla := v_falla || ' 12b(el turno A no solto el viaje)'; end if;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'administrador: 12 de 12';
end $$;

reset role;
reset request.jwt.claim.sub;
