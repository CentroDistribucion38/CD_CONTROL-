-- =====================================================================
-- EL MAESTRO DE INVENTARIO, CRUZADO CON 2026.09.26_MAESTRO.xlsx
--
-- «En el maestro de inventarios cruza la informacion y agrega todo lo
--  que falta, debe quedar completa. Valida bien.»
--
-- ---------------------------------------------------------------------
-- LO PRIMERO QUE DIO EL CRUCE: NO FALTA NI UN MATERIAL
-- ---------------------------------------------------------------------
-- Los 493 codigos del archivo YA ESTAN en el maestro, los 493. Lo que
-- faltaba no eran filas: eran COLUMNAS. El maestro se cargo de
-- «FEFO 002.xlsx», que traia otras, y estas cuatro nunca entraron:
--
--     CATEGORIA        Cerveza / Nabs / Empaque Primario...   495 vacias
--     TIPO ENVASE      Botella / Lata / Pet / Barril...       no existia
--     HL               hectolitros por unidad                 no existia
--     UNIDADES x HL    cuantas unidades hacen un hectolitro   no existia
--     REFERENCIA       el «X 6» del empaque de venta          no existia
--
-- ---------------------------------------------------------------------
-- LO QUE ESTE ARCHIVO NO TOCA, Y POR QUE
-- ---------------------------------------------------------------------
-- 1. CAJAS POR ESTIBA y UNIDADES POR ESTIBA. El Excel las trae en CERO
--    para 370 de los 493 —solo los 123 con patron de estiba las tienen—
--    y el maestro SI las tiene puestas para todos. Copiarlas borraria
--    el dato bueno de 369 materiales con un cero, y un cero ahi hace
--    que el conteo de una estiba de ese material de cero cajas.
--
-- 2. EL PATRON DE ESTIBA (largo, ancho, nivel). Son los MISMOS 123 que
--    ya cargo 2026-09-patron-de-estiba.sql. No hay nada nuevo.
--
-- 3. LA FAMILIA (Ret, Tw, Lata, Pet, Barril). No es lo mismo que el
--    tipo de envase: «Botella» del archivo son «Ret» y «Tw» en el
--    maestro, que es un dato mas fino y es el que usa Quiebra en sitio
--    para saber que se rompe como vidrio. El tipo de envase entra en su
--    propia columna y la familia se queda como esta.
--
-- 4. LO QUE YA TIENE VALOR. Todo lo de abajo es «rellena lo vacio», no
--    «pisa lo que haya». Si alguien corrigio algo a mano, manda lo suyo.
--
-- ---------------------------------------------------------------------
-- LO QUE SI SE CORRIGE, Y ESTA LISTADO UNO POR UNO
-- ---------------------------------------------------------------------
-- El cruce encontro CUATRO contenidos que no coinciden, y en los cuatro
-- EL NOMBRE DEL PROPIO MATERIAL le da la razon al archivo:
--
--     9116   Club Col MIX LTA 355X8 PRO        maestro 330  -> 355
--     15781  CLUB COL DORADA R 850CC X 13      maestro 1000 -> 850
--     22270  KAUFMANN LATA 310CC X6            maestro 330  -> 310
--     22753  PONY MALTA LATA 330CC x6 EXP ESP  maestro 33   -> 330
--
-- No es creerle al archivo: es que «850CC» esta escrito en el nombre.
-- Van en un bloque aparte al final, listados, para que se puedan quitar
-- de un tijeretazo si alguno estaba bien como estaba.
--
-- ---------------------------------------------------------------------
-- SE PUEDE CORRER VARIAS VECES. Al final devuelve la foto de lo que
-- quedo sin llenar, que es lo que hay que mirar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS NUEVAS
-- ---------------------------------------------------------------------
alter table public.productos
  -- Botella / Lata / Pet / Barril / Cilindro / Otro. Mas grueso que la
  -- familia y viene del maestro de la cerveceria, no de aqui.
  add column if not exists tipo_envase   text,
  -- Hectolitros de UNA unidad. Es como la cerveceria mide volumen, y
  -- sin esto no hay forma de decir cuantos HL salieron del CD.
  add column if not exists hl            numeric(14,8),
  -- Cuantas unidades hacen un hectolitro. Es 1/hl, pero viene calculado
  -- en el archivo y se guarda tal cual: recalcularlo aqui daria un
  -- decimal distinto al que usa el resto de la compania.
  add column if not exists unidades_x_hl numeric(16,6),
  -- El «X 6» del empaque de venta. NO es unidades por caja —eso es la
  -- columna UNID del archivo, que coincide con el maestro en las 493—:
  -- son dos cosas distintas y por eso son dos columnas.
  add column if not exists referencia    integer
