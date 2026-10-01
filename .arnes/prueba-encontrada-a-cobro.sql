\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- «ME LA ENCONTRÉ» VA DIRECTO A COBRO.
--
-- LO QUE PUEDE ROMPERSE:
--  1. Que la encontrada se quede esperando visto bueno (o llegue a
--     Desacuerdos): ahí nadie puede objetar nada porque no hay operario.
--  2. Que la reportada por OPM se vaya a cobro de una: se saltaría el
--     visto bueno de Easy, que es justo lo que SÍ debe pasar.
--  3. Que a la encontrada se le invente una respuesta de Easy.
--  4. Que Easy o ABI puedan objetarla / resolverla después.
--  5. Que una encontrada ya cobrada se «convierta» en OPM y se salte el visto bueno.
--  6. Que se vuelva a decidir lo que Easy ya objetó (el relleno de la migración).
-- =====================================================================
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('11111111-1111-1111-1111-111111111111','jefe@cd.local'),
  ('22222222-2222-2222-2222-222222222222','easy@cd.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('44444444-4444-4444-4444-444444444444','root','Root','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe ABI','abi',true),
  ('22222222-2222-2222-2222-222222222222','easy','Easy OL','operador',true)
on conflict (id) do update set rol = excluded.rol, activo = true;
insert into public.rol_permisos (rol, seccion, nivel) values
  ('operador','/roturas/en-sitio/visto-bueno','editar'),
  ('abi','/roturas/en-sitio/desacuerdos','editar')
on conflict (rol, seccion) do update set nivel = excluded.nivel;
insert into public.roturas_materiales (clave, nombre, tipo, color, activo, orden) values
  ('EER-AMBAR','Envase retornable ambar','eer','ambar',true,1) on conflict (clave) do nothing;
insert into public.roturas_procesos (clave, nombre, activo, orden) values ('lineas','Lineas',true,1) on conflict (clave) do nothing;
insert into public.roturas_areas (clave, nombre, activo, orden) values ('plazoleta','Plazoleta',true,1) on conflict (clave) do nothing;
insert into public.roturas_causas (clave, nombre, grupo, exige_foto, activo, orden) values
  ('estibas_malas','Estibas en mal estado','asumida',false,true,1) on conflict (clave) do nothing;
insert into public.roturas_operarios (pin, nombre, empresa, activo) values ('4821','Genesis Visbal','Easy',true)
  on conflict do nothing;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  EASY constant text := '22222222-2222-2222-2222-222222222222';
  v_falla text := ''; v_n int; v_txt text;
  re uuid; ro uuid; rv uuid; rx uuid;
begin
  begin
  set role probador;
  perform set_config('request.jwt.claim.sub', EASY, true);

  select r.id into re from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'encontrada', p_area => 'plazoleta', p_color => 'ambar') r;
  select r.id into ro from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'opm', p_area => 'plazoleta', p_color => 'ambar') r;

  /* 1. LA ENCONTRADA SE VA A COBRO. */
  perform public.rotura_marcar_origen(re, 'encontrada');
  select v.estado, v.etapa into v_txt, v_txt from public.v_roturas v where v.id = re;
  select v.estado into v_txt from public.v_roturas v where v.id = re;
  if v_txt <> 'cuenta' then v_falla := v_falla || format(' 1a(la encontrada quedó en estado «%s»)', v_txt); end if;
  select v.etapa into v_txt from public.v_roturas v where v.id = re;
  if v_txt <> 'cobro' then v_falla := v_falla || format(' 1b(la encontrada quedó en etapa «%s», no «cobro»)', v_txt); end if;
  select count(*) into v_n from public.v_roturas v where v.id = re and v.etapa in ('espera_ol','desacuerdo');
  if v_n <> 0 then v_falla := v_falla || ' 1c(la encontrada está en una bandeja)'; end if;
  select (decidida_en is not null and decidida_por is not null) into strict v_txt from public.roturas where id = re;
  if v_txt <> 'true' then v_falla := v_falla || ' 1d(la encontrada pasó a cobro sin quién ni cuándo)'; end if;

  /* 3. NO SE LE INVENTA UNA RESPUESTA DE EASY. */
  select ol_respuesta::text into v_txt from public.roturas where id = re;
  if v_txt is not null then v_falla := v_falla || format(' 3(se le inventó la respuesta de Easy: «%s»)', v_txt); end if;

  /* 2. LA DE OPM SIGUE ESPERANDO A EASY. */
  perform public.rotura_marcar_origen(ro, 'opm', '4821');
  select v.etapa into v_txt from public.v_roturas v where v.id = ro;
  if v_txt <> 'espera_ol' then v_falla := v_falla || format(' 2(la de OPM quedó en etapa «%s» y debe esperar a Easy)', v_txt); end if;

  /* 4. NADIE LA OBJETA NI LA RESUELVE. */
  begin
    perform public.rotura_visto_bueno(re, false, 'no fue mía');
    v_falla := v_falla || ' 4a(Easy objetó una encontrada)';
  exception when others then
    if position('ya está decidida' in sqlerrm) = 0 then v_falla := v_falla || ' 4a(falló por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  begin
    perform public.rotura_resolver(re, false, 'no cuenta');
    v_falla := v_falla || ' 4b(ABI resolvió una encontrada)';
  exception when others then
    if position('no está en desacuerdo' in sqlerrm) = 0 then v_falla := v_falla || ' 4b(falló por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  perform set_config('request.jwt.claim.sub', EASY, true);

  /* 5. UNA ENCONTRADA YA COBRADA NO SE VUELVE OPM. */
  begin
    perform public.rotura_marcar_origen(re, 'opm', '4821');
    v_falla := v_falla || ' 5(una encontrada ya en cobro se convirtió en OPM y se saltó el visto bueno)';
  exception when others then
    if position('ya pasó a cobro' in sqlerrm) = 0 then v_falla := v_falla || ' 5(falló por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  /* 6. MARCAR DOS VECES LA MISMA ENCONTRADA NO LA REDECIDE. */
  select decidida_en::text into v_txt from public.roturas where id = re;
  perform public.rotura_marcar_origen(re, 'encontrada');
  select (decidida_en::text = v_txt)::text into v_txt from public.roturas where id = re;
  if v_txt <> 'true' then v_falla := v_falla || ' 6(marcar otra vez una encontrada ya cobrada la volvió a decidir)'; end if;

  /* 7. LO QUE EASY YA OBJETÓ NO SE TOCA SI DESPUÉS SE MARCA «ENCONTRADA». */
  reset role;
  select r.id into rx from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'objetada', p_area => 'plazoleta', p_color => 'ambar') r;
  update public.roturas set origen = 'encontrada', ol_respuesta = 'rechaza', ol_en = now(), ol_nota = 'no', ol_por = null where id = rx;
  set role probador;
  perform set_config('request.jwt.claim.sub', EASY, true);
  perform public.rotura_marcar_origen(rx, 'encontrada');
  select estado::text into v_txt from public.roturas where id = rx;
  if v_txt <> 'esperando' then v_falla := v_falla || format(' 7(una ya objetada por Easy se re-decidió: «%s»)', v_txt); end if;

  exception when others then
    v_falla := v_falla || ' X(el arnés reventó: ' || sqlerrm || ')';
  end;
  reset role;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'ENCONTRADA · la encontrada va a cobro de una; la de OPM espera a Easy; nadie objeta lo cobrado.';
end $$;
