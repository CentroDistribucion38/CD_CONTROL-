-- =====================================================================
-- AVERÍAS — los frenos, contra una base de verdad.
--
-- Lo que se comprueba, y por qué cada uno:
--   1. Registrar exige lo que no se puede inventar después: ubicación,
--      cuánto, quién, y un producto que esté en el maestro.
--   2. El DOCUMENTO DE BAJA es el estado. Sin él la avería sigue
--      contando en el inventario, y eso lo tiene que decir la vista.
--   3. Un documento no se pisa con otro: eso no es corregir, es tapar.
--   4. Quitar una baja y anular son del administrador; registrar no.
--   5. La vista calcula los días de la baja y los que faltan para
--      vencer, en UN solo sitio.
--
--   bash .arnes/correr-averias.sh
-- =====================================================================
set client_min_messages to notice;

-- El escenario mínimo: dos personas y un producto. Sin perfiles,
-- `mi_nivel_pantalla` no tiene a quién mirar y todo falla por «no
-- tienes permiso», que es la forma más confusa de que falle un arnés.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cd.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cd.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol='admin', activo=true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true)
on conflict (id) do update set rol='supervisor', activo=true;

insert into public.productos (sku, nombre, unidad, tipo_material, activo) values
  ('AV-PT-1','Cerveza Aguila 330 ml','UND','PRODUCTO',true)
on conflict (sku) do update set nombre = excluded.nombre, activo = true;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  v_falla text := '';
  v_id uuid; v_cod text; v_n int; v_txt text; v_b boolean; v_i int;
