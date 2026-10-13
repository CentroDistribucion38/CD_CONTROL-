-- =====================================================================
-- CONTEO · CADA REGISTRO ES SU PROPIO RENGLÓN (lo repetido ya no se suma)
--
-- «Hice dos registros y se sumaron: aparece solo uno con 60 cuando hice uno de 40 y uno de 20.
--  No quiero que dentro del conteo, si son iguales, se sumen: quiero ver cada registro, cada renglón,
--  que no me mezcles nada.»
--
-- ANTES (2026-10-conteo-repetido-se-suma.sql / 2026-10-conteo-cilindro-sin-fecha.sql): si en el mismo
-- recorrido ya había un renglón del mismo código, módulo, vencimiento, avería, PNC y estado, lo nuevo
-- SE SUMABA a ese renglón. Y la llave única de la tabla no dejaba que hubiera dos iguales.
--
-- AHORA:
--   1. La llave única conteo_lineas_unico queda SOLO para el conteo general (renglones sin ubicación,
--      uno por producto). En el FEFO, dos anotaciones iguales son dos renglones.
--   2. `conteo_fefo_agregar` se vuelve a crear EXACTAMENTE como está hoy (copiada de
--      2026-10-conteo-cilindro-sin-fecha.sql) con el bloque de la suma apagado: siempre inserta.
--
-- Lo que YA se sumó antes no se puede separar (el 40 y el 20 ya quedaron guardados como 60): para
-- esos, corrige el renglón en Contar o vuelve a anotarlo. De aquí en adelante cada registro va aparte.
--
-- ORDEN: después de 2026-10-conteo-cilindro-sin-fecha.sql. SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

drop index if exists public.conteo_lineas_unico;
create unique index conteo_lineas_unico on public.conteo_lineas (conteo_id, producto_id)
  where ubicacion_id is null;

