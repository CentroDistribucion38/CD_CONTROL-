\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LAS HOJAS DEL DÍA GUARDADAS — lo que se comprueba y por qué
--
--   · QUIEN EDITA LA GUARDA, A SU NOMBRE: el renglón y el PDF.
--   · NADIE LA GUARDA A NOMBRE DE OTRO.
--   · QUIEN SOLO CONSULTA NO GUARDA, pero SÍ VE la lista.
--   · LO GENERADO NO SE PISA: ni el editor ni el administrador corrigen.
--   · NADIE BORRA, NI EL ADMINISTRADOR: se anula.
--   · EL ADMINISTRADOR ANULA, CON MOTIVO; NADIE MÁS. No dos veces.
--   · LA ANULACIÓN SE QUITA, Y LA HOJA QUEDA COMO ANTES.
--   · LA RUTA ES DEL DÍA: una hoja no queda guardada con el día de otro.
--   · LA VISTA DICE QUIÉN LA GENERÓ.
--   · EL ESPACIO ES PRIVADO, SOLO PDF Y CON TOPE.
-- =====================================================================

do $prueba$
declare
  v_falla text := '';
  n int; t text; v_id uuid;
  SUPER constant text := '22222222-2222-2222-2222-222222222222';
  OPERA constant text := '33333333-3333-3333-3333-333333333333';
  JEFE  constant text := '11111111-1111-1111-1111-111111111111';