;

create index if not exists productos_categoria_txt_idx on public.productos (categoria);

do $bloque$
declare v_n int; v_falta text; v_sobra text; v_pelea text;
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla public.productos: corre antes las migraciones de inventario.';
  end if;

  create temp table _maestro (
    sku text primary key, categoria text, tipo_envase text, referencia numeric,
    hl numeric, unidades_x_hl numeric, contenido numeric, unidades_por_caja numeric
  ) on commit drop;

  insert into _maestro (sku, categoria, tipo_envase, referencia, hl, unidades_x_hl,
                        contenido, unidades_por_caja) values
    ('26', 'Cerveza', 'Barril', 1, 0.5, 2, 50000, 1),
    ('27', 'Cerveza', 'Barril', 1, 0.5, 2, 50000, 1),
    ('31', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('1413', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('1416', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('1421', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('1428', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('1431', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2154', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('2157', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('2160', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2169', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('2170', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2171', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('2173', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2174', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('2182', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2183', 'Nabs', 'Botella', 38, 0.00225, 444.444444, 225, 38),
    ('2206', 'Nabs', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2208', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('2222', 'Nabs', 'Pet', 24, 0.0033, 303.030303, 330, 24),
    ('2223', 'Nabs', 'Pet', 6, 0.0033, 303.030303, 330, 6),
    ('2224', 'Nabs', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('2226', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('2227', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('2228', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2298', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2302', 'Cerveza', 'Botella', 24, 0.0025, 400, 250, 24),
    ('2511', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2512', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2558', 'Nabs', 'Pet', 2, 0.015, 66.666667, 1500, 2),
    ('2634', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2637', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('2640', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2641', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('2729', 'Nabs', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('2759', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('2772', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2776', 'Nabs', 'Pet', 6, 0.0033, 303.030303, 330, 6),
    ('2882', 'Cerveza', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('2912', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2976', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('2986', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('2999', 'Cerveza', 'Botella', 6, 0.0025, 400, 250, 6),
    ('3059', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3128', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3130', 'Cerveza', 'Botella', 38, 0.00225, 444.444444, 225, 38),
    ('3162', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3198', 'Cerveza', 'Botella', 30, 0.0035, 285.714286, 350, 30),
    ('3203', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('3221', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3222', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3228', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('3229', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('3232', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('3260', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3261', 'Cerveza', 'Botella', 20, 0.0045, 222.222222, 450, 20),
    ('3262', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('3345', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3479', 'Nabs', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3485', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3529', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('3583', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('3617', 'Cerveza', 'Botella', 38, 0.00175, 571.428571, 175, 38),
    ('3647', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3656', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('3658', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('3659', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('3664', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('3669', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3751', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3753', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3756', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3758', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('3759', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3760', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('3787', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3788', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3789', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3803', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('3810', 'Nabs', 'Pet', 30, 0.002, 500, 200, 30),
    ('3819', 'Nabs', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('3829', 'Nabs', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('3864', 'Nabs', 'Pet', 24, 0.0033, 303.030303, 330, 24),
    ('3867', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('3878', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('3888', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('4477', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('5049', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('5050', 'Nabs', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('5119', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('5120', 'Nabs', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('5121', 'Nabs', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5150', 'Cerveza', 'Lata', 6, 0.00473, 211.41649, 473, 6),
    ('5250', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5251', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('5252', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('5253', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5254', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('5255', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('5256', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5257', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('5268', 'Cerveza', 'Lata', 18, 0.00473, 211.41649, 473, 18),
    ('5409', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('5410', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('5505', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('5506', 'Nabs', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('5507', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5541', 'Cerveza', 'Botella', 6, 0.009, 111.111111, 900, 6),
    ('5623', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('5624', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('5626', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('5630', 'Cerveza', 'Lata', 6, 0.00473, 211.41649, 473, 6),
    ('5632', 'Cerveza', 'Lata', 6, 0.00473, 211.41649, 473, 6),
    ('5726', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('5729', 'Cerveza', 'Lata', 9, 0.0033, 303.030303, 330, 9),
    ('5733', 'Cerveza', 'Lata', 9, 0.0033, 303.030303, 330, 9),
    ('5739', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('5768', 'Cerveza', 'Botella', 38, 0.00175, 571.428571, 175, 38),
    ('5904', 'Cerveza', 'Lata', 18, 0.00473, 211.41649, 473, 18),
    ('5905', 'Cerveza', 'Lata', 18, 0.00473, 211.41649, 473, 18),
    ('6121', 'Cerveza', 'Botella', 24, 0.0025, 400, 250, 24),
    ('6122', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('6718', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('6860', 'Cerveza', 'Lata', 9, 0.0033, 303.030303, 330, 9),
    ('6861', 'Cerveza', 'Lata', 9, 0.0033, 303.030303, 330, 9),
    ('6862', 'Cerveza', 'Lata', 9, 0.0033, 303.030303, 330, 9),
    ('7078', 'Nabs', 'Pet', 15, 0.01, 100, 1000, 15),
    ('7089', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7167', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('7218', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('7326', 'Cerveza', 'Botella', 10, 0.0033, 303.030303, 330, 10),
    ('7410', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('7450', 'Cerveza', 'Lata', 4, 0.00269, 371.747212, 269, 4),
    ('7474', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('7475', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('7476', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7487', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('7575', 'Cerveza', 'Botella', 6, 0.00207, 483.091787, 207, 6),
    ('7576', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7577', 'Cerveza', 'Botella', 12, 0.0071, 140.84507, 710, 12),
    ('7579', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7581', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('7584', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('7586', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 24),
    ('7593', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7594', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7595', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7596', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('7597', 'Cerveza', 'Botella', 12, 0.0033, 303.030303, 330, 12),
    ('7598', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7599', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7600', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7601', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7602', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7603', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7604', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7605', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7606', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7607', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('7608', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('7609', 'Cerveza', 'Lata', 12, 0.00295, 338.983051, 295, 12),
    ('7611', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('7612', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7613', 'Cerveza', 'Botella', 6, 0.00207, 483.091787, 207, 6),
    ('7614', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7617', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7659', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('7660', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('7674', 'Cerveza', 'Lata', 12, 0.00295, 338.983051, 295, 12),
    ('7675', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('7676', 'Cerveza', 'Botella', 12, 0.0033, 303.030303, 330, 12),
    ('7686', 'Cerveza', 'Lata', 10, 0.0033, 303.030303, 330, 10),
    ('7692', 'Nabs', 'Pet', 2, 0.01, 100, 1000, 2),
    ('7760', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('7780', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7781', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7782', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7783', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7790', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7797', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7804', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7805', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7806', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7807', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7814', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7815', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7832', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7833', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7836', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7838', 'Cerveza', 'Barril', 1, 0.58, 1.724138, 58000, 1),
    ('7839', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('7990', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('7991', 'Cerveza', 'Botella', 24, 0.0025, 400, 250, 24),
    ('7993', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('7994', 'Cerveza', 'Botella', 24, 0.00315, 317.460317, 315, 24),
    ('7996', 'Cerveza', 'Lata', 12, 0.00269, 371.747212, 269, 12),
    ('8042', 'Cerveza', 'Botella', 6, 0.0025, 400, 250, 6),
    ('8061', 'Cerveza', 'Botella', 6, 0.00315, 317.460317, 315, 6),
    ('8062', 'Nabs', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('8063', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8065', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8066', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8069', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('8070', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('8071', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8072', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('8073', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8074', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8075', 'Cerveza', 'Botella', 24, 0.00355, 281.690141, 355, 24),
    ('8085', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('8086', 'Cerveza', 'Lata', 4, 0.00269, 371.747212, 269, 4),
    ('8122', 'Cerveza', 'Lata', 30, 0.0033, 303.030303, 330, 6),
    ('8123', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('8130', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('8135', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8136', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8156', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8157', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8158', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('8160', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8161', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8163', 'Nabs', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8165', 'Nabs', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8166', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('8180', 'Cerveza', 'Botella', 6, 0.0075, 133.333333, 750, 6),
    ('8186', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('8212', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('8213', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('8221', 'Cerveza', 'Botella', 6, 0.00275, 363.636364, 275, 6),
    ('8223', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('8224', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('8225', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8228', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('8229', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8234', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('8245', 'Cerveza', 'Botella', 24, 0.0034, 294.117647, 340, 24),
    ('8262', 'Nabs', 'Pet', 6, 0.002, 500, 200, 12),
    ('8287', 'Nabs', 'Pet', 6, 0.002, 500, 200, 12),
    ('8306', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('8307', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('8311', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('8312', 'Cerveza', 'Botella', 24, 0.00355, 281.690141, 355, 24),
    ('8322', 'Nabs', 'Pet', 15, 0.01, 100, 1000, 15),
    ('8343', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('8367', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('8507', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8515', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8517', 'Nabs', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8518', 'Nabs', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8532', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8533', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8547', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8567', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('8570', 'Cerveza', 'Botella', 6, 0.0021, 476.190476, 210, 6),
    ('8573', 'Cerveza', 'Botella', 24, 0.0021, 476.190476, 210, 24),
    ('8703', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8722', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8723', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('8727', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('8732', 'Cerveza', 'Botella', 24, 0.0025, 400, 250, 24),
    ('8813', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('8814', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('8815', 'Cerveza', 'Botella', 6, 0.00275, 363.636364, 275, 6),
    ('8828', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('8878', 'Nabs', 'Pet', 6, 0.004, 250, 400, 6),
    ('8880', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('8881', 'Nabs', 'Pet', 24, 0.004, 250, 400, 24),
    ('8923', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('9074', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9075', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9076', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9077', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9084', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('9116', 'Cerveza', 'Lata', 8, 0.00355, 281.690141, 355, 8),
    ('9127', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('9128', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('9130', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('9139', 'Cerveza', 'Botella', 38, 0.0025, 400, 250, 38),
    ('9150', 'Cerveza', 'Botella', 38, 0.0025, 400, 250, 38),
    ('9458', 'Nabs', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('9480', 'Cerveza', 'Botella', 13, 0.01, 100, 1000, 13),
    ('9482', 'Cerveza', 'Botella', 13, 0.01, 100, 1000, 13),
    ('9494', 'Cerveza', 'Botella', 13, 0.01, 100, 1000, 13),
    ('9508', 'Cerveza', 'Botella', 6, 0.0021, 476.190476, 210, 6),
    ('9551', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('9672', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('9798', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('9845', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('9847', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('9849', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9851', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9856', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9857', 'Nabs', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9858', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9859', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('9893', 'Cerveza', 'Barril', 1, 0.12, 8.333333, 12000, 1),
    ('9909', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('11635', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('11969', 'Nabs', 'Pet', 6, 0.02, 50, 2000, 6),
    ('12012', 'Cerveza', 'Lata', 4, 0.00269, 371.747212, 269, 4),
    ('12013', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('12026', 'Nabs', 'Pet', 12, 0.006, 166.666667, 600, 12),
    ('12257', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('12259', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('12283', 'Cerveza', 'Lata', 4, 0.00269, 371.747212, 269, 4),
    ('13413', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('13443', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('13451', 'Cerveza', 'Botella', 30, 0.0032, 312.5, 320, 30),
    ('13631', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('13763', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('13766', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('13798', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('13799', 'Nabs', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('14197', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('14588', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('14589', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('14603', 'Nabs', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('14646', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('14647', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('14703', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('14706', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('14707', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('14709', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('14779', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('14798', 'Cerveza', 'Lata', 4, 0.00355, 281.690141, 355, 4),
    ('14833', 'Cerveza', 'Botella', 2, 0.0033, 303.030303, 330, 2),
    ('14968', 'Cerveza', 'Lata', 30, 0.0033, 303.030303, 330, 30),
    ('14969', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('15012', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('15015', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('15024', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('15070', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('15366', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('15367', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('15545', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('15781', 'Cerveza', 'Botella', 13, 0.0085, 117.647059, 850, 13),
    ('15854', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('15859', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('15860', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('16002', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('16017', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('16018', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('16198', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('16210', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('16282', 'Cerveza', 'Lata', 24, 0.0033, 303.030303, 330, 24),
    ('16396', 'Cerveza', 'Lata', 2, 0.00355, 281.690141, 355, 4),
    ('16398', 'Nabs', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('16466', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('16542', 'Nabs', 'Pet', 6, 0.0033, 303.030303, 330, 6),
    ('16736', 'Nabs', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('16740', 'Nabs', 'Pet', 6, 0.0033, 303.030303, 330, 6),
    ('16920', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('16950', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('16951', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('16952', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('16953', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('17154', 'Cerveza', 'Lata', 24, 0.00269, 371.747212, 269, 24),
    ('17155', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('17157', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('17286', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('17287', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('17288', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('17289', 'Cerveza', 'Lata', 24, 0.00355, 281.690141, 355, 24),
    ('17290', 'Cerveza', 'Botella', 4, 0.00355, 281.690141, 355, 4),
    ('17594', 'Cerveza', 'Botella', 12, 0.00355, 281.690141, 355, 12),
    ('17740', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('17824', 'Nabs', 'Pet', 15, 0.01, 100, 1000, 15),
    ('18039', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('18059', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('18216', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('18217', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('18218', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('18220', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('18224', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('18226', 'Cerveza', 'Lata', 12, 0.00355, 281.690141, 355, 12),
    ('19184', 'Cerveza', 'Lata', 6, 0.00355, 281.690141, 355, 6),
    ('19224', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('19303', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('19596', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('19898', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('19954', 'Cerveza', 'Botella', 38, 0.0025, 400, 250, 38),
    ('20012', 'Cerveza', 'Lata', 4, 0.00355, 281.690141, 355, 4),
    ('20013', 'Cerveza', 'Lata', 4, 0.00355, 281.690141, 355, 4),
    ('20014', 'Cerveza', 'Lata', 4, 0.00355, 281.690141, 355, 4),
    ('20016', 'Cerveza', 'Lata', 4, 0.00355, 281.690141, 355, 4),
    ('20050', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('20205', 'Cerveza', 'Botella', 38, 0.0025, 400, 250, 38),
    ('20250', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('20251', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('20254', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('20281', 'Cerveza', 'Botella', 40, 0.0021, 476.190476, 210, 40),
    ('20282', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('20463', 'Cerveza', 'Botella', 6, 0.003, 333.333333, 300, 6),
    ('20469', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('20546', 'Cerveza', 'Botella', 38, 0.0025, 400, 250, 38),
    ('20668', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('20672', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('20677', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('20867', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('20877', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('21125', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('21146', 'Cerveza', 'Lata', 6, 0.00473, 211.41649, 473, 6),
    ('21155', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('21156', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('21159', 'Cerveza', 'Lata', 4, 0.00269, 371.747212, 269, 4),
    ('21161', 'Cerveza', 'Botella', 4, 0.0033, 303.030303, 330, 4),
    ('21166', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('21173', 'Nabs', 'Pet', 15, 0.01, 100, 1000, 15),
    ('21177', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('21182', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('21184', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('21186', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('21187', 'Cerveza', 'Botella', 16, 0.0075, 133.333333, 750, 16),
    ('21189', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('21203', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('21204', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('21255', 'Nabs', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('21447', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('21703', 'Nabs', 'Pet', 6, 0.02, 50, 2000, 6),
    ('21730', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('21806', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('21871', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('21951', 'Cerveza', 'Lata', 12, 0.00269, 371.747212, 269, 12),
    ('21959', 'Nabs', 'Pet', 6, 0.015, 66.666667, 1500, 6),
    ('22001', 'Cerveza', 'Barril', 1, 0.297, 3.367003, 29700, 1),
    ('22003', 'Cerveza', 'Barril', 1, 0.297, 3.367003, 29700, 1),
    ('22006', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('22039', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('22102', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('22135', 'Cerveza', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('22202', 'Cerveza', 'Barril', 1, 0.297, 3.367003, 29700, 1),
    ('22242', 'Nabs', 'Lata', 6, 0.00269, 371.747212, 269, 6),
    ('22256', 'Cerveza', 'Lata', 12, 0.0033, 303.030303, 330, 12),
    ('22265', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('22269', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('22270', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('22271', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('22272', 'Nabs', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('22282', 'Nabs', 'Pet', 6, 0.002, 500, 200, 6),
    ('22284', 'Cerveza', 'Barril', 1, 0.297, 3.367003, 29700, 1),
    ('22315', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('22363', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('22398', 'Cerveza', 'Botella', 6, 0.00355, 281.690141, 355, 6),
    ('22579', 'Cerveza', 'Lata', 6, 0.00473, 211.41649, 473, 6),
    ('22613', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('22615', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('22616', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('22643', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('22660', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('22753', 'Nabs', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('22866', 'Cerveza', 'Botella', 6, 0.0033, 303.030303, 330, 6),
    ('22867', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('23013', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('23047', 'Cerveza', 'Lata', 6, 0.0031, 322.580645, 310, 6),
    ('23060', 'Cerveza', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('23121', 'Cerveza', 'Lata', 6, 0.0033, 303.030303, 330, 6),
    ('23204', 'Cerveza', 'Botella', 6, 0.0021, 476.190476, 210, 6),
    ('23211', 'Nabs', 'Pet', 30, 0.002, 500, 200, 30),
    ('23223', 'Cerveza', 'Botella', 30, 0.0033, 303.030303, 330, 30),
    ('23224', 'Cerveza', 'Botella', 24, 0.0033, 303.030303, 330, 24),
    ('400733', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('412644', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('412671', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('412707', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('421887', 'Empaque Primario', 'Botella', 1, 0.0021, 476.190476, 210, 30),
    ('3500005', 'Empaque Primario', 'Botella', 1, 0.00175, 571.428571, 175, 38),
    ('3500024', 'Empaque Primario', 'Cilindro', 1, null, null, null, 1),
    ('3500025', 'Empaque Primario', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('3500026', 'Empaque Primario', 'Barril', 1, 0.5, 2, 50000, 1),
    ('3500159', 'Empaque Secundario', 'Otro', 1, 0.0033, 303.030303, 330, 1),
    ('3500162', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('3500163', 'Empaque Terciario', 'Otro', 1, null, null, null, 1),
    ('3500207', 'Empaque Primario', 'Botella', 1, 0.00225, 444.444444, 225, 38),
    ('3500213', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('3500231', 'Empaque Secundario', 'Otro', 1, 0.00225, 444.444444, 225, 1),
    ('3500232', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('3500373', 'Empaque Primario', 'Botella', 1, 0.0075, 133.333333, 750, 16),
    ('3500374', 'Empaque Secundario', 'Otro', 1, 0.0075, 133.333333, 750, 1),
    ('3500383', 'Empaque Primario', 'Botella', 1, 0.0075, 133.333333, 750, 16),
    ('3500446', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30),
    ('3500472', 'Empaque Primario', 'Botella', 1, 0.00175, 571.428571, 175, 38),
    ('3500587', 'Empaque Primario', 'Barril', 1, 0.3, 3.333333, 30000, 1),
    ('3500887', 'Empaque Primario', 'Botella', 1, 0.01, 100, 1000, 13),
    ('3500888', 'Empaque Primario', 'Botella', 1, 0.01, 100, 1000, 13),
    ('3501211', 'Empaque Secundario', 'Otro', 1, 0.01, 100, 1000, 1),
    ('3501224', 'Empaque Secundario', 'Otro', 1, 0.0025, 400, 250, 1),
    ('3501225', 'Empaque Primario', 'Botella', 1, 0.0025, 400, 250, 38),
    ('3501226', 'Empaque Primario', 'Botella', 1, 0.0025, 400, 250, 38),
    ('3501430', 'Empaque Primario', 'Botella', 1, 0.0032, 312.5, 320, 30),
    ('3501539', 'Empaque Primario', 'Botella', 1, 0.0085, 117.647059, 850, 13),
    ('3503016', 'Empaque Primario', 'Botella', 1, 0.0025, 400, 250, 38),
    ('3503486', 'Empaque Primario', 'Botella', 1, 0.0033, 303.030303, 330, 30)
  ;

  -- -------------------------------------------------------------------
  -- 2. ANTES DE TOCAR NADA: QUE EL ARCHIVO Y EL MAESTRO SE CONOZCAN
  -- -------------------------------------------------------------------
  -- Un codigo del archivo que no este en el maestro no se da de alta a
  -- ciegas: le faltarian la familia, los minimos y las prioridades, y
  -- entraria mudo a las pantallas de FEFO. Se nombra y se para.
  select string_agg(m.sku, ', ') into v_falta
    from _maestro m
   where not exists (select 1 from public.productos p where p.sku = m.sku);
  if v_falta is not null then
    raise exception 'Estos codigos del archivo NO estan en el maestro: %. Cargalos primero en Inventario -> Maestro con su familia y sus minimos.', v_falta;
  end if;

  -- Y AL REVES SOLO SE AVISA: un material que el archivo ya no trae
  -- puede tener conteos colgando, asi que no se borra ni se apaga.
  select string_agg(p.sku || ' (' || p.nombre || ')', '; ') into v_sobra
    from public.productos p
   where not exists (select 1 from _maestro m where m.sku = p.sku);
  if v_sobra is not null then
    raise notice 'En el maestro y no en el archivo (se quedan como estan): %', v_sobra;
  end if;

  -- -------------------------------------------------------------------
  -- 3. LO NUEVO: SOLO DONDE ESTA VACIO
  -- -------------------------------------------------------------------
  update public.productos p set categoria = m.categoria
    from _maestro m where p.sku = m.sku and p.categoria is null and m.categoria is not null;
  get diagnostics v_n = row_count;
  raise notice 'Categoria puesta a % materiales.', v_n;

  update public.productos p set tipo_envase = m.tipo_envase
    from _maestro m where p.sku = m.sku and p.tipo_envase is null and m.tipo_envase is not null;
  get diagnostics v_n = row_count;
  raise notice 'Tipo de envase puesto a % materiales.', v_n;

  update public.productos p set hl = m.hl
    from _maestro m where p.sku = m.sku and p.hl is null and m.hl is not null;
  get diagnostics v_n = row_count;
  raise notice 'HL puesto a % materiales.', v_n;

  update public.productos p set unidades_x_hl = m.unidades_x_hl
    from _maestro m where p.sku = m.sku and p.unidades_x_hl is null and m.unidades_x_hl is not null;
  get diagnostics v_n = row_count;
  raise notice 'Unidades por HL puestas a % materiales.', v_n;

  update public.productos p set referencia = m.referencia
    from _maestro m where p.sku = m.sku and p.referencia is null and m.referencia is not null;
  get diagnostics v_n = row_count;
  raise notice 'Referencia puesta a % materiales.', v_n;

  -- Y LOS DOS QUE YA EXISTIAN, por si algun material entro sin ellos.
  update public.productos p set contenido = m.contenido
    from _maestro m where p.sku = m.sku and p.contenido is null and m.contenido is not null;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise notice 'Contenido puesto a % materiales que lo tenian vacio.', v_n; end if;

  update public.productos p set unidades_por_caja = m.unidades_por_caja
    from _maestro m
   where p.sku = m.sku and p.unidades_por_caja is null and m.unidades_por_caja is not null;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise notice 'Unidades por caja puestas a % materiales que las tenian vacias.', v_n; end if;

  -- -------------------------------------------------------------------
  -- 4. LO QUE NO CUADRA: SE DICE, NO SE PISA
  -- -------------------------------------------------------------------
  -- Menos los cuatro del bloque de abajo, que estan decididos.
  select string_agg(p.sku || ': maestro ' || p.contenido || ' cc, archivo ' || m.contenido || ' cc', '; ')
    into v_pelea
    from public.productos p join _maestro m on m.sku = p.sku
   where p.contenido is not null and m.contenido is not null
     and p.contenido <> m.contenido
     and p.sku not in ('9116', '15781', '22270', '22753');
  if v_pelea is not null then
    raise warning 'CONTENIDO que no coincide y NO se toco: %', v_pelea;
  end if;

  select string_agg(p.sku || ': maestro ' || p.unidades_por_caja || ', archivo ' || m.unidades_por_caja, '; ')
    into v_pelea
    from public.productos p join _maestro m on m.sku = p.sku
   where p.unidades_por_caja is not null and m.unidades_por_caja is not null
     and p.unidades_por_caja <> m.unidades_por_caja;
  if v_pelea is not null then
    raise warning 'UNIDADES POR CAJA que no coinciden y NO se tocaron: %', v_pelea;
  end if;

  -- -------------------------------------------------------------------
  -- 5. LOS CUATRO CONTENIDOS QUE EL NOMBRE DEL MATERIAL DESEMPATA
  -- -------------------------------------------------------------------
  -- Se corrigen porque el tamano esta escrito en el nombre del propio
  -- material, no porque el archivo sea mas nuevo. Si alguno estaba bien
  -- como estaba, se borra su renglon de aqui y listo.
  update public.productos set contenido = 355 where sku = '9116'  and contenido = 330;
  update public.productos set contenido = 850 where sku = '15781' and contenido = 1000;
  update public.productos set contenido = 310 where sku = '22270' and contenido = 330;
  update public.productos set contenido = 330 where sku = '22753' and contenido = 33;

  -- -------------------------------------------------------------------
  -- 6. Y LO QUE SIGUE VACIO, QUE ES LO QUE HAY QUE IR A LLENAR
  -- -------------------------------------------------------------------
  select count(*) into v_n from public.productos where categoria is null;
  if v_n > 0 then
    raise warning 'Quedan % materiales sin categoria: son los que el archivo no trae.', v_n;
  end if;
  select count(*) into v_n from public.productos where tipo_envase is null;
  if v_n > 0 then
    raise warning 'Quedan % materiales sin tipo de envase.', v_n;
  end if;

  -- Y LO QUE NO VIENE DE ESTE CRUCE PERO SE VE AL MIRAR: un material
  -- con la estiba en cero hace que el conteo de una estiba suya de cero
  -- cajas. No lo arregla este archivo —el Excel tampoco trae el dato—,
  -- pero callarlo es dejarlo ahí otro mes.
  select string_agg(sku || ' (' || nombre || ')', '; ') into v_pelea
    from public.productos
   where coalesce(cajas_por_estiba, 0) = 0 or coalesce(unidades_por_estiba, 0) = 0;
  if v_pelea is not null then
    raise warning 'Materiales con la ESTIBA EN CERO o vacia —no es de este cruce, pero una estiba suya cuenta cero cajas—: %', v_pelea;
  end if;
  raise notice 'Cruce terminado. Mira la consulta del final para la foto completa.';
end $bloque$;

-- ---------------------------------------------------------------------
-- LA FOTO DE COMO QUEDO EL MAESTRO
--
-- Esto SI devuelve filas en el panel de Supabase (los `raise notice` de
-- arriba van a los logs). Es lo que hay que mirar despues de correr.
-- ---------------------------------------------------------------------
select
  count(*)                                             as materiales,
  count(*) filter (where categoria is null)            as sin_categoria,
  count(*) filter (where tipo_envase is null)          as sin_tipo_envase,
  count(*) filter (where hl is null)                   as sin_hl,
  count(*) filter (where referencia is null)           as sin_referencia,
  count(*) filter (where contenido is null)            as sin_contenido,
  count(*) filter (where unidades_por_caja is null)    as sin_unid_x_caja,
  count(*) filter (where cajas_por_estiba is null)     as sin_cajas_x_estiba,
  count(*) filter (where pat_largo is null)            as sin_patron,
  count(*) filter (where tipo_material = 'ENVASE'
                     and color_vidrio is null)         as envases_sin_color
  from public.productos;

-- Y EL DETALLE DE LOS QUE QUEDARON COJOS, si quedo alguno:
--
--   select sku, nombre, categoria, tipo_envase, hl, referencia
--     from public.productos
--    where categoria is null or tipo_envase is null or hl is null
--    order by sku;
