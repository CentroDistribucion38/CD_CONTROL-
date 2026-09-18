\set ON_ERROR_STOP on
set client_min_messages = notice;

-- =====================================================================
-- ESTIBAS COMPLETAS **Y** CAJAS SUELTAS
--
-- Lo que se comprueba no es «¿deja guardar las dos?» sino las cuatro
-- cosas que de verdad pueden salir mal:
--
--   · que el TOTAL salga bien —12 × 45 + 8 = 548— y no se pierda el
--     saldo por el camino,
--   · que la otra forma de contar siga siendo excluyente: cajas a secas
--     no se mezcla con estibas ni con saldo,
--   · que se pueda seguir anotando lo de siempre —solo estibas, o solo
--     cajas— porque lo que más se cuenta no cambió,
--   · y que corregir un renglón pueda pasarlo de una forma a la otra sin
--     dejar la cifra vieja colgando.
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role probador;

do $$
declare
  v_falla text := ''; v_bod uuid; v_con uuid; v_id uuid;
  v_tot bigint; v_e integer; v_c integer; v_s integer;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid;
begin
  select id into v_bod from public.bodegas where codigo = 'CD38';
  select id into u1 from public.ubicaciones where bodega_id = v_bod and clave = 'E01_DER';
  select id into u2 from public.ubicaciones where bodega_id = v_bod and clave = 'E01_IZQ';
  select id into u3 from public.ubicaciones where bodega_id = v_bod and clave = 'E06_IZQ';
  select id into u4 from public.ubicaciones where bodega_id = v_bod and clave = 'E08_DER';
  v_con := public.conteo_fefo_abrir(v_bod);

  /* 1. LAS DOS A LA VEZ, Y LA CUENTA. El 3128 lleva 45 cajas por estiba:
        12 × 45 + 8 = 548. Es el ejemplo exacto del diseño. */
  v_id := public.conteo_fefo_agregar(
    p_conteo => v_con, p_sku => '3128', p_ubicacion => u1, p_rotacion => false,
    p_estibas => 12, p_saldo => 8,
    p_venc_dia => 11::smallint, p_venc_mes => 3::smallint, p_venc_anio => 27::smallint);

  select estibas, cajas, saldo into v_e, v_c, v_s
    from public.conteo_lineas where id = v_id;
  select total_cajas into v_tot from public.v_conteo_fefo where id = v_id;

  if (v_e, v_s) is distinct from (12, 8) then
    v_falla := v_falla || ' 1(guardo estibas=' || coalesce(v_e,-1) || ' saldo=' || coalesce(v_s,-1) || ')'; end if;
  if v_c is not null then
    v_falla := v_falla || ' 1b(le puso cajas a un renglon contado por estibas)'; end if;
  if v_tot <> 548 then
    v_falla := v_falla || ' 1c(el total dio ' || v_tot || ' y 12x45+8 son 548)'; end if;

  /* 2. SOLO ESTIBAS, SIN SALDO. Es lo más común de todo y no podía
        dejar de funcionar por meter el saldo. */
  v_id := public.conteo_fefo_agregar(
    p_conteo => v_con, p_sku => '3128', p_ubicacion => u2, p_rotacion => false,
    p_estibas => 40,
    p_venc_dia => 6::smallint, p_venc_mes => 11::smallint, p_venc_anio => 27::smallint);
  select total_cajas into v_tot from public.v_conteo_fefo where id = v_id;
  if v_tot <> 1800 then
    v_falla := v_falla || ' 2(40 estibas dieron ' || v_tot || ' y son 1800)'; end if;

  /* 3. SOLO CAJAS, la otra forma de contar. */
  v_id := public.conteo_fefo_agregar(
    p_conteo => v_con, p_sku => '3128', p_ubicacion => u3, p_rotacion => true,
    p_cajas => 42,
    p_venc_dia => 2::smallint, p_venc_mes => 3::smallint, p_venc_anio => 27::smallint);
  select total_cajas into v_tot from public.v_conteo_fefo where id = v_id;
  if v_tot <> 42 then
    v_falla := v_falla || ' 3(42 cajas dieron ' || v_tot || ')'; end if;

  /* 4. MEZCLAR LAS DOS FORMAS: NO. No es una cantidad de más, es un
        renglón que no dice cómo se contó.

        HAY DOS REDES Y SE EXIGE LA DE ARRIBA. La regla de la tabla —que
        se llama `conteo_lineas_una_forma_de_contar`— también lo
        rechaza, así que buscar la palabra «forma» en el error daba por
        buena la función aunque no comprobara nada: la cazaba el nombre
        de la restricción. Aquí se exige el mensaje ENTERO de la
        función, que es el que lee quien está de pie frente al módulo.
        La red de abajo se prueba aparte, escribiendo directo en la
        tabla. */
  begin
    perform public.conteo_fefo_agregar(
      p_conteo => v_con, p_sku => '3128', p_ubicacion => u4, p_rotacion => false,
      p_estibas => 3, p_cajas => 5,
      p_venc_dia => 1::smallint, p_venc_mes => 2::smallint, p_venc_anio => 27::smallint);
    v_falla := v_falla || ' 4(dejo mezclar estibas con cajas)';
  exception when others then
    if sqlerrm not like '%dejan sin decir cómo se contó%' then
      v_falla := v_falla || ' 4b(lo rechazo, pero no con el mensaje de la funcion: ' || sqlerrm || ')'; end if;
  end;

  begin
    perform public.conteo_fefo_agregar(
      p_conteo => v_con, p_sku => '3128', p_ubicacion => u4, p_rotacion => false,
      p_cajas => 5, p_saldo => 3,
      p_venc_dia => 1::smallint, p_venc_mes => 2::smallint, p_venc_anio => 27::smallint);
    v_falla := v_falla || ' 4c(dejo mezclar cajas con saldo)';
  exception when others then
    if sqlerrm not like '%se cuenta por cajas%' then
      v_falla := v_falla || ' 4d(lo rechazo, pero no con el mensaje de la funcion: ' || sqlerrm || ')'; end if;
  end;

  /* 5. NINGUNA CANTIDAD SIGUE SIN VALER. Soltar una regla no puede
        soltar la de al lado. */
  begin
    perform public.conteo_fefo_agregar(
      p_conteo => v_con, p_sku => '3128', p_ubicacion => u4, p_rotacion => false,
      p_venc_dia => 1::smallint, p_venc_mes => 2::smallint, p_venc_anio => 27::smallint);
    v_falla := v_falla || ' 5(entro un renglon sin ninguna cantidad)';
  exception when others then
    if sqlerrm not like '%Hay que anotar%' then
      v_falla := v_falla || ' 5b(error raro: ' || sqlerrm || ')'; end if;
  end;

  /* 6. CORREGIR CAMBIANDO DE FORMA. El renglón de solo cajas pasa a
        estibas + saldo: la cifra vieja no puede quedarse colgando, o el
        total saldría sumando las dos formas. */
  select l.id into v_id
    from public.conteo_lineas l where l.conteo_id = v_con and l.cajas = 42;
  perform public.conteo_fefo_editar(
    p_linea => v_id, p_sku => '3128', p_ubicacion => u3, p_rotacion => true,
    p_estibas => 2, p_saldo => 7,
    p_venc_dia => 2::smallint, p_venc_mes => 3::smallint, p_venc_anio => 27::smallint);
  select estibas, cajas, saldo into v_e, v_c, v_s
    from public.conteo_lineas where id = v_id;
  select total_cajas into v_tot from public.v_conteo_fefo where id = v_id;
  if v_c is not null then
    v_falla := v_falla || ' 6(quedaron las cajas viejas colgando: ' || v_c || ')'; end if;
  if (v_e, v_s) is distinct from (2, 7) then
    v_falla := v_falla || ' 6b(corrigio a estibas=' || coalesce(v_e,-1) || ' saldo=' || coalesce(v_s,-1) || ')'; end if;
  if v_tot <> 97 then
    v_falla := v_falla || ' 6c(2x45+7 dieron ' || v_tot || ' y son 97)'; end if;

  /* 7. LOS DÍAS DE LA HOJA, que es de donde salen las alertas.
        El 3128 vence el 11/03/27 y su mínimo T1 son 90 días:
          días para vencer = 11/03/27 − hoy
          días para salir  = eso mismo − 90
        No se comprueban contra números fijos —hoy se mueve— sino contra
        la resta, que es la fórmula de la hoja. */
  select l.id into v_id from public.conteo_lineas l
   where l.conteo_id = v_con and l.estibas = 12;
  declare
    v_dv integer; v_ds integer; v_min integer;
  begin
    select v.dias_para_vencer, v.dias_para_salir into v_dv, v_ds
      from public.v_conteo_fefo v where v.id = v_id;
    select dias_minimo into v_min from public.productos where sku = '3128';
    if v_dv is distinct from (make_date(2027, 3, 11) - current_date) then
      v_falla := v_falla || ' 7(dias para vencer dio ' || coalesce(v_dv,-9999) || ')'; end if;
    if v_ds is distinct from (make_date(2027, 3, 11) - current_date - coalesce(v_min, 0)) then
      v_falla := v_falla || ' 7b(dias para salir dio ' || coalesce(v_ds,-9999)
                 || ' y el minimo es ' || coalesce(v_min,-1) || ')'; end if;
  end;

  /* 8. LA CIFRA GUARDADA CONTRA LA CALCULADA.
        `cantidad_contada` se escribe en la fila al anotar; `total_cajas`
        lo calcula la vista. Son DOS SITIOS con la misma fórmula, y una
        prueba que solo mire la vista deja el otro suelto: se puede
        guardar un total corto —sin el saldo— y ninguna pantalla lo
        nota, porque todas leen la vista. El mes cuadra de menos y nadie
        sabe por qué. */
  select count(*) into v_e
    from public.conteo_lineas l
    join public.v_conteo_fefo v on v.id = l.id
   where l.conteo_id = v_con and l.cantidad_contada <> v.total_cajas;
  if v_e > 0 then
    v_falla := v_falla || ' 8(en ' || v_e || ' renglones la cifra guardada no es la calculada)'; end if;

  /* 9. EL 31 DE FEBRERO. Dos números en rango que juntos no son un día.

        LA REGLA DE LA TABLA LO DEJA PASAR —«venc_dia between 1 and 31»,
        «venc_mes between 1 and 12»— y quien reventaba era LA VISTA, al
        leerlo: `make_date(2027, 2, 31)`. El borrador entero dejaba de
        cargar por un renglón, y el error no nombraba ni la fila ni el
        conteo.

        Ahora que la fecha se teclea de corrido —el cursor salta solo de
        DD a MM a AA— un dedazo así es cuestión de tiempo: son 152 fechas
        al día. Va de últimas a propósito: si la guardia se cae, el
        renglón entra y envenena la vista, y todo lo de arriba ya está
        comprobado. */
  begin
    perform public.conteo_fefo_agregar(
      p_conteo => v_con, p_sku => '3128', p_ubicacion => u4, p_rotacion => false,
      p_estibas => 1,
      p_venc_dia => 31::smallint, p_venc_mes => 2::smallint, p_venc_anio => 27::smallint);
    v_falla := v_falla || ' 9(dejo guardar el 31/02: la vista revienta al leerlo y el borrador entero deja de cargar)';
  exception when others then
    if sqlerrm not like '%no existe%' then
      v_falla := v_falla || ' 9b(lo rechazo, pero no diciendo que ese dia no existe: ' || sqlerrm || ')'; end if;
  end;

  if v_falla <> '' then raise exception 'CANTIDAD:%', v_falla; end if;
  raise notice 'CANTIDAD ok';
end $$;
reset role;

do $$ begin raise notice 'ESTIBAS Y SALDO: todo en orden'; end $$;
