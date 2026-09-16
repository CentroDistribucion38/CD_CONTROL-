\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- LA REVISIÓN AI
--
-- SE PRUEBA CONTRA UNA FILA DE VERDAD del archivo «Registro Cobro AI
-- COL V02.xlsx» —8 de mayo de 2026, placa JYM 958, Logisinú, G175— y
-- no contra números inventados. Una prueba con recibidas=100 y un
-- defecto pasa siempre y no dice nada; esta fila tiene 82.080 botellas
-- recibidas, 4.104 revisadas y siete tipos de defecto distintos, que es
-- donde se ven los redondeos.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.sider_origenes (planta, cd_origen, activo) values ('BAQ','Barranquilla',true)
on conflict (planta) do update set activo = true;
insert into public.sider_skus (sku, descripcion, activo) values ('G175','Costeñita 175',true)
on conflict (sku) do update set activo = true;

-- Dos viajes: uno marcado para AI y otro no.
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha) values
  ('aaaaaaaa-0000-0000-0000-000000000001','JYM958','BAQ','G175',20,'2026-05-08'),
  ('aaaaaaaa-0000-0000-0000-000000000002','XXX111','BAQ','G175',20,'2026-05-08')
on conflict (id) do nothing;


-- ===================== QUIÉN PUEDE PEDIR LA REVISIÓN =====================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_falla text := '';
begin
  -- 1. UN SUPERVISOR NO PIDE REVISIONES. Cuesta media hora de muelle y
  --    termina en un cobro al socio.
  begin
    perform public.sider_ai_marcar('aaaaaaaa-0000-0000-0000-000000000001', true, 'prueba');
    v_falla := v_falla || ' 1(el supervisor pudo marcar)';
  exception when others then
    if sqlerrm not like '%solo del administrador%' then
      v_falla := v_falla || ' 1(error raro: ' || sqlerrm || ')'; end if;
  end;
  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'supervisor rechazado: 1 de 1';
end $$;

-- 1b. Y QUIEN NO TIENE PERFIL TAMPOCO. Es el hueco del `mi_rol() <>
--     'admin'` sin coalesce: null <> 'admin' no es cierto ni falso, así
--     que el if no entra y la función sigue de largo. Ya pasó una vez
--     en este proyecto con las firmas de rotura.
reset role;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set role probador;
do $$
begin
  begin
    perform public.sider_ai_marcar('aaaaaaaa-0000-0000-0000-000000000001', true, null);
    raise exception 'FALLÓ: un usuario sin perfil pudo pedir una revisión AI';
  exception when others then
    if sqlerrm like '%sin perfil%' then raise; end if;
    if sqlerrm not like '%solo del administrador%' then
      raise exception 'FALLÓ: error raro para el usuario sin perfil: %', sqlerrm; end if;
  end;
  raise warning 'sin perfil rechazado: 1 de 1';
end $$;


-- ===================== EL ADMINISTRADOR MARCA =====================
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_falla text := '';
begin
  perform public.sider_ai_marcar('aaaaaaaa-0000-0000-0000-000000000001', true,
                                 'El socio viene con reclamos hace tres semanas');

  -- 3. AÚN NO HA LLEGADO: no hay camión que revisar.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
      'T1','socios','logisinu_s_a_s_zomac','G175', true, 82080, 4104, '{"rota":4}'::jsonb);
    v_falla := v_falla || ' 3(revisó un camión que no ha llegado)';
  exception when others then
    if sqlerrm not like '%llegada%' then
      v_falla := v_falla || ' 3(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'marcar: 2 de 2';
end $$;

