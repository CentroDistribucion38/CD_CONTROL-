\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- REGISTRAR DÍAS ANTERIORES
--
-- Lo que se comprueba no es "¿deja registrar hacia atrás?" —eso ya lo
-- dejaba—, sino las tres cosas que estaban mal y no se veían: la hora
-- que mentía, la marca que no existía, y el futuro que entraba.
--
-- LAS FECHAS SON RELATIVAS A HOY, nunca literales. Una prueba con
-- «2026-09-25» escrito a mano pasa hoy y falla sola el mes entrante, y
-- entonces nadie sabe si lo que se rompió fue el código o el calendario.
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
  v_hora timestamptz; v_atras int; v_marca boolean;
begin
  -- 1. EL FUTURO NO ENTRA. Ni un día.
  begin
    perform public.traspaso_registrar(v_hoy + 1,'A','pet','ABC123','ag01','planta',1);
    v_falla := v_falla || ' 1(entro un viaje de manana)';
  exception when others then
    if sqlerrm not like '%todavía no ha pasado%' then
      v_falla := v_falla || ' 1(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 2. HOY SÍ, y sin marca: la hora es la de verdad.
  select id into v_id from public.traspaso_registrar(
    v_hoy,'B','pet','ABC123','ag01','planta',1);
  select hora, dias_atras, atrasado into v_hora, v_atras, v_marca
    from public.v_traspasos_viajes where id = v_id;
  if v_atras <> 0 then v_falla := v_falla || ' 2(dias_atras=' || v_atras || ')'; end if;
  if v_marca then v_falla := v_falla || ' 2b(marco atrasado un viaje de hoy)'; end if;
  if abs(extract(epoch from (now() - v_hora))) > 60 then
    v_falla := v_falla || ' 2c(la hora de hoy no es ahora)'; end if;

  -- 3. TRES DÍAS ATRÁS, TURNO B: la hora guardada es el arranque del
  --    turno de ESE día —14:00 en Barranquilla—, no el momento de
  --    digitarlo. Es la falla que motivó todo esto.
  select id into v_id from public.traspaso_registrar(
    v_hoy - 3,'B','pet','DEF456','ag01','planta',1);
  select hora, dias_atras, atrasado into v_hora, v_atras, v_marca
    from public.v_traspasos_viajes where id = v_id;
  if v_atras <> 3 then v_falla := v_falla || ' 3(dias_atras=' || v_atras || ')'; end if;
  if not v_marca then v_falla := v_falla || ' 3b(no quedo marcado)'; end if;
  if (v_hora at time zone 'America/Bogota') <> ((v_hoy - 3) + time '14:00') then
    v_falla := v_falla || ' 3c(hora=' || (v_hora at time zone 'America/Bogota') || ')'; end if;
  --    y sigue cayendo dentro de SU día, que es el punto.
  if (v_hora at time zone 'America/Bogota')::date <> v_hoy - 3 then
    v_falla := v_falla || ' 3d(la hora se salio del dia)'; end if;

  -- 4. TURNO C ATRASADO: 22:00, no 06:00.
  select id into v_id from public.traspaso_registrar(
    v_hoy - 3,'C','pet','GHI789','ag01','planta',1);
  if (select hora at time zone 'America/Bogota' from public.v_traspasos_viajes where id = v_id)
     <> ((v_hoy - 3) + time '22:00') then
    v_falla := v_falla || ' 4(el turno C no arranco a las 22:00)'; end if;

  -- 5. UN VACÍO ATRASADO también lleva la hora de su turno y su marca.
  --    El camino de los vacíos es otro insert distinto dentro de la
  --    misma función: es exactamente donde se olvida un cambio.
  select id into v_id from public.traspaso_registrar(
    v_hoy - 2,'A',null,null,null,null,2,true);
  select hora, atrasado into v_hora, v_marca
    from public.v_traspasos_viajes where id = v_id;
  if not v_marca then v_falla := v_falla || ' 5(vacio sin marca)'; end if;
  if (v_hora at time zone 'America/Bogota') <> ((v_hoy - 2) + time '06:00') then
    v_falla := v_falla || ' 5b(vacio con hora de digitacion)'; end if;

  -- 6. MÁS DE UN AÑO ATRÁS: al supervisor no. No es un permiso, es un
  --    error de dedo en el año.
  begin
    perform public.traspaso_registrar(v_hoy - 400,'A','pet','JKL012','ag01','planta',1);
    v_falla := v_falla || ' 6(el supervisor metio un viaje de hace 400 dias)';
  exception when others then
    if sqlerrm not like '%más de un año%' then
      v_falla := v_falla || ' 6(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'supervisor: 6 de 6';
end $$;


-- ===================== EL ADMINISTRADOR =====================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  v_id uuid; v_falla text := '';
  v_hoy date := public.traspaso_hoy();
begin
  -- 7. SIN TOPE HACIA ATRÁS. Si el administrador dice que la fecha es
  --    correcta, es correcta.
  select id into v_id from public.traspaso_registrar(
    v_hoy - 400,'A','pet','MNO345','ag01','planta',1);
  if (select dias_atras from public.v_traspasos_viajes where id = v_id) <> 400 then
    v_falla := v_falla || ' 7(dias_atras no dio 400)'; end if;

  -- 8. PERO EL FUTURO SIGUE CERRADO, también para él: no es cuestión de
  --    rango, es que un viaje que no ha salido no es un registro.
  begin
    perform public.traspaso_registrar(v_hoy + 30,'A','pet','PQR678','ag01','planta',1);
    v_falla := v_falla || ' 8(el admin registro el futuro)';
  exception when others then
    if sqlerrm not like '%todavía no ha pasado%' then
      v_falla := v_falla || ' 8(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'administrador: 2 de 2';
end $$;


-- ===================== LA ZONA HORARIA =====================
-- 9. LA TRAMPA DE UTC. Un viaje de hoy digitado a las 7 p. m. de
--    Barranquilla: para UTC ya es mañana. Si `atrasado` se calculara
--    con `registrado_en::date` a secas, ese viaje saldría marcado como
--    metido un día tarde sin serlo — y todos los turnos B y C tardíos
--    quedarían marcados en falso todos los días.
reset role;
do $$
declare v_id uuid; v_hoy date := public.traspaso_hoy(); v_falla text := '';
begin
  select id into v_id from public.traspasos_viajes
   where fecha = v_hoy order by registrado_en desc limit 1;

  update public.traspasos_viajes
     set registrado_en = ((v_hoy + time '19:00') at time zone 'America/Bogota')
   where id = v_id;

  if (select atrasado from public.v_traspasos_viajes where id = v_id) then
    v_falla := v_falla || ' 9(marco atrasado un viaje digitado a las 7pm del mismo dia)'; end if;

  --    Y al revés: a las 5 a. m. del día siguiente sí es tarde.
  update public.traspasos_viajes
     set registrado_en = (((v_hoy + 1) + time '05:00') at time zone 'America/Bogota')
   where id = v_id;
  if not (select atrasado from public.v_traspasos_viajes where id = v_id) then
    v_falla := v_falla || ' 9b(no marco uno digitado al otro dia)'; end if;
  if (select dias_atras from public.v_traspasos_viajes where id = v_id) <> 1 then
    v_falla := v_falla || ' 9c(dias_atras no dio 1)'; end if;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'zona horaria: 3 de 3';
end $$;
