\set ON_ERROR_STOP on
set client_min_messages = notice;
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444','ana@x'), ('55555555-5555-5555-5555-555555555555','luis@x') on conflict (id) do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('44444444-4444-4444-4444-444444444444','ana','Ana','operador',true),('55555555-5555-5555-5555-555555555555','luis','Luis','operador',true)
on conflict (id) do update set activo = true;
insert into public.bodegas (id, codigo, nombre) values ('bbbbbbbb-0000-0000-0000-000000000001','CDT','CD de prueba') on conflict do nothing;
insert into public.productos (id, sku, nombre, tipo_material, cajas_por_estiba) values ('cccccccc-0000-0000-0000-000000000001','P1','Uno','PRODUCTO',10) on conflict do nothing;
insert into public.ubicaciones (id, bodega_id, clave, calle, modulo, lado) values ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','A01_DER','A','01','DER') on conflict do nothing;
insert into public.conteos (id, codigo, bodega_id, estado, tipo, responsable_id, iniciado_en) values
  ('eeeeeeee-0000-0000-0000-0000000000a1','FEFO-PNC','bbbbbbbb-0000-0000-0000-000000000001','en_proceso','fefo','44444444-4444-4444-4444-444444444444', now());
insert into public.conteo_lineas (id, conteo_id, producto_id, ubicacion_id, cajas, pnc, contado_por) values
  ('ffffffff-0000-0000-0000-0000000000a1','eeeeeeee-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 10, true, '44444444-4444-4444-4444-444444444444'),
  ('ffffffff-0000-0000-0000-0000000000a2','eeeeeeee-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001', 5, false, '44444444-4444-4444-4444-444444444444');
do $p$
declare v_falla text := ''; r record; v_msg text;
  ANA constant text := '44444444-4444-4444-4444-444444444444'; LUIS constant text := '55555555-5555-5555-5555-555555555555';
begin
  perform set_config('request.jwt.claim.sub', ANA, true);
  set local role probador;
  perform public.conteo_fefo_pnc_politica('ffffffff-0000-0000-0000-0000000000a1', true, false);
  reset role;
  select * into r from public.conteo_lineas where id = 'ffffffff-0000-0000-0000-0000000000a1';
  if r.pnc_rotulo is distinct from true or r.pnc_bloqueo_mecanico is distinct from false then v_falla := v_falla || ' P1'; end if;
  if v_falla = '' then raise notice 'P1 · guarda rótulo sí y bloqueo mecánico no'; end if;
  /* P2 · PNC sin las dos respuestas se rechaza */
  begin
    set local role probador;
    perform public.conteo_fefo_pnc_politica('ffffffff-0000-0000-0000-0000000000a1', true, null);
    reset role; v_falla := v_falla || ' P2(dejó pasar un PNC sin contestar)';
  exception when others then reset role; get stacked diagnostics v_msg = message_text;
    if v_msg not like 'PNC: falta contestar%' then v_falla := v_falla || ' P2b(' || v_msg || ')'; end if; end;
  if v_falla = '' then raise notice 'P2 · un PNC sin las dos respuestas se rechaza'; end if;
  /* P3 · un renglón que NO es PNC queda sin respuestas aunque se las manden */
  set local role probador;
  perform public.conteo_fefo_pnc_politica('ffffffff-0000-0000-0000-0000000000a2', true, true);
  reset role;
  select * into r from public.conteo_lineas where id = 'ffffffff-0000-0000-0000-0000000000a2';
  if r.pnc_rotulo is not null or r.pnc_bloqueo_mecanico is not null then v_falla := v_falla || ' P3'; end if;
  if v_falla = '' then raise notice 'P3 · un renglón sin PNC no guarda respuestas'; end if;
  /* P4 · otra persona no puede */
  begin
    perform set_config('request.jwt.claim.sub', LUIS, true);
    set local role probador;
    perform public.conteo_fefo_pnc_politica('ffffffff-0000-0000-0000-0000000000a1', true, true);
    reset role; v_falla := v_falla || ' P4(otra persona pudo escribir)';
  exception when others then reset role; end;
  if v_falla = '' then raise notice 'P4 · solo el dueño del conteo escribe'; end if;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
end $p$;
