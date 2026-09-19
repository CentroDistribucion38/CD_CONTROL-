\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- LA PRE-ANOTACIÓN, EL LADO QUE FALTA Y LO QUE QUEDÓ SIN CONTAR
--
-- LO QUE SE COMPRUEBA NO ES «¿existe la función?» sino lo que decide:
--
--   · QUE EL LADO QUE FALTA SE PUEDA CREAR Y CONTAR. Es la queja
--     entera: A01 existe como A01_IZQ y no como A01_DER, y el lado
--     derecho del pasillo no se podía contar.
--
--   · QUE NO SE DUPLIQUE. Llamarla dos veces tiene que devolver la
--     MISMA ubicación: un segundo A01_DER partiría el histórico de esa
--     posición en dos sin que nada avisara.
--
--   · QUE LA PRE-ANOTACIÓN TRAIGA TODOS LOS RENGLONES DEL ÚLTIMO
--     CONTEO, no el último renglón. Una posición con dos códigos que
--     trae uno solo obliga a escribir el otro a mano cada día.
--
--   · QUE «EL ÚLTIMO» SEA EL ÚLTIMO. Contado ayer y hoy, tiene que
--     traer el de hoy; y si una posición no se cuenta hace días, tiene
--     que seguir trayendo la de hace días y no salir en blanco.
--
--   · QUE LO QUE FALTA POR CONTAR SEA LO QUE FALTA. Parte de las
--     posiciones activas y quita las contadas: si contara al revés,
--     un módulo que nadie caminó no aparecería ni como cero.
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  v_falla text := '';
  v_bod uuid; v_izq uuid; v_der uuid; v_otra uuid;
  v_c1 uuid; v_c2 uuid; v_n int; v_id uuid;
