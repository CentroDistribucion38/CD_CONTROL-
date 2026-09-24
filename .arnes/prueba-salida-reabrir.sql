\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- REABRIR Y ANULAR UNA SALIDA DE VIDRIO — solo quien manda.
--
-- LO QUE PUEDE ROMPERSE:
--  1. Que lo pueda hacer alguien que no manda. Es el pedido entero.
--  2. Que «manda» se siga comparando contra el TEXTO 'admin': el día
--     que exista otro rol que mande, o que alguien renombre el de
--     siempre, la comprobación protege otra cosa.
--  3. Que reabrir DEJE LAS FIRMAS PUESTAS: unos kilos de hoy sostenidos
--     con la firma de ayer.
--  4. Que se reabra o se anule algo YA DESPACHADO: cambiar un número
--     que ya se facturó.
--  5. Que no quede rastro de quién la reabrió ni cuántas veces.
--  6. Que el administrador reabra y después no pueda quitar la tolva.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cd.local'),
  ('22222222-2222-2222-2222-222222222222','otro@cd.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cd.local')
on conflict do nothing;

/* UN SEGUNDO ROL QUE MANDA, con otro nombre. Es lo que distingue
   `manda()` de comparar contra 'admin'. */
insert into public.roles (clave, nombre, descripcion, manda, orden) values
  ('dueno','Dueño','Manda, y no se llama admin.', true, 30)
on conflict (clave) do update set manda = true;

insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('22222222-2222-2222-2222-222222222222','dueno','Dueño','dueno',true),
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.roturas_tolvas (codigo, modelo, tara_kg, orden) values
  ('TOLVA-R1','Tolva estándar',100,90), ('TOLVA-R2','Tolva estándar',100,91)
on conflict (codigo) do update set activo = true;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  v_falla text := '';
  s1 uuid; s2 uuid; t1 uuid;
  v_txt text; v_n int; v_b boolean;
  JEFE  constant text := '11111111-1111-1111-1111-111111111111';
  DUENO constant text := '22222222-2222-2222-2222-222222222222';
  SUP   constant text := '33333333-3333-3333-3333-333333333333';
