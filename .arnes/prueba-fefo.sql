-- =====================================================================
-- FEFO · LAS CUENTAS CONTRA LA HOJA DE VERDAD
-- ---------------------------------------------------------------------
-- Las seis columnas calculadas se comprueban contra renglones REALES de
-- «FEFO 002.xlsx», con los valores que el Excel mostraba el 16/09/2026.
-- Si una fórmula se copió mal, aquí revienta; si alguien la cambia
-- mañana, revienta también.
--
-- Y SE COMPRUEBA LO QUE LA HOJA NO PODÍA: que no entre un renglón sin
-- fecha, que no entren estibas y cajas a la vez, que nadie escriba en el
-- conteo de otro, y que un conteo vacío no se pueda cerrar.
-- =====================================================================
\set ON_ERROR_STOP on

begin;

-- Dos personas, para poder probar que una no toca el conteo de la otra.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'heiner@x.co', '{}'::jsonb),
       ('22222222-2222-2222-2222-222222222222', 'otro@x.co',   '{}'::jsonb)
on conflict (id) do nothing;

insert into public.perfiles (id, usuario, nombre, rol, activo)
values ('11111111-1111-1111-1111-111111111111', 'heiner', 'DE LEON HEINER', 'admin', true),
       ('22222222-2222-2222-2222-222222222222', 'otro',   'OTRA PERSONA',   'operador', true)
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

-- Los cuatro materiales de los renglones que se van a comprobar.
insert into public.fefo_materiales
  (codigo, descripcion, unidades_por_caja, cajas_por_estiba, unidades_por_estiba,
   vida_util, dias_minimo, tipo)
values
  (3128,  'Aguila RN 330cc X 30',                30,  45, 1350, 180, 90, 'PRODUCTO'),
  (17740, 'PONY MALTA LTA 330 X6 TERMO EXP USA',  6, 480, 2880, 365, 90, 'PRODUCTO'),
  (9909,  'Aguila Lta 269Cc X 6',                 6, 600, 3600, 270, 90, 'PRODUCTO'),
  (3500005,'Envase Costeñita 175R',              38,  54, 2052,   0,  0, 'ENVASE')
on conflict (codigo) do update set
  cajas_por_estiba = excluded.cajas_por_estiba,
  vida_util = excluded.vida_util, dias_minimo = excluded.dias_minimo,
  tipo = excluded.tipo;

commit;

-- ---------------------------------------------------------------------
-- A PARTIR DE AQUÍ, COMO USUARIO NORMAL. Probar las funciones como
-- superusuario no prueba nada: el candado es RLS y auth.uid(), y el
-- superusuario se los salta.
-- ---------------------------------------------------------------------
-- `set local` y set_config(..., true) son de la TRANSACCIÓN, y fuera de
-- una se pierden antes de llegar al DO. De sesión, que es lo que dura.
set role probador;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false) \gset

do $$
declare
  v_conteo uuid; v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid;
  v_r record; v_n int; v_err text;
