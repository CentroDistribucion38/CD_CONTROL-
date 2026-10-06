\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('33333333-3333-3333-3333-333333333333','sup@x'),
  ('44444444-4444-4444-4444-444444444444','ana@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','operador',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
delete from public.plan_envase_semanas;

do $prueba$
declare v_falla text := ''; id1 uuid; id2 uuid; n int;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  ANA constant text := '44444444-4444-4444-4444-444444444444';
  plan jsonb := '{"anio":2026,"semana":34,"fecha_ini":"2026-08-17","fecha_fin":"2026-08-23","escenario":"00 Escenario Oficial","generado":"2026-08-21","archivo":"x.xlsx",
    "pendientes":[{"tren":"TREN-1","sap":"3617","sku":"Costeñita","eficiencia":80,"formato":175,"referencia":38,"hl":5821,"unidades":3326283},
                  {"tren":"TREN-2","sap":"3128","sku":"Aguila RN","eficiencia":74,"formato":330,"referencia":30,"hl":7968,"unidades":2414575}],
    "bloques":[{"tren":"TREN-1","sap":"3617","fecha":"2026-08-21","turno":1,"hora_ini":0,"horas":8,"hl":647,"unidades":369700},
               {"tren":"TREN-1","sap":"3617","fecha":"2026-08-21","turno":2,"hora_ini":8,"horas":8,"hl":647,"unidades":369700},
               {"tren":"TREN-2","sap":"3128","fecha":"2026-08-22","turno":3,"hora_ini":16,"horas":8,"hl":1407,"unidades":426400}]}'::jsonb;
begin
  /* 1 · QUIEN PUEDE EDITAR RECEPCIÓN guarda; queda todo */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  id1 := public.plan_envase_guardar(plan);
  reset role;
  if id1 is null then v_falla := v_falla || ' 1(no devolvió id)'; end if;
  if (select count(*) from public.plan_envase_pendiente where semana_id = id1) <> 2 or (select count(*) from public.plan_envase_bloques where semana_id = id1) <> 3 then v_falla := v_falla || ' 1b(no quedaron 2 pendientes y 3 bloques)'; end if;
  if (select sum(unidades) from public.plan_envase_bloques where semana_id = id1 and tren = 'TREN-1') <> 739400 then v_falla := v_falla || ' 1c(unidades de bloques)'; end if;
  if (select cargado_por::text from public.plan_envase_semanas where id = id1) <> JEFE then v_falla := v_falla || ' 1d(no anota quién subió)'; end if;

  /* 2 · SUBIR OTRA VEZ LA MISMA SEMANA LA REEMPLAZA, no la duplica */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  id2 := public.plan_envase_guardar(jsonb_set(plan, '{bloques}', (plan->'bloques') - 2));
  reset role;
  if (select count(*) from public.plan_envase_semanas where anio = 2026 and semana = 34) <> 1 then v_falla := v_falla || ' 2(duplicó la semana)'; end if;
  if (select count(*) from public.plan_envase_bloques) <> 2 then v_falla := v_falla || ' 2b(no reemplazó los bloques: ' || (select count(*) from public.plan_envase_bloques) || ')'; end if;
  if exists (select 1 from public.plan_envase_pendiente where semana_id = id1) then v_falla := v_falla || ' 2c(quedó pendiente de la versión vieja)'; end if;

  /* 3 · QUIEN NO PUEDE EDITAR RECEPCIÓN no sube ni borra, ni toca las tablas a mano */
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  begin perform public.plan_envase_guardar(plan); v_falla := v_falla || ' 3(guardó sin permiso)'; exception when others then null; end;
  begin perform public.plan_envase_borrar(id2); v_falla := v_falla || ' 3b(borró sin permiso)'; exception when others then null; end;
  begin insert into public.plan_envase_bloques (semana_id, tren, sap, fecha, turno, hora_ini) values (id2, 'T', '1', current_date, 1, 0); v_falla := v_falla || ' 3c(insertó directo)'; exception when others then null; end;
  begin delete from public.plan_envase_semanas; if (select count(*) from public.plan_envase_semanas) = 0 and false then null; end if; exception when others then null; end;
  reset role;
  if (select count(*) from public.plan_envase_semanas) <> 1 then v_falla := v_falla || ' 3d(alguien sin permiso alteró las semanas)'; end if;

  /* 4 · SIN PERMISO DE VER, NO LEE NADA */
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  select count(*) into n from public.plan_envase_semanas;
  if n <> 0 then v_falla := v_falla || ' 4(ve las semanas sin permiso: ' || n || ')'; end if;
  select count(*) into n from public.plan_envase_bloques;
  if n <> 0 then v_falla := v_falla || ' 4b(ve los bloques sin permiso)'; end if;
  reset role;

  /* 5 · QUIEN PUEDE VER lee (sin poder editar) */
  insert into public.rol_permisos (rol, seccion, nivel) values ('operador', '/inventario/recibir', 'ver') on conflict (rol, seccion) do update set nivel = 'ver';
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  select count(*) into n from public.plan_envase_bloques;
  if n <> 2 then v_falla := v_falla || ' 5(con permiso de ver no lee: ' || n || ')'; end if;
  begin perform public.plan_envase_guardar(plan); v_falla := v_falla || ' 5b(con solo ver, guardó)'; exception when others then null; end;
  reset role;
  delete from public.rol_permisos where rol = 'operador' and seccion = '/inventario/recibir';

  /* 6 · BORRAR UNA SEMANA SE LLEVA SU PENDIENTE Y SUS BLOQUES */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  perform public.plan_envase_borrar(id2);
  reset role;
  if exists (select 1 from public.plan_envase_semanas) or exists (select 1 from public.plan_envase_bloques) or exists (select 1 from public.plan_envase_pendiente) then v_falla := v_falla || ' 6(no borró en cascada)'; end if;

  /* 7 · UN PLAN MAL FORMADO SE RECHAZA */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin perform public.plan_envase_guardar('{"semana":34}'::jsonb); v_falla := v_falla || ' 7(aceptó un plan sin año ni fecha)'; exception when others then null; end;
  reset role;

  if v_falla <> '' then raise exception 'PLAN:%', v_falla; end if;
  raise notice 'PLAN ENVASE: todo bien';
end $prueba$;
