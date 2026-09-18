\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL DOCUMENTO DEL VIAJE
--
-- Lo que se comprueba no es «¿guarda el documento?» —eso se ve mirando
-- la pantalla— sino las cinco cosas que solo se ven poniéndolas a
-- prueba:
--
--   · que el duplicado NO entre, ni siquiera disfrazado de guiones,
--   · que anular lo LIBERE de verdad,
--   · que corregir un viaje sin tocarle el documento no choque contra
--     sí mismo —el error que volvería «corregir la placa» imposible—,
--   · que pasar un viaje a vacío suelte su documento,
--   · y que la firma VIEJA de las dos funciones haya desaparecido: si
--     quedaran las dos, PostgREST escogería una y el documento se
--     mandaría a ninguna parte sin que nada avisara.
--
-- LAS FECHAS SON RELATIVAS A HOY, nunca literales.
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


-- ===================== LAS DOS FIRMAS =====================
-- Va primero y fuera de cualquier rol: si quedó la firma vieja, todo lo
-- demás de este archivo puede pasar y la pantalla seguir sin funcionar.
do $$
declare v_falla text := '';
begin
  if to_regprocedure('public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text)') is not null then
    v_falla := v_falla || ' A(quedo la firma vieja de registrar)'; end if;
  if to_regprocedure('public.traspaso_editar_viaje(uuid, date, text, text, text, text, text, integer, boolean, integer, text, text, text)') is not null then
    v_falla := v_falla || ' B(quedo la firma vieja de editar)'; end if;
  if to_regprocedure('public.traspaso_registrar(date, text, text, text, text, text, integer, boolean, integer, text, text, text)') is null then
    v_falla := v_falla || ' C(no esta la firma con documento)'; end if;

  if v_falla <> '' then raise exception 'FIRMAS:%', v_falla; end if;
  raise notice 'FIRMAS ok';
end $$;


-- ===================== EL SUPERVISOR REGISTRA =====================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare
  v_id uuid; v_id2 uuid; v_falla text := '';
  v_hoy date := public.traspaso_hoy();
  v_doc text; v_clave text; v_marca boolean; v_n int;