-- Que la marca haya quedado se comprueba fuera del rol de prueba:
-- sider_viajes tiene su propio RLS y esto es una prueba del módulo AI,
-- no de los permisos de Sider.
reset role;
do $$
declare v_falla text := '';
begin
  if not (select requiere_ai from public.sider_viajes
           where id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    v_falla := v_falla || ' 2(no quedó marcado)'; end if;
  if (select ai_pedido_por from public.sider_viajes
       where id = 'aaaaaaaa-0000-0000-0000-000000000001')
     <> '11111111-1111-1111-1111-111111111111' then
    v_falla := v_falla || ' 2b(no guardó quién lo pidió)'; end if;
  if (select ai_motivo from public.sider_viajes
       where id = 'aaaaaaaa-0000-0000-0000-000000000001') is null then
    v_falla := v_falla || ' 2c(no guardó el motivo)'; end if;
  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'la marca quedó: 3 de 3';
end $$;

-- Llega el camión.
insert into public.sider_certificaciones (viaje_id, punta, lat, lng)
values ('aaaaaaaa-0000-0000-0000-000000000001','llegada', 10.96, -74.79)
on conflict do nothing;


-- ===================== LA REVISIÓN, CON LA FILA DE VERDAD =====================
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  v_id uuid; v_falla text := ''; r record;
begin
  -- 4. EL VIAJE NO MARCADO NO SE PUEDE REVISAR.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000002',
      'T1','socios','logisinu_s_a_s_zomac','G175', true, 100, 10, '{"rota":1}'::jsonb);
    v_falla := v_falla || ' 4(revisó un viaje sin marcar)';
  exception when others then
    if sqlerrm not like '%no está marcado%' then
      v_falla := v_falla || ' 4(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 5. LA FILA DEL EXCEL, tal cual:
  --    82.080 recibidas · 4.104 revisadas
  --    rota 4 · cemento 5 · otras compañías 10 · extrasucio 7 · cristalizado 6
  --    y aparte: mezclado 2 · cajas malas 1
  v_id := public.sider_ai_guardar(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'T1','socios','logisinu_s_a_s_zomac','G175', true, 82080, 4104,
    '{"rota":4,"cemento":5,"otras_cias":10,"extrasucio":7,"cristalizado":6,
      "mezclado":2,"cajas_malas":1,"faltante":0,"hongo":0}'::jsonb,
    'ZCL3-001','la del 8 de mayo');

  select * into r from public.v_sider_ai where id = v_id;

  -- Las cifras del Excel para esa fila: «TOTAL BOTELLAS CON DEFECTOS» 32
  -- y Hl 0,056. Las dos tienen que salir iguales.
  if r.defectos <> 32 then v_falla := v_falla || ' 5(defectos=' || r.defectos || ', debía ser 32)'; end if;
  if r.otros    <> 3  then v_falla := v_falla || ' 5b(otros=' || r.otros || ', debía ser 3)'; end if;
  if r.hl_defectos <> 0.0560 then v_falla := v_falla || ' 5c(hl=' || r.hl_defectos || ', debía ser 0.056)'; end if;

  -- El índice, ahora calculado: 32 / 4104.
  if r.indice <> round(32::numeric/4104, 6) then
    v_falla := v_falla || ' 5d(indice=' || r.indice || ')'; end if;

  -- Y de ahí las dos cifras de plata, con las fórmulas del Excel que sí
  -- cuadraban en las 296 filas.
  if r.no_abono <> round(82080 * 32::numeric / 4104)::integer then
    v_falla := v_falla || ' 5e(no_abono=' || r.no_abono || ')'; end if;
  if r.abono_sap <> 82080 - r.no_abono then
    v_falla := v_falla || ' 5f(abono_sap no cierra)'; end if;
  if r.no_abono + r.abono_sap <> r.recibidas then
    v_falla := v_falla || ' 5g(no abono + abono <> recibidas)'; end if;

  -- 6. LOS CEROS NO SE GUARDAN: se mandaron faltante:0 y hongo:0.
  if (select count(*) from public.sider_ai_conteos where revision_id = v_id) <> 7 then
    v_falla := v_falla || ' 6(guardó ' ||
      (select count(*) from public.sider_ai_conteos where revision_id = v_id) || ' conteos, debían ser 7)'; end if;

  -- 7. EL DETALLE cuadra con la cabecera.
  if (select sum(unidades) from public.v_sider_ai_detalle where revision_id = v_id and cobra) <> 32 then
    v_falla := v_falla || ' 7(el detalle no suma 32)'; end if;

  -- 8. YA NO ESTÁ PENDIENTE.
  if exists (select 1 from public.v_sider_ai_pendientes
              where viaje_id = 'aaaaaaaa-0000-0000-0000-000000000001') then
    v_falla := v_falla || ' 8(sigue apareciendo como pendiente)'; end if;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'la fila del Excel: 8 de 8 · defectos 32 · Hl 0.056 · no abono % · abono %',
    r.no_abono, r.abono_sap;
end $$;


