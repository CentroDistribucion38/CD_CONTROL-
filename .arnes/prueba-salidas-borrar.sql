\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- BORRAR SALIDAS EN LOTE — «por si quiero empezar mi data de cero»
--
-- ESTO BORRA PESOS. Cada salida se lleva sus tolvas: lo que alguien
-- leyó en la báscula y la tara con la que se pesó ese día. Lo que puede
-- romperse, y por qué importa cada cosa:
--
--  1. QUE LO PUEDA HACER CUALQUIERA. Es del administrador, y por la
--     CASILLA del rol y no por el nombre «admin»: el día que se cree un
--     segundo rol que mande, comparar contra un nombre deja de proteger
--     y lo hace en la dirección peligrosa.
--
--  2. QUE BORRE SIN MOTIVO. La fila se va; el motivo es lo único que
--     queda.
--
--  3. QUE NO DEJE RASTRO, O QUE LO DEJE A MEDIAS. Guardar la cabecera
--     sin las tolvas deja el registro contestando «se borró SR-0007,
--     489 kg» sin poder decir de cuántas tolvas salían ni con qué tara
--     — que es justo lo que se pregunta cuando alguien reclama.
--
--  4. QUE EL RASTRO SE ESCRIBA DESPUÉS DEL DELETE. Las tolvas ya se
--     habrían ido con la cascada y quedaría una lista vacía.
--
--  5. QUE EL REGISTRO DE BORRADAS LO PUEDA LEER CUALQUIERA. Sería una
--     segunda copia de lo borrado al alcance de todos.
--
--  6. QUE BORRE DE A UNA CUANDO SE PIDEN VARIAS, o que conteste un
--     número que no es el que borró.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('11111111-1111-1111-1111-111111111111','jefe@cd.local'),
  ('22222222-2222-2222-2222-222222222222','easy@cd.local')
on conflict do nothing;

do $prueba$
declare
  ROOT constant text := '44444444-4444-4444-4444-444444444444';
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  EASY constant text := '22222222-2222-2222-2222-222222222222';
  v_falla text := '';
  s1 uuid; s2 uuid; s3 uuid;
  v_n int;
  v_json jsonb;
