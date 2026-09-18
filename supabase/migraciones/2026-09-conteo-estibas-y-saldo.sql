-- =====================================================================
-- CONTEO · ESTIBAS COMPLETAS **Y** CAJAS SUELTAS EN EL MISMO RENGLÓN
--
-- «Estibas completas y saldo · cajas sueltas, con el total vivo:
--  12 × 45 + 8 = 548 cajas.»
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTABA PROHIBIDO Y POR QUÉ DEJA DE ESTARLO
-- ---------------------------------------------------------------------
-- La regla decía UNA SOLA CANTIDAD POR RENGLÓN: o estibas, o cajas, o
-- saldo. Venía de la hoja, donde en 151 de 152 renglones solo una de las
-- dos columnas viene llena y la única que traía las dos era un dedazo.
--
-- Pero eso era mirar la hoja y no el piso. UN MÓDULO SE CUENTA ASÍ: doce
-- estibas completas y ocho cajas sueltas encima de la trece. Son una
-- sola posición, un solo material, un solo vencimiento — un renglón. Con
-- la regla vieja había que partirlo en dos, y dos renglones del mismo
-- material en el mismo sitio con la misma fecha es exactamente lo que la
-- llave única del renglón considera un duplicado: ni siquiera se podía.
--
-- LO QUE SIGUE PROHIBIDO, Y CON MÁS RAZÓN: mezclar `cajas` con las
-- otras dos. Son dos FORMAS DE CONTAR distintas, no dos cantidades.
--
--   · Se cuenta por ESTIBAS  → estibas completas + saldo suelto.
--   · Se cuenta por CAJAS    → cajas, a secas, sin estibas de por medio.
--
-- Poner las tres deja el renglón sin decir cómo se contó, y quien lo
-- revise dentro de un mes no tiene forma de saberlo.
--
-- ---------------------------------------------------------------------
-- EL TOTAL NO CAMBIA DE FÓRMULA
-- ---------------------------------------------------------------------
--     total = factor × estibas + cajas + saldo
--
-- Ya estaba así en las dos vistas y en las dos funciones, sumando las
-- tres con coalesce. Nunca dependió de que solo una viniera llena: la
-- regla vieja se la guardaba la tabla, no la cuenta. Por eso este
-- archivo no toca ninguna vista — y por eso NINGÚN renglón ya guardado
-- cambia de total.
--
-- SE PUEDE CORRER VARIAS VECES.
-- ORDEN: después de supabase/migraciones/2026-09-conteo-fabricacion.sql
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas'
                    and column_name = 'saldo') then
    raise exception 'Falta supabase/migraciones/2026-09-conteo-saldo.sql. Ese va primero.';
  end if;
  if to_regproc('public.conteo_fefo_agregar') is null then
    raise exception 'Falta supabase/migraciones/2026-09-inventario-fefo.sql. Ese va primero.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. LA REGLA NUEVA EN LA TABLA
--
-- El nombre viejo se va y entra uno que dice lo que ahora se comprueba.
-- Dejar los dos habría hecho que el nuevo no se pudiera violar nunca
-- —el viejo revienta antes— y un candado que nunca se alcanza es un
-- candado que nadie mantiene.
--
-- SE SIGUEN PERMITIENDO CERO CANTIDADES a nivel de tabla, y no es un
-- descuido: el conteo general siembra 494 renglones vacíos para que
-- alguien los camine. Quien exige que venga alguna es la función de
-- agregar, que es por donde entra el conteo FEFO.
-- ---------------------------------------------------------------------
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_una_cantidad;
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_estibas_o_cajas;
/* Y ESTA TERCERA, QUE SE ME HABÍA PASADO. `conteo_lineas_una_u_otra`
   viene de 2026-09-inventario-fefo.sql y dice «estibas o cajas, no las
   dos» — lo mismo que la regla nueva, pero dicho peor y con otro
   nombre. La encontró el arnés, no yo: una mutación falló contra ella
   en vez de contra la que se estaba probando.

   Dejarla habría sido peor que redundante. La regla nueva no se podría
   violar nunca —la vieja revienta antes— y un candado que nunca se
   alcanza es un candado que nadie mantiene; y el día que alguien lea
   «violates check constraint conteo_lineas_una_u_otra» va a ir a buscar
   una regla que este archivo ya reemplazó. */
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_una_u_otra;
alter table public.conteo_lineas
  drop constraint if exists conteo_lineas_una_forma_de_contar;