begin
  perform set_config('request.jwt.claim.sub', SUP, true);
  select id into s1 from public.salida_abrir('RAB111', null);
  perform public.salida_pesar(s1, 'TOLVA-R1', 'ambar', 600);
  select id into t1 from public.roturas_salida_tolvas where salida_id = s1;
  perform public.salida_firmar(s1, 'supervisora', null);

  select id into s2 from public.salida_abrir('RAB222', null);
  perform public.salida_pesar(s2, 'TOLVA-R2', 'flint', 500);
  perform public.salida_firmar(s2, 'supervisora', null);

  -- ================================================================
  -- 1. EL SUPERVISOR NO REABRE NI ANULA
  -- ================================================================
  begin
    perform public.salida_reabrir(s1, 'me equivoqué');
    v_falla := v_falla || ' 1(el supervisor pudo reabrir una salida)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.salida_anular(s1, 'me equivoqué');
    v_falla := v_falla || ' 1b(el supervisor pudo anular una salida)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 2. UN ROL QUE MANDA PERO NO SE LLAMA «admin» SÍ PUEDE
  -- ================================================================
  -- Es la diferencia entre `manda()` y comparar contra un nombre.
  perform set_config('request.jwt.claim.sub', DUENO, true);
  if public.mi_rol() = 'admin' then
    v_falla := v_falla || ' 2(el segundo rol se llama admin: la prueba 2 no prueba nada)';
  end if;
  if not public.manda() then
    v_falla := v_falla || ' 2(el rol «dueno» no manda: la prueba 2 no prueba nada)';
  end if;
  begin
    perform public.salida_reabrir(s1, 'peso mal tecleado');
  exception when others then
    v_falla := v_falla || ' 2b(un rol que manda y no se llama admin no pudo reabrir: ' || sqlerrm || ')';
  end;

  -- ================================================================
  -- 3. REABRIR TUMBA LAS FIRMAS Y DEJA RASTRO
  -- ================================================================
  select estado::text, supervisora_en is null, reaperturas
    into v_txt, v_b, v_n
    from public.roturas_salidas where id = s1;
  if v_txt is distinct from 'abierta' then
    v_falla := v_falla || format(' 3(reabrir la dejó en %s)', v_txt);
  end if;
  if not v_b then
    v_falla := v_falla || ' 3b(reabrir dejó la firma puesta: kilos de hoy con la firma de ayer)';
  end if;
  if v_n <> 1 then v_falla := v_falla || format(' 3c(el contador de reaperturas dice %s)', v_n); end if;
  select reabierta_nota into v_txt from public.roturas_salidas where id = s1;
  if v_txt is distinct from 'peso mal tecleado' then
    v_falla := v_falla || ' 3d(no quedó escrito por qué se reabrió)';
  end if;
  /* SIN MOTIVO NO SE REABRE: una reapertura sin explicación no se puede
     defender tres meses después. */
  begin
    perform public.salida_reabrir(s2, '   ');
    v_falla := v_falla || ' 3e(reabrió sin decir por qué)';
  exception when others then
    if position('por qué' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3e(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 4. QUIEN MANDA PUEDE QUITAR LA TOLVA DE LO QUE ACABA DE REABRIR
  -- ================================================================
  -- ESTA PRUEBA CAMBIÓ LA MIGRACIÓN. Se escribió creyendo que había que
  -- agregarle `manda()` a `salida_quitar_tolva`, y lo primero que hizo
  -- fue avisar de que el rol «dueno» YA tenía el permiso de supervisora:
  -- `rotura_puede` pasa por `mi_nivel_pantalla`, que le devuelve
  -- «editar» a quien manda. El cambio sobraba y se quitó. Lo que sí hay
  -- que sostener es esto: reabrir y quedarse sin poder corregir sería
  -- reabrir para nada.
  if not public.rotura_puede('supervisora') then
    v_falla := v_falla || ' 4(quien manda perdió el permiso de quitar tolvas)';
  end if;
  begin
    perform public.salida_quitar_tolva(t1);
  exception when others then
    v_falla := v_falla || ' 4b(reabrió y no pudo quitar la tolva: ' || sqlerrm || ')';
  end;
  select count(*) into v_n from public.roturas_salida_tolvas where salida_id = s1;
  if v_n <> 0 then v_falla := v_falla || format(' 4c(quedaron %s tolvas)', v_n); end if;

  -- ================================================================
  -- 5. LO YA DESPACHADO NO SE REABRE NI SE ANULA
  -- ================================================================
  set role postgres;
  update public.roturas_salidas set despachada_en = now() where id = s2;
  set role probador;
  begin
    perform public.salida_reabrir(s2, 'quiero cambiarle los kilos');
    v_falla := v_falla || ' 5(reabrió una salida que ya salió por la puerta)';
  exception when others then
    if position('Facturación' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.salida_anular(s2, 'quiero borrarla');
    v_falla := v_falla || ' 5b(anuló una salida que ya salió por la puerta)';
  exception when others then
    if position('Facturación' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 6. ANULAR, Y LO QUE NO SE PUEDE HACER DESPUÉS
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  begin
    perform public.salida_anular(s1, 'se registró dos veces');
  exception when others then
    v_falla := v_falla || ' 6(el administrador no pudo anular: ' || sqlerrm || ')';
  end;
  select estado::text into v_txt from public.roturas_salidas where id = s1;
  if v_txt is distinct from 'anulada' then
    v_falla := v_falla || format(' 6b(anular la dejó en %s)', v_txt);
  end if;
  /* ANULAR ES «ESTO NO PASÓ»: no se reabre. Para volver atrás se abre
     una salida nueva. */
  begin
    perform public.salida_reabrir(s1, 'me arrepentí');
    v_falla := v_falla || ' 6c(reabrió una salida anulada)';
  exception when others then
    if position('anulada' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6c(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.salida_anular(s1, 'otra vez');
    v_falla := v_falla || ' 6d(anuló dos veces la misma salida)';
  exception when others then
    if position('ya está anulada' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6d(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 7. LA VISTA LO DICE
  -- ================================================================
  select reaperturas into v_n from public.v_roturas_salidas where id = s1;
  if v_n <> 1 then
    v_falla := v_falla || format(' 7(la vista dice %s reaperturas y fue 1)', coalesce(v_n, -1));
  end if;

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: reabrir y anular son de quien MANDA —por la casilla del rol, no por el nombre—;';
  raise notice 'BIEN: reabrir tumba las firmas, exige motivo y cuenta las veces;';
  raise notice 'BIEN: quien manda puede quitar la tolva de lo que acaba de reabrir;';
  raise notice 'BIEN: lo ya despachado no se reabre ni se anula, y lo anulado no se reabre.';
end $$;
