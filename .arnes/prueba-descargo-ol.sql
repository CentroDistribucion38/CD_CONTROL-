\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL DESCARGO DEL OPERADOR LOGÍSTICO
--
-- «Que al operador logístico le llegue esa notificación y conteste si
--  está de acuerdo con ese cobro o no, y adjunte evidencia, con el fin
--  de ir conciliando.»
--
-- LO QUE PUEDE ROMPERSE al meter un tercero en una cadena que hasta hoy
-- la cerraba quien cobra:
--
--  1. LA FOTO DEL DESCARGO CUMPLE EL REQUISITO DE COBRAR. `exige_foto`
--     existe «porque es la que sostiene que la rotura no fue del OL».
--     Si la foto que sube el OL para defenderse contara para eso, el
--     acusado estaría firmando la prueba en su contra. Es el error más
--     fácil de cometer aquí y el más difícil de ver.
--  2. Objetar sin decir por qué, o sin evidencia.
--  3. Responder después de vencido. Si la vista lo da por aceptado y la
--     función lo deja responder, la verdad depende de por dónde se mire.
--  4. Que una rotura en disputa siga sumando en «se cobra».
--  5. Que la misma persona cobre y responda. Son dos empresas.
--  6. Que el OL resuelva su propia disputa.
--  7. Que anular deje el cobro colgado — y de paso rompa el check.
--  8. Que las cifras se solapen o no sumen.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA ENVUELTO EN `begin/exception`, HASTA LO QUE DEBE
-- FUNCIONAR
-- ---------------------------------------------------------------------
-- La primera versión de este arnés solo protegía lo que debía fallar.
-- Al romper una guarda a propósito, la prueba pasaba el paso roto y
-- REVENTABA DOS LÍNEAS DESPUÉS con «esa rotura ya fue respondida» —un
-- error cierto, pero que no dice nada— y el resumen nunca se imprimía.
-- Un arnés que se muere antes de hablar no distingue «lo rompí yo» de
-- «se rompió el arnés». Ahora toda llamada queda registrada: la que
-- debe fallar y no falla, y la que debe pasar y no pasa.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('a1111111-0000-0000-0000-000000000001','abi@cdcontrol.local'),
  ('01111111-0000-0000-0000-000000000002','ol@cdcontrol.local'),
  ('51111111-0000-0000-0000-000000000003','sitio@cdcontrol.local')
on conflict do nothing;