-- ===================== LO QUE NO SE PUEDE ESCRIBIR =====================
do $$
declare v_falla text := ''; v_id uuid;
begin
  -- 9. MÁS DEFECTOS QUE BOTELLAS REVISADAS. En una hoja de cálculo esto
  --    pasa sin que nadie lo vea y le cobra al socio más de lo que mandó.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
      'T1','socios','logisinu_s_a_s_zomac','G175', true, 82080, 100,
      '{"rota":150}'::jsonb);
    v_falla := v_falla || ' 9(dejó marcar 150 malas de 100 revisadas)';
  exception when others then
    if sqlerrm not like '%de % revisadas%' then
      v_falla := v_falla || ' 9(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 10. LA MUESTRA NO PUEDE SER MAYOR QUE LO RECIBIDO.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
      'T1','socios','logisinu_s_a_s_zomac','G175', true, 100, 500, '{"rota":1}'::jsonb);
    v_falla := v_falla || ' 10(revisó más de lo que llegó)';
  exception when others then
    if sqlerrm not like '%no puede ser mayor%' then
      v_falla := v_falla || ' 10(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 11. CANAL SOCIOS SIN SOCIO: no se le puede cobrar a nadie.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
      'T1','socios',null,'G175', true, 82080, 4104, '{"rota":1}'::jsonb);
    v_falla := v_falla || ' 11(guardó una revisión de socios sin socio)';
  exception when others then
    if sqlerrm not like '%de qué socio%' then
      v_falla := v_falla || ' 11(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 12. UN DEFECTO QUE NO EXISTE, y que NO deje la revisión a medias.
  begin
    perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
      'T1','socios','logisinu_s_a_s_zomac','G175', true, 82080, 4104,
      '{"rota":3,"inventado":9}'::jsonb);
    v_falla := v_falla || ' 12(aceptó un defecto inventado)';
  exception when others then
    if sqlerrm not like '%no existe en el maestro%' then
      v_falla := v_falla || ' 12(error raro: ' || sqlerrm || ')'; end if;
  end;
  --     …y la revisión buena sigue intacta: 32, no 3.
  if (select defectos from public.v_sider_ai
       where viaje_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 32 then
    v_falla := v_falla || ' 12b(el intento fallido dañó la revisión buena)'; end if;

  -- 13. NO SE PUEDE ESCRIBIR LA REVISIÓN DIRECTO. Sin esto, un índice de
  --     cobro se fabricaría desde el navegador, y eso es lo único que le
  --     quita valor a un documento de cobro.
  begin
    insert into public.sider_ai_revisiones
      (viaje_id, fecha, planta, placa, turno, canal, envase, recibidas, revisadas)
    values ('aaaaaaaa-0000-0000-0000-000000000002','2026-05-08','BAQ','XXX111','T1',
            'socios','G175', 100, 10);
    v_falla := v_falla || ' 13(pudo insertar una revisión a mano)';
  exception when others then null;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'lo que no se puede escribir: 5 de 5';
end $$;


-- ===================== CORREGIR DEJA RASTRO =====================
do $$
declare v_falla text := ''; r record;
begin
  -- 14. Se corrige la misma revisión: sigue siendo una, y cuenta la edición.
  perform public.sider_ai_guardar('aaaaaaaa-0000-0000-0000-000000000001',
    'T2','socios','logisinu_s_a_s_zomac','G175', false, 82080, 4104,
    '{"rota":4,"cemento":5,"otras_cias":10,"extrasucio":7,"cristalizado":6,"faltante":2}'::jsonb);

  if (select count(*) from public.sider_ai_revisiones
       where viaje_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then
    v_falla := v_falla || ' 14(quedaron dos revisiones del mismo viaje)'; end if;

  select * into r from public.v_sider_ai
   where viaje_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if r.ediciones <> 1 then v_falla := v_falla || ' 14b(ediciones=' || r.ediciones || ')'; end if;
  if r.editado_por is null then v_falla := v_falla || ' 14c(no guardó quién corrigió)'; end if;
  if r.defectos <> 34 then v_falla := v_falla || ' 14d(defectos=' || r.defectos || ', debía ser 34)'; end if;
  -- Y los conteos viejos que ya no vienen se fueron: mezclado y cajas.
  if r.otros <> 0 then v_falla := v_falla || ' 14e(quedaron conteos de la versión anterior)'; end if;

  -- 15. NO SE PUEDE DESMARCAR UN VIAJE QUE YA TIENE REVISIÓN: sería
  --     borrar el cobro sin que quede rastro.
  begin
    perform public.sider_ai_marcar('aaaaaaaa-0000-0000-0000-000000000001', false, null);
    v_falla := v_falla || ' 15(desmarcó un viaje ya revisado)';
  exception when others then
    if sqlerrm not like '%ya tiene la revisión%' then
      v_falla := v_falla || ' 15(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'FALLARON:%', v_falla; end if;
  raise warning 'corregir: 7 de 7';
end $$;

/* Se suelta el rol antes de cerrar: perfiles tiene un trigger de
   constraint que corre al confirmar la transacción y necesita leer la
   tabla. Con el rol de prueba puesto, la prueba fallaba al final —por
   su propio andamiaje, no por lo que estaba probando—. */
reset role;
