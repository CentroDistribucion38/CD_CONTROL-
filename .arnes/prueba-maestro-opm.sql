\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- UN SOLO MAESTRO, Y EL PIN DEL OPM.
--
-- LO QUE PUEDE ROMPERSE:
--  1. Que el desplegable siga ofreciendo los siete sembrados a mano en
--     vez de los 494 del inventario, o que mezcle producto y envase.
--  2. Que EL PIN SE PUEDA LEER desde la aplicación. Es lo unico que
--     hace que el informe pruebe algo: si cualquiera ve los PIN,
--     cualquiera registra a nombre de otro.
--  3. Que un PIN apagado —o inventado— conteste distinto: el maestro se
--     iria adivinando de a cuatro digitos desde la pantalla.
--  4. Que dos operarios compartan PIN.
--  5. Que una «encontrada» quede con un OPM pegado: seria decir que
--     alguien la reporto.
--  6. Que el maestro de operarios lo toque alguien que no manda.
-- =====================================================================

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

insert into public.productos (sku, nombre, unidad, tipo_material, activo, color_vidrio, unidades_x_caja) values
  ('3128','Aguila RN 330cc X30','UND','PRODUCTO',true,null,30),
  ('2512','Poker R 330cc X30','UND','PRODUCTO',true,null,30),
  ('EER-AMBAR','Envase retornable ambar','UND','ENVASE',true,'ambar',null),
  ('EER-FLINT','Envase retornable flint','UND','ENVASE',true,null,null),
  ('APAGADO','Producto apagado','UND','PRODUCTO',false,null,30)