alter table public.conteo_lineas
  add constraint conteo_lineas_una_forma_de_contar
  check (cajas is null or (estibas is null and saldo is null));

comment on constraint conteo_lineas_una_forma_de_contar on public.conteo_lineas is
  'Dos formas de contar, no tres cantidades: o estibas completas más el '
  'saldo suelto, o cajas a secas. Mezclarlas deja el renglón sin decir '
  'cómo se contó.';


-- ---------------------------------------------------------------------
-- 2. LAS DOS FUNCIONES
--
-- VAN COPIADAS LITERAL del archivo donde viven hoy
-- —2026-09-conteo-fabricacion.sql— y con UN SOLO CAMBIO: la regla de la
-- cantidad. Nada más se toca.
--
-- Y eso es a propósito. La primera versión de este archivo las reescribí
-- de memoria, y en la comparación aparecieron cuatro cosas perdidas: los
-- tres mensajes distintos de «ese conteo no existe / es de otra persona
-- / ya está cerrado» convertidos en uno solo, la comprobación de que la
-- ubicación esté ACTIVA, el mensaje que dice qué fecha no existe cuando
-- se teclea un 31 de febrero, y una regla nueva que yo no había pedido
-- —prohibir mandar las dos fechas— que habría roto corregir un renglón
-- viejo.
--
-- Ya me costó una vista en este proyecto reescribir en vez de copiar. La
-- firma no cambia ni un parámetro, así que no hay firma vieja que dejar
-- colgando y PostgREST no tiene dos entre las que escoger.
-- ---------------------------------------------------------------------
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
  if v_tipo = 'PRODUCTO' and v_va is null then
    raise exception 'Falta la fecha: el vencimiento, o la de fabricación para calcularlo.';
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


create or replace function public.conteo_fefo_editar(
  p_linea       uuid,
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
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod uuid; v_tipo text; v_factor integer; v_vida integer;
  v_estado estado_conteo; v_dueno uuid; v_bodega uuid;
  v_fab date; v_venc date;
  v_vd smallint; v_vm smallint; v_va smallint;
begin
  select c.estado, c.responsable_id, c.bodega_id
    into v_estado, v_dueno, v_bodega
    from public.conteo_lineas cl
    join public.conteos c on c.id = cl.conteo_id
   where cl.id = p_linea;

  if v_estado is null then raise exception 'Ese renglón no existe.'; end if;
  if v_dueno is distinct from auth.uid() then
    raise exception 'Ese conteo es de otra persona.';
  end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya se envió.'; end if;

  select id, tipo_material, cajas_por_estiba, vida_util
    into v_prod, v_tipo, v_factor, v_vida
    from public.productos where sku = p_sku and activo;
  if v_prod is null then raise exception 'El código % no está en el maestro.', p_sku; end if;

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
        raise exception 'El material % no tiene vida útil en el maestro, así que no se puede calcular el vencimiento desde la fabricación.', p_sku;
      end if;
      v_venc := v_fab + v_vida;
      v_vd := extract(day   from v_venc)::smallint;
      v_vm := extract(month from v_venc)::smallint;
      v_va := (extract(year from v_venc)::integer - 2000)::smallint;
    end if;
  end if;

  if v_tipo = 'PRODUCTO' and v_va is null then
    raise exception 'Falta la fecha: el vencimiento, o la de fabricación para calcularlo.';
  end if;

  update public.conteo_lineas set
    producto_id = v_prod, ubicacion_id = p_ubicacion,
    estibas = p_estibas, cajas = p_cajas, saldo = p_saldo,
    venc_dia = v_vd, venc_mes = v_vm, venc_anio = v_va,
    fab_dia = p_fab_dia, fab_mes = p_fab_mes, fab_anio = p_fab_anio,
    rotacion = p_rotacion,
    averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
    estado_envase = nullif(trim(coalesce(p_estado, '')), ''),
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    cantidad_contada = coalesce(v_factor, 0) * coalesce(p_estibas, 0)
                       + coalesce(p_cajas, 0) + coalesce(p_saldo, 0),
    contado_por = auth.uid(), contado_en = now()
  where id = p_linea;
end $$;

grant execute on function public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer,
  smallint, smallint, smallint) to authenticated;
