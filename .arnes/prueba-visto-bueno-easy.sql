\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA CADENA, AL DERECHO.
--
--   registro → EASY dice si está de acuerdo
--                ├─ de acuerdo    → cobro, y ABI ni se entera
--                └─ en desacuerdo → ABI resuelve, y es la última
--
-- LO QUE PUEDE ROMPERSE:
--  1. Que ABI pueda decidir de entrada. Si puede, la cadena volvió a
--     estar al revés y ABI tiene que mirar las cien del mes otra vez.
--  2. Que un «de acuerdo» pase por alguna bandeja. «No llega
--     notificación, llega a la data.»
--  3. Que se pueda rechazar SIN EVIDENCIA. Entonces ABI resuelve un
--     pleito donde una parte trajo pruebas y la otra una opinión.
--  4. Que ABI pueda tocar una que nadie objetó.
--  5. Que aceptar exija foto del descargo. Quien acepta no prueba nada,
--     y cobrarle el trámite enseña a rechazar por costumbre.
--  6. Que la vista diga «por acuerdo» de una rotura vieja, decidida
--     cuando ABI decidía de entrada: sería inventar un acuerdo.
-- =====================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','root@cd.local'),
  ('11111111-1111-1111-1111-111111111111','jefe@cd.local'),
  ('22222222-2222-2222-2222-222222222222','easy@cd.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cd.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('44444444-4444-4444-4444-444444444444','root','Root','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;

insert into public.perfiles (id, usuario, nombre, rol, activo) values
  /* ABI ES EL ROL `abi`, QUE NO MANDA — y eso es a propósito. El súper
     admin de este proyecto pasa por encima de todo permiso de pantalla
     (`mi_nivel_pantalla` le devuelve «editar» a quien manda), así que
     probar «ABI no puede dar el visto bueno» con un admin no probaría
     la cadena: probaría que el admin es admin. */
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe ABI','abi',true),
  ('22222222-2222-2222-2222-222222222222','easy','Easy OL','operador',true),
  ('33333333-3333-3333-3333-333333333333','sup','Mirón','supervisor',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

/* EL REPARTO QUE PIDIÓ: el visto bueno es de EASY, los desacuerdos son
   de ABI, y el supervisor solo mira. */
insert into public.rol_permisos (rol, seccion, nivel) values
  ('operador',   '/roturas/en-sitio/visto-bueno', 'editar'),
  ('operador',   '/roturas/en-sitio/desacuerdos', 'ver'),
  ('abi',        '/roturas/en-sitio/visto-bueno', 'ver'),
  ('abi',        '/roturas/en-sitio/desacuerdos', 'editar'),
  ('supervisor', '/roturas/en-sitio/visto-bueno', 'ver'),
  ('supervisor', '/roturas/en-sitio/desacuerdos', 'ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

insert into public.roturas_materiales (clave, nombre, tipo, color, activo, orden) values
  ('EER-AMBAR','Envase retornable ambar','eer','ambar',true,1)
on conflict (clave) do nothing;
insert into public.roturas_procesos (clave, nombre, activo, orden) values
  ('lineas','Lineas',true,1) on conflict (clave) do nothing;
insert into public.roturas_areas (clave, nombre, activo, orden) values
  ('plazoleta','Plazoleta',true,1) on conflict (clave) do nothing;
/* DOS CAUSAS: una que EXIGE foto y otra que no. Con una sola, «aceptar
   no exige foto del descargo» y «aceptar sí exige la de la rotura
   cuando la causa la pide» no se pueden separar. */
insert into public.roturas_causas (clave, nombre, grupo, exige_foto, activo, orden) values
  ('estibas_malas','Estibas en mal estado','asumida',false,true,1),
  ('falla_maquinas','Falla de las maquinas','no_asumida',true,true,2)
on conflict (clave) do update set exige_foto = excluded.exige_foto;

grant probador to postgres;
grant authenticated to probador;

do $$
declare
  JEFE constant text := '11111111-1111-1111-1111-111111111111';
  ROOT constant text := '44444444-4444-4444-4444-444444444444';
  EASY constant text := '22222222-2222-2222-2222-222222222222';
  SUP  constant text := '33333333-3333-3333-3333-333333333333';
  v_falla text := ''; v_n int; v_txt text; v_id uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
begin
  /* UN ARNÉS TIENE QUE HABLAR ANTES DE MORIRSE: si una mutación hace
     que una llamada de más abajo reviente, sin esto el bloque muere y
     v_falla no se imprime —ni verde ni roja, que es lo único que de
     verdad no sirve—. */
  begin
  set role probador;
  perform set_config('request.jwt.claim.sub', EASY, true);

  -- ================================================================
  -- El escenario: cinco roturas iguales
  -- ================================================================
  select r.id into r1 from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'La primera',
    p_area => 'plazoleta', p_color => 'ambar') r;
  select r.id into r2 from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'La segunda',
    p_area => 'plazoleta', p_color => 'ambar') r;
  select r.id into r3 from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'La tercera',
    p_area => 'plazoleta', p_color => 'ambar') r;
  select r.id into r4 from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'falla_maquinas', p_descripcion => 'La que exige foto',
    p_area => 'plazoleta', p_color => 'ambar') r;
  select r.id into r5 from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'La vieja',
    p_area => 'plazoleta', p_color => 'ambar') r;

  -- ================================================================
  -- 1. ABI NO DECIDE DE ENTRADA
  --
  -- Es la mitad de la razón de invertir la cadena. Si ABI puede tocar
  -- lo que nadie objetó, vuelve a tener que mirar las cien del mes.
  -- ================================================================
  perform set_config('request.jwt.claim.sub', JEFE, true);
  begin
    perform public.rotura_visto_bueno(r1, true);
    v_falla := v_falla || ' 1a(ABI dio el visto bueno: eso ahora es de Easy)';
  exception when others then
    if position('operador logístico' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  begin
    perform public.rotura_resolver(r1, true, 'porque sí');
    v_falla := v_falla || ' 1b(ABI resolvió una rotura que nadie objetó)';
  exception when others then
    if position('no está en desacuerdo' in sqlerrm) = 0 then
      v_falla := v_falla || ' 1b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 2. DE ACUERDO → COBRO, Y ABI NI SE ENTERA
  -- ================================================================
  perform set_config('request.jwt.claim.sub', EASY, true);
  perform public.rotura_visto_bueno(r1, true, 'Fue nuestra');

  select v.estado, v.etapa into v_txt, v_txt from public.v_roturas v where v.id = r1;
  select v.estado into v_txt from public.v_roturas v where v.id = r1;
  if v_txt <> 'cuenta' then
    v_falla := v_falla || format(' 2a(aceptada y el estado quedó «%s»)', v_txt);
  end if;
  select v.etapa into v_txt from public.v_roturas v where v.id = r1;
  if v_txt <> 'cobro' then
    v_falla := v_falla || format(' 2b(aceptada y la etapa dice «%s», no «cobro»)', v_txt);
  end if;
  /* «NO LLEGA NOTIFICACIÓN, LLEGA A LA DATA»: no queda en ninguna
     bandeja —ni en la de Easy ni en la de ABI—. */
  select count(*) into v_n from public.v_roturas v
   where v.id = r1 and v.etapa in ('espera_ol', 'desacuerdo');
  if v_n <> 0 then
    v_falla := v_falla || ' 2c(una aceptada se quedó en una bandeja: debía irse derecho a la data)';
  end if;
  /* Y SE SABE POR QUÉ CAMINO LLEGÓ AL COBRO: el acta del mes tiene que
     poder decir si las partes estuvieron de acuerdo o si una le ganó. */
  select v.cobro_por into v_txt from public.v_roturas v where v.id = r1;
  if v_txt <> 'acuerdo' then
    v_falla := v_falla || format(' 2d(el camino al cobro dice «%s» y fue por acuerdo)', v_txt);
  end if;

  -- Y NO SE CONTESTA DOS VECES.
  begin
    perform public.rotura_visto_bueno(r1, false, 'ahora no quiero');
    v_falla := v_falla || ' 2e(se contestó dos veces la misma rotura)';
  exception when others then
    if position('ya se contestó' in sqlerrm) = 0 and position('ya está decidida' in sqlerrm) = 0 then
      v_falla := v_falla || ' 2e(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 3. RECHAZAR SIN EVIDENCIA, NO
  --
  -- «Y en todo se requiere evidencia.» Sin foto del descargo, ABI
  -- resolvería un pleito donde una parte trajo pruebas y la otra no.
  -- ================================================================
  begin
    perform public.rotura_visto_bueno(r2, false, 'No fue nuestra');
    v_falla := v_falla || ' 3a(se rechazó sin evidencia del descargo)';
  exception when others then
    if position('evidencia del descargo' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  /* Y LA FOTO DE LA ROTURA NO VALE COMO EVIDENCIA DEL DESCARGO.
     Lo destapó una mutación: quitar el filtro `papel = 'descargo'`
     salía VERDE, porque la única rotura que se rechazaba no tenía
     ninguna otra foto. Son dos momentos distintos —lo que se rompió y
     con qué se sostiene que no fue mío—, y una no prueba lo otro. */
  select r.id into v_id from public.rotura_registrar(
    p_material => 'EER-AMBAR', p_unidades => 10, p_proceso => 'lineas',
    p_causa => 'estibas_malas', p_descripcion => 'La que solo tiene foto de la rotura',
    p_area => 'plazoleta', p_color => 'ambar') r;
  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (v_id, v_id || '/rotura.jpg', 'rotura');
  begin
    perform public.rotura_visto_bueno(v_id, false, 'No fue nuestra');
    v_falla := v_falla || ' 3a2(la foto de la ROTURA pasó por evidencia del descargo)';
  exception when others then
    if position('evidencia del descargo' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3a2(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- NI SIN MOTIVO, aunque haya foto.
  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r2, r2 || '/descargo.jpg', 'descargo');
  begin
    perform public.rotura_visto_bueno(r2, false, '   ');
    v_falla := v_falla || ' 3b(se rechazó sin decir por qué)';
  exception when others then
    if position('por qué' in sqlerrm) = 0 then
      v_falla := v_falla || ' 3b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- Con las dos cosas, sí.
  perform public.rotura_visto_bueno(r2, false, 'El montacargas no fue nuestro ese dia');
  select v.etapa into v_txt from public.v_roturas v where v.id = r2;
  if v_txt <> 'desacuerdo' then
    v_falla := v_falla || format(' 3c(rechazada y la etapa dice «%s»)', v_txt);
  end if;
  /* SIGUE EN 'esperando': todavía no está decidida. Lo que cambió es
     quién la mira. */
  select v.estado into v_txt from public.v_roturas v where v.id = r2;
  if v_txt <> 'esperando' then
    v_falla := v_falla || format(' 3d(una rechazada quedó en estado «%s»: todavía no está decidida)', v_txt);
  end if;
  select v.cobro_por into v_txt from public.v_roturas v where v.id = r2;
  if v_txt is not null then
    v_falla := v_falla || format(' 3e(una rechazada ya dice camino de cobro «%s»)', v_txt);
  end if;

  -- ================================================================
  -- 4. ACEPTAR NO EXIGE FOTO DEL DESCARGO, PERO SÍ LA DE LA ROTURA
  --    CUANDO LA CAUSA LA PIDE
  -- ================================================================
  -- r3 no tiene NINGUNA foto y su causa no la exige: se acepta igual.
  -- Cobrarle un trámite a quien está de acuerdo es lo que enseña a
  -- rechazar por costumbre.
  perform public.rotura_visto_bueno(r3, true);
  select v.etapa into v_txt from public.v_roturas v where v.id = r3;
  if v_txt <> 'cobro' then
    v_falla := v_falla || ' 4a(aceptar una sin fotos, con causa que no las exige, no dejó)';
  end if;

  -- r4 SÍ la exige y no la tiene: aceptarla dejaría un cobro sin con
  -- qué sostenerlo.
  begin
    perform public.rotura_visto_bueno(r4, true);
    v_falla := v_falla || ' 4b(se aceptó una causa que exige foto, sin foto)';
  exception when others then
    if position('exige foto' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  -- Y LA DEL DESCARGO NO CUENTA COMO LA DE LA ROTURA: son dos momentos.
  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r4, r4 || '/descargo.jpg', 'descargo');
  begin
    perform public.rotura_visto_bueno(r4, true);
    v_falla := v_falla || ' 4c(una foto de descargo pasó por foto de la rotura)';
  exception when others then
    if position('exige foto' in sqlerrm) = 0 then
      v_falla := v_falla || ' 4c(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;
  insert into public.roturas_fotos (rotura_id, ruta, papel)
    values (r4, r4 || '/rotura.jpg', 'rotura');
  perform public.rotura_visto_bueno(r4, true);
  select v.etapa into v_txt from public.v_roturas v where v.id = r4;
  if v_txt <> 'cobro' then
    v_falla := v_falla || format(' 4d(con la foto de la rotura puesta, aceptar dejó la etapa en «%s»)', v_txt);
  end if;

  -- ================================================================
  -- 5. ABI RESUELVE, Y ES LA ÚLTIMA PALABRA
  -- ================================================================
  perform set_config('request.jwt.claim.sub', EASY, true);
  begin
    perform public.rotura_resolver(r2, true, 'me lo cobro yo solo');
    v_falla := v_falla || ' 5a(Easy resolvió su propio desacuerdo)';
  exception when others then
    if position('de ABI' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform set_config('request.jwt.claim.sub', JEFE, true);
  -- SIN ARGUMENTO NO SE CIERRA: un desacuerdo que se cierra sin una
  -- línea es el que se vuelve a discutir el mes entrante.
  begin
    perform public.rotura_resolver(r2, true, '  ');
    v_falla := v_falla || ' 5b(ABI cerró un desacuerdo sin decir por qué)';
  exception when others then
    if position('por qué' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5b(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  perform public.rotura_resolver(r2, true, 'El video del dia lo muestra');
  select v.estado into v_txt from public.v_roturas v where v.id = r2;
  if v_txt <> 'cuenta' then
    v_falla := v_falla || format(' 5c(ABI sostuvo el cobro y el estado quedó «%s»)', v_txt);
  end if;
  /* SE COBRA, PERO NO POR ACUERDO: una le ganó a la otra, y el acta
     tiene que poder decirlo. */
  select v.cobro_por into v_txt from public.v_roturas v where v.id = r2;
  if v_txt <> 'abi' then
    v_falla := v_falla || format(' 5d(lo resuelto por ABI dice camino «%s»)', v_txt);
  end if;

  -- Y NO SE RESUELVE DOS VECES: es la última palabra.
  begin
    perform public.rotura_resolver(r2, false, 'me arrepenti');
    v_falla := v_falla || ' 5e(ABI resolvió dos veces el mismo desacuerdo)';
  exception when others then
    if position('ya se resolvió' in sqlerrm) = 0 then
      v_falla := v_falla || ' 5e(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 6. LO VIEJO NO SE REESCRIBE
  --
  -- r5 se decide como se decidía antes —ABI de entrada, sin que Easy
  -- contestara—. Decir hoy que aquello fue «por acuerdo» sería
  -- inventar un acuerdo que nadie dio.
  -- ================================================================
  set role postgres;
  update public.roturas set estado = 'cuenta', decidida_por = JEFE::uuid, decidida_en = now()
   where id = r5;
  set role probador;
  perform set_config('request.jwt.claim.sub', JEFE, true);
  select v.cobro_por into v_txt from public.v_roturas v where v.id = r5;
  if v_txt <> 'antes' then
    v_falla := v_falla || format(' 6a(una decidida con la cadena vieja dice «%s» y debe decir «antes»)', v_txt);
  end if;

  -- ================================================================
  -- 7. QUIEN SOLO MIRA NO TOCA NADA
  -- ================================================================
  perform set_config('request.jwt.claim.sub', SUP, true);
  begin
    perform public.rotura_visto_bueno(r5, true);
    v_falla := v_falla || ' 7a(quien solo VE dio el visto bueno)';
  exception when others then
    if position('operador logístico' in sqlerrm) = 0 then
      v_falla := v_falla || ' 7a(falló por otra cosa: ' || sqlerrm || ')';
    end if;
  end;

  -- ================================================================
  -- 8. ANULAR Y BORRAR — del administrador, y con sus límites
  -- ================================================================
  -- «La tabla de todos los registros con sus estados, para borrar o
  --  anular si eres súper admin.»
  declare v_borrable uuid; v_decidida uuid;
  begin
    perform set_config('request.jwt.claim.sub', EASY, true);
    select r.id into v_borrable from public.rotura_registrar(
      p_material => 'EER-AMBAR', p_unidades => 5, p_proceso => 'lineas',
      p_causa => 'estibas_malas', p_descripcion => 'Para borrar',
      p_area => 'plazoleta', p_color => 'ambar') r;

    /* NI EASY NI EL SUPERVISOR: es del administrador. `rotura_anular`
       preguntaba por el NOMBRE del rol —`mi_rol() <> 'admin'`— y eso
       deja de proteger el día que alguien cree un segundo rol que
       mande. Ahora pregunta por la casilla. */
    begin
      perform public.rotura_borrar(v_borrable);
      v_falla := v_falla || ' 8a(Easy pudo borrar una rotura)';
    exception when others then
      if position('administrador' in sqlerrm) = 0 then
        v_falla := v_falla || ' 8a(falló por otra cosa: ' || sqlerrm || ')';
      end if;
    end;
    begin
      perform public.rotura_anular(v_borrable, 'porque sí');
      v_falla := v_falla || ' 8b(Easy pudo anular una rotura)';
    exception when others then
      if position('administrador' in sqlerrm) = 0 then
        v_falla := v_falla || ' 8b(falló por otra cosa: ' || sqlerrm || ')';
      end if;
    end;

    /* EL ADMINISTRADOR SÍ, mientras nadie la haya decidido. */
    perform set_config('request.jwt.claim.sub', ROOT, true);
    perform public.rotura_borrar(v_borrable);
    select count(*) into v_n from public.v_roturas v where v.id = v_borrable;
    if v_n <> 0 then v_falla := v_falla || ' 8c(borrar no borró)'; end if;

    /* PERO UNA YA DECIDIDA NO SE BORRA: entró en la conciliación de
       alguien, y borrarla cambia un mes que ya se cerró sin dejar nada
       que mirar cuando pregunten por qué. */
    /* SE USA r5 Y NO r1, y la diferencia importa: r1 está en 'cuenta'
       PORQUE Easy la aceptó, así que la frenarían los dos guardas —el
       de «ya decidida» y el de «el OL ya contestó»— y quitar uno de
       los dos seguiría saliendo verde. r5 se decidió con la cadena
       vieja: está decidida y NADIE contestó, así que solo la frena el
       primero. Lo destapó una mutación que salió VERDE. */
    begin
      perform public.rotura_borrar(r5);
      v_falla := v_falla || ' 8d(se borró una rotura ya decidida)';
    exception when others then
      if position('se anula, no se borra' in sqlerrm) = 0 then
        v_falla := v_falla || ' 8d(falló por otra cosa: ' || sqlerrm || ')';
      end if;
    end;
    select count(*) into v_n from public.v_roturas v where v.id = r5;
    if v_n <> 1 then v_falla := v_falla || ' 8e(el intento igual la borró)'; end if;

    /* NI UNA QUE EASY YA CONTESTÓ, aunque siga en 'esperando': el
       descargo de alguien no se borra por debajo. */
    perform set_config('request.jwt.claim.sub', EASY, true);
    select r.id into v_decidida from public.rotura_registrar(
      p_material => 'EER-AMBAR', p_unidades => 5, p_proceso => 'lineas',
      p_causa => 'estibas_malas', p_descripcion => 'Objetada',
      p_area => 'plazoleta', p_color => 'ambar') r;
    insert into public.roturas_fotos (rotura_id, ruta, papel)
      values (v_decidida, v_decidida || '/d.jpg', 'descargo');
    perform public.rotura_visto_bueno(v_decidida, false, 'No fue nuestra');
    perform set_config('request.jwt.claim.sub', ROOT, true);
    begin
      perform public.rotura_borrar(v_decidida);
      v_falla := v_falla || ' 8f(se borró una rotura que el OL ya había objetado)';
    exception when others then
      if position('ya contestó' in sqlerrm) = 0 then
        v_falla := v_falla || ' 8f(falló por otra cosa: ' || sqlerrm || ')';
      end if;
    end;

    /* Y ANULAR DEJA LA FILA, con el motivo. */
    perform public.rotura_anular(v_decidida, 'Se conto dos veces');
    select v.estado, v.motivo_anulacion into v_txt, v_txt
      from public.v_roturas v where v.id = v_decidida;
    select v.estado into v_txt from public.v_roturas v where v.id = v_decidida;
    if v_txt <> 'anulada' then
      v_falla := v_falla || format(' 8g(anular dejó el estado en «%s»)', v_txt);
    end if;
    select v.motivo_anulacion into v_txt from public.v_roturas v where v.id = v_decidida;
    if v_txt is null then v_falla := v_falla || ' 8h(anular no guardó el motivo)'; end if;
    select count(*) into v_n from public.v_roturas v where v.id = v_decidida;
    if v_n <> 1 then v_falla := v_falla || ' 8i(anular borró la fila en vez de marcarla)'; end if;
  end;

  exception when others then
    set role postgres;
    raise exception 'FALLA:% — y ademas se murio en el camino: %', v_falla, sqlerrm;
  end;

  set role postgres;
  if v_falla <> '' then raise exception 'FALLA:%', v_falla; end if;
  raise notice 'BIEN: la cadena va al derecho —EASY contesta primero, y si esta de acuerdo la';
  raise notice 'BIEN: rotura se va derecho a cobro sin pasar por ninguna bandeja de ABI—;';
  raise notice 'BIEN: rechazar exige motivo Y foto del descargo, aceptar no exige la del';
  raise notice 'BIEN: descargo pero si la de la rotura cuando la causa la pide, y una no vale';
  raise notice 'BIEN: por la otra; ABI solo toca lo que se objeto y su palabra es la ultima;';
  raise notice 'BIEN: y lo decidido con la cadena vieja no se reescribe como «por acuerdo»;';
  raise notice 'BIEN: anular y borrar son del ADMINISTRADOR —por la casilla del rol, no por el';
  raise notice 'BIEN: nombre «admin»—, y lo ya decidido o ya contestado se anula, no se borra.';
end $$;
