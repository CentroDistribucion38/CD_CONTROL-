\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x'), ('44444444-4444-4444-4444-444444444444','ana@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true),
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true, nombre = excluded.nombre;
delete from public.rotulos_plan;

do $prueba$
declare v_falla text := ''; n int; r record; f text[];
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  ANA constant text := '44444444-4444-4444-4444-444444444444';
begin
  /* 1 · IMPRIMIR da folios 1..N, con formato, y los anota */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*), min(x.folio), max(x.folio), bool_and(x.tipo = 'plan') into r from public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 1, 'TREN-1', '3617', 5, 5, 54) x;
  reset role;
  if r.count <> 5 or r.min <> '3617-20260821-L1-T1-001' or r.max <> '3617-20260821-L1-T1-005' or not r.bool_and then v_falla := v_falla || ' 1(' || r::text || ')'; end if;
  if (select count(*) from public.rotulos_plan) <> 5 or (select count(distinct lote) from public.rotulos_plan) <> 1 then v_falla := v_falla || ' 1b(no quedaron anotados en un lote)'; end if;
  if (select impreso_por::text from public.rotulos_plan limit 1) <> JEFE then v_falla := v_falla || ' 1c(no anota quién imprimió)'; end if;

  /* 2 · LA SIGUIENTE TANDA SIGUE LA NUMERACIÓN y lo que pasa de lo planeado es ADICIONAL */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*), min(x.numero), max(x.numero), count(*) filter (where x.tipo = 'adicional') as adic into r from public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 1, 'TREN-1', '3617', 3, 6, 54) x;
  reset role;
  if r.min <> 6 or r.max <> 8 or r.adic <> 2 then v_falla := v_falla || ' 2(siguió en ' || r.min || '-' || r.max || ', adicionales ' || r.adic || ')'; end if;

  /* 3 · OTRO BLOQUE EMPIEZA EN 1 */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select min(x.numero) as m into r from public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 2, 'TREN-1', '3617', 2, 10, 54) x;
  reset role;
  if r.m <> 1 then v_falla := v_falla || ' 3(el turno 2 no empezó en 1)'; end if;

  /* 4 · RESUMEN */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select * into r from public.rotulos_plan_resumen(2026, 34) x where x.turno = 1;
  reset role;
  if r.impresos <> 6 or r.adicionales <> 2 or r.reimpresos <> 0 then v_falla := v_falla || ' 4(' || r::text || ')'; end if;

  /* 5 · REIMPRIMIR: el viejo queda reemplazado, el nuevo lleva R1 y el MISMO número; el resumen no cambia */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*), min(x.folio) as fo, min(x.numero) as nu into r from public.rotulos_plan_reimprimir(array['3617-20260821-L1-T1-002','3617-20260821-L1-T1-003'], 'Dañado') x;
  reset role;
  if r.count <> 2 or r.fo <> '3617-20260821-L1-T1-002R1' or r.nu <> 2 then v_falla := v_falla || ' 5(' || r::text || ')'; end if;
  if (select estado from public.rotulos_plan where folio = '3617-20260821-L1-T1-002') <> 'reemplazado' then v_falla := v_falla || ' 5b(el viejo no quedó reemplazado)'; end if;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select * into r from public.rotulos_plan_resumen(2026, 34) x where x.turno = 1;
  reset role;
  if r.impresos <> 6 or r.reimpresos <> 2 then v_falla := v_falla || ' 5c(el resumen cambió: ' || r::text || ')'; end if;
  /* se reimprime otra vez el mismo número: R2 */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select min(x.folio) as fo into r from public.rotulos_plan_reimprimir(array['3617-20260821-L1-T1-002R1'], 'Perdido') x;
  reset role;
  if r.fo <> '3617-20260821-L1-T1-002R2' then v_falla := v_falla || ' 5d(segunda reimpresión: ' || r.fo || ')'; end if;
  /* el viejo ya no se puede reimprimir */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin perform public.rotulos_plan_reimprimir(array['3617-20260821-L1-T1-002'], 'Dañado'); v_falla := v_falla || ' 5e(reimprimió uno ya reemplazado)'; exception when others then null; end;
  begin perform public.rotulos_plan_reimprimir(array['3617-20260821-L1-T1-004'], 'quién sabe'); v_falla := v_falla || ' 5f(aceptó un motivo inventado)'; exception when others then null; end;
  reset role;

  /* 5g · POR RANGO: toma los vigentes, aunque ya hubieran sido reimpresos (el 2 va por R3) */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*) as c, min(x.folio) as fo into r from public.rotulos_plan_reimprimir_rango(2026, 34, '2026-08-21', 1, 'TREN-1', '3617', 1, 3, 'Dato equivocado') x;
  reset role;
  if r.c <> 3 or r.fo <> '3617-20260821-L1-T1-001R1' then v_falla := v_falla || ' 5g(rango: ' || r::text || ')'; end if;
  if not exists (select 1 from public.rotulos_plan where folio = '3617-20260821-L1-T1-002R3' and estado = 'impreso') then v_falla := v_falla || ' 5h(el 2 no quedó en R3)'; end if;
  if (select count(*) from public.rotulos_plan where fecha = '2026-08-21' and turno = 1 and numero = 2 and estado = 'impreso') <> 1 then v_falla := v_falla || ' 5i(hay más de un vigente del 2)'; end if;

  /* 6 · LOTES */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  select count(*) into n from public.rotulos_plan_lotes(2026, 34);
  reset role;
  if n < 4 then v_falla := v_falla || ' 6(lotes: ' || n || ')'; end if;

  /* 7 · SIN PERMISO DE EDITAR NO IMPRIME NI TOCA LA TABLA; SIN PERMISO DE VER NO LEE */
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  begin perform public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 3, 'TREN-1', '3617', 1, 1, 54); v_falla := v_falla || ' 7(imprimió sin permiso)'; exception when others then null; end;
  begin perform public.rotulos_plan_reimprimir(array['3617-20260821-L1-T1-004'], 'Dañado'); v_falla := v_falla || ' 7b(reimprimió sin permiso)'; exception when others then null; end;
  begin perform public.rotulos_plan_reimprimir_rango(2026, 34, '2026-08-21', 1, 'TREN-1', '3617', 1, 2, 'Dañado'); v_falla := v_falla || ' 7f(reimprimió por rango sin permiso)'; exception when others then null; end;
  begin insert into public.rotulos_plan (folio, anio, semana, fecha, turno, tren, sap, numero, lote) values ('x', 1, 1, current_date, 1, 'T', '1', 1, gen_random_uuid()); v_falla := v_falla || ' 7c(insertó directo)'; exception when others then null; end;
  begin perform * from public.rotulos_plan_resumen(2026, 34); v_falla := v_falla || ' 7d(vio el resumen sin permiso)'; exception when others then null; end;
  select count(*) into n from public.rotulos_plan; if n <> 0 then v_falla := v_falla || ' 7e(leyó la tabla sin permiso)'; end if;
  reset role;

  /* 8 · TOPES */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin perform public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 1, 'TREN-1', '3617', 401, 1, 54); v_falla := v_falla || ' 8(imprimió 401)'; exception when others then null; end;
  begin perform public.rotulos_plan_imprimir(2026, 34, '2026-08-21', 4, 'TREN-1', '3617', 1, 1, 54); v_falla := v_falla || ' 8b(turno 4)'; exception when others then null; end;
  reset role;

  if v_falla <> '' then raise notice 'ROTULOS-PLAN: %', v_falla; else raise notice 'ok · rótulos del plan'; end if;
end $prueba$;