grant execute on function public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer,
  smallint, smallint, smallint) to authenticated;

/* LAS FIRMAS VIEJAS SE VAN. Postgres no reemplaza una función cuando le
   cambia la lista de parámetros: crea una SEGUNDA. Con las dos vivas,
   una llamada sin `p_fab_*` entraría por la de antes —guardando bien,
   sin fabricación— y nadie se enteraría hasta que hiciera falta
   recontar contra el cartón. */
drop function if exists public.conteo_fefo_agregar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer);
drop function if exists public.conteo_fefo_editar(uuid, text, uuid, boolean, integer, integer,
  smallint, smallint, smallint, boolean, boolean, text, text, integer);


-- ---------------------------------------------------------------------
-- 3. LA VISTA, CON LA FABRICACIÓN
--
-- `drop` y no `create or replace`: gana columnas en medio. Copiada, no
-- reescrita de memoria.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 3. QUEDÓ ASÍ
--
-- No se comprueba «¿existe la restricción?» —una con el nombre correcto
-- y la condición vieja también existe— sino QUÉ DEJA PASAR Y QUÉ NO. Se
-- le pregunta a la propia base evaluando las dos combinaciones que
-- importan.
-- ---------------------------------------------------------------------
do $$
declare v_cond text;
begin
  select pg_get_constraintdef(oid) into v_cond
    from pg_constraint
   where conname = 'conteo_lineas_una_forma_de_contar'
     and conrelid = 'public.conteo_lineas'::regclass;

  if v_cond is null then
    raise exception 'No quedó puesta la regla de la forma de contar';
  end if;

  /* La condición tiene que hablar de las tres columnas y NO puede ser la
     de num_nonnulls, que es la que prohibía estibas + saldo. */
  if v_cond like '%num_nonnulls%' then
    raise exception 'Quedó la regla vieja: estibas y saldo seguirían sin poder ir juntos';
  end if;
  if v_cond not like '%cajas%' or v_cond not like '%estibas%' or v_cond not like '%saldo%' then
    raise exception 'La regla no habla de las tres columnas: %', v_cond;
  end if;

  /* NINGUNA DE LAS VIEJAS PUEDE SEGUIR VIVA. Con cualquiera de ellas
     puesta, la regla nueva no se alcanza y estibas + saldo sigue sin
     poderse — pero la migración habría dicho «listo». */
  if exists (select 1 from pg_constraint
              where conrelid = 'public.conteo_lineas'::regclass
                and conname in ('conteo_lineas_una_cantidad',
                                'conteo_lineas_estibas_o_cajas',
                                'conteo_lineas_una_u_otra')) then
    raise exception 'Quedó viva una regla vieja de la cantidad: %',
      (select string_agg(conname, ', ') from pg_constraint
        where conrelid = 'public.conteo_lineas'::regclass
          and conname in ('conteo_lineas_una_cantidad',
                          'conteo_lineas_estibas_o_cajas',
                          'conteo_lineas_una_u_otra'));
  end if;

  raise notice 'Listo. Un renglón ya puede llevar estibas completas MÁS cajas sueltas.';
  raise notice 'Lo que sigue sin poderse es mezclar «cajas» con las otras dos: son dos formas de contar.';
  raise notice 'Renglones guardados: % (ninguno cambió de total: la fórmula no se tocó).',
    (select count(*) from public.conteo_lineas);
end $$;