begin
  -- 1. UN VACÍO NO LLEVA DOCUMENTO Y ENTRA IGUAL. Y el segundo vacío
  --    también: si la clave generada guardara '' en vez de NULL, dos
  --    vacíos chocarían contra el índice único y el turno se trabaría
  --    al segundo. Por eso se prueban DOS.
  begin
    perform public.traspaso_registrar(v_hoy,'A',null,null,null,null,2,true);
    perform public.traspaso_registrar(v_hoy,'A',null,null,null,null,5,true);
  exception when others then
    v_falla := v_falla || ' 1(un vacio no pudo entrar: ' || sqlerrm || ')';
  end;

  -- 2. CON CARGA Y SIN DOCUMENTO: NO ENTRA.
  begin
    perform public.traspaso_registrar(v_hoy,'A','pet','ABC123','ag01','planta',1,
                                      false,null,null,null,null);
    v_falla := v_falla || ' 2(entro un viaje con carga sin documento)';
  exception when others then
    if sqlerrm not like '%documento%' then
      v_falla := v_falla || ' 2b(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 3. CON DOCUMENTO: ENTRA, y se guarda EN MAYÚSCULA tal como está en
  --    el papel —con su guion—, mientras la clave va pelada.
  select id into v_id from public.traspaso_registrar(
    v_hoy,'A','pet','ABC123','ag01','planta',1,false,null,null,null,'t-12345');
  select documento, documento_clave into v_doc, v_clave
    from public.traspasos_viajes where id = v_id;
  if v_doc <> 'T-12345' then
    v_falla := v_falla || ' 3(no lo guardo en mayuscula: ' || coalesce(v_doc,'null') || ')'; end if;
  if v_clave <> 'T12345' then
    v_falla := v_falla || ' 3b(la clave no quedo pelada: ' || coalesce(v_clave,'null') || ')'; end if;

  -- 4. EL MISMO, OTRA VEZ: no entra, y el mensaje dice CUÁL viaje lo
  --    tiene. Un «duplicate key value violates unique constraint» no
  --    le sirve a nadie de pie al lado de un camión.
  begin
    perform public.traspaso_registrar(
      v_hoy,'B','pet','DEF456','ag01','planta',1,false,null,null,null,'T-12345');
    v_falla := v_falla || ' 4(entro el documento repetido)';
  exception when others then
    if sqlerrm not like '%TR-%' then
      v_falla := v_falla || ' 4b(el mensaje no dice cual viaje: ' || sqlerrm || ')'; end if;
  end;

  -- 5. EL MISMO DISFRAZADO. Minúscula, espacios y sin guion: es el
  --    mismo papel y tampoco entra. Sin la clave normalizada, este pasa.
  begin
    perform public.traspaso_registrar(
      v_hoy,'B','pet','DEF456','ag01','planta',1,false,null,null,null,'  t 12 345 ');
    v_falla := v_falla || ' 5(entro el mismo documento escrito distinto)';
  exception when others then
    if sqlerrm not like '%TR-%' then
      v_falla := v_falla || ' 5b(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 6. OTRO DOCUMENTO SÍ ENTRA. La validación tiene que rechazar el
  --    repetido, no todo lo que venga detrás.
  select id into v_id2 from public.traspaso_registrar(
    v_hoy,'B','pet','DEF456','ag01','planta',1,false,null,null,null,'T-99999');
  if v_id2 is null then v_falla := v_falla || ' 6(no entro un documento nuevo)'; end if;

  -- 7. ANULAR LIBERA EL DOCUMENTO. Es la excepción que se pidió.
  perform public.traspaso_anular_viaje(v_id, 'se digito dos veces');
  begin
    select id into v_id from public.traspaso_registrar(
      v_hoy,'C','pet','ABC123','ag01','planta',1,false,null,null,null,'T-12345');
  exception when others then
    v_falla := v_falla || ' 7(anular no libero el documento: ' || sqlerrm || ')';
  end;

  -- 7b. Y QUEDAN LOS DOS: el anulado conserva su documento —el rastro
  --     no se borra— y el nuevo lo tiene también. Dos filas, un número.
  select count(*) into v_n from public.traspasos_viajes
   where documento_clave = 'T12345';
  if v_n <> 2 then
    v_falla := v_falla || ' 7b(el anulado perdio su documento: ' || v_n || ' filas)'; end if;

  -- 8. LA MARCA DE LO VIEJO. `sin_documento` es «con carga, registrado
  --    y sin documento». Un VACÍO nunca sale marcado: no le falta nada,
  --    es que no lleva.
  select count(*) into v_n from public.v_traspasos_viajes
   where vacio and sin_documento;
  if v_n <> 0 then
    v_falla := v_falla || ' 8(marco vacios como sin documento: ' || v_n || ')'; end if;

  -- 8b. Y un ANULADO sin documento tampoco: no hay nada que completar
  --     en un viaje que se declaró que no pasó.
  select count(*) into v_n from public.v_traspasos_viajes
   where estado = 'anulado' and sin_documento;
  if v_n <> 0 then
    v_falla := v_falla || ' 8b(marco anulados como sin documento: ' || v_n || ')'; end if;

  -- 8c. El viaje viejo sembrado antes de la migración SÍ sale marcado.
  select count(*) into v_n from public.v_traspasos_viajes where sin_documento;
  if v_n < 1 then
    v_falla := v_falla || ' 8c(no marco el viaje viejo sin documento)'; end if;

  if v_falla <> '' then raise exception 'REGISTRAR:%', v_falla; end if;
  raise notice 'REGISTRAR ok';
end $$;
reset role;


-- ===================== EL ADMINISTRADOR CORRIGE =====================
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  v_a uuid; v_b uuid; v_falla text := '';
  v_hoy date := public.traspaso_hoy();
  v_doc text; v_n int;