begin
  select id into v_bod from public.bodegas order by creado_en limit 1;

  /* ---------------------------------------------------------------
     0 · EL MAESTRO A MEDIAS, que es como está la bodega de verdad:
         A01 cargado solo por el lado izquierdo.
     --------------------------------------------------------------- */
  insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
  /* SE FIJAN FAMILIA Y CAPACIDAD TAMBIÉN AL ACTUALIZAR. El maestro real
     ya trae A01_IZQ, así que sin esto el `on conflict` dejaba los
     valores del maestro y la prueba medía otra cosa: acusaba a la
     función de no heredar lo que la siembra nunca puso. */
  values (v_bod, 'A01_IZQ', 'A', '01', 'IZQ', 'RB F1000', 40, true)
  on conflict (bodega_id, clave) do update
    set activa = true, familia = 'RB F1000', capacidad = 40
  returning id into v_izq;

  insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
  values (v_bod, 'B02_IZQ', 'B', '02', 'IZQ', null, null, true)
  on conflict (bodega_id, clave) do update
    set activa = true, familia = null, capacidad = null
  returning id into v_otra;

  /* ---------------------------------------------------------------
     1 · EL LADO QUE FALTA SE CREA AL USARLO.

     Se borra antes si el maestro real ya lo traía: si no, esto no
     probaría una creación sino una búsqueda, y saldría verde con la
     función vacía. */
  delete from public.ubicaciones where bodega_id = v_bod and clave = 'A01_DER';

  v_der := public.conteo_ubicacion_asegurar(v_bod, 'A', '01', 'DER');
  if v_der is null then
    v_falla := v_falla || ' 1(no creó el lado que faltaba)';
  else
    if (select clave from public.ubicaciones where id = v_der) is distinct from 'A01_DER' then
      v_falla := v_falla || ' 1b(la clave no se armó como las 428 que ya están: A01_DER)'; end if;
    /* HEREDA DEL OTRO LADO. Sin esto el lado nuevo nace huérfano y
       alguien tiene que ir al maestro a completarlo a mano. */
    if (select familia from public.ubicaciones where id = v_der) is distinct from 'RB F1000' then
      v_falla := v_falla || ' 1c(no heredó la familia del otro lado del mismo módulo)'; end if;
    if (select capacidad from public.ubicaciones where id = v_der) is distinct from 40 then
      v_falla := v_falla || ' 1d(no heredó la capacidad del otro lado)'; end if;
  end if;

  /* 2 · Y LLAMARLA DOS VECES DEVUELVE LA MISMA. Un segundo A01_DER
         partiría el histórico de esa posición en dos. */
  v_id := public.conteo_ubicacion_asegurar(v_bod, 'A', '01', 'DER');
  if v_id is distinct from v_der then
    v_falla := v_falla || ' 2(creó una segunda ubicación para el mismo lado)'; end if;
  select count(*) into v_n from public.ubicaciones
   where bodega_id = v_bod and clave = 'A01_DER';
  if v_n <> 1 then
    v_falla := v_falla || ' 2b(hay ' || v_n || ' filas de A01_DER y debe haber una)'; end if;

  /* 3 · Y NO INVENTA LADOS QUE NO EXISTEN. */
  begin
    perform public.conteo_ubicacion_asegurar(v_bod, 'A', '01', 'ARRIBA');
    v_falla := v_falla || ' 3(aceptó un lado que no es IZQ ni DER)';
  exception when others then
    if sqlerrm not like '%IZQ o DER%' then
      v_falla := v_falla || ' 3b(lo rechazó, pero por otra cosa: ' || sqlerrm || ')'; end if;
  end;

  /* ---------------------------------------------------------------
     4 · LA PRE-ANOTACIÓN: DOS CÓDIGOS EN LA MISMA POSICIÓN.

     Ayer se contó A01_IZQ con dos códigos. Al escogerla hoy tienen
     que salir LOS DOS: con uno solo, el segundo hay que escribirlo a
     mano cada día, que es justo el trabajo que esto viene a quitar.
     --------------------------------------------------------------- */
  insert into public.conteos (codigo, bodega_id, estado, responsable_id, iniciado_en, cerrado_en)
  values ('AYER-1', v_bod, 'cerrado', auth.uid(), now() - interval '1 day', now() - interval '1 day')
  returning id into v_c1;

  insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas,
                                    venc_dia, venc_mes, venc_anio, rotacion)
  select v_c1, p.id, v_izq, 96, 15, 6, 27, true
    from public.productos p where p.activo order by p.sku limit 1;
  insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, cajas,
                                    venc_dia, venc_mes, venc_anio, rotacion)
  select v_c1, p.id, v_izq, 12, 20, 7, 27, false
    from public.productos p where p.activo order by p.sku offset 1 limit 1;

  select count(*) into v_n from public.v_conteo_ultimo_por_ubicacion where ubicacion_id = v_izq;
  if v_n <> 2 then
    v_falla := v_falla || ' 4(la pre-anotación trae ' || v_n
                       || ' renglones y son 2: la posición tenía dos códigos)'; end if;

  /* Y TRAE LO QUE HAY QUE CONFIRMAR, no un identificador pelado. */
  if not exists (select 1 from public.v_conteo_ultimo_por_ubicacion
                  where ubicacion_id = v_izq and estibas = 96 and venc_anio = 27) then
    v_falla := v_falla || ' 4b(no trae la cantidad y el vencimiento que se contaron)'; end if;
  if exists (select 1 from public.v_conteo_ultimo_por_ubicacion
              where ubicacion_id = v_izq and codigo is null) then
    v_falla := v_falla || ' 4c(trae el renglón sin el código: no hay qué confirmar)'; end if;

  /* ---------------------------------------------------------------
     5 · «EL ÚLTIMO» ES EL ÚLTIMO. Hoy se cuenta otra vez, con un solo
         código: mañana tiene que traer el de hoy, no el de ayer.
     --------------------------------------------------------------- */
  insert into public.conteos (codigo, bodega_id, estado, responsable_id, iniciado_en)
  values ('HOY-1', v_bod, 'en_proceso', auth.uid(), now())
  returning id into v_c2;

  insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas,
                                    venc_dia, venc_mes, venc_anio, rotacion)
  select v_c2, p.id, v_izq, 80, 15, 6, 27, true
    from public.productos p where p.activo order by p.sku limit 1;

  select count(*) into v_n from public.v_conteo_ultimo_por_ubicacion where ubicacion_id = v_izq;
  if v_n <> 1 then
    v_falla := v_falla || ' 5(después de contar hoy la pre-anotación trae ' || v_n
                       || ' renglones: mezcló el conteo de hoy con el de ayer)'; end if;
  if not exists (select 1 from public.v_conteo_ultimo_por_ubicacion
                  where ubicacion_id = v_izq and estibas = 80) then
    v_falla := v_falla || ' 5b(sigue trayendo el de ayer y no el de hoy)'; end if;

  /* 6 · Y LA POSICIÓN QUE NO SE CONTÓ HOY SIGUE TRAYENDO LA DE AYER.
         Salir en blanco por un día sin contar sería un formulario
         vacío justo donde más ayuda hace falta. */
  insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas,
                                    venc_dia, venc_mes, venc_anio, rotacion)
  select v_c1, p.id, v_otra, 30, 1, 1, 27, true
    from public.productos p where p.activo order by p.sku limit 1;
  if not exists (select 1 from public.v_conteo_ultimo_por_ubicacion
                  where ubicacion_id = v_otra and estibas = 30) then
    v_falla := v_falla || ' 6(la posición que no se contó hoy quedó sin pre-anotación)'; end if;

  /* ---------------------------------------------------------------
     7 · LO QUE QUEDÓ SIN CONTAR.
         Hoy solo se tocó A01_IZQ, así que A01_DER y B02_IZQ faltan.
     --------------------------------------------------------------- */
  select count(*) into v_n from public.conteo_sin_contar(v_c2)
   where ubicacion_id in (v_der, v_otra);
  if v_n <> 2 then
    v_falla := v_falla || ' 7(de las dos posiciones sin contar reconoce ' || v_n || ')'; end if;

  if exists (select 1 from public.conteo_sin_contar(v_c2) where ubicacion_id = v_izq) then
    v_falla := v_falla || ' 7b(la posición que SÍ se contó hoy sale como que falta)'; end if;

  /* Y DICE HACE CUÁNTO SE CONTÓ, que es lo que convierte la lista en
     alerta: «sin contar» a secas son cientos de renglones el primer
     día; «sin contar hace 12 días» son los que hay que ir a caminar. */
  if (select dias_sin_contar from public.conteo_sin_contar(v_c2) where ubicacion_id = v_otra)
       is distinct from 1 then
    v_falla := v_falla || ' 7c(no dice que B02_IZQ se contó hace un día)'; end if;
  if (select ultimo_en from public.conteo_sin_contar(v_c2) where ubicacion_id = v_der)
       is not null then
    v_falla := v_falla || ' 7d(dice que A01_DER ya se había contado, y es nueva)'; end if;

  /* 8 · Y LAS INACTIVAS NO SE PIDEN. Un módulo dado de baja saldría
         como pendiente para siempre y nadie podría cerrar el recorrido. */
  update public.ubicaciones set activa = false where id = v_otra;
  if exists (select 1 from public.conteo_sin_contar(v_c2) where ubicacion_id = v_otra) then
    v_falla := v_falla || ' 8(pide contar una posición dada de baja)'; end if;
  update public.ubicaciones set activa = true where id = v_otra;

  if v_falla <> '' then raise exception 'PREANOTACION:%', v_falla; end if;
  raise notice 'PREANOTACION ok';
end $$;
reset role;

do $$ begin raise notice 'LA PRE-ANOTACIÓN Y LO QUE FALTA POR CONTAR: todo en orden'; end $$;