begin
  -- -------------------------------------------------------------------
  -- EL FIXTURE
  --
  -- UN ROL QUE MANDA Y OTRO QUE NO, y el que manda NO se llama «admin»:
  -- si se llamara así, la prueba de «pregunta por la casilla y no por
  -- el nombre» pasaría sin probar nada.
  -- -------------------------------------------------------------------
  insert into public.roles (clave, nombre, manda) values
    ('mando_general','Mando general', true),
    ('logistico','Operador logístico', false)
  on conflict (clave) do update set manda = excluded.manda;

  update public.perfiles set rol = 'mando_general', activo = true where id = ROOT::uuid;
  update public.perfiles set rol = 'logistico', activo = true where id in (JEFE::uuid, EASY::uuid);

  insert into public.rol_permisos (rol, seccion, nivel) values
    ('mando_general','/roturas/salida','editar'),
    ('logistico','/roturas/salida','editar')
  on conflict (rol, seccion) do update set nivel = excluded.nivel;

  insert into public.roturas_tolvas (codigo, modelo, tara_kg, activo)
  values ('TV-01','Tolva de prueba', 111, true)
  on conflict (codigo) do nothing;

  -- TRES SALIDAS CON TOLVAS DE VERDAD. Sin tolvas, la comprobación de
  -- que el rastro las guarda pasaría con una lista vacía.
  --
  -- `set role probador` Y NO SEGUIR COMO postgres: el superusuario SE
  -- SALTA LA RLS. Sin esto, «el operador logístico no ve lo borrado»
  -- sale rojo por un motivo falso —o, peor, saldría VERDE el día que la
  -- política esté mal y el fixture sea superusuario—.
  set role probador;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  select r.id into s1 from public.salida_abrir('ABC111', null) r;
  select r.id into s2 from public.salida_abrir('ABC222', null) r;
  select r.id into s3 from public.salida_abrir('ABC333', null) r;
  perform public.salida_pesar(s1, 'TV-01', 'ambar', 600);
  perform public.salida_pesar(s2, 'TV-01', 'flint', 400);
  perform public.salida_pesar(s2, 'TV-01', 'ambar', 500);

  -- ===================================================================
  -- 1. NO ES DE CUALQUIERA
  -- ===================================================================
  perform set_config('request.jwt.claim.sub', EASY, true);
  begin
    perform public.salidas_borrar(array[s1], 'porque sí y porque quiero');
    v_falla := v_falla || ' 1a(el operador logístico pudo borrar salidas)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  select count(*) into v_n from public.roturas_salidas where id = s1;
  if v_n <> 1 then v_falla := v_falla || ' 1b(el intento igual la borró)'; end if;

  -- ===================================================================
  -- 2. SIN MOTIVO NO SE BORRA
  -- ===================================================================
  perform set_config('request.jwt.claim.sub', ROOT, true);
  begin
    perform public.salidas_borrar(array[s1], '   ');
    v_falla := v_falla || ' 2a(se borró sin motivo)';
  exception when others then
    if position('por qué se borran' in sqlerrm) = 0 then
      v_falla := v_falla || ' 2a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  select count(*) into v_n from public.roturas_salidas where id = s1;
  if v_n <> 1 then v_falla := v_falla || ' 2b(el intento sin motivo igual la borró)'; end if;

  -- Y sin escoger nada tampoco: un arreglo vacío que «borra 0» y
  -- contesta bien es cómo un botón parece funcionar sin hacer nada.
  begin
    perform public.salidas_borrar(array[]::uuid[], 'data de prueba');
    v_falla := v_falla || ' 2c(aceptó una lista vacía)';
  exception when others then
    if position('ninguna salida' in sqlerrm) = 0 then
      v_falla := v_falla || ' 2c(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ===================================================================
  -- 3 Y 4. BORRA, Y DEJA LA FILA ENTERA **CON SUS TOLVAS**
  --
  -- s2 tiene DOS tolvas a propósito: con una sola, guardar «la primera»
  -- en vez de «todas» saldría verde.
  -- ===================================================================
  select public.salidas_borrar(array[s1, s2], 'Data de prueba, arrancamos el mes limpio')
    into v_n;
  if v_n <> 2 then
    v_falla := v_falla || format(' 3a(contestó %s y borró dos)', v_n);
  end if;

  select count(*) into v_n from public.roturas_salidas where id in (s1, s2);
  if v_n <> 0 then v_falla := v_falla || ' 3b(no las borró)'; end if;
  -- Y las tolvas se fueron con ellas.
  select count(*) into v_n from public.roturas_salida_tolvas where salida_id in (s1, s2);
  if v_n <> 0 then v_falla := v_falla || ' 3c(quedaron tolvas huérfanas)'; end if;
  -- Pero NO se tocó la que no se escogió.
  select count(*) into v_n from public.roturas_salidas where id = s3;
  if v_n <> 1 then v_falla := v_falla || ' 3d(se llevó por delante una que no se escogió)'; end if;

  select count(*) into v_n from public.roturas_salidas_borradas where id in (s1, s2);
  if v_n <> 2 then v_falla := v_falla || format(' 4a(el rastro tiene %s filas y deben ser 2)', v_n); end if;

  select b.tolvas into v_json from public.roturas_salidas_borradas b where b.id = s2;
  if v_json is null or jsonb_array_length(v_json) <> 2 then
    v_falla := v_falla || format(' 4b(el rastro de s2 guardó %s tolvas y eran 2: se escribió DESPUÉS del delete)',
                                 coalesce(jsonb_array_length(v_json), -1));
  end if;
  -- Y la fila entera, no solo el código: «se borró SR-0007» sin los
  -- kilos no contesta lo que se va a preguntar.
  select b.fila into v_json from public.roturas_salidas_borradas b where b.id = s2;
  if v_json is null or not (v_json ? 'placa') or not (v_json ? 'estado') then
    v_falla := v_falla || ' 4c(el rastro no guardó la fila entera)';
  end if;
  select count(*) into v_n from public.roturas_salidas_borradas b
   where b.id = s1 and b.motivo like '%mes limpio%' and b.borrada_por = ROOT::uuid;
  if v_n <> 1 then v_falla := v_falla || ' 4d(el rastro no guardó el motivo y quién)'; end if;

  -- ===================================================================
  -- 5. EL REGISTRO DE BORRADAS SOLO LO LEE QUIEN MANDA
  -- ===================================================================
  perform set_config('request.jwt.claim.sub', EASY, true);
  select count(*) into v_n from public.roturas_salidas_borradas;
  if v_n <> 0 then
    v_falla := v_falla || format(' 5a(el operador logístico ve %s filas de lo borrado)', v_n);
  end if;
  perform set_config('request.jwt.claim.sub', ROOT, true);
  select count(*) into v_n from public.roturas_salidas_borradas;
  if v_n <> 2 then
    v_falla := v_falla || format(' 5b(quien manda ve %s filas y debe ver 2)', v_n);
  end if;

  -- ===================================================================
  -- 6. UNA QUE YA NO EXISTE NO PASA POR BUENA
  -- ===================================================================
  begin
    perform public.salidas_borrar(array[s1], 'ya no está, esto no debería pasar');
    v_falla := v_falla || ' 6a(borrar algo que ya no existe contestó bien)';
  exception when others then
    if position('existe ya' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  set role postgres;

  -- -------------------------------------------------------------------
  if v_falla <> '' then
    raise exception 'FALLA:%', v_falla;
  end if;
  raise notice 'BIEN: borrar salidas en lote es del ADMINISTRADOR —por la casilla del rol, no';
  raise notice 'BIEN: por el nombre «admin»—, exige motivo, no acepta una lista vacia, borra';
  raise notice 'BIEN: SOLO las escogidas, se lleva sus tolvas, y deja la fila entera CON sus';
  raise notice 'BIEN: tolvas en roturas_salidas_borradas —que solo lee quien manda—.';

exception when others then
  -- SE VUELVE A postgres ANTES DE HABLAR: si se murió siendo
  -- `probador`, el `raise` de abajo puede no tener ni permiso de leer
  -- lo que necesita para explicarse.
  set role postgres;
  -- UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE. Sin esto, una excepción
  -- a mitad de camino deja la consola en blanco y parece que pasó.
  raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
end $prueba$;
