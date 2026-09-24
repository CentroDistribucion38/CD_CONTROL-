\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- AVERÍAS · LA UBICACIÓN DEL MAESTRO Y LA HORA DE LA BASE
--
-- Lo que tiene que ser cierto:
--
--  1. QUE SE PUEDA REGISTRAR EN UNA UBICACIÓN QUE NO ESTÁ EN EL
--     MAESTRO. Era todo el punto del cambio: con texto libre la misma
--     calle se escribe de cuatro formas y la concentración por calle
--     reparte un pasillo en tres.
--
--  2. QUE SE PUEDA REGISTRAR EN UNA APAGADA. Una ubicación apagada es
--     una que la bodega dejó de usar: registrar ahí es registrar en un
--     sitio al que nadie va a ir a mirar.
--
--  3. QUE LA FECHA SE PUEDA MANDAR DESDE FUERA. Si `averia_registrar`
--     todavía aceptara `p_fecha`, quitar el campo de la pantalla sería
--     decoración: a una función se llega llamándola.
--
--  4. QUE EL TURNO SE CALCULE MAL O SE QUEDE EN NULO. Es lo que se
--     pidió —«en qué turno, a qué hora, en qué fecha»— y se congela al
--     guardar: calculado al vuelo cada vez, una avería del turno 2
--     pasaría a ser del 1 el día que se mueva el horario.
--
--  5. QUE EL TEXTO DE LA UBICACIÓN LO ARME CADA UNO POR SU CUENTA.
--     Tres sitios armando «calle · módulo · lado» son tres sitios donde
--     un día uno pone guion y otro punto.
--
--  6. QUE «CORREGIR» SE SALTE LA REGLA. Una regla que solo se aplica
--     en uno de los dos caminos no es una regla: el texto libre
--     entraría por la puerta de atrás.
--
--  7. QUE «PASÓ ANTES» SEA HOY O DESPUÉS. Entonces no es «antes» y
--     solo repite la fecha del registro en otra columna.
--
--  8. QUE LAS AVERÍAS VIEJAS DESAPAREZCAN de la vista por no tener
--     amarre al maestro.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('11111111-1111-1111-1111-111111111111','bodega@cd.local')
on conflict do nothing;

do $prueba$
declare
  ROOT   constant text := '44444444-4444-4444-4444-444444444444';
  OPERARIO constant text := '11111111-1111-1111-1111-111111111111';
  v_falla text := '';
  v_bod uuid; u_izq uuid; u_der uuid; u_off uuid;
  a1 uuid; v_cod text;
  v_txt text; v_n int; v_hoy date;
  /* APARTE Y NO REUTILIZANDO `u_izq`: guardar aquí el `ubicacion_id`
     leído de la fila pisaba el id del maestro, y después «corregir»
     corregía a la MISMA ubicación — la prueba se ponía roja sola. */
  v_ubi uuid;
