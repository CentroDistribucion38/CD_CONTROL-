\set ON_ERROR_STOP on
set client_min_messages = notice;
-- =====================================================================
-- CORTE FINAL SIN «CUÁNTAS ESTIBAS» EN EL ORIGEN (se corre DESPUÉS de
-- prueba-inv-corte.sql, que arma bodegas, ubicaciones, usuarios y permisos).
--   · el origen del FINAL acepta un módulo sin cantidad y lo guarda VACÍO
--   · el inicial y cualquier destino siguen exigiendo la cantidad
--   · si algo falla no queda nada a medias; lo viejo sigue igual
-- =====================================================================
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare v_ini uuid; v_fin uuid; b constant uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
begin
  v_ini := public.inv_corte_guardar(b,'inicial',null, now() - interval '9 hours', null,
    '[{"linea":"L1","cajas_depa":100,
       "origenes":[{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":40,"unidad":"estibas"}]}]'::jsonb);
  insert into public._ids values ('ini8', v_ini);
  /* El final: dos módulos de origen, el primero con cant/unidad en null y el segundo sin las llaves. */
  v_fin := public.inv_corte_guardar(b,'final',v_ini, now() - interval '8 hours', null,
    '[{"linea":"L1","cajas_depa":900,
       "origenes":[{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":null,"unidad":null},
                   {"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000004"}]}]'::jsonb);
  insert into public._ids values ('fin8', v_fin);
  /* Un inicial más, sin final, para probar rechazos. */
  v_ini := public.inv_corte_guardar(b,'inicial',null, now() - interval '6 hours', null,
    '[{"linea":"L1","cajas_depa":10,
       "origenes":[{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000001","cant":4,"unidad":"estibas"}]}]'::jsonb);
  insert into public._ids values ('ini9', v_ini);
end $$;
reset role;
do $$
declare v_ini uuid := (select v from public._ids where k='ini8'); v_fin uuid := (select v from public._ids where k='fin8'); f text := '';
begin
  if (select count(*) from public.inv_corte_sitios s join public.inv_corte_renglones r on r.id = s.renglon_id
       where r.corte_id = v_fin and s.rol = 'origen' and s.cant is null and s.unidad is null) <> 2 then
    f := f || E'\n   · los dos módulos del final debían quedar con la cantidad VACÍA'; end if;
  if (select count(*) from public.inv_corte_sitios s join public.inv_corte_renglones r on r.id = s.renglon_id
       where r.corte_id = v_fin and s.cant = 0) <> 0 then
    f := f || E'\n   · la cantidad vacía se guardó como cero'; end if;
  if not exists (select 1 from public.inv_corte_sitios s join public.inv_corte_renglones r on r.id = s.renglon_id
       where r.corte_id = v_ini and s.cant = 40 and s.unidad = 'estibas') then
    f := f || E'\n   · el inicial perdió su cantidad'; end if;
  if f <> '' then raise exception E'FALLA 1:%', f; end if;
  raise notice 'I8 · el origen del final se guarda sin cantidad (vacía, no cero) y el inicial conserva la suya';
end $$;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set role probador;
do $$
declare f text := ''; b constant text := 'bbbbbbbb-0000-0000-0000-000000000001';
        ini text := (select v::text from public._ids where k='ini9');
        U1 constant text := 'bbbbbbbb-1000-0000-0000-000000000001';
        antes int := (select count(*) from public.inv_cortes);
        antes_s int := (select count(*) from public.inv_corte_sitios);
        pre text := 'select public.inv_corte_guardar(''bbbbbbbb-0000-0000-0000-000000000001'',';
begin
  /* El INICIAL sigue exigiendo la cantidad. */
  f := f || public._espera_error(pre || '''inicial'',null, now() - interval ''2 hours'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"ubicacion_id":"' || U1 || '"}]}]''::jsonb)',
        '%está incompleto%', 'el corte INICIAL aceptó un origen sin cantidad');
  /* Un DESTINO, aunque sea de un final, también. */
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"destinos":[{"ubicacion_id":"' || U1 || '"}]}]''::jsonb)',
        '%está incompleto%', 'un DESTINO del final aceptó no traer cantidad');
  /* Cantidad sin unidad, o unidad sin cantidad: a medias, no vale. */
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"ubicacion_id":"' || U1 || '","cant":5}]}]''::jsonb)',
        '%está incompleto%', 'el origen del final aceptó cantidad sin unidad');
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"ubicacion_id":"' || U1 || '","unidad":"cajas"}]}]''::jsonb)',
        '%está incompleto%', 'el origen del final aceptó unidad sin cantidad');
  /* Sin la ubicación, tampoco: el módulo es lo único que sí se pide. */
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"cant":null,"unidad":null}]}]''::jsonb)',
        '%está incompleto%', 'el origen del final aceptó no traer ni el módulo');
  /* Un módulo de otra bodega, tampoco. */
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"ubicacion_id":"bbbbbbbb-1000-0000-0000-000000000003"}]}]''::jsonb)',
        '%no es de esta bodega%', 'el origen del final aceptó un módulo de otra bodega');
  /* El mismo módulo dos veces en el origen, tampoco. */
  f := f || public._espera_error(pre || '''final'',''' || ini || ''', now() - interval ''20 minutes'', null, ''[{"linea":"L1","cajas_depa":1,"origenes":[{"ubicacion_id":"' || U1 || '"},{"ubicacion_id":"' || U1 || '"}]}]''::jsonb)',
        '%repetido%', 'el mismo módulo sin cantidad entró dos veces');
  if (select count(*) from public.inv_cortes) <> antes or (select count(*) from public.inv_corte_sitios) <> antes_s then
    f := f || E'\n   · un corte rechazado dejó filas a medias'; end if;
  if f <> '' then raise exception E'FALLA 2:%', f; end if;
  raise notice 'I9 · sin cantidad solo vale en el ORIGEN del final: el inicial, un destino, media cantidad, sin módulo, otra bodega o repetido se rechazan sin dejar nada a medias';
end $$;
reset role;

/* La columna: cantidad y unidad van las dos o ninguna. */
do $$
declare f text := ''; rid uuid := (select r.id from public.inv_corte_renglones r where r.corte_id = (select v from public._ids where k='fin8') limit 1);
begin
  begin
    insert into public.inv_corte_sitios (renglon_id, rol, orden, ubicacion_id, cant, unidad)
    values (rid, 'origen', 9, 'bbbbbbbb-1000-0000-0000-000000000005', null, 'cajas');
    f := f || E'\n   · la tabla aceptó unidad sin cantidad';
  exception when check_violation then null; end;
  if f <> '' then raise exception E'FALLA 3:%', f; end if;
  raise notice 'I10 · la tabla no acepta cantidad y unidad a medias';
end $$;