on conflict (sku) do update set tipo_material = excluded.tipo_material,
  activo = excluded.activo, color_vidrio = excluded.color_vidrio,
  unidades_x_caja = excluded.unidades_x_caja;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  v_falla text := ''; v_n int; v_txt text; v_id uuid; v_b boolean;
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  r1 uuid; r2 uuid; o1 uuid;
begin
  -- ================================================================
  -- 1. EL DESPLEGABLE, SEPARADO POR TIPO
  -- ================================================================
  select count(*) into v_n from public.v_roturas_materiales_maestro where tipo = 'producto_terminado';
  if v_n <> 2 then v_falla := v_falla || format(' 1(producto terminado trae %s y deben ser 2 activos)', v_n); end if;
  select count(*) into v_n from public.v_roturas_materiales_maestro where tipo = 'eer';
  if v_n <> 2 then v_falla := v_falla || format(' 1b(EER trae %s y deben ser 2)', v_n); end if;
  /* LO APAGADO NO SE OFRECE: un material apagado en el maestro es uno
     que ya no se debe escoger. */
  if exists (select 1 from public.v_roturas_materiales_maestro where clave = 'APAGADO') then
    v_falla := v_falla || ' 1c(ofrece un material apagado)';
  end if;
  /* Y SE DICE A QUÉ LE FALTA. Un envase sin color acaba en un análisis
     por color que no cuadra, y callarlo es lo que hace que nadie lo
     llene nunca. */
  select le_falta_color into v_b from public.v_roturas_materiales_maestro where clave = 'EER-FLINT';
  if not v_b then v_falla := v_falla || ' 1d(un envase sin color no sale marcado)'; end if;
  select le_falta_color into v_b from public.v_roturas_materiales_maestro where clave = 'EER-AMBAR';
  if v_b then v_falla := v_falla || ' 1e(marca como sin color uno que sí lo tiene)'; end if;
  select le_falta_caja into v_b from public.v_roturas_materiales_maestro where clave = '3128';
  if v_b then v_falla := v_falla || ' 1f(marca como sin unidades uno que sí las tiene)'; end if;

  -- ================================================================
  -- 2. EL PIN NO SE PUEDE LEER DESDE LA APLICACIÓN
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  select public.operario_guardar(null, '4821', 'Genesis Visbal', 'Easy', 'A') into o1;
  perform public.operario_guardar(null, '7130', 'Santiago Leal', 'Easy', 'B');

  set role probador;
  begin
    select count(*) into v_n from public.roturas_operarios;
    v_falla := v_falla || ' 2(la aplicación puede leer la tabla de operarios, con sus PIN)';
  exception when insufficient_privilege then null;
           when others then
    v_falla := v_falla || ' 2(falló por otra cosa: ' || sqlerrm || ')';
  end;
  /* Y LA FUNCIÓN QUE SÍ SE PUEDE LLAMAR NO DEVUELVE EL PIN. */
  perform set_config('request.jwt.claim.sub', SUP, true);
  select nombre into v_txt from public.operario_por_pin('4821');
  if v_txt is distinct from 'Genesis Visbal' then
    v_falla := v_falla || format(' 2b(el PIN 4821 devolvió «%s»)', v_txt);
  end if;
  if exists (select 1 from information_schema.columns
              where table_name = 'operario_por_pin' and column_name = 'pin') then
    v_falla := v_falla || ' 2c(la función devuelve el PIN)';
  end if;

  -- ================================================================
  -- 3. UN PIN APAGADO CONTESTA IGUAL QUE UNO INVENTADO
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  perform public.operario_guardar(o1, '4821', 'Genesis Visbal', 'Easy', 'A', false);
  perform set_config('request.jwt.claim.sub', SUP, true);
  if exists (select 1 from public.operario_por_pin('4821')) then
    v_falla := v_falla || ' 3(un operario apagado sigue contestando: el maestro se puede ir adivinando)';
  end if;
  if exists (select 1 from public.operario_por_pin('0000')) then
    v_falla := v_falla || ' 3b(un PIN inventado contestó)';
  end if;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  perform public.operario_guardar(o1, '4821', 'Genesis Visbal', 'Easy', 'A', true);

  -- ================================================================
  -- 4. DOS OPERARIOS NO COMPARTEN PIN
  -- ================================================================
  begin
    perform public.operario_guardar(null, '4821', 'Otro cualquiera', 'Easy', 'C');
    v_falla := v_falla || ' 4(dejó dos operarios con el mismo PIN)';
  exception when others then
    if position('mismo PIN' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.operario_guardar(null, '12', 'PIN corto', 'Easy', 'A');
    v_falla := v_falla || ' 4b(aceptó un PIN de dos dígitos)';
  exception when others then
    if position('dígitos' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 5. EL ORIGEN, Y QUE UNA «ENCONTRADA» NO QUEDE CON OPM
  -- ================================================================
  perform set_config('request.jwt.claim.sub', SUP, true);
  select id into r1 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 5,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_area => 'traspasos');
  select id into r2 from public.rotura_registrar(p_material => 'EER-AMBAR', p_unidades => 3,
    p_proceso => 'traspaso', p_causa => 'estibas_malas', p_area => 'traspasos');

  /* SIN ORIGEN SE VE. Una rotura sin origen no es un error que se pueda
     esconder: es una que hay que ir a completar. */
  select sin_origen into v_b from public.v_roturas where id = r1;
  if not v_b then v_falla := v_falla || ' 5(una rotura recién registrada no sale marcada como sin origen)'; end if;

  select opm into v_txt from public.rotura_marcar_origen(r1, 'opm', '4821');
  if v_txt is distinct from 'Genesis Visbal' then
    v_falla := v_falla || format(' 5b(marcar con PIN devolvió «%s»)', v_txt);
  end if;
  select origen, opm_nombre, opm_turno, sin_origen
    into v_txt, v_txt, v_txt, v_b from public.v_roturas where id = r1;
  select origen into v_txt from public.v_roturas where id = r1;
  if v_txt is distinct from 'opm' then v_falla := v_falla || format(' 5c(el origen quedó en %s)', v_txt); end if;
  select opm_nombre into v_txt from public.v_roturas where id = r1;
  if v_txt is distinct from 'Genesis Visbal' then
    v_falla := v_falla || ' 5d(la vista no trae el nombre del operario)';
  end if;
  select sin_origen into v_b from public.v_roturas where id = r1;
  if v_b then v_falla := v_falla || ' 5e(sigue marcada como sin origen)'; end if;

  /* UN PIN QUE NO ES NO PASA. */
  begin
    perform public.rotura_marcar_origen(r2, 'opm', '9999');
    v_falla := v_falla || ' 5f(marcó como reportada por OPM con un PIN inventado)';
  exception when others then
    if position('PIN' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5f(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  /* UNA ENCONTRADA NO LLEVA OPM, aunque le manden un PIN: poner ahí a
     alguien sería decir que él la reportó. */
  /* TIENE QUE FUNCIONAR, no solo «no corromper». Hay DOS frenos —la
     función, que ni busca el PIN cuando el origen es «encontrada», y el
     CHECK de la tabla—, y al romper el primero el segundo salva el dato
     PERO A COSTA DE UN ERROR EN LA CARA DE QUIEN REGISTRA. Así que aquí
     CUALQUIER excepción es una falla: que la base lo rechace no es lo
     mismo que que la pantalla funcione.

     Envuelto, además, para que el arnés reporte en vez de morirse: sin
     esto la mutación salía «ni verde ni roja», que es lo único inútil. */
  begin
    perform public.rotura_marcar_origen(r2, 'encontrada', '4821');
  exception when others then
    v_falla := v_falla || ' 5g(marcar una «encontrada» reventó: ' || sqlerrm || ')';
  end;
  select opm_id is null into v_b from public.roturas where id = r2;
  if not v_b then
    v_falla := v_falla || ' 5g(una «encontrada» quedó con un operario pegado)';
  end if;

  -- ================================================================
  -- 6. EL MAESTRO ES DE QUIEN MANDA
  -- ================================================================
  begin
    perform public.operario_guardar(null, '5555', 'Colado', 'Easy', 'A');
    v_falla := v_falla || ' 6(el supervisor pudo crear un operario)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 then
      v_falla := v_falla || ' 6(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  select count(*) into v_n from public.operarios_listar();
  if v_n <> 0 then v_falla := v_falla || ' 6b(el supervisor pudo listar el maestro de operarios)'; end if;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  select count(*) into v_n from public.operarios_listar();
  if v_n < 2 then v_falla := v_falla || format(' 6c(el administrador solo ve %s operarios)', v_n); end if;

  -- ================================================================
  -- 7. PEGAR LA LISTA Y QUE LA BASE PONGA LOS PIN
  --
  -- «Yo solo coloco los nombres: copio en Excel, pego allí, y de una
  --  genera los PIN.»
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  set role probador;

  -- 7a · CADA UNO SALE CON SU PIN, Y NINGUNO REPETIDO.
  --      Veinte de una para que «ninguno repetido» mida algo: con tres
  --      nombres, un sorteo roto pasaría la prueba casi siempre.
  declare
    v_lista jsonb := '[]'::jsonb;
    v_pines text[];
    v_nuevos int;
  begin
    for v_n in 1..20 loop
      v_lista := v_lista || jsonb_build_array(
        jsonb_build_object('nombre', 'Operario Pegado ' || v_n, 'turno', 'A'));
    end loop;
    select array_agg(c.pin), count(*) filter (where c.estado = 'nuevo')
      into v_pines, v_nuevos
      from public.operarios_cargar(v_lista) c;

    if v_nuevos <> 20 then
      v_falla := v_falla || format(' 7a(se cargaron %s de 20)', v_nuevos);
    end if;
    if exists (select 1 from unnest(v_pines) p where p !~ '^[0-9]{4}$') then
      v_falla := v_falla || ' 7a(algun PIN no son cuatro digitos)';
    end if;
    if (select count(distinct p) from unnest(v_pines) p) <> 20 then
      v_falla := v_falla || ' 7b(dos operarios salieron con el mismo PIN)';
    end if;
    -- NO CORRELATIVO: con 0001, 0002, 0003 quien ve un PIN sabe los de
    -- todos sus compañeros, y el PIN existe para poder creerle al que
    -- registra. Veinte seguidos por sorteo es imposible.
    if (select count(*) from (
          select p::int - lag(p::int) over (order by p::int) as d
            from unnest(v_pines) p) s where d = 1) > 8 then
      v_falla := v_falla || ' 7c(los PIN salieron correlativos, no sorteados)';
    end if;
    -- Y NO SALEN LOS QUE CUALQUIERA TECLEA PARA PROBAR SUERTE.
    if exists (select 1 from unnest(v_pines) p
                where p in ('0000','1111','2222','3333','4444','5555',
                            '6666','7777','8888','9999','1234','4321')) then
      v_falla := v_falla || ' 7d(salio un PIN de los que cualquiera prueba)';
    end if;
  end;

  -- 7b · PEGAR LA MISMA LISTA OTRA VEZ NO DUPLICA A NADIE, y devuelve
  --      el PIN que ya tenían: es la forma de volver a sacarlos todos.
  declare v_antes int; v_despues int; v_pin1 text; v_pin2 text; v_est text;
  begin
    select count(*) into v_antes from public.operarios_listar();
    select c.pin into v_pin1 from public.operarios_cargar(
      '[{"nombre":"Operario Pegado 1"}]'::jsonb) c;
    select c.pin, c.estado into v_pin2, v_est from public.operarios_cargar(
      '[{"nombre":"  operario   PEGADO 1  "}]'::jsonb) c;
    select count(*) into v_despues from public.operarios_listar();

    if v_despues <> v_antes then
      v_falla := v_falla || format(' 7e(pegar lo mismo creo %s filas nuevas)', v_despues - v_antes);
    end if;
    if v_pin1 is distinct from v_pin2 then
      v_falla := v_falla || ' 7f(el repetido no devolvio el PIN que ya tenia)';
    end if;
    if v_est <> 'ya estaba' then
      v_falla := v_falla || format(' 7g(el repetido dijo «%s» en vez de «ya estaba»)', v_est);
    end if;
  end;

  -- 7c · SI LA LISTA YA TRAE PIN, SE RESPETA. Y si ese PIN ya es de
  --      otro, se dice y NO se pisa: pisarlo dejaría a dos personas
  --      respondiendo al mismo número y al primero sin poder reportar.
  declare v_pin text; v_est text; v_nom text;
  begin
    select c.pin, c.estado into v_pin, v_est from public.operarios_cargar(
      '[{"nombre":"Con Pin Propio","pin":"7654"}]'::jsonb) c;
    if v_pin <> '7654' or v_est <> 'nuevo' then
      v_falla := v_falla || format(' 7h(no se respeto el PIN de la lista: %s / %s)', v_pin, v_est);
    end if;

    select c.estado into v_est from public.operarios_cargar(
      '[{"nombre":"Otro Distinto","pin":"7654"}]'::jsonb) c;
    if v_est not like '%ya es de otro%' then
      v_falla := v_falla || format(' 7i(un PIN ya usado no se aviso: %s)', v_est);
    end if;
    select o.nombre into v_nom from public.operarios_listar() o where o.pin = '7654';
    if v_nom <> 'Con Pin Propio' then
      v_falla := v_falla || ' 7j(el PIN repetido le quito el suyo al primero)';
    end if;

    -- Un PIN mal escrito en el Excel tampoco tumba la carga entera.
    select c.estado into v_est from public.operarios_cargar(
      '[{"nombre":"Pin Torcido","pin":"12"}]'::jsonb) c;
    if v_est not like '%mal escrito%' then
      v_falla := v_falla || format(' 7k(un PIN de dos digitos no se aviso: %s)', v_est);
    end if;
  end;

  -- 7d · LAS LÍNEAS EN BLANCO NO CREAN OPERARIOS SIN NOMBRE. Pegar de
  --      Excel arrastra filas vacías del final casi siempre.
  declare v_antes int; v_despues int; v_n2 int;
  begin
    select count(*) into v_antes from public.operarios_listar();
    select count(*) into v_n2 from public.operarios_cargar(
      '[{"nombre":"  "},{"nombre":""},{"turno":"A"}]'::jsonb) c;
    select count(*) into v_despues from public.operarios_listar();
    if v_despues <> v_antes or v_n2 <> 0 then
      v_falla := v_falla || ' 7l(las lineas en blanco crearon operarios sin nombre)';
    end if;
  end;

  -- 7e · Y ESTO TAMBIÉN ES DEL ADMINISTRADOR. Si no, cualquiera con la
  --      sesión abierta se llena el maestro de PIN que él conoce.
  perform set_config('request.jwt.claim.sub', SUP, true);
  begin
    perform public.operarios_cargar('[{"nombre":"Colado Por Lista"}]'::jsonb);
    v_falla := v_falla || ' 7m(el supervisor pudo cargar la lista de operarios)';
  exception when others then
    if position('administrador' in sqlerrm) = 0 then
      v_falla := v_falla || ' 7m(fallo por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 8. BORRAR UN OPERARIO — del administrador, y no al que ya reportó
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  declare v_libre uuid; v_usado uuid; v_pin_libre text;
  begin
    select c.pin into v_pin_libre
      from public.operarios_cargar('[{"nombre":"Para Borrar"}]'::jsonb) c;
    select o.id into v_libre from public.operarios_listar() o where o.pin = v_pin_libre;

    /* Uno que SÍ reportó: es el caso que hay que frenar. */
    select o.id into v_usado from public.operarios_listar() o where o.nombre = 'Genesis Visbal';
    if v_usado is null then
      select c.pin into v_pin_libre
        from public.operarios_cargar('[{"nombre":"Genesis Visbal"}]'::jsonb) c;
      select o.id into v_usado from public.operarios_listar() o where o.pin = v_pin_libre;
    end if;
    set role postgres;
    update public.roturas set opm_id = v_usado, origen = 'opm'
     where id = (select id from public.roturas limit 1);
    set role probador;
    perform set_config('request.jwt.claim.sub', JEFE, true);

    -- EL QUE NO REPORTÓ NADA SE BORRA: es para el error de dedo.
    perform public.operario_borrar(v_libre);
    select count(*) into v_n from public.operarios_listar() o where o.id = v_libre;
    if v_n <> 0 then v_falla := v_falla || ' 8a(borrar no borró al que no reportó nada)'; end if;

    -- EL QUE YA REPORTÓ, NO: sus roturas quedarían sin quién las vio.
    if exists (select 1 from public.roturas r where r.opm_id = v_usado) then
      begin
        perform public.operario_borrar(v_usado);
        v_falla := v_falla || ' 8b(se borró un operario que ya había reportado roturas)';
      exception when others then
        if position('se apaga, no se borra' in sqlerrm) = 0 then
          v_falla := v_falla || ' 8b(falló por otra cosa: ' || sqlerrm || ')';
        end if;
      end;
      select count(*) into v_n from public.operarios_listar() o where o.id = v_usado;
      if v_n <> 1 then v_falla := v_falla || ' 8c(el intento igual lo borró)'; end if;
    end if;

    -- Y NO LO BORRA QUIEN NO MANDA.
    perform set_config('request.jwt.claim.sub', SUP, true);
    begin
      perform public.operario_borrar(v_usado);
      v_falla := v_falla || ' 8d(el supervisor pudo borrar un operario)';
    exception when others then
      if position('administrador' in sqlerrm) = 0 then
        v_falla := v_falla || ' 8d(falló por otra cosa: ' || sqlerrm || ')';
      end if;
    end;
    perform set_config('request.jwt.claim.sub', JEFE, true);
  end;

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: el desplegable sale del maestro de inventario, separa PRODUCTO de ENVASE,';
  raise notice 'BIEN: no ofrece lo apagado y dice a que le falta color o unidades por caja;';
  raise notice 'BIEN: el PIN no se puede leer desde la aplicacion y un PIN apagado contesta';
  raise notice 'BIEN: igual que uno inventado; dos operarios no comparten PIN;';
  raise notice 'BIEN: el origen queda escrito, una «encontrada» no lleva OPM aunque manden PIN,';
  raise notice 'BIEN: y el maestro de operarios es solo de quien manda.';
  raise notice 'BIEN: pegar la lista sortea PIN distintos, no correlativos y sin los que';
  raise notice 'BIEN: cualquiera prueba; pegarla otra vez no duplica a nadie y devuelve el';
  raise notice 'BIEN: PIN que ya tenian; un PIN de la lista se respeta y uno ya usado se avisa.';
end $$;
