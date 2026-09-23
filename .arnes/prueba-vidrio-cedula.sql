\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- EL VIDRIO SALE CON EL VIAJE · LA CÉDULA
--
-- «Que facturación no haga doble trabajo validando allá en salida y en
--  traspaso.»
--
-- Quitar un paso de una cadena de firmas es lo más fácil de hacer mal:
-- se quita el paso y se va con él la regla que ese paso sostenía. Aquí
-- se comprueban las SEIS cosas que pueden romperse, y ninguna es «¿deja
-- dar salida?» —eso ya lo dejaba—:
--
--   1. La firma de validación quedó rechazada, y el mensaje dice a
--      dónde se mudó en vez de «no tienes permiso», que mandaría a
--      pedirle un permiso a quien administra por una firma que ya no
--      existe.
--   2. Un Vh con vidrio pendiente NO sale sin escoger la cédula. Es el
--      hueco que deja quitar Validación: el Vh se va, el vidrio se va
--      con él, y el registro dice que sigue en el patio.
--   3. La placa tiene que cuadrar.
--   4. Las tolvas tienen que cuadrar, y es FRENO, no aviso.
--   5. Una cédula no se despacha dos veces.
--   6. Quien pesó no da la salida. Es la razón de ser de la cadena, y
--      al quitarse el paso de en medio tenía que MUDARSE a facturación,
--      no perderse.
--
--   Y la séptima, que es la que nadie prueba: reabrir el viaje tiene
--   que DEVOLVER la cédula a pendiente. Si no, el vidrio queda
--   despachado contra un viaje que ya no salió.
-- =====================================================================

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@cdcontrol.local'),
  ('33333333-3333-3333-3333-333333333333','sup@cdcontrol.local'),
  ('77777777-7777-7777-7777-777777777777','fac@cdcontrol.local')
on conflict do nothing;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe','Jefe','admin',true)
on conflict (id) do update set rol = 'admin', activo = true;
insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('33333333-3333-3333-3333-333333333333','sup','Super','supervisor',true),
  ('77777777-7777-7777-7777-777777777777','fac','Facturo','facturacion',true)
on conflict (id) do update set rol = excluded.rol, activo = true;

insert into public.roturas_tolvas (codigo, modelo, tara_kg, orden) values
  ('TOLVA-C1', 'Tolva estándar', 111, 91),
  ('TOLVA-C2', 'Tolva estándar', 111, 92)
on conflict (codigo) do update set activo = true;

/* DOS PUNTOS PARA QUE LOS VIAJES TENGAN DE DÓNDE Y A DÓNDE.
   En una base recién montada el maestro de puntos está vacío, y el
   viaje no se puede insertar sin ellos. */
insert into public.traspasos_puntos (clave, nombre, activo) values
  ('CD38', 'CD38', true), ('PELDAR', 'Peldar', true)
on conflict (clave) do update set activo = true;

/* DOS VIAJES DE TRASPASO, PUESTOS A MANO.
   Se insertan derecho en la tabla y no con traspaso_registrar a
   propósito: lo que esta prueba mide es la SALIDA, y hacerla depender
   del maestro de puntos —que en una base recién montada está vacío—
   la haría fallar por algo que no tiene nada que ver con lo que prueba. */
insert into public.traspasos_viajes
  (id, codigo, fecha, turno, tipo, placa, origen, destino, viajes, vacio, estado, registrado_por)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','VC-0001', current_date, 'A', 'casco_vidrio',
   'ABC123', 'CD38', 'PELDAR', 1, false, 'registrado', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002','VC-0002', current_date, 'A', 'casco_vidrio',
   'XYZ789', 'CD38', 'PELDAR', 1, false, 'registrado', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- EL SUPERVISOR PESA Y CIERRA: AHÍ NACE LA CÉDULA
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_id uuid; v_cod text; v_falla text := ''; v_pend int;
begin
  select a.id, a.codigo into v_id, v_cod from public.salida_abrir('ABC123') a;
  perform public.salida_pesar(v_id, 'TOLVA-C1', 'ambar', 900);
  perform public.salida_pesar(v_id, 'TOLVA-C2', 'ambar', 880);
  perform public.salida_firmar(v_id, 'supervisora', 'pesadas 2 tolvas');

  -- 1. LA FIRMA DE VALIDACIÓN YA NO EXISTE, y lo dice diciendo a dónde
  --    se fue. Un «no tienes permiso» mandaría a pedir un permiso que
  --    ya no le sirve a nadie.
  begin
    perform public.salida_firmar(v_id, 'validador', 'sale');
    v_falla := v_falla || ' 1(todavia acepta la firma de validacion)';
  exception when others then
    if sqlerrm not like '%ya no se hace aquí%' then
      v_falla := v_falla || ' 1(el mensaje no dice a donde se mudo: ' || sqlerrm || ')'; end if;
    if sqlerrm not like '%facturación%' then
      v_falla := v_falla || ' 1b(el mensaje no nombra a facturacion)'; end if;
  end;

  -- 1c. Y LA CÉDULA QUEDA LISTA, con sus dos tolvas y su placa.
  select count(*) into v_pend from public.v_salidas_por_despachar d
   where d.placa = 'ABC123' and d.cedula = v_cod and d.tolvas = 2;
  if v_pend <> 1 then
    v_falla := v_falla || ' 1c(la cedula no quedo lista para despachar con sus 2 tolvas)'; end if;

  if v_falla = '' then
    raise notice 'PESAR: bien. Validacion rechazada y la cedula % queda lista con 2 tolvas.', v_cod;
  else
    raise exception 'PESAR FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;


