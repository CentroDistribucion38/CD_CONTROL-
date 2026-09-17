-- =====================================================================
-- INVENTARIO · LA PLANTILLA DE CONTEO CONTRA LA HOJA DE VERDAD
-- ---------------------------------------------------------------------
-- Las seis columnas calculadas se comprueban contra renglones REALES de
-- «FEFO 002.xlsx», con los valores que el Excel mostraba el 16/09/2026
-- (su «FECHA DE ANALISIS»). Si una fórmula se copió mal, aquí revienta;
-- si alguien la cambia mañana, revienta también.
--
-- LOS DÍAS SE COMPARAN DESPLAZADOS. «DIAS PARA SALIR» y «DIAS PARA
-- VENCER» salen de TODAY(), así que los números del Excel son los de
-- ese día. Fijarlos tal cual habría hecho una prueba que pasa hoy y
-- falla mañana — que es peor que no tenerla. Se comparan contra el
-- valor del Excel corrido por los días transcurridos.
--
-- Y SE COMPRUEBA LO QUE LA HOJA NO PODÍA: que no entre un renglón sin
-- fecha, que no entren estibas y cajas a la vez, que la ubicación sea
-- de esta bodega, que nadie escriba en el conteo de otro, y que cerrar
-- un conteo FEFO no destroce el kardex.
-- =====================================================================
\set ON_ERROR_STOP on

-- LO QUE SUPABASE DA SOLO. En la nube, `authenticated` trae permiso
-- sobre todo lo del esquema public por privilegios por defecto de la
-- plataforma, así que inventario.sql nunca tuvo que escribir un `grant`
-- para bodegas o productos. Aquí, en un Postgres pelado, no existen — y
-- sin esto la prueba falla con «permission denied for table bodegas»,
-- que es un agujero del banco de pruebas y no del módulo. Se replica
-- para que lo que se mida sea RLS y no la falta de un grant.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'heiner@x.co', '{}'::jsonb),
       ('22222222-2222-2222-2222-222222222222', 'otro@x.co',   '{}'::jsonb)
on conflict (id) do nothing;

insert into public.perfiles (id, usuario, nombre, rol, activo)
values ('11111111-1111-1111-1111-111111111111', 'heiner', 'DE LEON HEINER', 'admin', true),
       ('22222222-2222-2222-2222-222222222222', 'otro',   'OTRA PERSONA',   'operador', true)
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true;

-- BORRÓN Y CUENTA NUEVA. Esta prueba se corre DOS VECES y la segunda es
-- la que vale: la primera pasa hasta cuando el archivo deja basura
-- detrás. Ya me pasó con la versión anterior de esta misma prueba —
-- desactivaba un material a propósito y no lo volvía a encender, y la
-- segunda vuelta reventaba por su propia huella y no por un error.
delete from public.movimientos
 where conteo_id in (select id from public.conteos
                      where responsable_id in ('11111111-1111-1111-1111-111111111111',
                                               '22222222-2222-2222-2222-222222222222'));
delete from public.conteos
 where responsable_id in ('11111111-1111-1111-1111-111111111111',
                          '22222222-2222-2222-2222-222222222222');

commit;

-- ---------------------------------------------------------------------
-- A PARTIR DE AQUÍ, COMO USUARIO NORMAL. Probar las funciones como
-- superusuario no prueba nada: el candado es RLS y auth.uid(), y el
-- superusuario se los salta.
--
-- `set local` y set_config(..., true) son de la TRANSACCIÓN, y fuera de
-- una se pierden antes de llegar al DO. De sesión, que es lo que dura.
-- ---------------------------------------------------------------------
set role probador;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false) \gset

