\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA CONVERSIÓN DE LOS RENGLONES VIEJOS
--
-- Lo que se comprueba no es «¿corrió la migración?» sino LAS CUENTAS, y
-- una a una:
--
--   · que la fabricación despejada dé EXACTAMENTE el vencimiento que ya
--     estaba guardado —no un día antes ni un día después—,
--   · que el vencimiento no se haya movido ni un dígito,
--   · que la resta aguante cruzar el año hacia atrás,
--   · que lo que NO se puede convertir se quede quieto y no se invente,
--   · y que un renglón que ya traía fabricación no se toque, ni siquiera
--     para «corregirlo».
-- =====================================================================

do $$
declare
  v_falla text := '';
  v_con uuid; v_d smallint; v_m smallint; v_a smallint;
  v_vd smallint; v_vm smallint; v_va smallint;
  v_n int;
begin
  select id into v_con from public.conteos where codigo = 'FEFO-VIEJO-01';
  if v_con is null then raise exception 'No está el conteo sembrado'; end if;

  -- 1. EL CASO NORMAL. 06/11/27 − 180 días = 10/05/27, que es el mismo
  --    par con el que se comprobó la cuenta hacia adelante.
  select l.fab_dia, l.fab_mes, l.fab_anio, l.venc_dia, l.venc_mes, l.venc_anio
    into v_d, v_m, v_a, v_vd, v_vm, v_va
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.conteo_id = v_con and p.sku = '3128' and l.estibas = 40;

  if (v_d, v_m, v_a) is distinct from (10::smallint, 5::smallint, 27::smallint) then
    v_falla := v_falla || ' 1(despejo ' || coalesce(v_d,0) || '/' || coalesce(v_m,0)
               || '/' || coalesce(v_a,0) || ' en vez de 10/5/27)';
  end if;
  -- Y EL VENCIMIENTO NO SE MOVIÓ. Es lo que manda: de él salen «días
  -- para vencer» y «días para salir».
  if (v_vd, v_vm, v_va) is distinct from (6::smallint, 11::smallint, 27::smallint) then
    v_falla := v_falla || ' 1b(le movio el vencimiento a ' || v_vd || '/' || v_vm || '/' || v_va || ')';
  end if;

  -- 2. CRUZANDO EL AÑO HACIA ATRÁS. 01/03/27 − 180 días = 02/09/26.
  --    Aquí es donde un año de dos cifras mal armado se rompe: 27−1 hay
  --    que sacarlo de la fecha, no restarlo a mano.
  select l.fab_dia, l.fab_mes, l.fab_anio into v_d, v_m, v_a
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.conteo_id = v_con and p.sku = '3128' and l.cajas = 12;

  if (v_d, v_m, v_a) is distinct from (2::smallint, 9::smallint, 26::smallint) then
    v_falla := v_falla || ' 2(cruzando el ano despejo ' || coalesce(v_d,0) || '/'
               || coalesce(v_m,0) || '/' || coalesce(v_a,0) || ' en vez de 2/9/26)';
  end if;

  -- 3. SIN VIDA ÚTIL NO SE INVENTA NADA.
  select l.fab_anio, l.venc_dia into v_a, v_vd
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.conteo_id = v_con and p.sku = 'ZZZ-SIN-VIDA';
  if v_a is not null then
    v_falla := v_falla || ' 3(se invento una fabricacion sin vida util)'; end if;
  if v_vd <> 20 then
    v_falla := v_falla || ' 3b(le toco el vencimiento a uno que no podia convertir)'; end if;

  -- 4. EL ENVASE SIGUE SIN FECHA, y está bien: no trae impresa.
  select count(*) into v_n
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.conteo_id = v_con and p.tipo_material = 'ENVASE'
     and (l.fab_anio is not null or l.venc_anio is not null);
  if v_n > 0 then
    v_falla := v_falla || ' 4(le puso fecha a un envase)'; end if;

  -- 5. LO QUE YA TRAÍA FABRICACIÓN NO SE TOCA, NI AUNQUE NO CUADRE.
  --    Este renglón dice 01/01/27 y su vencimiento es 06/11/27: 309
  --    días, no 180. Es de cuando ese material tenía otra vida útil en
  --    el maestro. Lo que se leyó frente a la estiba manda sobre
  --    cualquier cuenta de hoy — un conteo es la foto de su día.
  select l.fab_dia, l.fab_mes, l.fab_anio into v_d, v_m, v_a
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.conteo_id = v_con and p.sku = '3128' and l.estibas = 7;
  if (v_d, v_m, v_a) is distinct from (1::smallint, 1::smallint, 27::smallint) then
    v_falla := v_falla || ' 5(le cambio la fabricacion a uno que ya la tenia: quedo '
               || coalesce(v_d,0) || '/' || coalesce(v_m,0) || '/' || coalesce(v_a,0) || ')'; end if;

  -- 6. NO QUEDA NINGUNO CONVERTIBLE SIN CONVERTIR.
  select count(*) into v_n
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is null and l.venc_anio is not null and coalesce(p.vida_util,0) > 0;
  if v_n > 0 then
    v_falla := v_falla || ' 6(quedaron ' || v_n || ' sin convertir)'; end if;

  -- 7. Y LA CUENTA CIERRA EN TODOS LOS QUE LA MIGRACIÓN CONVIRTIÓ.
  --    Se excluye el de estibas = 7, que es el sembrado a propósito sin
  --    cuadrar: ese no lo tocó la migración y no tiene por qué cuadrar
  --    contra la vida útil de hoy.
  select count(*) into v_n
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is not null and l.venc_anio is not null and coalesce(p.vida_util,0) > 0
     and coalesce(l.estibas, 0) <> 7
     and make_date(2000 + l.fab_anio, l.fab_mes, l.fab_dia) + p.vida_util
       <> make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia);
  if v_n > 0 then
    v_falla := v_falla || ' 7(en ' || v_n || ' renglones fabricacion + vida util no da el vencimiento)'; end if;

  if v_falla <> '' then raise exception 'CONVERSION:%', v_falla; end if;
  raise notice 'CONVERSION ok';