-- ---------------------------------------------------------------------
-- FACTURACIÓN: LOS CUATRO FRENOS
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role probador;
do $$
declare
  v_cedula uuid; v_otra uuid; v_falla text := ''; v_n int;
  v_desp timestamptz; v_viaje uuid; v_cont int;
begin
  select id into v_cedula from public.roturas_salidas where placa = 'ABC123' and despachada_en is null;

  -- 2. SIN ESCOGER LA CÉDULA, EL VH NO SALE.
  --    Es el hueco que deja quitar Validación: sin este freno el Vh se
  --    va, el vidrio se va con él, y la cédula sigue diciendo que está
  --    en el patio.
  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000001', '5500000001');
    v_falla := v_falla || ' 2(dio salida ignorando el vidrio pendiente)';
  exception when others then
    if sqlerrm not like '%sin despachar%' then
      v_falla := v_falla || ' 2(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 3. LA PLACA TIENE QUE CUADRAR. La cédula es de ABC123; el viaje
  --    0002 es de XYZ789.
  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000002', '5500000002', v_cedula, 2);
    v_falla := v_falla || ' 3(despacho una cedula de otra placa)';
  exception when others then
    if sqlerrm not like '%es de la placa%' then
      v_falla := v_falla || ' 3(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 4. LAS TOLVAS TIENEN QUE CUADRAR, Y FRENA. Son dos pesadas; se
  --    cuentan tres.
  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000001', '5500000001', v_cedula, 3);
    v_falla := v_falla || ' 4(dejo salir con las tolvas descuadradas)';
  exception when others then
    if sqlerrm not like '%No cuadra%' then
      v_falla := v_falla || ' 4(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 4b. Y SIN CONTARLAS, TAMPOCO. Mandar null no puede colarse como
  --     «no aplica»: ese es justo el camino por el que se pierde el
  --     freno sin que nadie lo note.
  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000001', '5500000001', v_cedula, null);
    v_falla := v_falla || ' 4b(dejo salir sin contar las tolvas)';
  exception when others then
    if sqlerrm not like '%Cuenta las tolvas%' then
      v_falla := v_falla || ' 4b(error raro: ' || sqlerrm || ')'; end if;
  end;

  -- 5. Y CUANDO CUADRA, SALE, y el mismo acto despacha el vidrio.
  perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000001', '5500000001', v_cedula, 2);

  select despachada_en, viaje, tolvas_contadas into v_desp, v_viaje, v_cont
    from public.roturas_salidas where id = v_cedula;
  if v_desp is null then v_falla := v_falla || ' 5(no quedo despachada)'; end if;
  if v_viaje <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    v_falla := v_falla || ' 5b(no quedo amarrada al viaje)'; end if;
  if v_cont <> 2 then v_falla := v_falla || ' 5c(no guardo las tolvas contadas)'; end if;

  -- 5d. Y SALE DEL DESPLEGABLE. Si se quedara, el siguiente Vh de esa
  --     placa la vería y alguien la despacharia dos veces.
  select count(*) into v_n from public.v_salidas_por_despachar where id = v_cedula;
  if v_n <> 0 then v_falla := v_falla || ' 5d(sigue apareciendo como pendiente)'; end if;

  -- 5e. LA VISTA DICE EN QUÉ VIAJE SE FUE. Sin esto, el día que Peldar
  --     reclame no hay cómo saber con qué documento salió.
  select count(*) into v_n from public.v_roturas_salidas
   where id = v_cedula and viaje_codigo = 'VC-0001' and firmas = 2 and completa;
  if v_n <> 1 then v_falla := v_falla || ' 5e(la vista no dice el viaje, o no la da por completa)'; end if;

  -- 6. UNA CÉDULA NO SE DESPACHA DOS VECES.
  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000002', '5500000003', v_cedula, 2);
    v_falla := v_falla || ' 6(la despacho dos veces)';
  exception when others then
    if sqlerrm not like '%ya se despachó%' then
      v_falla := v_falla || ' 6(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla = '' then
    raise notice 'FACTURACION: bien. Sin cedula no sale, la placa y las tolvas tienen que cuadrar, y no se despacha dos veces.';
  else
    raise exception 'FACTURACION FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;