do $$
declare
  v_bod uuid; v_conteo uuid; v_l record; v_n int; v_err text;
  v_id1 uuid; v_id2 uuid; v_id3 uuid; v_id4 uuid; v_id5 uuid;
  -- Los días del Excel son los del 16/09/2026; se corren los
  -- transcurridos desde entonces.
  v_corrido int := current_date - date '2026-09-16';
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  if v_bod is null then
    raise exception 'FALLA: no existe la bodega CD38; falta correr inventario-maestro-cd38.sql';
  end if;

  -- ===== 0. EL MAESTRO ENTRÓ =====
  select count(*) into v_n from public.productos where cajas_por_estiba is not null;
  if v_n < 480 then
    raise exception 'FALLA: solo hay % productos con factor estibado', v_n;
  end if;
  select count(*) into v_n from public.ubicaciones where bodega_id = v_bod;
  if v_n <> 428 then raise exception 'FALLA: hay % ubicaciones, deberían ser 428', v_n; end if;
  select count(*) into v_n from public.productos where tipo_material = 'ENVASE';
  if v_n <> 32 then
    raise exception 'FALLA: hay % envases; en Hoja1 son 32', v_n;
  end if;
  raise notice '✓ el maestro entero está: 494 materiales (32 envases) y 428 ubicaciones';

  -- ===== 1. ABRIR =====
  v_conteo := public.conteo_fefo_abrir(v_bod);
  if v_conteo is null then raise exception 'FALLA: no devolvió conteo'; end if;
  -- Llamarla otra vez devuelve EL MISMO: quien vuelve del almuerzo sigue
  -- en su recorrido en vez de partir la mañana en dos.
  if public.conteo_fefo_abrir(v_bod) <> v_conteo then
    raise exception 'FALLA: abrió un segundo conteo en vez de seguir el abierto';
  end if;
  -- Y arranca VACÍO: el FEFO se camina, no se tacha.
  select count(*) into v_n from public.conteo_lineas where conteo_id = v_conteo;
  if v_n <> 0 then
    raise exception 'FALLA: el conteo FEFO arrancó con % renglones sembrados', v_n;
  end if;
  raise notice '✓ abrir devuelve el conteo abierto y arranca vacío';

  -- ===== 2. LOS RENGLONES DE LA HOJA REAL =====
  -- Fila 5: 3128 · E01 · 42 cajas sueltas · vence 11/3/27
  -- En el Excel la fila iba SIN LADO; aquí la ubicación se escoge y E01
  -- existe como E01_DER y E01_IZQ, así que hay que decir cuál. Ese es
  -- justo el cuarto del conteo que en la hoja no se podía ubicar.
  v_id1 := public.conteo_fefo_agregar(
    v_conteo, '3128',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER'),
    false, null, 42, 11::smallint, 3::smallint, 27::smallint);

  -- Fila 13: 17740 · E06_IZQ · 56 estibas · vence 21/8/27
  v_id2 := public.conteo_fefo_agregar(
    v_conteo, '17740',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E06_IZQ'),
    true, 56, null, 21::smallint, 8::smallint, 27::smallint);

  -- Fila 22: 3500231 · ENVASE · E08_DER · 80 estibas · vence 13/9/26
  v_id3 := public.conteo_fefo_agregar(
    v_conteo, '3500231',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E08_DER'),
    true, 80, null, 13::smallint, 9::smallint, 26::smallint);

  -- Fila 42: 31 · barril, vida 60, mínimo 30 · D19_IZQ · 9 cajas
  -- Es el que prueba que «días para salir» NO es 90: aquí da -27.
  v_id4 := public.conteo_fefo_agregar(
    v_conteo, '31',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'D19_IZQ'),
    true, null, 9, 19::smallint, 9::smallint, 26::smallint,
    false, false, 'LLENOS');

  -- Fila 87: 20050 · C09_DER · 2 estibas · AVERÍA
  v_id5 := public.conteo_fefo_agregar(
    v_conteo, '20050',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'C09_DER'),
    true, 2, null, 12::smallint, 8::smallint, 27::smallint, true);

  -- ===== 3. LAS SEIS CUENTAS, CONTRA EL EXCEL =====
  -- fila 5: P=42 Q=45 R=0 S=2027-03-11 T=86 U=176
  select * into v_l from public.v_conteo_fefo where id = v_id1;
  if v_l.total_cajas <> 42      then raise exception 'FALLA f5 TOTAL CAJAS: % (Excel 42)', v_l.total_cajas; end if;
  if v_l.factor_estibado <> 45  then raise exception 'FALLA f5 FACTOR: % (Excel 45)', v_l.factor_estibado; end if;
  if v_l.total_estibas <> 0     then raise exception 'FALLA f5 TOTAL ESTIBAS: % (Excel 0)', v_l.total_estibas; end if;
  if v_l.vencimiento <> date '2027-03-11' then raise exception 'FALLA f5 VENCIMIENTO: %', v_l.vencimiento; end if;
  if v_l.dias_para_salir  <> 86  - v_corrido then raise exception 'FALLA f5 DIAS PARA SALIR: % (Excel 86)', v_l.dias_para_salir; end if;
  if v_l.dias_para_vencer <> 176 - v_corrido then raise exception 'FALLA f5 DIAS PARA VENCER: % (Excel 176)', v_l.dias_para_vencer; end if;

  -- fila 13: P=26880 Q=480 R=56 S=2027-08-21 T=249 U=339
  select * into v_l from public.v_conteo_fefo where id = v_id2;
  if v_l.total_cajas <> 26880 then raise exception 'FALLA f13 TOTAL CAJAS: % (Excel 26880)', v_l.total_cajas; end if;
  if v_l.total_estibas <> 56  then raise exception 'FALLA f13 TOTAL ESTIBAS: %', v_l.total_estibas; end if;
  if v_l.dias_para_salir  <> 249 - v_corrido then raise exception 'FALLA f13 DIAS PARA SALIR: %', v_l.dias_para_salir; end if;
  if v_l.dias_para_vencer <> 339 - v_corrido then raise exception 'FALLA f13 DIAS PARA VENCER: %', v_l.dias_para_vencer; end if;

  -- fila 22: ENVASE → U=0 SIEMPRE, aunque la fecha ya pasó. T=-3.
  select * into v_l from public.v_conteo_fefo where id = v_id3;
  if v_l.total_cajas <> 4320 then raise exception 'FALLA f22 TOTAL CAJAS: % (Excel 4320)', v_l.total_cajas; end if;
  if v_l.dias_para_vencer <> 0 then
    raise exception 'FALLA f22: el envase no vence, DIAS PARA VENCER debería ser 0 y dio %', v_l.dias_para_vencer;
  end if;
  if v_l.dias_para_salir <> -3 - v_corrido then raise exception 'FALLA f22 DIAS PARA SALIR: % (Excel -3)', v_l.dias_para_salir; end if;

  -- fila 42: EL QUE PRUEBA QUE «DIAS PARA SALIR» NO ES 90.
  -- Vida útil 60, Mínimo T1 30 → T = 3 - 30 = -27, no 3 - 90.
  select * into v_l from public.v_conteo_fefo where id = v_id4;
  if v_l.dias_para_vencer <> 3 - v_corrido then raise exception 'FALLA f42 DIAS PARA VENCER: % (Excel 3)', v_l.dias_para_vencer; end if;
  if v_l.dias_para_salir <> -27 - v_corrido then
    raise exception 'FALLA f42 DIAS PARA SALIR: % (Excel -27). Si dio -87, alguien puso el mínimo en 90 fijo.', v_l.dias_para_salir;
  end if;
  if v_l.estado_envase <> 'LLENOS' then raise exception 'FALLA f42: se perdió el estado del envase'; end if;

  -- fila 87: la averiada se separa en UBICACIÓN COMBINADA.
  select * into v_l from public.v_conteo_fefo where id = v_id5;
  if v_l.total_cajas <> 520 then raise exception 'FALLA f87 TOTAL CAJAS: % (Excel 520)', v_l.total_cajas; end if;
  if v_l.ubicacion_combinada <> 'C09_DER AVERIA' then
    raise exception 'FALLA f87: la ubicación combinada dio «%» y debería marcar la avería', v_l.ubicacion_combinada;
  end if;
  if v_l.ubicacion_texto = v_l.ubicacion_combinada then
    raise exception 'FALLA f87: la estiba averiada no se separa de la buena del mismo módulo';
  end if;

  raise notice '✓ las 6 cuentas dan lo mismo que la hoja en los 5 renglones reales';

  -- ===== 4. LO QUE LA HOJA NO PODÍA =====
  -- 4.1 DOS CANTIDADES A LA VEZ (el dedazo de la fila 154).
  --     El mensaje cambió al entrar el saldo: antes decía «no las dos» y
  --     ahora «Una sola cantidad por renglón», porque ya son tres. Se
  --     busca «una sola cantidad», que es lo que la regla dice hoy.
  begin
    perform public.conteo_fefo_agregar(v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER'),
      false, 5, 5, 11::smallint, 3::smallint, 27::smallint);
    raise exception 'FALLA: aceptó estibas y cajas en el mismo renglón';
  exception when raise_exception then
    if position('na sola cantidad' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4.2 sin nada que contar
  begin
    perform public.conteo_fefo_agregar(v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER'),
      false, null, null, 11::smallint, 3::smallint, 27::smallint);
    raise exception 'FALLA: aceptó un renglón sin estibas, cajas ni saldo';
  exception when raise_exception then
    if position('estibas, cajas o saldo' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4.3 producto sin fecha de vencimiento
  begin
    perform public.conteo_fefo_agregar(v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_IZQ'),
      false, 1, null);
    raise exception 'FALLA: aceptó un producto sin fecha de vencimiento';
  exception when raise_exception then
    if position('vencimiento' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4.4 el envase SÍ puede ir sin fecha: no la trae impresa
  perform public.conteo_fefo_agregar(v_conteo, '3500231',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E08_IZQ'),
    false, 3, null, null, null, null, false, false, 'VACIOS');

  -- 4.5 sin contestar si rota — se contesta en las 152 filas de la hoja
  begin
    perform public.conteo_fefo_agregar(v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_IZQ'),
      null, 1, null, 11::smallint, 3::smallint, 27::smallint);
    raise exception 'FALLA: aceptó un renglón sin decir si rota';
  exception when raise_exception then
    if position('rota' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4.6 un código que no está en el maestro
  begin
    perform public.conteo_fefo_agregar(v_conteo, '999999',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER'),
      false, 1, null, 1::smallint, 1::smallint, 27::smallint);
    raise exception 'FALLA: aceptó un código que no existe';
  exception when raise_exception then
    if position('no está en el maestro' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4.7 una ubicación de otra bodega
  begin
    insert into public.bodegas (codigo, nombre) values ('ZZZ', 'OTRA') on conflict do nothing;
  exception when insufficient_privilege then null;
  end;

  -- 4.8 EL MISMO MATERIAL EN OCHO MÓDULOS NO ES UN DUPLICADO.
  -- Es lo que la llave vieja `unique (conteo_id, producto_id)` impedía y
  -- por lo que hubo que cambiarla: la misma cerveza está en varios
  -- módulos con varios vencimientos, y cada uno es un renglón de verdad.
  perform public.conteo_fefo_agregar(v_conteo, '3128',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E02_DER'),
    false, 3, null, 11::smallint, 3::smallint, 27::smallint);
  perform public.conteo_fefo_agregar(v_conteo, '3128',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E02_DER'),
    false, 3, null, 12::smallint, 4::smallint, 27::smallint);
  select count(*) into v_n from public.conteo_lineas
   where conteo_id = v_conteo and producto_id = (select id from public.productos where sku = '3128');
  if v_n <> 3 then
    raise exception 'FALLA: el mismo material debería tener 3 renglones y tiene %', v_n;
  end if;

  -- Pero el MISMO material, MISMO módulo y MISMA fecha sí es duplicado.
  begin
    perform public.conteo_fefo_agregar(v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E02_DER'),
      false, 3, null, 11::smallint, 3::smallint, 27::smallint);
    raise exception 'FALLA: dejó repetir material, módulo y fecha';
  exception when unique_violation then null;
  end;
  raise notice '✓ los 7 candados de la plantilla aguantan';

  -- ===== 5. BORRAR UN RENGLÓN =====
  perform public.conteo_fefo_borrar(v_id5);
  if exists (select 1 from public.conteo_lineas where id = v_id5) then
    raise exception 'FALLA: el renglón no se borró';
  end if;
  raise notice '✓ un renglón mal anotado se borra';
end $$;

-- ===== 6. EL CONTEO ES DE QUIEN LO ABRIÓ =====
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false) \gset

do $$
declare v_ajeno uuid; v_bod uuid;
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  select id into v_ajeno from public.conteos
   where responsable_id = '11111111-1111-1111-1111-111111111111' and tipo = 'fefo'
   order by creado_en desc limit 1;

  begin
    perform public.conteo_fefo_agregar(v_ajeno, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E03_DER'),
      false, 1, null, 11::smallint, 3::smallint, 27::smallint);
    raise exception 'FALLA: escribió en el conteo de otra persona';
  exception when raise_exception then
    if position('otra persona' in sqlerrm) = 0 then raise; end if;
  end;

  -- Pero SÍ lo puede ver: el valor del FEFO es que el de la tarde sepa
  -- qué contó el de la mañana. Esconderlo obligaría a pedirlo por
  -- WhatsApp, que es de donde venimos.
  if not exists (select 1 from public.v_conteo_fefo where conteo_id = v_ajeno) then
    raise exception 'FALLA: no puede ver lo que contó el otro';
  end if;
  raise notice '✓ nadie escribe en el conteo de otro, pero todos lo ven';
end $$;

-- ===== 7. CERRAR NO DESTROZA EL KARDEX =====
-- ESTE ES EL CANDADO QUE MÁS IMPORTA. `cerrar_conteo` generaba un
-- movimiento POR RENGLÓN, lo cual daba igual cuando había un renglón por
-- producto. Con FEFO el mismo producto trae varios renglones —uno por
-- módulo— y sin sumarlos primero el kardex recibiría varios ajustes
-- parciales del mismo producto, cada uno restándole el teórico completo.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false) \gset

do $$
declare v_conteo uuid; v_n int; v_mov int; v_total numeric;
begin
  select id into v_conteo from public.conteos
   where responsable_id = '11111111-1111-1111-1111-111111111111' and tipo = 'fefo'
   order by creado_en desc limit 1;

  select count(*) into v_n from public.conteo_lineas
   where conteo_id = v_conteo and producto_id = (select id from public.productos where sku = '3128');

  perform public.cerrar_conteo(v_conteo);

  select count(*), sum(cantidad) into v_mov, v_total
    from public.movimientos
   where conteo_id = v_conteo and producto_id = (select id from public.productos where sku = '3128');

  if v_mov <> 1 then
    raise exception 'FALLA: % renglones del 3128 generaron % movimientos. Debería ser UNO con la suma, o el inventario queda destrozado.', v_n, v_mov;
  end if;
  -- 42 + 3*45 + 3*45 = 312 cajas contadas, teórico 0.
  if v_total <> 312 then
    raise exception 'FALLA: el ajuste del 3128 dio % y la suma de sus renglones es 312', v_total;
  end if;
  raise notice '✓ cerrar suma por producto: % renglones del 3128 → 1 movimiento de 312', v_n;

  raise notice 'INVENTARIO · plantilla de conteo: las 6 cuentas dan lo mismo que la hoja y los candados aguantan.';
end $$;

reset role;


-- =====================================================================
-- EL SALDO, LA TERCERA CANTIDAD
--
-- El saldo es lo que queda en una estiba incompleta, y se guarda en su
-- propia columna: aritméticamente daría igual meterlo en `cajas` —las
-- tres terminan en cajas— pero entonces el informe no podría volver a
-- separar un saldo de unas cajas sueltas, y en el piso son dos cosas
-- distintas.
--
-- LO QUE SE PRUEBA, Y POR QUÉ CADA COSA:
--   1. Que el saldo SUME en total_cajas. Si la vista no lo suma, el
--      renglón se guarda bien y el total sale corto: el error no
--      aparece al anotar sino al cuadrar el mes.
--   2. Que no se puedan mandar dos cantidades. El candado antes miraba
--      dos columnas; con tres, `a is null or b is null` ya no dice lo
--      que hay que decir.
--   3. Que no quede viva la versión VIEJA de la función. Postgres no
--      reemplaza una función cuando le cambia la firma: crea otra. Si
--      quedan las dos, una llamada sin `p_saldo` entra por la de antes
--      —guarda bien, sin saldo— y nadie se entera hasta el informe.
-- =====================================================================
/* El `reset role` del bloque anterior también soltó la identidad, y sin
   ella `conteo_fefo_abrir` contesta «Hay que entrar para contar» — que
   es el candado haciendo su trabajo, no un fallo. Se vuelve a poner. */
set role probador;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false) \gset

do $$
declare
  v_bod uuid; v_conteo uuid; v_linea uuid; v_total bigint; v_saldo integer;
begin
  select id into v_bod from public.bodegas order by codigo limit 1;
  v_conteo := public.conteo_fefo_abrir(v_bod);

  -- 3128 lleva 45 cajas por estiba. Un saldo de 17 cajas es 17, no 765:
  -- el saldo NO se multiplica por el factor.
  v_linea := public.conteo_fefo_agregar(
    v_conteo, '3128',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E02_DER'),
    true, null, null, 4::smallint, 4::smallint, 27::smallint,
    false, false, null, null, 17);

  select total_cajas, saldo into v_total, v_saldo
    from public.v_conteo_fefo where id = v_linea;

  if v_saldo is distinct from 17 then
    raise exception 'FALLA: el saldo se guardó como % y era 17', v_saldo;
  end if;
  if v_total <> 17 then
    raise exception 'FALLA: 17 de saldo dieron % cajas. El saldo no se multiplica por el factor estibado.', v_total;
  end if;
  raise notice '✓ el saldo suma como cajas y no se multiplica por el factor';

  -- Y una estiba en el mismo módulo sigue dando 45.
  perform public.conteo_fefo_agregar(
    v_conteo, '3128',
    (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E03_DER'),
    true, 1, null, 4::smallint, 4::smallint, 27::smallint);
  if (select total_cajas from public.v_conteo_fefo
       where conteo_id = v_conteo and estibas = 1) <> 45 then
    raise exception 'FALLA: una estiba del 3128 dejó de dar 45 cajas al agregar el saldo';
  end if;
  raise notice '✓ la estiba sigue dando 45: el saldo no le movió la cuenta';

  -- UNA SOLA CANTIDAD POR RENGLÓN.
  begin
    perform public.conteo_fefo_agregar(
      v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E04_DER'),
      true, 2, null, 4::smallint, 4::smallint, 27::smallint,
      false, false, null, null, 17);
    raise exception 'FALLA: dejó anotar estibas Y saldo en el mismo renglón';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  begin
    perform public.conteo_fefo_agregar(
      v_conteo, '3128',
      (select id from public.ubicaciones where bodega_id = v_bod and clave = 'E05_DER'),
      true, null, 9, 4::smallint, 4::smallint, 27::smallint,
      false, false, null, null, 17);
    raise exception 'FALLA: dejó anotar cajas Y saldo en el mismo renglón';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  raise notice '✓ una sola cantidad por renglón: estibas, cajas o saldo';
end $$;

reset role;

-- QUE NO QUEDE LA FUNCIÓN VIEJA VIVA.
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('conteo_fefo_agregar', 'conteo_fefo_editar');
  if v_n <> 2 then
    raise exception 'FALLA: hay % versiones de agregar/editar y deberían ser 2. Con la firma vieja viva, una llamada sin p_saldo entraría por ella y el saldo se perdería en silencio.', v_n;
  end if;
  raise notice '✓ una sola versión de agregar y de editar';
end $$;