begin
  v_hoy := (now() at time zone 'America/Bogota')::date;

  -- -------------------------------------------------------------------
  -- EL FIXTURE
  -- -------------------------------------------------------------------
  insert into public.roles (clave, nombre, manda) values
    ('mando_general','Mando general', true),
    ('bodeguero','Bodeguero', false)
  on conflict (clave) do update set manda = excluded.manda;
  update public.perfiles set rol = 'mando_general', activo = true where id = ROOT::uuid;
  update public.perfiles set rol = 'bodeguero', activo = true where id = OPERARIO::uuid;
  insert into public.rol_permisos (rol, seccion, nivel) values
    ('mando_general','/inventario/averias','editar'),
    ('bodeguero','/inventario/averias','editar')
  on conflict (rol, seccion) do update set nivel = excluded.nivel;

  select id into v_bod from public.bodegas limit 1;
  if v_bod is null then
    insert into public.bodegas (codigo, nombre) values ('AG01','Bodega de prueba')
    returning id into v_bod;
  end if;

  insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, activa) values
    (v_bod, 'A03_M12_IZQ', 'A03', 'M12', 'IZQ', true),
    (v_bod, 'A03_M12_DER', 'A03', 'M12', 'DER', true),
    (v_bod, 'B01_M01',     'B01', 'M01', null,  false)
  on conflict (bodega_id, clave) do update set activa = excluded.activa;
  select id into u_izq from public.ubicaciones where clave = 'A03_M12_IZQ';
  select id into u_der from public.ubicaciones where clave = 'A03_M12_DER';
  select id into u_off from public.ubicaciones where clave = 'B01_M01';

  insert into public.productos (sku, nombre, activo) values ('SKU1','Aguila Lta 355', true)
  on conflict (sku) do nothing;
  insert into public.averias_causales (clave, nombre, externa, activo) values
    ('transporte','Avería transporte', true, true)
  on conflict (clave) do update set activo = true;

  perform set_config('request.jwt.claims', json_build_object('sub', OPERARIO)::text, true);

  -- ===================================================================
  -- 1. SIN MAESTRO NO HAY UBICACIÓN
  -- ===================================================================
  begin
    perform public.averia_registrar(
      gen_random_uuid(), 'SKU1', 3, 0, 'transporte', 'Yo', null, null, null);
    v_falla := v_falla || E'\n · se registró en una ubicación que NO está en el maestro';
  exception when others then null;
  end;
  begin
    perform public.averia_registrar(null, 'SKU1', 3, 0, 'transporte', 'Yo', null, null, null);
    v_falla := v_falla || E'\n · se registró sin ubicación';
  exception when others then null;
  end;

  -- ===================================================================
  -- 2. NI EN UNA APAGADA
  -- ===================================================================
  begin
    perform public.averia_registrar(u_off, 'SKU1', 3, 0, 'transporte', 'Yo', null, null, null);
    v_falla := v_falla || E'\n · se registró en una ubicación APAGADA del maestro';
  exception when others then null;
  end;

  -- ===================================================================
  -- 3. LA FECHA NO SE PUEDE MANDAR DESDE FUERA
  --
  -- Se pregunta al catálogo y no se intenta llamar: si la función
  -- todavía tuviera `p_fecha`, llamarla sin ese argumento pasaría
  -- igual —tiene valor por defecto— y la prueba no vería nada.
  -- ===================================================================
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'averia_registrar'
       and 'p_fecha' = any (p.proargnames)) then
    v_falla := v_falla || E'\n · averia_registrar TODAVÍA acepta p_fecha: la fecha se puede teclear';
  end if;
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'averia_registrar'
       and 'p_ubicacion' = any (p.proargnames)) then
    v_falla := v_falla || E'\n · quedó viva la versión vieja de averia_registrar con texto libre';
  end if;
  -- Y UNA SOLA VERSIÓN: con dos, la pantalla vieja seguiría guardando
  -- texto libre sin que nada avisara.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'averia_registrar';
  if v_n <> 1 then
    v_falla := v_falla || E'\n · hay ' || v_n || ' versiones de averia_registrar y debe haber UNA';
  end if;

  -- ===================================================================
  -- 4 y 5. EL REGISTRO BUENO: TURNO, HORA, FECHA Y TEXTO
  -- ===================================================================
  select id, codigo into a1, v_cod from public.averia_registrar(
    u_der, 'SKU1', 5, 0, 'transporte', 'Genesis', null, 'La estiba se cayó', null);
  if a1 is null then v_falla := v_falla || E'\n · no se pudo registrar la avería buena'; end if;

  select fecha, turno, ubicacion, ubicacion_id
    into v_hoy, v_n, v_txt, v_ubi
    from public.averias where id = a1;
  if v_ubi is distinct from u_der then
    v_falla := v_falla || E'\n · la avería no quedó amarrada a la ubicación del maestro';
  end if;
  if v_hoy <> (now() at time zone 'America/Bogota')::date then
    v_falla := v_falla || E'\n · la fecha no es la de hoy en Colombia';
  end if;
  if v_n is null then
    v_falla := v_falla || E'\n · el turno quedó en nulo: se pidió saber en qué turno se registró';
  elsif v_n <> public.turno_cd(now()) then
    v_falla := v_falla || E'\n · el turno guardado (' || v_n || ') no es el de ahora ('
                       || public.turno_cd(now()) || ')';
  end if;
  -- EL TEXTO LO ARMA LA BASE, con calle · módulo · lado.
  if v_txt is distinct from 'A03 · M12 · DER' then
    v_falla := v_falla || E'\n · el texto de la ubicación se armó mal: «' || coalesce(v_txt,'(nulo)') || '»';
  end if;

  -- EL TURNO DEL CD, EN SUS TRES TRAMOS. Son OTROS que los de la
  -- planta de envasado —allá el A arranca a medianoche— y confundirlos
  -- movería de turno todo lo que se registre entre las 22 y las 6.
  if public.turno_cd('2026-09-24 08:00-05'::timestamptz) <> 1
     or public.turno_cd('2026-09-24 16:00-05'::timestamptz) <> 2
     or public.turno_cd('2026-09-24 23:00-05'::timestamptz) <> 3
     or public.turno_cd('2026-09-24 03:00-05'::timestamptz) <> 3 then
    v_falla := v_falla || E'\n · turno_cd no parte el día en 06–14 / 14–22 / 22–06';
  end if;
  -- Y EN HORA DE COLOMBIA, no en la del servidor: Vercel corre en UTC,
  -- y a las 8 de la noche de acá allá ya es la 1 de la mañana.
  if public.turno_cd('2026-09-25 01:00+00'::timestamptz) <> 2 then
    v_falla := v_falla || E'\n · turno_cd usa la hora del servidor y no la de Colombia';
  end if;

  -- LA VISTA DESGLOSA LA CALLE DE VERDAD, no partiendo el texto.
  select calle, hora into v_txt, v_cod from public.v_averias where id = a1;
  if v_txt is distinct from 'A03' then
    v_falla := v_falla || E'\n · la vista no trae la calle del maestro: «' || coalesce(v_txt,'(nulo)') || '»';
  end if;
  /* CON `coalesce`, Y NO POR ADORNO: si la vista deja de traer la
     hora, `null !~ '...'` NO da falso — da NULL, y un `if NULL then`
     no entra. La prueba se quedaba callada justo en el caso que dice
     cazar. Lo encontró la mutación 5c. */
  if coalesce(v_cod, '') !~ '^\d{2}:\d{2}$' then
    v_falla := v_falla || E'\n · la vista no trae la hora del registro: «' || coalesce(v_cod,'(nulo)') || '»';
  end if;

  -- ===================================================================
  -- 7. «PASÓ ANTES» NO PUEDE SER HOY NI DESPUÉS
  -- ===================================================================
  begin
    perform public.averia_registrar(u_der, 'SKU1', 1, 0, 'transporte', 'Yo', null, null,
                                    (now() at time zone 'America/Bogota')::date);
    v_falla := v_falla || E'\n · aceptó «pasó antes» = hoy, que no es «antes»';
  exception when others then null;
  end;
  -- Y AYER SÍ, que es para lo que existe.
  declare a2 uuid;
  begin
    select id into a2 from public.averia_registrar(
      u_der, 'SKU1', 1, 0, 'transporte', 'Yo', null, null,
      (now() at time zone 'America/Bogota')::date - 1);
    if a2 is null then v_falla := v_falla || E'\n · no dejó decir que pasó ayer'; end if;
  end;

  -- ===================================================================
  -- 6. «CORREGIR» LLEVA LA MISMA REGLA
  -- ===================================================================
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'averia_corregir'
       and 'p_ubicacion' = any (p.proargnames)) then
    v_falla := v_falla || E'\n · «corregir» sigue aceptando texto libre: la regla tiene puerta trasera';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'averia_corregir'
       and 'p_fecha' = any (p.proargnames)) then
    v_falla := v_falla || E'\n · «corregir» todavía deja cambiar la fecha del registro a mano';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ROOT)::text, true);
  begin
    perform public.averia_corregir(a1, gen_random_uuid(), 'SKU1', 5, 0, 'transporte', 'Yo',
                                   null, null, null);
    v_falla := v_falla || E'\n · «corregir» aceptó una ubicación que no está en el maestro';
  exception when others then null;
  end;
  perform public.averia_corregir(a1, u_izq, 'SKU1', 6, 0, 'transporte', 'Genesis',
                                 null, null, null);
  select ubicacion, cajas into v_txt, v_n from public.averias where id = a1;
  if v_txt is distinct from 'A03 · M12 · IZQ' or v_n <> 6 then
    v_falla := v_falla || E'\n · corregir no cambió la ubicación al texto del maestro: «'
                       || coalesce(v_txt,'(nulo)') || '»';
  end if;

  -- ===================================================================
  -- 8. LAS VIEJAS SIN AMARRE SE SIGUEN VIENDO
  --
  -- Con un join interior desaparecerían de la lista sin que nadie se
  -- entere, que es la peor forma de perder datos: en silencio.
  -- ===================================================================
  insert into public.averias (codigo, fecha, ubicacion, producto_sku, producto,
                              cajas, unidades, causal, reporto, creado_por)
  values ('AV-VIEJA', v_hoy, 'a3 m12 como sea', 'SKU1', 'Aguila Lta 355',
          2, 0, 'transporte', 'Alguien', ROOT::uuid);
  select count(*) into v_n from public.v_averias where codigo = 'AV-VIEJA';
  if v_n <> 1 then
    v_falla := v_falla || E'\n · una avería vieja sin amarre al maestro DESAPARECIÓ de la vista';
  end if;
  select calle into v_txt from public.v_averias where codigo = 'AV-VIEJA';
  if v_txt is not null then
    v_falla := v_falla || E'\n · a una avería sin amarre se le inventó una calle: «' || v_txt || '»';
  end if;

  if v_falla <> '' then
    raise exception 'FALLA:%', v_falla;
  end if;
  raise notice 'BIEN: Averias — la ubicacion sale del maestro (ni inventada ni apagada), la '
               'fecha/hora/turno los pone la base y no se pueden mandar, el texto lo arma un '
               'solo sitio, «pasó antes» solo acepta antes, corregir lleva la misma regla y las '
               'averias viejas sin amarre se siguen viendo.';
exception when others then
  set role postgres;
  raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
end $prueba$;