end $$;


-- ---------------------------------------------------------------------
-- Y LA PANTALLA SIGUE PUDIENDO ANOTAR CON LA FABRICACIÓN, que es de lo
-- que no sirve nada de lo anterior si se rompió. Se prueba por la
-- función de verdad, como usuario normal.
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;
do $$
declare
  v_falla text := ''; v_bod uuid; v_con uuid; v_id uuid;
  v_vd smallint; v_vm smallint; v_va smallint;
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  v_con := public.conteo_fefo_abrir(v_bod);

  /* CON LOS NOMBRES DE LOS PARÁMETROS, no por posición. Son diecisiete
     y tres de ellos son fechas de dos cifras: una prueba que los manda
     en fila es una prueba que un día compara el mes con el día y dice
     que todo está bien. */
  v_id := public.conteo_fefo_agregar(
    p_conteo    => v_con,
    p_sku       => '3128',
    p_ubicacion => (select id from public.ubicaciones
                     where bodega_id = v_bod and clave = 'E06_IZQ'),
    p_rotacion  => false,
    p_estibas   => 10,
    -- EL VENCIMIENTO NUNCA SE MANDA. Lo calcula la base.
    p_fab_dia   => 10::smallint,
    p_fab_mes   => 5::smallint,
    p_fab_anio  => 27::smallint);

  select venc_dia, venc_mes, venc_anio into v_vd, v_vm, v_va
    from public.conteo_lineas where id = v_id;

  if (v_vd, v_vm, v_va) is distinct from (6::smallint, 11::smallint, 27::smallint) then
    v_falla := v_falla || ' 8(10/05/27 + 180 dias no dio 06/11/27 sino '
               || coalesce(v_vd,0) || '/' || coalesce(v_vm,0) || '/' || coalesce(v_va,0) || ')';
  end if;

  if v_falla <> '' then raise exception 'ANOTAR:%', v_falla; end if;
  raise notice 'ANOTAR ok';
end $$;
reset role;

do $$ begin raise notice 'SOLO FABRICACION: todo en orden'; end $$;