begin
  /* ---- 0 · EL ESPACIO ---- */
  select count(*) into n from storage.buckets
   where id = 'rotlinea-hojas' and public = false
     and allowed_mime_types = array['application/pdf'] and file_size_limit = 5242880;
  if n <> 1 then v_falla := v_falla || ' 0(el espacio de los PDF no es privado, solo PDF y de 5 MB)'; end if;

  /* ---- 1 · QUIEN EDITA LA GUARDA, A SU NOMBRE ---- */
  perform set_config('request.jwt.claim.sub', SUPER, true);
  set local role probador;
  begin
    insert into storage.objects (bucket_id, name) values ('rotlinea-hojas', '2026-09-15/a.pdf');
    insert into public.rotlinea_hojas (fecha, ruta, bytes, unidades, kg, lineas, elaboro, supervisor)
      values ('2026-09-15', '2026-09-15/a.pdf', 111000, 170, 12.5, 2, 'Sandra', 'Pedro');
  exception when others then
    v_falla := v_falla || ' 1(la supervisora no pudo guardar su hoja: ' || sqlerrm || ')';
  end;
  select generado_nombre, id into t, v_id from public.v_rotlinea_hojas where ruta = '2026-09-15/a.pdf';
  if t is distinct from 'Sandra Supervisora' then
    v_falla := v_falla || ' 1b(la vista no dice quién la generó: ' || coalesce(t,'nada') || ')'; end if;

  /* ---- 2 · NADIE LA GUARDA A NOMBRE DE OTRO ---- */
  begin
    insert into public.rotlinea_hojas (fecha, ruta, generado_por)
      values ('2026-09-15', '2026-09-15/b.pdf', JEFE::uuid);
    v_falla := v_falla || ' 2(se pudo guardar una hoja a nombre de otro)';
  exception when insufficient_privilege then null;
  end;

  /* ---- 3 · LA RUTA ES DEL DÍA ---- */
  begin
    insert into public.rotlinea_hojas (fecha, ruta) values ('2026-09-15', '2026-09-14/c.pdf');
    v_falla := v_falla || ' 3(una hoja del 15 quedó guardada en la carpeta del 14)';
  exception when check_violation then null;
  end;

  /* ---- 4 · LO GENERADO NO SE PISA ---- */
  begin
    update public.rotlinea_hojas set unidades = 1 where ruta = '2026-09-15/a.pdf';
    v_falla := v_falla || ' 4(la supervisora corrigió las cifras de una hoja ya generada)';
  exception when insufficient_privilege then null;
  end;

  /* La supervisora no borra: el renglón sigue ahí. */
  begin
    delete from public.rotlinea_hojas where ruta = '2026-09-15/a.pdf';
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where name = '2026-09-15/a.pdf';
  reset role;
  if (select count(*) from public.rotlinea_hojas where ruta = '2026-09-15/a.pdf') <> 1 then
    v_falla := v_falla || ' 5(la supervisora borró una hoja: se anula, no se borra)'; end if;
  if (select count(*) from storage.objects where name = '2026-09-15/a.pdf') <> 1 then
    v_falla := v_falla || ' 5b(la supervisora borró el PDF: se anula, no se borra)'; end if;

  /* ---- 6 · QUIEN SOLO CONSULTA VE, PERO NO GUARDA ---- */
  perform set_config('request.jwt.claim.sub', OPERA, true);
  set local role probador;
  select count(*) into n from public.v_rotlinea_hojas;
  if n <> 1 then v_falla := v_falla || ' 6(el operador no ve la lista de hojas: ve ' || n || ')'; end if;
  select count(*) into n from storage.objects where bucket_id = 'rotlinea-hojas';
  if n <> 1 then v_falla := v_falla || ' 6b(el operador no puede abrir el PDF)'; end if;
  begin
    insert into public.rotlinea_hojas (fecha, ruta) values ('2026-09-16', '2026-09-16/d.pdf');
    v_falla := v_falla || ' 7(el operador, que solo consulta, guardó una hoja)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('rotlinea-hojas', '2026-09-16/d.pdf');
    v_falla := v_falla || ' 7b(el operador, que solo consulta, subió un PDF)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* ---- 8 · QUIEN NO ADMINISTRA NO ANULA ---- */
  perform set_config('request.jwt.claim.sub', SUPER, true);
  set local role probador;
  begin
    perform public.rotlinea_hoja_anular(v_id, 'Se generó con el día equivocado');
    v_falla := v_falla || ' 8(la supervisora anuló una hoja: solo el administrador anula)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  /* ---- 9 · NI EL ADMINISTRADOR CORRIGE NI BORRA ---- */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    update public.rotlinea_hojas set supervisor = 'Otro' where id = v_id;
    v_falla := v_falla || ' 9(el administrador corrigió una hoja: lo generado no se pisa, se anula)';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.rotlinea_hojas where id = v_id;
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where name = '2026-09-15/a.pdf';
  reset role;
  if (select count(*) from public.rotlinea_hojas where id = v_id) <> 1 then
    v_falla := v_falla || ' 9b(el administrador borró una hoja: se anula, no se borra)'; end if;
  if (select count(*) from storage.objects where name = '2026-09-15/a.pdf') <> 1 then
    v_falla := v_falla || ' 9c(el administrador borró el PDF: se anula, no se borra)'; end if;

  /* ---- 10 · EL ADMINISTRADOR ANULA, CON MOTIVO ---- */
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    perform public.rotlinea_hoja_anular(v_id, '  ');
    v_falla := v_falla || ' 10(se anuló sin motivo)';
  exception when others then
    if sqlerrm not like 'Escribe por qué se anula%' then
      v_falla := v_falla || ' 10b(sin motivo lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  begin
    perform public.rotlinea_hoja_anular(v_id, 'Se generó con el día equivocado');
  exception when others then
    v_falla := v_falla || ' 11(el administrador no pudo anular: ' || sqlerrm || ')';
  end;
  select anulada_nombre || ' · ' || anulada_motivo into t from public.v_rotlinea_hojas where id = v_id;
  if t is distinct from 'Jefe · Se generó con el día equivocado' then
    v_falla := v_falla || ' 11b(la vista no dice quién anuló ni por qué: ' || coalesce(t, 'nada') || ')'; end if;
  begin
    perform public.rotlinea_hoja_anular(v_id, 'Otra vez, por si acaso');
    v_falla := v_falla || ' 12(se anuló dos veces: la segunda pisa quién y por qué)';
  exception when others then
    if sqlerrm not like '%ya está anulada%' then
      v_falla := v_falla || ' 12b(lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;
  reset role;

  /* ---- 13 · QUITAR LA ANULACIÓN: solo el administrador, y queda como antes ---- */
  perform set_config('request.jwt.claim.sub', SUPER, true);
  set local role probador;
  begin
    perform public.rotlinea_hoja_restituir(v_id);
    v_falla := v_falla || ' 13(la supervisora quitó una anulación)';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set local role probador;
  begin
    perform public.rotlinea_hoja_restituir(v_id);
  exception when others then
    v_falla := v_falla || ' 13d(el administrador no pudo quitar la anulación: ' || sqlerrm || ')';
  end;
  reset role;
  if exists (select 1 from public.rotlinea_hojas
              where id = v_id and (anulada_en is not null or anulada_motivo is not null or anulada_por is not null)) then
    v_falla := v_falla || ' 13b(quitar la anulación no la deja como antes)'; end if;
  if (select unidades from public.rotlinea_hojas where id = v_id) <> 170 then
    v_falla := v_falla || ' 13c(anular o restituir cambió las cifras de la hoja)'; end if;

  if v_falla <> '' then raise exception 'HOJAS:%', v_falla; end if;
  raise notice 'HOJAS ok';
end $prueba$;

do $fin$ begin raise notice 'LAS HOJAS SE GUARDAN TAL CUAL Y NO SE PISAN: todo en orden'; end $fin$;
