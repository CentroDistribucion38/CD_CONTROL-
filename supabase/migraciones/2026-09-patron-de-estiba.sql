-- =====================================================================
-- INVENTARIO · EL PATRÓN DE ESTIBA EN EL MAESTRO
--
-- «que pueda colocar el sku y traiga toda la informacion y solo sea
--  agregarle fecha de vencimiento»
--
-- Del maestro de Cristian (2026.09.26_MAESTRO.xlsx, columna FACTOR
-- ESTIBA) salen tres números por material: LARGO × ANCHO × NIVEL. Es
-- CÓMO VAN LAS CAJAS SOBRE UNA ESTIBA —tres de largo, tres de ancho,
-- cinco de alto— y su producto es el factor de estiba: 3 × 3 × 5 = 45.
--
-- NO ES LO MISMO QUE LAS DIMENSIONES QUE YA PIDE LA PANTALLA DE
-- RECEPCIÓN. Esas dicen cuántas ESTIBAS tiene el arrume (doce estibas
-- pueden ir 12×1×1 o 3×2×2) y las teclea quien recibe, porque cambian
-- en cada camión. Estas son del MATERIAL y no cambian nunca: por eso
-- van en el maestro y no en el formulario. En la tarjeta salen las dos,
-- en bloques distintos y con nombres distintos; juntarlas haría que un
-- montacarguista arme una estiba con el patrón del arrume.
--
-- SE PUEDE CORRER VARIAS VECES sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. QUE LA TABLA EXISTA
-- ---------------------------------------------------------------------
do $bloque$
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla public.productos: corre antes las migraciones de inventario.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. LAS TRES COLUMNAS
--
-- NACEN VACÍAS Y NO EN 1. Un patrón «1 × 1 × 1» es un dato que parece
-- puesto y está inventado: la tarjeta lo imprimiría como si fuera el
-- del material y nadie volvería a dudar de él. Vacío se ve vacío, y la
-- pantalla lo dice.
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists pat_largo smallint,
  add column if not exists pat_ancho smallint,
  add column if not exists pat_nivel smallint;

comment on column public.productos.pat_largo is
  'Patrón de estiba: cajas a lo LARGO de una estiba. Del maestro; no se teclea al recibir.';
comment on column public.productos.pat_ancho is
  'Patrón de estiba: cajas a lo ANCHO de una estiba.';
comment on column public.productos.pat_nivel is
  'Patrón de estiba: NIVELES (camas) de cajas sobre la estiba. largo × ancho × nivel = cajas por estiba.';

-- NINGUNO PUEDE SER CERO O NEGATIVO. Un cero haría que el producto de
-- los tres diera cero cajas por estiba, y eso se imprimiría.
alter table public.productos drop constraint if exists productos_patron_chk;
alter table public.productos add constraint productos_patron_chk check (
  (pat_largo is null or pat_largo > 0) and
  (pat_ancho is null or pat_ancho > 0) and
  (pat_nivel is null or pat_nivel > 0)
);

-- ---------------------------------------------------------------------
-- 2. LOS 123 DEL MAESTRO
--
-- Son los que traen patrón en el archivo. Los otros 370 —barriles,
-- latas sueltas y empaques— se quedan vacíos A PROPÓSITO: el archivo no
-- los trae, y rellenarlos con algo sería inventar cómo se arma una
-- estiba de algo que no se arma así.
--
-- VAN POR SKU, que es lo que está pegado en la estiba. El nombre del
-- material se escribe de cuatro formas distintas entre el archivo y la
-- base; el código, de una sola.
--
-- LO QUE YA ESTÉ PUESTO A MANO SE RESPETA: si alguien corrigió un
-- patrón desde la pantalla del maestro, este archivo no se lo pisa.
-- Para volver a sembrarlos todos desde cero, primero:
--   update public.productos set pat_largo = null, pat_ancho = null, pat_nivel = null;
-- ---------------------------------------------------------------------
do $bloque$
declare
  v_tocados int;
  v_faltan  int;
  v_pelean  int;