insert into public.roles (clave, nombre, descripcion, orden) values
  ('abi','ABI','Da el visto bueno de las roturas.', 20),
  ('ol', 'Operador logístico','Responde los cobros de roturas.', 21)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('abi','/roturas/en-sitio/visto-bueno','editar'),
  ('ol', '/roturas/en-sitio/descargo',   'editar'),
  ('ol', '/roturas/en-sitio',            'editar')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('a1111111-0000-0000-0000-000000000001','abi','Quien cobra','abi',true),
  ('01111111-0000-0000-0000-000000000002','ol','Operador logistico','ol',true),
  ('51111111-0000-0000-0000-000000000003','sitio','Quien registra','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  v_falla text := '';
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid;
  v_txt text; v_b boolean; v_b2 boolean; v_n int; v_int int;
  ABI  constant text := 'a1111111-0000-0000-0000-000000000001';
  OL   constant text := '01111111-0000-0000-0000-000000000002';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SITIO constant text := '51111111-0000-0000-0000-000000000003';
begin
  perform set_config('request.jwt.claim.sub', OL, true);
  select id into r1 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_descripcion => 'una', p_area => 'traspasos');
  select id into r2 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_descripcion => 'dos', p_area => 'traspasos');
  select id into r3 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_descripcion => 'tres', p_area => 'traspasos');
  select id into r4 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_descripcion => 'cuatro', p_area => 'traspasos');
  select id into r5 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_descripcion => 'cinco', p_area => 'traspasos');
  select id into r6 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'falla_maquinas', p_descripcion => 'seis', p_area => 'traspasos');

  -- ================================================================
  -- 1. LA FOTO DEL DESCARGO NO SIRVE PARA COBRAR
  -- ================================================================
  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r6, 'x/descargo.jpg', 'descargo');

  perform set_config('request.jwt.claim.sub', ABI, true);
  begin
    perform public.rotura_visto_bueno(r6, true, null);
    v_falla := v_falla || ' 1(una foto de DESCARGO dejo cobrar una causa que exige foto)';
  exception when others then
    if position('exige foto' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r6, 'x/rotura.jpg', 'rotura');
  begin
    perform public.rotura_visto_bueno(r6, true, null);
  exception when others then
    v_falla := v_falla || ' 1b(con la foto de la ROTURA tampoco dejo cobrar: ' || sqlerrm || ')';
  end;

  select fotos, descargo_fotos into v_n, v_int from public.v_roturas where id = r6;
  if v_n <> 1 or v_int <> 1 then
    v_falla := v_falla || format(' 1c(la vista cuenta fotos=%s descargo=%s y deben ser 1 y 1)', v_n, v_int);
  end if;

  -- ================================================================
  -- 2. EL VISTO BUENO ABRE EL PLAZO
  -- ================================================================
  begin
    perform public.rotura_visto_bueno(r1, true, null);
    perform public.rotura_visto_bueno(r2, true, null);
    perform public.rotura_visto_bueno(r3, true, null);
    perform public.rotura_visto_bueno(r5, false, 'no es del OL');
  exception when others then
    v_falla := v_falla || ' 2(el visto bueno normal dejo de funcionar: ' || sqlerrm || ')';
  end;

  /* r4 LA DECIDE EL ADMINISTRADOR, que tiene los dos permisos: es el
     único que puede intentar cerrar solo una conciliación entre dos
     empresas, así que es con él con quien hay que probarlo. */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  begin
    perform public.rotura_visto_bueno(r4, true, null);
  exception when others then
    v_falla := v_falla || ' 2b(el administrador no pudo dar visto bueno: ' || sqlerrm || ')';
  end;

  select cobro, cobro_vence_en is not null into v_txt, v_b
    from public.v_roturas where id = r1;
  if v_txt is distinct from 'por_responder' or not v_b then
    v_falla := v_falla || format(' 2c(cobrar no abrio el plazo: cobro=%s conFecha=%s)', v_txt, v_b);
  end if;

  select cobro into v_txt from public.v_roturas where id = r5;
  if v_txt is not null then
    v_falla := v_falla || format(' 2d(lo que NO se cobra quedo con cobro=%s y no debe tener)', v_txt);
  end if;

  -- ================================================================
  -- 3. QUIEN COBRA NO SE RESPONDE A SÍ MISMO
  -- ================================================================
  -- Sigue puesto el administrador, que decidió r4 y SÍ tiene el permiso
  -- de descargo. Si fallara por permisos, esta prueba no probaría nada.
  if not public.rotura_puede('descargo') then
    v_falla := v_falla || ' 3(el administrador no tiene el permiso: la prueba 3 no prueba nada)';
  end if;
  begin
    perform public.rotura_responder(r4, true, null);
    v_falla := v_falla || ' 3(quien dio el visto bueno pudo responder su propio cobro)';
  exception when others then
    if position('las dos partes' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 4. SIN EL PERMISO NO SE RESPONDE
  -- ================================================================
  perform set_config('request.jwt.claim.sub', SITIO, true);
  begin
    perform public.rotura_responder(r1, true, null);
    v_falla := v_falla || ' 4(respondio alguien sin el permiso de descargo)';
  exception when others then
    if position('operador logístico' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 5. OBJETAR SIN NOTA, Y SIN EVIDENCIA
  -- ================================================================
  perform set_config('request.jwt.claim.sub', OL, true);
  begin
    perform public.rotura_responder(r2, false, null);
    v_falla := v_falla || ' 5(objeto sin decir por que)';
  exception when others then
    if position('por qué' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  begin
    perform public.rotura_responder(r2, false, 'el camion llego asi de planta');
    v_falla := v_falla || ' 5b(objeto sin adjuntar evidencia)';
    /* Si pasó, r2 quedó en disputa y los pasos de abajo ya no prueban
       lo suyo. Se deshace para que cada prueba siga midiendo una cosa. */
    update public.roturas set cobro = 'por_responder', respondida_por = null,
           respondida_en = null, respuesta_nota = null where id = r2;
  exception when others then
    if position('evidencia' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5b(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r2, 'x/remesa.jpg', 'descargo');
  begin
    perform public.rotura_responder(r2, false, 'el camion llego asi de planta');
  exception when others then
    v_falla := v_falla || ' 5c(con nota Y evidencia tampoco dejo objetar: ' || sqlerrm || ')';
  end;

  select cobro_efectivo into v_txt from public.v_roturas where id = r2;
  if v_txt is distinct from 'en_disputa' then
    v_falla := v_falla || format(' 5d(objetada con evidencia quedo en %s)', v_txt);
  end if;

  begin
    perform public.rotura_responder(r1, true, null);
  exception when others then
    v_falla := v_falla || ' 5e(estar de acuerdo no deberia pedir nada: ' || sqlerrm || ')';
  end;
  select cobro_efectivo into v_txt from public.v_roturas where id = r1;
  if v_txt is distinct from 'aceptado' then
    v_falla := v_falla || format(' 5f(aceptar dejo la rotura en %s)', v_txt);
  end if;

  -- ================================================================
  -- 6. UNA DISPUTA NO SUMA EN «SE COBRA»
  -- ================================================================
  select se_cobra, en_disputa into v_b, v_b2 from public.v_roturas where id = r2;
  if v_b then v_falla := v_falla || ' 6(una rotura en disputa esta sumando en se_cobra)'; end if;
  if not v_b2 then v_falla := v_falla || ' 6b(la disputa no aparece como disputa)'; end if;

  -- ================================================================
  -- 7. EL PLAZO SE MIDE AL LEER, Y LA FUNCIÓN LO RESPETA
  -- ================================================================
  -- r3 se queda sin responder y se le vence el plazo a mano. SE LE PONE
  -- EVIDENCIA ANTES: si no, quitar la guarda del plazo haría fallar la
  -- prueba por falta de foto y parecería que la guarda sigue puesta.
  insert into public.roturas_fotos (rotura_id, ruta, papel) values (r3, 'x/tarde.jpg', 'descargo');
  set role postgres;
  update public.roturas set cobro_vence_en = now() - interval '1 hour' where id = r3;
  set role probador;

  select cobro_efectivo, vencido into v_txt, v_b from public.v_roturas where id = r3;
  if v_txt is distinct from 'aceptado' or not v_b then
    v_falla := v_falla || format(' 7(vencida: la vista dice %s vencido=%s y debe decir aceptado/true)', v_txt, v_b);
  end if;
  select cobro into v_txt from public.v_roturas where id = r3;
  if v_txt is distinct from 'por_responder' then
    v_falla := v_falla || ' 7b(la fila se escribio sola: el vencimiento debe medirse al leer)';
  end if;
  if (select se_cobra from public.v_roturas where id = r3) is not true then
    v_falla := v_falla || ' 7c(una vencida no esta contando como cobrada)';
  end if;

  begin
    perform public.rotura_responder(r3, false, 'a destiempo');
    v_falla := v_falla || ' 7d(respondio una rotura ya vencida)';
    update public.roturas set cobro = 'por_responder', respondida_por = null,
           respondida_en = null, respuesta_nota = null where id = r3;
  exception when others then
    if position('venció el plazo' in sqlerrm) = 0 then
      v_falla := v_falla || ' 7d(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 8. LA DISPUTA LA RESUELVE ABI, NO EL OL
  -- ================================================================
  begin
    perform public.rotura_resolver(r2, true, 'porque si');
    v_falla := v_falla || ' 8(el OL resolvio su propia disputa)';
    update public.roturas set cobro = 'en_disputa', resuelta_por = null,
           resuelta_en = null, resolucion_nota = null where id = r2;
  exception when others then
    if position('es de ABI' in sqlerrm) = 0 then
      v_falla := v_falla || ' 8(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform set_config('request.jwt.claim.sub', ABI, true);
  begin
    perform public.rotura_resolver(r2, true, '   ');
    v_falla := v_falla || ' 8b(resolvio un pleito sin decir en que se basa)';
    update public.roturas set cobro = 'en_disputa', resuelta_por = null,
           resuelta_en = null, resolucion_nota = null where id = r2;
  exception when others then
    if position('en qué se basa' in sqlerrm) = 0 then
      v_falla := v_falla || ' 8b(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  begin
    perform public.rotura_resolver(r2, true, 'la remesa no dice nada de rotura al recibir');
  exception when others then
    v_falla := v_falla || ' 8c(ABI no pudo sostener su propio cobro: ' || sqlerrm || ')';
  end;
  select cobro_efectivo, se_cobra into v_txt, v_b from public.v_roturas where id = r2;
  if v_txt is distinct from 'sostenido' or not v_b then
    v_falla := v_falla || format(' 8d(sostenida quedo en %s y se_cobra=%s)', v_txt, v_b);
  end if;

  -- Y retirar deja de cobrar. r4 la decidió el administrador, así que el
  -- OL sí puede responderla.
  perform set_config('request.jwt.claim.sub', OL, true);
  insert into public.roturas_fotos (rotura_id, ruta, papel) values (r4, 'x/foto4.jpg', 'descargo');
  begin
    perform public.rotura_responder(r4, false, 'esa estiba no la movimos nosotros');
  exception when others then
    v_falla := v_falla || ' 8e(el OL no pudo objetar r4: ' || sqlerrm || ')';
  end;
  perform set_config('request.jwt.claim.sub', ABI, true);
  begin
    perform public.rotura_resolver(r4, false, 'tiene razon, fue la linea');
  exception when others then
    v_falla := v_falla || ' 8f(ABI no pudo retirar el cobro: ' || sqlerrm || ')';
  end;
  select cobro_efectivo, se_cobra, retirado into v_txt, v_b, v_b2
    from public.v_roturas where id = r4;
  if v_txt is distinct from 'retirado' or v_b or not v_b2 then
    v_falla := v_falla || format(' 8g(retirada quedo en %s se_cobra=%s retirado=%s)', v_txt, v_b, v_b2);
  end if;

  -- ================================================================
  -- 9. ANULAR BORRA LA CONVERSACIÓN
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  begin
    perform public.rotura_anular(r6, 'se registro dos veces');
  exception when others then
    v_falla := v_falla || ' 9(no dejo anular una rotura cobrada: ' || sqlerrm || ')';
  end;
  select cobro into v_txt from public.v_roturas where id = r6;
  if v_txt is not null then
    v_falla := v_falla || format(' 9b(anulada quedo con cobro=%s)', v_txt);
  end if;

  -- ================================================================
  -- 10. LAS CIFRAS SUMAN Y NO SE SOLAPAN
  -- ================================================================
  select count(*) into v_n from public.v_roturas where cuenta;
  select count(*) into v_int from public.v_roturas
   where se_cobra or en_disputa or por_responder or retirado;
  if v_n <> v_int then
    v_falla := v_falla || format(' 10(cobradas=%s clasificadas=%s)', v_n, v_int);
  end if;
  select count(*) into v_n from public.v_roturas
   where (se_cobra::int + en_disputa::int + por_responder::int + retirado::int) > 1;
  if v_n > 0 then v_falla := v_falla || format(' 10b(%s caen en dos cifras a la vez)', v_n); end if;

  -- ================================================================
  -- 11. CONGELAR LO VENCIDO NO CAMBIA NINGUNA CIFRA
  -- ================================================================
  select count(*) into v_n from public.v_roturas where se_cobra;
  select public.roturas_vencer_plazos() into v_int;
  if v_int < 1 then v_falla := v_falla || ' 11(no congelo la vencida que habia)'; end if;
  select count(*) into v_int from public.v_roturas where se_cobra;
  if v_n <> v_int then
    v_falla := v_falla || format(' 11b(congelar movio las cobradas de %s a %s)', v_n, v_int);
  end if;
  select cobro, cobro_por_silencio into v_txt, v_b from public.v_roturas where id = r3;
  if v_txt is distinct from 'aceptado' or not v_b then
    v_falla := v_falla || format(' 11c(congelada quedo cobro=%s porSilencio=%s)', v_txt, v_b);
  end if;
  select public.roturas_vencer_plazos() into v_int;
  if v_int <> 0 then v_falla := v_falla || format(' 11d(congelar dos veces movio %s filas)', v_int); end if;

  set role postgres;
  if v_falla <> '' then
    raise exception 'FALLA:%', v_falla;
  end if;
  raise notice 'BIEN: la foto del descargo no sirve para cobrar; objetar exige nota Y evidencia;';
  raise notice 'BIEN: quien cobra no se responde solo y el OL no resuelve su disputa;';
  raise notice 'BIEN: el plazo se mide al leer y la funcion lo respeta; anular borra el cobro;';
  raise notice 'BIEN: la disputa no suma en cobrado, las cuatro cifras suman y no se solapan,';
  raise notice 'BIEN: y congelar lo vencido no mueve ninguna cifra ni hace nada la segunda vez.';
end $$;
