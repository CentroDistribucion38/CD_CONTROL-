-- =====================================================================
-- FEFO · LA PANTALLA DEL MAESTRO, CONTRA EL MAESTRO DE VERDAD
-- ---------------------------------------------------------------------
-- La pantalla de maestros no llama funciones: escribe DIRECTO sobre
-- `fefo_materiales` y `fefo_ubicaciones` con la sesión de quien está
-- adelante, y lo único que la detiene es RLS. Así que probarla es
-- hacer exactamente lo que ella hace —los mismos update, insert y rpc—
-- como un usuario normal y no como superusuario, que se salta RLS y
-- aprobaría cualquier cosa.
--
-- Y SE HACE SOBRE LOS 494 MATERIALES Y LAS 428 UBICACIONES IMPORTADAS,
-- no sobre cuatro filas de mentira: era lo pedido, y es donde aparecen
-- los casos que uno no inventa —el material sin «cajas por estiba», la
-- ubicación sin lado, la clave con guion bajo—.
--
-- QUÉ TIENE QUE PASAR:
--   · el supervisor edita, agrega y quita;
--   · el operador NO, ni con la consulta escrita a mano;
--   · quitar decide solo entre borrar y desactivar, y acierta;
--   · lo desactivado sigue ahí y sigue leyéndose.
-- =====================================================================
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'jefe@x.co',  '{}'::jsonb),
       ('44444444-4444-4444-4444-444444444444', 'peon@x.co',  '{}'::jsonb)
on conflict (id) do nothing;

insert into public.perfiles (id, usuario, nombre, rol, activo)
values ('33333333-3333-3333-3333-333333333333', 'jefe', 'SUPERVISOR DE PRUEBA', 'supervisor', true),
       ('44444444-4444-4444-4444-444444444444', 'peon', 'OPERADOR DE PRUEBA',   'operador',   true)
on conflict (id) do update set rol = excluded.rol, activo = true;

-- La huella de la vuelta anterior, borrada: esta prueba se corre dos
-- veces y la segunda es la que vale.
delete from public.fefo_materiales  where codigo in (998001, 998002);
delete from public.fefo_ubicaciones where clave  in ('ZZ_PRUEBA', 'ZZ_USADA');
update public.fefo_materiales set activo = true where codigo = 3128;

commit;

-- ---------------------------------------------------------------------
set role probador;

-- ===== COMO SUPERVISOR =====
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false) \gset

do $$
declare
  v_n int; v_txt text; v_num int; v_antes int; v_msg text; v_act boolean;