begin
  /* LOS DATOS DEL ARCHIVO, EN UNA TABLA TEMPORAL Y NO EN UN «with».
     Se necesitan TRES veces --para sembrar, para contar los que no estan
     en la base y para avisar de los que pelean con el factor-- y pegar la
     lista de 123 tres veces es tener tres listas que se desincronizan a
     la primera correccion.

     Y ADEMAS plpgsql NO DEJA un «with ... update ... select count(*) into»
     en la misma sentencia: cuenta dos veces la palabra «into» y se cae
     con «INTO specified more than once», que no dice nada de lo que pasa.
     Esta forma se lee mejor y ademas compila. */
  create temp table _patron (
    sku text primary key, largo smallint, ancho smallint, nivel smallint
  ) on commit drop;

  insert into _patron (sku, largo, ancho, nivel) values
    ('2154', 3, 5, 5),   -- Aguila TW 330cc X 24  (3x5x5 = 75 cajas)
    ('2157', 3, 5, 5),   -- Aguila Lig TW 330cc X 24  (3x5x5 = 75 cajas)
    ('2160', 3, 3, 5),   -- Aguila Lig R 330cc X 30  (3x3x5 = 45 cajas)
    ('2182', 3, 3, 5),   -- Pony Malta R 330cc X 30  (3x3x5 = 45 cajas)
    ('2183', 3, 3, 6),   -- Pony Malta R 225cc X 38  (3x3x6 = 54 cajas)
    ('2226', 3, 5, 5),   -- Aguila TW 330 mls X 24 CC/CE USA  (3x5x5 = 75 cajas)
    ('2227', 3, 5, 5),   -- Aguila EXP TW 330 mls X 24 CD/CE USA  (3x5x5 = 75 cajas)
    ('2228', 3, 3, 5),   -- Aguila EXP BNR 330cc X 30 USA  (3x3x5 = 45 cajas)
    ('2298', 3, 3, 5),   -- Redds Cold R 330cc X 30  (3x3x5 = 45 cajas)
    ('2511', 3, 3, 5),   -- Cola&Pola RN 330cc X 30  (3x3x5 = 45 cajas)
    ('2512', 3, 3, 5),   -- Poker R 330cc X 30  (3x3x5 = 45 cajas)
    ('2634', 3, 3, 5),   -- Pilsen R 330cc X 30  (3x3x5 = 45 cajas)
    ('2637', 3, 5, 5),   -- Pilsen Tw 330cc X 24  (3x5x5 = 75 cajas)
    ('2772', 3, 3, 5),   -- Pony Malta R 330ccX30 Pro  (3x3x5 = 45 cajas)
    ('2912', 3, 3, 5),   -- Pony Malta EXP BNR 330cc X 30 USA - Prod  (3x3x5 = 45 cajas)
    ('2986', 3, 3, 5),   -- Aguila R 330cc X 30 Pro  (3x3x5 = 45 cajas)
    ('3059', 3, 3, 5),   -- Aguila R 330cc X 30 Evt  (3x3x5 = 45 cajas)
    ('3128', 3, 3, 5),   -- Aguila RN 330cc X 30  (3x3x5 = 45 cajas)
    ('3130', 3, 3, 6),   -- Aguila RN 225cc X 38  (3x3x6 = 54 cajas)
    ('3162', 3, 3, 5),   -- Poker Lig R 330cc X 30  (3x3x5 = 45 cajas)
    ('3198', 3, 3, 5),   -- Costeña RN 350ccX 30  (3x3x5 = 45 cajas)
    ('3485', 3, 3, 5),   -- Pony Malta EXP BNR 330cc X 30 ESP  (3x3x5 = 45 cajas)
    ('3583', 3, 3, 4),   -- Aguila R 750cc X 16  (3x3x4 = 36 cajas)
    ('3617', 3, 3, 6),   -- Costeñita R 175cc X 38  (3x3x6 = 54 cajas)
    ('3647', 3, 3, 5),   -- Aguila Lig R 330 X 30 Pro  (3x3x5 = 45 cajas)
    ('3658', 3, 3, 4),   -- Pilsen R 750cc X 16  (3x3x4 = 36 cajas)
    ('3659', 3, 3, 4),   -- Poker R 750cc X 16  (3x3x4 = 36 cajas)
    ('3664', 3, 3, 4),   -- Aguila Lig R 750cc X 16  (3x3x4 = 36 cajas)
    ('3751', 3, 3, 5),   -- Club Col R 330cc X 30 N  (3x3x5 = 45 cajas)
    ('3759', 3, 3, 5),   -- Club Col RJ R 330cc X 30 N  (3x3x5 = 45 cajas)
    ('3760', 3, 3, 5),   -- Club Col NG R 330cc X 30 N  (3x3x5 = 45 cajas)
    ('3888', 3, 5, 5),   -- Aguila Exp TW 330ccX24 SUECIA  (3x5x5 = 75 cajas)
    ('5049', 3, 3, 5),   -- Pony Malta EXP TW 330cc X 30 PAN - Prod  (3x3x5 = 45 cajas)
    ('5119', 3, 3, 5),   -- Aguila Cero R 330cc X 30  (3x3x5 = 45 cajas)
    ('5120', 3, 5, 5),   -- Aguila Cero TW 330cc X 24  (3x5x5 = 75 cajas)
    ('5623', 3, 3, 5),   -- Club Col R 330cc X 30 OKF  (3x3x5 = 45 cajas)
    ('5726', 3, 3, 5),   -- Aguila Lig R 330 X 30 Pro2  (3x3x5 = 45 cajas)
    ('5739', 3, 3, 5),   -- Aguila Cero R 330cc X 30 PRO  (3x3x5 = 45 cajas)
    ('5768', 3, 3, 6),   -- Aguila Lig R 175cc X 38  (3x3x6 = 54 cajas)
    ('7089', 3, 5, 5),   -- Aguila Lig EXP Nr 330cc X 24 ARUBA  (3x5x5 = 75 cajas)
    ('7167', 3, 3, 5),   -- Poker R 330cc X 30 DDA  (3x3x5 = 45 cajas)
    ('7474', 3, 3, 5),   -- Club Col TG R 330cc X 30  (3x3x5 = 45 cajas)
    ('7994', 3, 5, 5),   -- Budweiser Nr 315ccX24  (3x5x5 = 75 cajas)
    ('8062', 3, 5, 5),   -- AGUILA CERO TW 330CC X 24 EVT  (3x5x5 = 75 cajas)
    ('8228', 3, 3, 4),   -- POKER R 750CC X 16 DDA  (3x3x4 = 36 cajas)
    ('8570', 8, 10, 4),   -- Coronita Extra 210cc X 6  (8x10x4 = 320 cajas)
    ('8573', 4, 5, 4),   -- Coronita Extra 210cc X 24  (4x5x4 = 80 cajas)
    ('8814', 3, 3, 5),   -- BUSCH LIGHT RB 330CCX30  (3x3x5 = 45 cajas)
    ('8880', 3, 3, 5),   -- Malta Leona RB 330cc x 30  (3x3x5 = 45 cajas)
    ('9139', 3, 3, 5),   -- Aguila Light RN 250cc X 38  (3x3x5 = 45 cajas)
    ('9150', 3, 3, 5),   -- Poker RN 250cc X 38  (3x3x5 = 45 cajas)
    ('9480', 3, 3, 4),   -- POKER RN 1000cc X 13  (3x3x4 = 36 cajas)
    ('9482', 3, 3, 4),   -- Aguila Lig RN 1000cc X 13  (3x3x4 = 36 cajas)
    ('9494', 3, 3, 4),   -- AGUILA RN 1000cc X 13  (3x3x4 = 36 cajas)
    ('9551', 3, 3, 5),   -- Aguila 0.0 RB 330CC X 30  (3x3x5 = 45 cajas)
    ('9798', 3, 3, 5),   -- Club Col Tw 330cc X 30  (3x3x5 = 45 cajas)
    ('9845', 3, 3, 5),   -- Aguila TW 330cc X 30  (3x3x5 = 45 cajas)
    ('9847', 3, 3, 5),   -- Aguila Cero TW 330CC X 30  (3x3x5 = 45 cajas)
    ('9856', 3, 5, 4),   -- Aguila TW 330cc X 24 MANUAL  (3x5x4 = 60 cajas)
    ('9857', 3, 5, 5),   -- Aguila Cero TW 330CC X 24 MANUAL  (3x5x5 = 75 cajas)
    ('9858', 3, 5, 4),   -- Aguila Lig TW 330cc X 24 MANUAL  (3x5x4 = 60 cajas)
    ('11635', 3, 3, 5),   -- Pony Malta EXP NR 330ccX30 CHI  (3x3x5 = 45 cajas)
    ('12257', 3, 3, 5),   -- CLUB COL DORADA TW 330CC X 30 ESP  (3x3x5 = 45 cajas)
    ('13451', 3, 3, 5),   -- COSTENA BACANA BR 320CCX30  (3x3x5 = 45 cajas)
    ('14588', 3, 3, 5),   -- CLUB COL 330CC X 30 EXP USA  (3x3x5 = 45 cajas)
    ('14779', 3, 3, 5),   -- NATIVA BR 330CC X 30  (3x3x5 = 45 cajas)
    ('15012', 3, 3, 5),   -- CLUB COL OKTF FESTBIER BR 330  (3x3x5 = 45 cajas)
    ('15781', 3, 3, 4),   -- CLUB COL DORADA R 850CC X 13  (3x3x4 = 36 cajas)
    ('16002', 3, 3, 5),   -- BUSCH LIGHT NRB 330CCX30  (3x3x5 = 45 cajas)
    ('19954', 3, 3, 5),   -- BUDWEISER RB 250CC X38  (3x3x5 = 45 cajas)
    ('20205', 3, 3, 5),   -- NATIVA BR 250CC X38  (3x3x5 = 45 cajas)
    ('20251', 3, 3, 5),   -- CLUB COL OKTF FESTBIER BR 330 X30  (3x3x5 = 45 cajas)
    ('20281', 3, 3, 5),   -- CORONA REUSABLE 210CC X40  (3x3x5 = 45 cajas)
    ('20282', 3, 3, 5),   -- CORONA REUSABLE 330CC X30  (3x3x5 = 45 cajas)
    ('20546', 3, 3, 5),   -- AGUILA ORIGINAL RB 250CC X38  (3x3x5 = 45 cajas)
    ('20867', 3, 3, 5),   -- COSTEÑA RB 330CC X30  (3x3x5 = 45 cajas)
    ('20877', 3, 3, 4),   -- COSTEÑA RB 750CC X16  (3x3x4 = 36 cajas)
    ('21156', 3, 3, 5),   -- CLUB COLOMBIA TRIGO RB 330CC X30  (3x3x5 = 45 cajas)
    ('21182', 3, 3, 5),   -- AGUILA NRB 330CC X30  (3x3x5 = 45 cajas)
    ('21184', 3, 3, 5),   -- AGUILA LIGHT NRB 330CC X30  (3x3x5 = 45 cajas)
    ('21186', 3, 3, 4),   -- AGUILA LIGHT NRB 750 X16  (3x3x4 = 36 cajas)
    ('21187', 3, 3, 4),   -- AGUILA NRB 750 x16  (3x3x4 = 36 cajas)
    ('21871', 3, 3, 5),   -- AGUILA IMPERIAL RB 330CC X30  (3x3x5 = 45 cajas)
    ('22272', 3, 3, 5),   -- PONY MALTA GO RB 330CC X30  (3x3x5 = 45 cajas)
    ('22363', 3, 3, 5),   -- REDDS CITRUS RB 330 X30  (3x3x5 = 45 cajas)
    ('22613', 3, 3, 5),   -- AGUILA LIGHT RB 330CC X30 THERMO INK  (3x3x5 = 45 cajas)
    ('22615', 3, 3, 5),   -- AGUILA LIGHT NRB TW 330CC X30 THERMO INK  (3x3x5 = 45 cajas)
    ('22616', 3, 5, 4),   -- AGUILA LIGHT NRB TW 330CC X24 THERMO INK  (3x5x4 = 60 cajas)
    ('22643', 3, 3, 5),   -- CLUB COL ESMERALDA NRB 330cc x30  (3x3x5 = 45 cajas)
    ('23204', 8, 9, 5),   -- MICHELOB ULTRA NRB 210CC X6  (8x9x5 = 360 cajas)
    ('23223', 3, 3, 5),   -- POKER NR 330 X30 EXP USA TERC  (3x3x5 = 45 cajas)
    ('400733', 3, 3, 5),   -- ENVASE MARRON 330NR CERVEZAS  (3x3x5 = 45 cajas)
    ('412644', 3, 3, 5),   -- ENVASE MARRON 330NR NUEVO  (3x3x5 = 45 cajas)
    ('412671', 3, 3, 5),   -- ENVASE MARRON 330NR CLUB COLOMBIA NUEVA  (3x3x5 = 45 cajas)
    ('412707', 3, 3, 5),   -- ENVASE FLINT AGUILA 330NR NUEVO  (3x3x5 = 45 cajas)
    ('421887', 3, 3, 5),   -- ENVASE FLINT CORONA 210ML REUSABLE ESP  (3x3x5 = 45 cajas)
    ('3500005', 3, 3, 6),   -- Envase Costeñita 175R  (3x3x6 = 54 cajas)
    ('3500024', 4, 5, 1),   -- CILINDRO CO2 20 kg  (4x5x1 = 20 cajas)
    ('3500025', 3, 3, 1),   -- Barril Acero INOX DIN 30 LT  (3x3x1 = 9 cajas)
    ('3500026', 3, 3, 1),   -- Barril Acero INOX DIN 50 LT  (3x3x1 = 9 cajas)
    ('3500159', 3, 3, 5),   -- Caja Plástica Café 330cc X 30  (3x3x5 = 45 cajas)
    ('3500162', 3, 3, 5),   -- Envase Marron 330R  (3x3x5 = 45 cajas)
    ('3500163', 1, 1, 1),   -- Estiba Cerv Madera 1280X1080X120  (1x1x1 = 1 cajas)
    ('3500207', 3, 3, 6),   -- BOTELLA MARRON 225R  (3x3x6 = 54 cajas)
    ('3500213', 3, 3, 5),   -- Envase Flint 330R  (3x3x5 = 45 cajas)
    ('3500231', 3, 3, 6),   -- Caja Plástica Café 225cc X 38  (3x3x6 = 54 cajas)
    ('3500232', 3, 3, 5),   -- Envase Green 330R  (3x3x5 = 45 cajas)
    ('3500373', 3, 3, 4),   -- Envase Marron 750R  (3x3x4 = 36 cajas)
    ('3500374', 3, 3, 4),   -- CAJA PLASTICA MARRON 750cc x 16  (3x3x4 = 36 cajas)
    ('3500383', 3, 3, 4),   -- Envase Flint 750R  (3x3x4 = 36 cajas)
    ('3500446', 3, 3, 5),   -- Envase Marron Club Col 330R  (3x3x5 = 45 cajas)
    ('3500472', 3, 3, 6),   -- Envase Flint 175R  (3x3x6 = 54 cajas)
    ('3500587', 4, 4, 1),   -- BBC BARRIL ACERO INOX DIN 30 LT  (4x4x1 = 16 cajas)
    ('3500887', 3, 3, 4),   -- BOTELLA FLINT 1000R  (3x3x4 = 36 cajas)
    ('3500888', 3, 3, 4),   -- BOTELLA MARRON 1000CC  (3x3x4 = 36 cajas)
    ('3501211', 3, 3, 4),   -- CAJA PLASTICA MARRON 1000cc x13  (3x3x4 = 36 cajas)
    ('3501224', 3, 3, 5),   -- CAJA PLASTICA MARRON 250cc x38  (3x3x5 = 45 cajas)
    ('3501225', 3, 3, 5),   -- BOTELLA FLINT 250 CC  (3x3x5 = 45 cajas)
    ('3501226', 3, 3, 5),   -- BOTELLA MARRON 250 CC  (3x3x5 = 45 cajas)
    ('3501430', 3, 3, 5),   -- ENVASE COSTENA BACANA 320CC R  (3x3x5 = 45 cajas)
    ('3501539', 3, 3, 4),   -- BOTELLA MARRON 850 ML R  (3x3x4 = 36 cajas)
    ('3503016', 3, 3, 5),   -- BOTELLA MARRON 250 BUDWEISER  (3x3x5 = 45 cajas)
    ('3503486', 3, 3, 5)    -- ENV REUSA NORTE FLINT 330 CORONITA  (3x3x5 = 45 cajas)
  ;

  /* SEMBRAR SOLO LO QUE ESTA VACIO: lo corregido a mano desde la
     pantalla del maestro manda sobre el archivo. */
  update public.productos p
     set pat_largo = d.largo, pat_ancho = d.ancho, pat_nivel = d.nivel
    from _patron d
   where p.sku = d.sku
     and p.pat_largo is null and p.pat_ancho is null and p.pat_nivel is null;
  get diagnostics v_tocados = row_count;

  /* CUANTOS DEL ARCHIVO NO ESTAN EN LA BASE. Se dice en vez de fallar:
     un SKU del maestro de Bavaria que este CD no maneja no es un error,
     pero enterarse es distinto de no enterarse. */
  select count(*) into v_faltan
    from _patron d
   where not exists (select 1 from public.productos p where p.sku = d.sku);

  /* DONDE EL PATRON NO CUADRA CON EL FACTOR DE ESTIBA DE LA BASE. En el
     archivo cuadran los 123 sin una sola excepcion; si aqui sale alguno,
     es que la base tiene otro factor y hay que decidir cual manda. No se
     toca ninguno de los dos: se avisa. */
  select count(*) into v_pelean
    from public.productos p
   where p.pat_largo is not null and p.cajas_por_estiba is not null
     and p.pat_largo * p.pat_ancho * p.pat_nivel <> p.cajas_por_estiba;

  raise notice 'Patron de estiba: % materiales sembrados, % del archivo no estan en la base, % con el factor de estiba en desacuerdo.',
    v_tocados, v_faltan, v_pelean;
end $bloque$;

-- ---------------------------------------------------------------------
-- 3. PARA MIRARLO
--
--   select sku, nombre, pat_largo, pat_ancho, pat_nivel,
--          pat_largo * pat_ancho * pat_nivel as cajas_del_patron,
--          cajas_por_estiba
--     from public.productos
--    where pat_largo is not null
--    order by sku;
--
--   -- los que no cuadran, si los hubiera:
--   select sku, nombre, pat_largo, pat_ancho, pat_nivel, cajas_por_estiba
--     from public.productos
--    where pat_largo is not null and cajas_por_estiba is not null
--      and pat_largo * pat_ancho * pat_nivel <> cajas_por_estiba;
-- ---------------------------------------------------------------------