begin
  -- ===== 1. ABRIR =====
  v_conteo := public.fefo_abrir();
  if v_conteo is null then raise exception 'FALLA: fefo_abrir no devolvió conteo'; end if;

  -- Llamarla otra vez tiene que devolver EL MISMO, no uno nuevo: quien
  -- vuelve del almuerzo sigue en su recorrido.
  if public.fefo_abrir() <> v_conteo then
    raise exception 'FALLA: fefo_abrir abrió un segundo conteo en vez de seguir el abierto';
  end if;

  -- ===== 2. LOS RENGLONES DE LA HOJA REAL =====
  -- Fila 5 del Excel: 42 cajas sueltas, vence 11/03/27.
  v_l1 := public.fefo_agregar(v_conteo, 3128, 'E', '01', null, null, 42, false,
                              11::smallint, 3::smallint, 27::smallint);
  -- Fila 13: 56 estibas, factor 480, vence 21/08/27.
  v_l2 := public.fefo_agregar(v_conteo, 17740, 'E', '06', 'IZQ', 56, null, true,
                              21::smallint, 8::smallint, 27::smallint);
  -- Fila 15: 544 cajas sueltas de lata.
  v_l3 := public.fefo_agregar(v_conteo, 9909, 'E', '6', 'DER', null, 544, true,
                              29::smallint, 3::smallint, 27::smallint);
  -- Un envase, SIN fecha: el envase no vence.
  v_l4 := public.fefo_agregar(v_conteo, 3500005, 'A', '01', 'DER', 12, null, false);

  -- ----- total cajas = cajas_por_estiba * estibas + cajas -----
  select * into v_r from public.v_fefo_lineas where id = v_l1;
  if v_r.total_cajas <> 42 then
    raise exception 'FALLA total_cajas sueltas: esperado 42, dio %', v_r.total_cajas;
  end if;
  if v_r.total_estibas <> 0 then
    raise exception 'FALLA total_estibas con cajas sueltas: esperado 0, dio %', v_r.total_estibas;
  end if;
  if v_r.ubicacion <> 'E01' then
    raise exception 'FALLA ubicacion sin lado: esperado E01, dio «%»', v_r.ubicacion;
  end if;

  select * into v_r from public.v_fefo_lineas where id = v_l2;
  -- 56 × 480 = 26.880, que es lo que decía la hoja.
  if v_r.total_cajas <> 26880 then
    raise exception 'FALLA total_cajas por estibas: esperado 26880, dio %', v_r.total_cajas;
  end if;
  if v_r.total_estibas <> 56 then
    raise exception 'FALLA total_estibas: esperado 56, dio %', v_r.total_estibas;
  end if;
  if v_r.ubicacion <> 'E06 IZQ' then
    raise exception 'FALLA ubicacion con lado: esperado «E06 IZQ», dio «%»', v_r.ubicacion;
  end if;
  if v_r.vencimiento <> date '2027-08-21' then
    raise exception 'FALLA vencimiento: esperado 2027-08-21, dio %', v_r.vencimiento;
  end if;
  -- dias_para_salir = vencimiento - hoy - dias_minimo
  if v_r.dias_para_salir <> (date '2027-08-21' - current_date - 90) then
    raise exception 'FALLA dias_para_salir: esperado %, dio %',
      (date '2027-08-21' - current_date - 90), v_r.dias_para_salir;
  end if;
  if v_r.dias_para_vencer <> (date '2027-08-21' - current_date) then
    raise exception 'FALLA dias_para_vencer: esperado %, dio %',
      (date '2027-08-21' - current_date), v_r.dias_para_vencer;
  end if;

  select * into v_r from public.v_fefo_lineas where id = v_l3;
  if v_r.total_cajas <> 544 then
    raise exception 'FALLA total_cajas lata suelta: esperado 544, dio %', v_r.total_cajas;
  end if;

  -- ----- EL ENVASE NO VENCE: días para vencer en cero, como el Excel -----
  select * into v_r from public.v_fefo_lineas where id = v_l4;
  if v_r.dias_para_vencer <> 0 then
    raise exception 'FALLA envase: dias_para_vencer debería ser 0, dio %', v_r.dias_para_vencer;
  end if;
  if v_r.vencimiento is not null then
    raise exception 'FALLA envase: no debería tener fecha armada, dio %', v_r.vencimiento;
  end if;

  -- ===== 3. LO QUE NO DEBE ENTRAR =====

  -- Un producto sin fecha.
  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '02', null, 1, null, false);
    raise exception 'FALLA: dejó entrar un producto sin vencimiento';
  exception when others then
    if position('vencimiento' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- Estibas y cajas a la vez.
  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '02', null, 3, 7, false,
                                1::smallint, 1::smallint, 28::smallint);
    raise exception 'FALLA: dejó entrar estibas Y cajas en el mismo renglón';
  exception when others then
    if position('una_u_otra' in lower(sqlerrm)) = 0
       and position('check' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- Nada que contar.
  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '02', null, 0, 0, false,
                                1::smallint, 1::smallint, 28::smallint);
    raise exception 'FALLA: dejó entrar un renglón sin estibas ni cajas';
  exception when others then
    if position('contar' in lower(sqlerrm)) = 0
       and position('check' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- 31 de febrero: pasa los tres rangos por separado y no existe.
  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '02', null, 1, null, false,
                                31::smallint, 2::smallint, 27::smallint);
    raise exception 'FALLA: dejó entrar el 31 de febrero';
  exception when others then
    if position('no existe' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- Un código que no está en el maestro.
  begin
    perform public.fefo_agregar(v_conteo, 999999, 'E', '02', null, 1, null, false,
                                1::smallint, 1::smallint, 28::smallint);
    raise exception 'FALLA: dejó entrar un código que no está en el maestro';
  exception when others then
    if position('maestro' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- ===== 4. BORRAR =====
  perform public.fefo_borrar(v_l3);
  select count(*) into v_n from public.fefo_lineas where id = v_l3;
  if v_n <> 0 then raise exception 'FALLA: el renglón borrado sigue ahí'; end if;

  -- ===== 5. EL RESUMEN =====
  select * into v_r from public.v_fefo_conteos where id = v_conteo;
  if v_r.renglones <> 3 then
    raise exception 'FALLA resumen: esperaba 3 renglones, dio %', v_r.renglones;
  end if;
  if v_r.responsable_nombre <> 'DE LEON HEINER' then
    raise exception 'FALLA resumen: el responsable salió «%»', v_r.responsable_nombre;
  end if;
  -- 56 estibas del renglón 2 + 12 del envase.
  if v_r.estibas <> 68 then
    raise exception 'FALLA resumen: esperaba 68 estibas, dio %', v_r.estibas;
  end if;

  -- ===== 6. EL CONTEO ES DE QUIEN LO CAMINA =====
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '03', null, 1, null, false,
                                1::smallint, 1::smallint, 28::smallint);
    raise exception 'FALLA: otra persona escribió en el conteo ajeno';
  exception when others then
    if position('otra persona' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    perform public.fefo_cerrar(v_conteo);
    raise exception 'FALLA: otra persona cerró el conteo ajeno';
  exception when others then
    if position('otra persona' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- Y el suyo propio, vacío, no se puede cerrar.
  declare v_otro uuid;
  begin
    v_otro := public.fefo_abrir();
    begin
      perform public.fefo_cerrar(v_otro);
      raise exception 'FALLA: cerró un conteo sin un solo renglón';
    exception when others then
      if position('ni un renglón' in lower(sqlerrm)) = 0 then raise; end if;
    end;
  end;

  -- ===== 7. CERRAR, Y QUE QUEDE QUIETO =====
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  perform public.fefo_cerrar(v_conteo, 'Conteo de prueba');
  select estado into v_err from public.fefo_conteos where id = v_conteo;
  if v_err <> 'cerrado' then raise exception 'FALLA: no quedó cerrado, quedó «%»', v_err; end if;
  -- Cerrarlo dos veces no es un error.
  perform public.fefo_cerrar(v_conteo);

  begin
    perform public.fefo_agregar(v_conteo, 3128, 'E', '04', null, 1, null, false,
                                1::smallint, 1::smallint, 28::smallint);
    raise exception 'FALLA: agregó un renglón a un conteo cerrado';
  exception when others then
    if position('cerr' in lower(sqlerrm)) = 0 then raise; end if;
  end;
  begin
    perform public.fefo_borrar(v_l1);
    raise exception 'FALLA: borró un renglón de un conteo cerrado';
  exception when others then
    if position('cerr' in lower(sqlerrm)) = 0 then raise; end if;
  end;

  -- Y después de cerrar, fefo_abrir tiene que dar uno NUEVO.
  if public.fefo_abrir() = v_conteo then
    raise exception 'FALLA: fefo_abrir devolvió el conteo ya cerrado';
  end if;

  raise notice 'FEFO: las 6 cuentas dan lo mismo que la hoja y los 11 candados aguantan.';
end $$;

reset role;