begin
  select id into v_a from public.traspaso_registrar(
    v_hoy,'A','pet','GHI789','ag01','planta',1,false,null,null,null,'ED-001');
  select id into v_b from public.traspaso_registrar(
    v_hoy,'A','pet','JKL012','ag01','planta',1,false,null,null,null,'ED-002');

  -- 9. CORREGIR SIN DOCUMENTO: no pasa. Es también la puerta por la que
  --    se completan los viajes de antes de esta migración.
  begin
    perform public.traspaso_editar_viaje(
      v_a, v_hoy, 'A', 'pet', 'GHI789', 'ag01', 'planta', 1, false,
      null, null, null, 'probando', null);
    v_falla := v_falla || ' 9(corrigio sin documento)';
  exception when others then
    if sqlerrm not like '%documento%' then
      v_falla := v_falla || ' 9b(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 10. CORREGIR LA PLACA DEJANDO EL MISMO DOCUMENTO. Este es el que
  --     importa: si la comprobación no excluyera el propio viaje,
  --     corregir cualquier cosa sería imposible para siempre.
  begin
    perform public.traspaso_editar_viaje(
      v_a, v_hoy, 'A', 'pet', 'GHI000', 'ag01', 'planta', 1, false,
      null, null, null, 'la placa estaba mala', 'ED-001');
  exception when others then
    v_falla := v_falla || ' 10(el viaje choco contra su propio documento: ' || sqlerrm || ')';
  end;

  -- 11. CORREGIR PONIENDO EL DOCUMENTO DE OTRO VIAJE REGISTRADO: no.
  begin
    perform public.traspaso_editar_viaje(
      v_a, v_hoy, 'A', 'pet', 'GHI000', 'ag01', 'planta', 1, false,
      null, null, null, null, 'ED-002');
    v_falla := v_falla || ' 11(le puso a un viaje el documento de otro)';
  exception when others then
    if sqlerrm not like '%TR-%' then
      v_falla := v_falla || ' 11b(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 12. PASARLO A VACÍO SUELTA EL DOCUMENTO. Un vacío que conserva el
  --     documento del viaje con carga que fue antes tiene ocupado un
  --     número que no lleva — y nadie podría volver a usarlo.
  perform public.traspaso_editar_viaje(
    v_b, v_hoy, 'A', null, null, null, null, 4, true,
    null, null, null, 'era un vacio', null);
  select documento into v_doc from public.traspasos_viajes where id = v_b;
  if v_doc is not null then
    v_falla := v_falla || ' 12(el vacio se quedo con el documento: ' || v_doc || ')'; end if;

  -- 12b. Y por eso ED-002 vuelve a estar libre.
  begin
    perform public.traspaso_registrar(
      v_hoy,'C','pet','MNO345','ag01','planta',1,false,null,null,null,'ED-002');
  exception when others then
    v_falla := v_falla || ' 12b(el documento del vacio no quedo libre: ' || sqlerrm || ')';
  end;

  if v_falla <> '' then raise exception 'CORREGIR:%', v_falla; end if;
  raise notice 'CORREGIR ok';
end $$;
reset role;


-- ===================== EL CANDADO DE VERDAD =====================
-- Las comprobaciones de arriba pasan por el `if` de la función. Este
-- bloque se salta el `if` y escribe DIRECTO en la tabla, que es lo que
-- haría el segundo supervisor si los dos llegaran en el mismo
-- microsegundo. Si el índice único no estuviera, esto entraría.
do $$
declare v_falla text := ''; v_n int;
begin
  begin
    insert into public.traspasos_viajes
      (codigo, fecha, turno, tipo, placa, documento, origen, destino, viajes, vacio, estado)
    values ('TR-CARRERA', public.traspaso_hoy(), 'A', 'pet', 'ZZZ999', 'T-99999',
            'ag01', 'planta', 1, false, 'registrado');
    v_falla := v_falla || ' 13(el indice no existe: entro un duplicado por debajo)';
  exception when unique_violation then
    null;  -- lo esperado
  end;

  -- 13b. …y el mismo número disfrazado tampoco, porque el índice va
  --      sobre la clave generada y no sobre el texto.
  begin
    insert into public.traspasos_viajes
      (codigo, fecha, turno, tipo, placa, documento, origen, destino, viajes, vacio, estado)
    values ('TR-CARRERA2', public.traspaso_hoy(), 'A', 'pet', 'ZZZ999', 't 99 999',
            'ag01', 'planta', 1, false, 'registrado');
    v_falla := v_falla || ' 13b(entro el mismo documento escrito distinto por debajo)';
  exception when unique_violation then
    null;
  end;

  -- 13c. LA CLAVE NO SE PUEDE DESAJUSTAR. Es generada: no hay forma de
  --      escribirla a mano ni de que quede distinta del documento.
  begin
    update public.traspasos_viajes set documento_clave = 'INVENTADO'
     where documento is not null;
    v_falla := v_falla || ' 13c(se pudo escribir la clave a mano)';
  exception when others then
    null;
  end;

  select count(*) into v_n from public.traspasos_viajes
   where documento is not null
     and documento_clave <> upper(regexp_replace(documento, '[^A-Za-z0-9]', '', 'g'));
  if v_n <> 0 then
    v_falla := v_falla || ' 13d(hay ' || v_n || ' claves que no corresponden a su documento)'; end if;

  if v_falla <> '' then raise exception 'CANDADO:%', v_falla; end if;
  raise notice 'CANDADO ok';
end $$;

do $$ begin raise notice 'DOCUMENTO: todo en orden'; end $$;