begin
  /* UN ARNES TIENE QUE HABLAR ANTES DE MORIRSE.
     Dos mutaciones —quitarle el `manda()` a quitar_baja y a borrar— se
     DETECTAN aqui, y el efecto de esa misma mutacion —el supervisor
     SI quito el documento, el supervisor SI borro la fila— hace que
     una llamada de mas abajo reviente. Sin este envoltorio, el bloque
     muere y v_falla no se imprime: ni verde ni roja, que es lo unico
     que de verdad no sirve. */
  begin
  -- -----------------------------------------------------------------
  -- El escenario
  -- -----------------------------------------------------------------
  /* Al jefe se le da «editar» en Averías y al supervisor «ver»: es la
     pareja con la que se miden los dos lados de cada freno. */
  insert into public.rol_permisos (rol, seccion, nivel)
    values ('admin', '/inventario/averias', 'editar'),
           ('supervisor', '/inventario/averias', 'ver')
    on conflict (rol, seccion) do update set nivel = excluded.nivel;

  set role probador;
  perform set_config('request.jwt.claim.sub', JEFE, true);

  -- =================================================================
  -- 1. REGISTRAR EXIGE LO QUE NO SE PUEDE INVENTAR DESPUÉS
  -- =================================================================
  -- SIN UBICACIÓN. Una avería que no se sabe dónde está no se puede ir
  -- a ver, y el hallazgo que más vale del informe —en qué calle se
  -- concentran— se calcula justamente sobre eso.
  begin
    perform public.averia_registrar('  ', 'AV-PT-1', 3, 0, 'deposito', 'Genesis');
    v_falla := v_falla || ' 1a(se registró sin ubicación)';
  exception when others then
    if position('ubicación' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- SIN CANTIDAD. Cero cajas y cero unidades es una avería de nada.
  begin
    perform public.averia_registrar('A03 · M12', 'AV-PT-1', 0, 0, 'deposito', 'Genesis');
    v_falla := v_falla || ' 1b(se registró una avería de cero)';
  exception when others then
    if position('cuánto' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- UN PRODUCTO QUE NO ESTÁ EN EL MAESTRO. Si se dejara, el informe
  -- por producto tendría filas que no se pueden cruzar con nada.
  begin
    perform public.averia_registrar('A03 · M12', 'NO-EXISTE', 3, 0, 'deposito', 'Genesis');
    v_falla := v_falla || ' 1c(se registró un producto que no está en el maestro)';
  exception when others then
    if position('maestro' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1c(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- UNA FECHA DEL FUTURO. Un dedo de más en el año la manda a 2062, y
  -- ahí no la encuentra ningún informe: no está «mal», está fuera de
  -- todo rango que alguien vaya a mirar.
  begin
    perform public.averia_registrar('A03 · M12', 'AV-PT-1', 3, 0, 'deposito', 'Genesis',
                                    null, (current_date + 5));
    v_falla := v_falla || ' 1d(se registró con fecha del futuro)';
  exception when others then
    if position('llegado' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1d(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- Y LA BUENA PASA, con el nombre del producto COPIADO del maestro.
  select r.id, r.codigo into v_id, v_cod
    from public.averia_registrar('A03 · M12', 'AV-PT-1', 12, 7, 'deposito', 'Genesis Visbal',
                                 (current_date + 20)) r;
  if v_cod !~ '^AV-[0-9]{4}$' then
    v_falla := v_falla || format(' 1e(el código salió «%s»)', v_cod);
  end if;
  select a.producto into v_txt from public.v_averias a where a.id = v_id;
  if v_txt <> 'Cerveza Aguila 330 ml' then
    v_falla := v_falla || format(' 1f(no se copió el nombre del producto: «%s»)', v_txt);
  end if;

  -- EL NOMBRE COPIADO NO SE MUEVE cuando cambia el del maestro. Sin la
  -- copia, una avería de hace seis meses empieza a decir otra cosa de
  -- la que decía el papel que se firmó.
  set role postgres;
  update public.productos set nombre = 'Aguila 330 NUEVO NOMBRE' where sku = 'AV-PT-1';
  set role probador;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  select a.producto into v_txt from public.v_averias a where a.id = v_id;
  if v_txt <> 'Cerveza Aguila 330 ml' then
    v_falla := v_falla || ' 1g(al renombrar el producto cambió lo que dice una avería vieja)';
  end if;

  -- =================================================================
  -- 2. EL DOCUMENTO DE BAJA ES EL ESTADO
  -- =================================================================
  select a.pendiente_baja into v_b from public.v_averias a where a.id = v_id;
  if not v_b then
    v_falla := v_falla || ' 2a(una avería recién registrada no sale pendiente de baja)';
  end if;
  select a.dias_baja into v_i from public.v_averias a where a.id = v_id;
  if v_i is not null then
    v_falla := v_falla || ' 2b(sin documento ya dice cuántos días tardó la baja)';
  end if;

  -- SIN NÚMERO NO HAY BAJA: una baja sin documento es una que nadie
  -- puede buscar en SAP.
  begin
    perform public.averia_dar_baja(v_id, '   ');
    v_falla := v_falla || ' 2c(se dio de baja sin documento)';
  exception when others then
    if position('documento' in sqlerrm) = 0 then
      v_falla := v_falla || ' 2c(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform public.averia_dar_baja(v_id, '4900123456');
  select a.pendiente_baja, a.documento into v_b, v_txt
    from public.v_averias a where a.id = v_id;
  if v_b then v_falla := v_falla || ' 2d(con documento sigue saliendo pendiente de baja)'; end if;
  if v_txt <> '4900123456' then
    v_falla := v_falla || format(' 2e(el documento quedó «%s»)', v_txt);
  end if;
  -- Y AHORA SÍ SE PUEDE MEDIR LA DEMORA, que es lo único que permite
  -- decir «la baja se está demorando once días».
  select a.dias_baja into v_i from public.v_averias a where a.id = v_id;
  if v_i is null then
    v_falla := v_falla || ' 2f(con documento no se puede medir cuánto tardó la baja)';
  end if;

  -- =================================================================
  -- 3. UN DOCUMENTO NO SE PISA CON OTRO
  -- =================================================================
  begin
    perform public.averia_dar_baja(v_id, '4900999999');
    v_falla := v_falla || ' 3a(se le puso un segundo documento encima al primero)';
  exception when others then
    if position('ya se dio de baja' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  select a.documento into v_txt from public.v_averias a where a.id = v_id;
  if v_txt <> '4900123456' then
    v_falla := v_falla || ' 3b(el segundo intento igual le cambió el documento)';
  end if;

  -- =================================================================
  -- 4. QUITAR LA BAJA Y ANULAR SON DEL ADMINISTRADOR; REGISTRAR NO
  -- =================================================================
  -- Poner el documento es papeleo del día. Quitarlo devuelve un
  -- producto a la cuenta del inventario después de que alguien ya
  -- cuadró el mes.
  perform set_config('request.jwt.claim.sub', SUP, true);
  begin
    perform public.averia_registrar('B01', 'AV-PT-1', 1, 0, 'transporte', 'Colado');
    v_falla := v_falla || ' 4a(quien solo VE pudo registrar una avería)';
  exception when others then
    if position('permiso' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  /* QUITAR LA BAJA NO LA PUEDE HACER QUIEN SOLO REGISTRA. Lo destapó
     una mutación: le quité el `manda()` a `averia_quitar_baja` y el
     arnés salió VERDE, porque solo la llamaba con el jefe. Un freno
     que solo se prueba desde el lado que pasa no está probado. */
  begin
    perform public.averia_quitar_baja(v_id, 'me da la gana');
    v_falla := v_falla || ' 4a2(quien solo VE pudo quitar un documento de baja)';
  exception when others then
    if position('administrador' in sqlerrm) = 0
       and position('permiso' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4a2(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.averia_anular(v_id, 'me da la gana');
    v_falla := v_falla || ' 4a3(quien solo VE pudo anular una avería)';
  exception when others then
    if position('administrador' in sqlerrm) = 0
       and position('permiso' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4a3(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  -- Quien manda sí puede quitarla, y queda escrito en la nota que hubo
  -- dos: si no, mañana nadie sabe que ahí hubo otro documento.
  perform public.averia_quitar_baja(v_id, 'El documento era de otra estiba');
  select a.documento, a.nota into v_txt, v_txt from public.v_averias a where a.id = v_id;
  select a.documento into v_txt from public.v_averias a where a.id = v_id;
  if v_txt is not null then v_falla := v_falla || ' 4b(no se quitó el documento)'; end if;
  select a.nota into v_txt from public.v_averias a where a.id = v_id;
  if v_txt is null or position('4900123456' in v_txt) = 0 then
    v_falla := v_falla || ' 4c(al quitar la baja no quedó escrito qué documento tenía)';
  end if;

  -- Y ANULAR DEJA LA FILA. Una avería borrada no deja nada que mirar
  -- cuando alguien pregunte por qué el mes cerró distinto.
  perform public.averia_anular(v_id, 'Se contó dos veces');
  select count(*) into v_n from public.v_averias a where a.id = v_id;
  if v_n <> 1 then v_falla := v_falla || ' 4d(anular borró la fila en vez de marcarla)'; end if;
  select a.pendiente_baja into v_b from public.v_averias a where a.id = v_id;
  if v_b then
    v_falla := v_falla || ' 4e(una avería anulada sigue contando como pendiente de baja)';
  end if;
  -- Y a una anulada no se le da de baja: son dos finales distintos.
  begin
    perform public.averia_dar_baja(v_id, '4900777777');
    v_falla := v_falla || ' 4f(se le dio de baja a una avería anulada)';
  exception when others then
    if position('anulada' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4f(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- =================================================================
  -- 5. LOS DÍAS PARA VENCER, CALCULADOS EN UN SOLO SITIO
  -- =================================================================
  -- Tres pantallas calculando «se vence pronto» por su cuenta son tres
  -- sitios donde se puede calcular distinto.
  select r.id into v_id from public.averia_registrar(
    'C02 · M04', 'AV-PT-1', 4, 0, 'contaminado', 'Jose', (current_date + 9)) r;
  select a.dias_para_vencer into v_i from public.v_averias a where a.id = v_id;
  if v_i <> 9 then
    v_falla := v_falla || format(' 5a(faltan 9 días para vencer y la vista dice %s)', v_i);
  end if;
  -- Una avería sin vencimiento no dice cero: dice nada. Cero sería
  -- «se vence hoy», que es la alarma más fuerte del tablero.
  select r.id into v_id from public.averia_registrar(
    'C02 · M04', 'AV-PT-1', 1, 0, 'transporte', 'Jose') r;
  select a.dias_para_vencer into v_i from public.v_averias a where a.id = v_id;
  if v_i is not null then
    v_falla := v_falla || format(' 5b(sin vencimiento la vista dice %s en vez de nada)', v_i);
  end if;

  -- Y LA CAUSAL DICE SI LA CULPA ES DE AFUERA, que es lo que decide a
  -- quién se le cobra y no se puede sacar del nombre sin adivinar.
  select a.externa into v_b from public.v_averias a where a.id = v_id;
  if not v_b then
    v_falla := v_falla || ' 5c(una avería de transporte no sale marcada como externa)';
  end if;

  -- =================================================================
  -- 6. CORREGIR Y BORRAR — del administrador, y con sus límites
  -- =================================================================
  -- «Que el admin yo pueda editar, eliminar, anular, borrar.»
  select r.id into v_id from public.averia_registrar(
    'D01 · M02', 'AV-PT-1', 5, 0, 'deposito', 'Jose') r;

  perform set_config('request.jwt.claim.sub', SUP, true);
  begin
    perform public.averia_corregir(v_id, 'Z99', 'AV-PT-1', 1, 0, 'deposito', 'Colado');
    v_falla := v_falla || ' 6a(quien solo VE pudo corregir una avería)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 and position('permiso' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.averia_borrar(v_id);
    v_falla := v_falla || ' 6b(quien solo VE pudo borrar una avería)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 and position('permiso' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  perform public.averia_corregir(v_id, 'E07 · M01', 'AV-PT-1', 9, 3,
                                 'transporte', 'Genesis Visbal');
  select a.ubicacion, a.cajas into v_txt, v_n from public.v_averias a where a.id = v_id;
  if v_txt <> 'E07 · M01' or v_n <> 9 then
    v_falla := v_falla || format(' 6c(corregir no cambió: %s / %s cajas)', v_txt, v_n);
  end if;
  -- Y CORREGIR NO PUEDE DEJARLA EN CERO: la misma regla que registrar.
  begin
    perform public.averia_corregir(v_id, 'E07', 'AV-PT-1', 0, 0, 'deposito', 'Genesis');
    v_falla := v_falla || ' 6d(corregir la dejó en cero cajas y cero unidades)';
  exception when others then
    if position('cuánto' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6d(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- BORRAR SÍ, MIENTRAS NO SE LE HAYA DADO DE BAJA.
  perform public.averia_borrar(v_id);
  select count(*) into v_n from public.v_averias a where a.id = v_id;
  if v_n <> 0 then v_falla := v_falla || ' 6e(borrar no borró)'; end if;

  -- PERO UNA CON DOCUMENTO NO SE BORRA: el documento de SAP quedaría
  -- apuntando a algo que no existe, y el día que alguien audite la baja
  -- no encuentra contra qué cuadrarla. Esa se anula.
  select r.id into v_id from public.averia_registrar(
    'D02', 'AV-PT-1', 2, 0, 'deposito', 'Jose') r;
  perform public.averia_dar_baja(v_id, '4900555555');
  begin
    perform public.averia_borrar(v_id);
    v_falla := v_falla || ' 6f(se borró una avería que ya tenía documento de baja)';
  exception when others then
    if position('se anula, no se borra' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6f(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  select count(*) into v_n from public.v_averias a where a.id = v_id;
  if v_n <> 1 then v_falla := v_falla || ' 6g(el intento igual la borró)'; end if;

  -- Y UNA ANULADA NO SE CORRIGE: para volver atrás se registra una nueva.
  select r.id into v_id from public.averia_registrar(
    'D03', 'AV-PT-1', 2, 0, 'deposito', 'Jose') r;
  perform public.averia_anular(v_id, 'duplicada');
  begin
    perform public.averia_corregir(v_id, 'D04', 'AV-PT-1', 2, 0, 'deposito', 'Jose');
    v_falla := v_falla || ' 6h(se corrigió una avería anulada)';
  exception when others then
    if position('anulada' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6h(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  exception when others then
    set role postgres;
    raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
  end;

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: registrar exige ubicacion, cantidad, quien y un producto del maestro,';
  raise notice 'BIEN: y copia el nombre para que una averia vieja no cambie de texto;';
  raise notice 'BIEN: el documento de baja es el ESTADO —sin el sigue contando— y no se';
  raise notice 'BIEN: pisa con otro; quitarlo y anular son del administrador y dejan rastro;';
  raise notice 'BIEN: los dias de la baja y los que faltan para vencer los calcula la vista;';
  raise notice 'BIEN: corregir, anular y borrar son del administrador, y la que ya tiene';
  raise notice 'BIEN: documento de baja NO se borra —se anula—, ni se corrige una anulada.';
end $$;