-- ---------------------------------------------------------------------
-- 7. QUIEN PESÓ NO DA LA SALIDA
--
-- La regla que sostenía Validación tenía que MUDARSE a facturación, no
-- perderse. Se prueba con una persona que pesa Y factura —que es
-- exactamente el caso que la regla existe para impedir— y que NO es
-- administrador, porque el administrador sí pasa.
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor', '/traspasos/facturacion', 'editar')
on conflict (rol, seccion) do update set nivel = 'editar';

insert into public.traspasos_viajes
  (id, codigo, fecha, turno, tipo, placa, origen, destino, viajes, vacio, estado, registrado_por)
values
  ('aaaaaaaa-0000-0000-0000-000000000003','VC-0003', current_date, 'A', 'casco_vidrio',
   'MMM555', 'CD38', 'PELDAR', 1, false, 'registrado', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role probador;
do $$
declare v_id uuid; v_falla text := '';
begin
  select a.id into v_id from public.salida_abrir('MMM555') a;
  perform public.salida_pesar(v_id, 'TOLVA-C1', 'ambar', 700);
  perform public.salida_firmar(v_id, 'supervisora');

  begin
    perform public.traspaso_confirmar_salida('aaaaaaaa-0000-0000-0000-000000000003', '5500000009', v_id, 1);
    v_falla := v_falla || ' 7(quien peso pudo darle la salida)';
  exception when others then
    if sqlerrm not like '%quien pesó el vidrio no le da la salida%' then
      v_falla := v_falla || ' 7(error raro: ' || sqlerrm || ')'; end if;
  end;

  if v_falla = '' then
    raise notice 'DOS PERSONAS: bien. Quien peso el vidrio no le da la salida.';
  else
    raise exception 'DOS PERSONAS FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;


-- ---------------------------------------------------------------------
-- 8. REABRIR EL VIAJE DEVUELVE LA CÉDULA
--
-- Nadie prueba esto, y es donde se queda el vidrio colgado para
-- siempre: quien administra reabre el viaje para corregirlo, la cédula
-- se queda despachada contra un viaje que ya no salió, y no hay pantalla
-- en la que vuelva a aparecer.
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare v_cedula uuid; v_falla text := ''; v_n int;
begin
  select id into v_cedula from public.roturas_salidas
   where viaje = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_cedula is null then raise exception 'REABRIR FALLA: no encontre la cedula despachada'; end if;

  perform public.traspaso_reabrir_salida('aaaaaaaa-0000-0000-0000-000000000001', 'se equivoco de documento');

  select count(*) into v_n from public.v_salidas_por_despachar where id = v_cedula;
  if v_n <> 1 then v_falla := v_falla || ' 8(la cedula no volvio a quedar pendiente)'; end if;

  select count(*) into v_n from public.roturas_salidas
   where id = v_cedula and (despachada_en is not null or viaje is not null or tolvas_contadas is not null);
  if v_n <> 0 then v_falla := v_falla || ' 8b(quedo con rastro del despacho anterior)'; end if;

  if v_falla = '' then
    raise notice 'REABRIR: bien. Al reabrir el viaje la cedula vuelve a estar pendiente.';
  else
    raise exception 'REABRIR FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;


-- ---------------------------------------------------------------------
-- 9. EL DESPLEGABLE SOLO TRAE LAS DE SU PLACA
--
-- «Solo las de esa placa.» Un desplegable con todas las pendientes del
-- CD invita a escoger la de al lado: las placas se parecen y la de
-- arriba es la que se toca.
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role probador;
do $$
declare v_falla text := ''; v_n int; v_placas int;
begin
  select count(*), count(distinct placa) into v_n, v_placas
    from public.viaje_cedulas('aaaaaaaa-0000-0000-0000-000000000001');
  if v_n = 0 then v_falla := v_falla || ' 9(no trajo ninguna y hay una pendiente para esa placa)'; end if;
  if v_placas > 1 then v_falla := v_falla || ' 9b(trajo cedulas de mas de una placa)'; end if;

  select count(*) into v_n from public.viaje_cedulas('aaaaaaaa-0000-0000-0000-000000000001')
   where placa <> 'ABC123';
  if v_n <> 0 then v_falla := v_falla || ' 9c(trajo cedulas de otra placa)'; end if;

  /* Y LAS TOLVAS VIENEN EN EL DESPLEGABLE. Es lo que facturación mira
     para decir «sí, es este»; sin ese número el desplegable es una
     lista de códigos que no dicen nada. */
  select count(*) into v_n from public.viaje_cedulas('aaaaaaaa-0000-0000-0000-000000000001')
   where tolvas = 2 and neto_kg > 0;
  if v_n <> 1 then v_falla := v_falla || ' 9d(el desplegable no trae las tolvas y los kilos)'; end if;

  if v_falla = '' then
    raise notice 'DESPLEGABLE: bien. Solo las de esa placa, con sus tolvas y sus kilos.';
  else
    raise exception 'DESPLEGABLE FALLA:%', v_falla;
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;

do $$ begin raise notice 'CEDULA ok'; end $$;
