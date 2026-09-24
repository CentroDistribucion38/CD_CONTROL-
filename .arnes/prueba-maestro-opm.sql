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

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: el desplegable sale del maestro de inventario, separa PRODUCTO de ENVASE,';
  raise notice 'BIEN: no ofrece lo apagado y dice a que le falta color o unidades por caja;';
  raise notice 'BIEN: el PIN no se puede leer desde la aplicacion y un PIN apagado contesta';
  raise notice 'BIEN: igual que uno inventado; dos operarios no comparten PIN;';
  raise notice 'BIEN: el origen queda escrito, una «encontrada» no lleva OPM aunque manden PIN,';
  raise notice 'BIEN: y el maestro de operarios es solo de quien manda.';
end $$;