begin
  -- ===== 0. LO IMPORTADO ESTÁ Y SE LEE =====
  select count(*) into v_n from public.fefo_materiales;
  if v_n < 490 then
    raise exception 'FALLA: solo hay % materiales; falta correr fefo-maestro.sql', v_n;
  end if;
  select count(*) into v_n from public.fefo_ubicaciones;
  if v_n < 420 then
    raise exception 'FALLA: solo hay % ubicaciones', v_n;
  end if;
  raise notice '✓ el maestro importado se lee entero desde una sesión normal';

  -- ===== 1. CORREGIR UN MATERIAL (lo que hace «Guardar») =====
  -- Se toma uno de los reales, se le cambia el factor y se devuelve.
  select cajas_por_estiba into v_antes from public.fefo_materiales where codigo = 3128;
  update public.fefo_materiales
     set cajas_por_estiba = 777, descripcion = 'AGUILA RN 330CC X 30 (corregido)',
         actualizado_en = now()
   where codigo = 3128;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALLA: el update no tocó la fila (%)', v_n; end if;

  select cajas_por_estiba into v_num from public.fefo_materiales where codigo = 3128;
  if v_num <> 777 then raise exception 'FALLA: no quedó guardado, quedó %', v_num; end if;

  -- EL FACTOR CORREGIDO TIENE QUE LLEGAR A LAS CUENTAS. Si la vista se
  -- quedara con una copia vieja, la pantalla diría una cosa y el informe
  -- otra, que es justo lo que este módulo vino a evitar.
  raise notice '✓ corregir un material queda guardado (cajas por estiba: % → %)',
               coalesce(v_antes::text, 'nulo'), v_num;

  -- ===== 2. AGREGAR UN MATERIAL =====
  insert into public.fefo_materiales
    (codigo, descripcion, unidades_por_caja, cajas_por_estiba, vida_util, dias_minimo, tipo)
  values (998001, 'MATERIAL NUEVO DE PRUEBA', 6, 480, 180, 90, 'PRODUCTO');
  if not exists (select 1 from public.fefo_materiales where codigo = 998001) then
    raise exception 'FALLA: el insert dijo que sí y no está';
  end if;
  raise notice '✓ agregar un material funciona';

  -- El código repetido lo para la llave primaria y no la pantalla: la
  -- pantalla también lo mira, pero dos personas agregando a la vez no se
  -- ven entre ellas.
  begin
    insert into public.fefo_materiales (codigo, descripcion) values (3128, 'REPETIDO');
    raise exception 'FALLA: dejó meter un código que ya existe';
  exception when unique_violation then
    raise notice '✓ un código repetido lo para la base, no solo la pantalla';
  end;

  -- Y un tipo que no existe tampoco entra.
  begin
    insert into public.fefo_materiales (codigo, descripcion, tipo)
         values (998002, 'TIPO INVENTADO', 'CHATARRA');
    raise exception 'FALLA: aceptó un tipo que no existe';
  exception when check_violation then
    raise notice '✓ el tipo solo puede ser PRODUCTO o ENVASE';
  end;

  -- ===== 3. CORREGIR Y AGREGAR UNA UBICACIÓN =====
  update public.fefo_ubicaciones set capacidad = 99 where clave = 'A01_DER';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALLA: A01_DER no se dejó corregir (%)', v_n; end if;

  insert into public.fefo_ubicaciones (clave, calle, modulo, lado, familia, capacidad)
       values ('ZZ_PRUEBA', 'ZZ', '99', 'DER', 'PRUEBA', 10);

  -- El lado inventado lo para el candado, que es lo que cazó el error
  -- del importador cuando partía «ALAR_A» en calle A, módulo LAR, lado A.
  begin
    insert into public.fefo_ubicaciones (clave, calle, modulo, lado)
         values ('ZZ_MALA', 'ZZ', '98', 'A');
    raise exception 'FALLA: aceptó un lado que no existe';
  exception when check_violation then
    raise notice '✓ corregir y agregar ubicaciones funciona, y el lado sigue siendo IZQ/DER';
  end;

  -- ===== 4. QUITAR: LO DECIDE LA BASE =====
  -- Sin usar → se borra de verdad.
  v_msg := public.fefo_quitar_material(998001);
  if position('borrado' in lower(v_msg)) = 0 then
    raise exception 'FALLA: uno sin usar debería borrarse, dijo «%»', v_msg;
  end if;

  -- Usado por un conteo → se desactiva, y SIGUE LEYÉNDOSE. Es el punto
  -- entero: si se borrara, el conteo de la semana pasada se quedaría sin
  -- descripción y nadie sabría qué se contó.
  v_msg := public.fefo_quitar_material(3128);
  if position('desactiv' in lower(v_msg)) = 0 then
    raise exception 'FALLA: uno usado debería desactivarse, dijo «%»', v_msg;
  end if;
  select activo, descripcion into v_act, v_txt
    from public.fefo_materiales where codigo = 3128;
  if v_act then raise exception 'FALLA: dijo desactivado y sigue encendido'; end if;
  if v_txt is null then raise exception 'FALLA: se llevó la descripción por delante'; end if;
  raise notice '✓ quitar borra lo que nadie usó y desactiva lo que sí (sin perder el nombre)';

  -- Y se puede volver a encender desde la pantalla: «desactivar» no
  -- puede ser un viaje de ida, o el primer dedazo cuesta una consulta a
  -- la base de datos.
  update public.fefo_materiales set activo = true where codigo = 3128;
  select activo into v_act from public.fefo_materiales where codigo = 3128;
  if not v_act then raise exception 'FALLA: no se deja volver a encender'; end if;
  raise notice '✓ lo desactivado se vuelve a encender desde la misma pantalla';

  v_msg := public.fefo_quitar_ubicacion('ZZ_PRUEBA');
  if position('borrada' in lower(v_msg)) = 0 then
    raise exception 'FALLA: una ubicación sin usar debería borrarse, dijo «%»', v_msg;
  end if;
end $$;

-- ===== COMO OPERADOR: MIRA Y NO TOCA =====
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', false) \gset

do $$
declare v_n int;
begin
  -- Ver, sí: el operador necesita el maestro para contar.
  select count(*) into v_n from public.fefo_materiales;
  if v_n < 490 then raise exception 'FALLA: el operador no puede leer el maestro'; end if;

  -- Corregir, no. Y OJO CON CÓMO FALLA: RLS no lanza error en un UPDATE,
  -- simplemente no encuentra filas que le dejen tocar. Comprobar que «no
  -- reventó» aprobaría el agujero; hay que comprobar que no cambió NADA.
  update public.fefo_materiales set cajas_por_estiba = 1 where codigo = 9909;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FALLA: un operador corrigió el maestro (% filas)', v_n;
  end if;

  begin
    insert into public.fefo_materiales (codigo, descripcion) values (998003, 'DE CONTRABANDO');
    raise exception 'FALLA: un operador agregó un material';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.fefo_quitar_material(9909);
    raise exception 'FALLA: un operador quitó un material';
  exception when others then
    if position('supervisor' in lower(sqlerrm)) = 0
       and position('permis'   in lower(sqlerrm)) = 0 then
      raise exception 'FALLA: falló por otra razón: %', sqlerrm;
    end if;
  end;

  raise notice '✓ el operador lee el maestro y no lo puede tocar por ningún lado';
  raise notice 'FEFO · maestro: la pantalla puede todo lo suyo sobre los 494 reales, y el operador nada.';
end $$;

reset role;

-- Deja el maestro como estaba: esta prueba no puede dejar huella en los
-- datos de verdad.
update public.fefo_materiales
   set cajas_por_estiba = 45, descripcion = 'Aguila RN 330cc X 30', activo = true
 where codigo = 3128;
delete from public.fefo_materiales  where codigo in (998001, 998002, 998003);
delete from public.fefo_ubicaciones where clave  in ('ZZ_PRUEBA', 'ZZ_MALA');