create or replace function public.conteo_fefo_agregar(
  p_conteo      uuid,
  p_sku         text,
  p_ubicacion   uuid,
  p_rotacion    boolean,
  p_estibas     integer  default null,
  p_cajas       integer  default null,
  p_venc_dia    smallint default null,
  p_venc_mes    smallint default null,
  p_venc_anio   smallint default null,
  p_averia      boolean  default false,
  p_pnc         boolean  default false,
  p_estado      text     default null,
  p_nota        text     default null,
  p_saldo       integer  default null,
  p_fab_dia     smallint default null,
  p_fab_mes     smallint default null,
  p_fab_anio    smallint default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer; v_vida integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid; v_linea uuid;
  v_fab date; v_venc date;
  v_vd smallint; v_vm smallint; v_va smallint;
  v_ex record; v_estado_txt text; v_n_estibas integer; v_n_saldo integer; v_n_cajas integer;
begin
  select estado, responsable_id, bodega_id into v_estado, v_dueno, v_bodega
    from public.conteos where id = p_conteo;
  if v_estado is null then raise exception 'Ese conteo no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya está cerrado.'; end if;

  select id, tipo_material, cajas_por_estiba, vida_util
    into v_prod, v_tipo, v_factor, v_vida
    from public.productos where sku = p_sku and activo;
  if v_prod is null then
    raise exception 'El código % no está en el maestro. Revísalo o pide que lo agreguen.', p_sku;
  end if;

  if not exists (select 1 from public.ubicaciones
                  where id = p_ubicacion and bodega_id = v_bodega and activa) then
    raise exception 'Esa ubicación no es de esta bodega o está inactiva.';
  end if;

  if coalesce(p_estibas, 0) + coalesce(p_cajas, 0) + coalesce(p_saldo, 0) <= 0 then
    raise exception 'Hay que anotar cuántas estibas o cuántas cajas.';
  end if;
  /* DOS FORMAS DE CONTAR, NO TRES CANTIDADES. Estibas completas más el
     saldo suelto es UNA forma —la de un módulo lleno con una estiba a
     medias encima—; cajas a secas es la otra. Mezclarlas deja el renglón
     sin decir cómo se contó, y quien lo revise dentro de un mes no tiene
     forma de saberlo.

     Aquí decía `num_nonnulls(...) > 1`: una sola de las tres. Venía de
     la hoja, donde en 151 de 152 renglones solo una columna viene llena.
     Era mirar la hoja y no el piso: doce estibas y ocho cajas sueltas
     son un renglón, y partirlo en dos choca contra la llave única del
     renglón —mismo material, mismo sitio, misma fecha—. */
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'O se cuenta por estibas —completas más el saldo suelto— o se cuenta por cajas. Las dos formas en un renglón dejan sin decir cómo se contó.';
  end if;
  if p_rotacion is null then raise exception 'Falta decir si rota.'; end if;

  /* ---------- EL VENCIMIENTO, DE DONDE VENGA ----------
     Si se tecleó la fabricación, se calcula: fabricación + vida útil del
     maestro. Si se tecleó el vencimiento, ese manda y la fabricación se
     guarda como vino —si vino—.

     EL MENSAJE DICE QUÉ MATERIAL Y CUÁNTO LE FALTA. «No se puede
     calcular» a secas manda a buscar el problema a la pantalla, cuando
     está en el maestro. */
  v_vd := p_venc_dia; v_vm := p_venc_mes; v_va := p_venc_anio;

  /* EL VENCIMIENTO TIENE QUE EXISTIR COMO FECHA, no solo caer en rango.

     La regla de la tabla dice `venc_dia between 1 and 31` y
     `venc_mes between 1 and 12`, así que el 31/02 pasa: son dos números
     buenos que juntos no son un día. Se guardaba, y quien reventaba
     después era LA VISTA —`make_date(2027, 2, 31)`—, que es de donde
     leen todas las pantallas: el borrador entero dejaba de cargar por un
     renglón, y el error no nombraba ni la fila ni el conteo.

     Con la fecha tecleándose de corrido —el cursor pasa solo de DD a MM
     a AA— un dedazo así es cuestión de tiempo: son 152 fechas al día.
     Se caza AQUÍ, al guardar, con el nombre del día que no existe y con
     la estiba todavía delante.

     LA PANTALLA YA LO COMPRUEBA Y ESO NO SOBRA NI ESTORBA: allá es para
     no hacer el viaje al servidor; aquí es porque la función es la
     puerta, y la puerta no puede confiar en que el que llame sea la
     pantalla. */
  if v_va is not null then
    if num_nonnulls(v_vd, v_vm, v_va) <> 3 then
      raise exception 'La fecha de vencimiento va completa: día, mes y año.';
    end if;
    begin
      perform make_date(2000 + v_va, v_vm::integer, v_vd::integer);
    exception when others then
      raise exception 'El %/%/% no existe. Revisa el día.', v_vd, v_vm, v_va;
    end;
  end if;

  if p_fab_anio is not null then
    if num_nonnulls(p_fab_dia, p_fab_mes, p_fab_anio) <> 3 then
      raise exception 'La fecha de fabricación va completa: día, mes y año.';
    end if;
    begin
      v_fab := make_date(2000 + p_fab_anio, p_fab_mes::integer, p_fab_dia::integer);
    exception when others then
      raise exception 'El %/%/% no existe como fecha de fabricación.',
        p_fab_dia, p_fab_mes, p_fab_anio;
    end;

    if v_va is null then
      if coalesce(v_vida, 0) <= 0 then
        raise exception 'El material % no tiene vida útil en el maestro, así que no se puede calcular el vencimiento desde la fabricación. Téclea el vencimiento, o pide que le pongan la vida útil.', p_sku;
      end if;
      v_venc := v_fab + v_vida;
      v_vd := extract(day   from v_venc)::smallint;
      v_vm := extract(month from v_venc)::smallint;
      v_va := (extract(year from v_venc)::integer - 2000)::smallint;
    end if;
  end if;

  -- El envase retornable no trae fecha impresa; el producto sí, siempre.
  if v_tipo = 'PRODUCTO' and v_va is null and not public.es_cilindro(v_prod) then
    raise exception 'Falta la fecha: el vencimiento, o la de fabricación para calcularlo.';
  end if;

  /* ---------- EL MISMO CÓDIGO, EN EL MISMO MÓDULO, SE PUEDE VOLVER A PONER ----------
     En un módulo caben varios códigos —cada uno es su renglón— y el mismo
     código también se puede anotar más de una vez (otra estiba, otra tanda).
     Si ya hay un renglón de ese código, en ese módulo, con el MISMO
     vencimiento, avería, PNC y estado del envase, lo que se anota ahora SE
     SUMA a ese renglón: no se rechaza como repetido y no se pierde nada.
     (La llave única de la tabla no se toca: nunca llega a haber dos iguales.) */
  v_estado_txt := upper(nullif(trim(coalesce(p_estado, '')), ''));
  /* «No quiero que dentro del conteo, si son iguales, se sumen: quiero ver cada registro, cada renglón.»
     Desde 2026-10-conteo-cada-registro.sql lo repetido YA NO SE SUMA: cada anotación es su propio
     renglón (40 y 20 quedan como dos renglones, no como uno de 60). Este bloque queda apagado. */
  if false then
    select cl.id, cl.estibas, cl.cajas, cl.saldo, cl.nota into v_ex
      from public.conteo_lineas cl
     where cl.conteo_id = p_conteo and cl.producto_id = v_prod and cl.ubicacion_id = p_ubicacion
       and cl.venc_dia  is not distinct from v_vd
       and cl.venc_mes  is not distinct from v_vm
       and cl.venc_anio is not distinct from v_va
       and cl.averia = coalesce(p_averia, false) and cl.pnc = coalesce(p_pnc, false)
       and upper(coalesce(cl.estado_envase, '')) = coalesce(v_estado_txt, '')
     order by cl.contado_en desc limit 1;
    if found then
      if v_ex.cajas is not null and p_cajas is not null then
        /* cajas con cajas */
        v_n_cajas := v_ex.cajas + p_cajas; v_n_estibas := null; v_n_saldo := null;
      elsif v_ex.cajas is null and p_cajas is null then
        /* estibas (y saldo) con estibas (y saldo) */
        v_n_cajas := null;
        v_n_estibas := case when v_ex.estibas is null and p_estibas is null then null
                            else coalesce(v_ex.estibas, 0) + coalesce(p_estibas, 0) end;
        v_n_saldo   := case when v_ex.saldo is null and p_saldo is null then null
                            else coalesce(v_ex.saldo, 0) + coalesce(p_saldo, 0) end;
      elsif v_ex.cajas is null then
        /* el renglón venía en estibas y ahora se anotan cajas sueltas: van al saldo */
        v_n_cajas := null; v_n_estibas := v_ex.estibas;
        v_n_saldo := coalesce(v_ex.saldo, 0) + p_cajas;
      else
        /* el renglón venía en cajas y ahora se anotan estibas: se pasan a cajas */
        if coalesce(p_estibas, 0) > 0 and coalesce(v_factor, 0) <= 0 then
          raise exception 'El material % no dice cuántas cajas lleva una estiba, así que no se puede sumar a lo que ya se contó en cajas. Anótalo en cajas.', p_sku;
        end if;
        v_n_cajas := v_ex.cajas + coalesce(v_factor, 0) * coalesce(p_estibas, 0) + coalesce(p_saldo, 0);
        v_n_estibas := null; v_n_saldo := null;
      end if;
      update public.conteo_lineas set
        estibas = v_n_estibas, cajas = v_n_cajas, saldo = v_n_saldo,
        cantidad_contada = coalesce(v_factor, 0) * coalesce(v_n_estibas, 0)
                           + coalesce(v_n_cajas, 0) + coalesce(v_n_saldo, 0),
        nota = case when nullif(trim(coalesce(p_nota, '')), '') is null then v_ex.nota
                    when v_ex.nota is null then nullif(trim(p_nota), '')
                    else v_ex.nota || ' · ' || trim(p_nota) end,
        contado_por = auth.uid(), contado_en = now()
      where id = v_ex.id;
      return v_ex.id;
    end if;
  end if;

  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo,
     venc_dia, venc_mes, venc_anio, fab_dia, fab_mes, fab_anio,
     rotacion, averia, pnc, estado_envase, nota,
     cantidad_contada, contado_por, contado_en)
  values
    (p_conteo, v_prod, p_ubicacion, p_estibas, p_cajas, p_saldo,
     v_vd, v_vm, v_va, p_fab_dia, p_fab_mes, p_fab_anio,
     p_rotacion, coalesce(p_averia, false), coalesce(p_pnc, false),
     nullif(trim(coalesce(p_estado, '')), ''), nullif(trim(coalesce(p_nota, '')), ''),
     coalesce(v_factor, 0) * coalesce(p_estibas, 0)
       + coalesce(p_cajas, 0) + coalesce(p_saldo, 0),
     auth.uid(), now())
  returning id into v_linea;

  return v_linea;
end $$;

commit;
