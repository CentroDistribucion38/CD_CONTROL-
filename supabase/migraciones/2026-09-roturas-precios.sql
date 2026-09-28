-- =====================================================================
-- ROTURAS EN SITIO · LOS PRECIOS Y EL ENVASE DE CADA PRODUCTO
--
-- Del archivo MM60_2.XLS que pasó Cristian: 32 productos y 13 envases,
-- con el precio de UNA BOTELLA de cada uno y, para cada producto, a qué
-- envase corresponde.
--
-- EL PRECIO ES POR BOTELLA Y NO POR CAJA, y es lo primero que hay que
-- tener claro porque en roturas «unidades» quiere decir otra cosa:
--
--     unidades   los empaques  -- una caja de 30
--     botellas   las de adentro -- 30 por caja
--
-- $233,50 es una botella de Pony Malta, no la caja. Por eso la columna
-- se llama `precio_botella` y no `precio_unidad`: quien lea
-- «precio_unidad» al lado de la columna `unidades` va a multiplicar por
-- el número equivocado, y el error es de treinta veces.
--
-- CÓMO SE COBRA (lo confirmó Cristian):
--
--     ROTA         solo el envase. Al OL se le cobra reponer la botella.
--     CONTAMINADA  el envase Y el producto. El envase contaminado no se
--                  lava ni vuelve a la línea: se descarta con el líquido.
--
-- Esto es al revés de lo que decían los comentarios del código, que
-- daban por hecho que la contaminada devolvía el envase entero. Aquí
-- queda escrito de dónde sale la regla; el cálculo del cobro va en el
-- paso siguiente y este archivo solo deja los datos.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

do $bloque$
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla public.productos: corre antes las migraciones de inventario.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. LAS DOS COLUMNAS
--
-- NACEN VACÍAS. Un precio en cero es un cobro de cero que nadie va a
-- cuestionar; vacío se ve vacío y la pantalla lo puede decir.
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists precio_botella numeric(12,2),
  add column if not exists envase_sku     text;

comment on column public.productos.precio_botella is
  'Lo que cuesta UNA botella de este codigo (no una caja). Del MM60. Con esto se cobra la rotura.';
comment on column public.productos.envase_sku is
  'A que envase corresponde este producto. Null en los no retornables y en los envases mismos.';

alter table public.productos drop constraint if exists productos_precio_botella_chk;
alter table public.productos add constraint productos_precio_botella_chk
  check (precio_botella is null or precio_botella > 0);

-- EL ENLACE ES UNA LLAVE DE VERDAD, no un texto suelto: `sku` es único,
-- así que la base puede impedir que un producto apunte a un envase que
-- no existe. Un enlace roto aquí es un cobro que sale sin la parte del
-- envase y nadie se entera.
alter table public.productos drop constraint if exists productos_envase_sku_fk;
alter table public.productos add constraint productos_envase_sku_fk
  foreign key (envase_sku) references public.productos (sku) on update cascade;

create index if not exists productos_envase_sku_idx on public.productos (envase_sku)
  where envase_sku is not null;

-- ---------------------------------------------------------------------
-- 2. LOS PRECIOS Y LOS ENLACES
--
-- LOS ENVASES VAN PRIMERO. La llave foránea exige que el envase exista
-- antes de que un producto lo señale; al revés, la primera fila se cae.
--
-- SE PISA LO QUE HUBIERA: un precio es un dato que cambia y este
-- archivo es la lista oficial del mes. Lo que no se pisa es el resto del
-- maestro.
-- ---------------------------------------------------------------------
do $bloque$
declare v_env int; v_pro int; v_falta text;
begin
  create temp table _env (sku text primary key, precio numeric(12,2)) on commit drop;
  insert into _env (sku, precio) values
    ('3500005', 200.00),          -- Envase Costeñita 175R  $200,00
    ('3500162', 100.00),          -- Envase Marron 330R  $100,00
    ('3500213', 100.00),          -- Envase Flint 330R  $100,00
    ('3500373', 400.00),          -- Envase Marron 750R  $400,00
    ('3500383', 400.00),          -- Envase Flint 750R  $400,00
    ('3500446', 100.00),          -- Envase Marron Club Col 330R  $100,00
    ('3500887', 400.00),          -- BOTELLA FLINT 1000R  $400,00
    ('3500888', 400.00),          -- BOTELLA MARRON 1000CC  $400,00
    ('3501225', 100.00),          -- BOTELLA FLINT 250 CC  $100,00
    ('3501226', 100.00),          -- BOTELLA MARRON 250 CC  $100,00
    ('3501430', 100.00),          -- ENVASE COSTENA BACANA 320CC R  $100,00
    ('3501539', 400.00),          -- BOTELLA MARRON 850 ML R  $400,00
    ('412375', 390.30)            -- Envase Flint 210NR Coronita  $390,30
  ;

  create temp table _pro (sku text primary key, precio numeric(12,2), env text) on commit drop;
  insert into _pro (sku, precio, env) values
    ('2182', 233.50, '3500162'),              -- Pony Malta R 330cc X 30  $233,50 + envase 3500162 $100,00
    ('2511', 203.00, '3500162'),              -- Cola&Pola RN 330cc X 30  $203,00 + envase 3500162 $100,00
    ('2512', 219.15, '3500162'),              -- Poker R 330cc X 30  $219,15 + envase 3500162 $100,00
    ('3128', 221.08, '3500162'),              -- Aguila RN 330cc X 30  $221,08 + envase 3500162 $100,00
    ('3583', 437.76, '3500373'),              -- Aguila R 750cc X 16  $437,76 + envase 3500373 $400,00
    ('3617', 130.53, '3500005'),              -- Costeñita R 175cc X 38  $130,53 + envase 3500005 $200,00
    ('3659', 446.21, '3500373'),              -- Poker R 750cc X 16  $446,21 + envase 3500373 $400,00
    ('3664', 383.05, '3500383'),              -- Aguila Lig R 750cc X 16  $383,05 + envase 3500383 $400,00
    ('3751', 280.41, '3500162'),              -- Club Col R 330cc X 30 N  $280,41 + envase 3500162 $100,00
    ('3759', 343.48, '3500162'),              -- Club Col RJ R 330cc X 30 N  $343,48 + envase 3500162 $100,00
    ('3787', 1425.42, '3500162'),             -- Club Col TW 330ccX6 N  $1.425,42 + envase 3500162 $100,00
    ('9139', 161.34, '3501225'),              -- Aguila Light RN 250cc X 38  $161,34 + envase 3501225 $100,00
    ('9150', 197.18, '3501226'),              -- Poker Rn 250Cc X 38  $197,18 + envase 3501226 $100,00
    ('9480', 588.23, '3500888'),              -- Poker Rn 1000Cc X 13  $588,23 + envase 3500888 $400,00
    ('9482', 544.69, '3500887'),              -- Aguila Lig Rn 1000Cc X 13  $544,69 + envase 3500887 $400,00
    ('9494', 613.14, '3500888'),              -- Aguila Rn 1000Cc X 13  $613,14 + envase 3500888 $400,00
    ('9508', 873.05, '412375'),               -- Coronita Nr 210Cc X 6  $873,05 + envase 412375 $390,30
    ('9798', 859.77, '3500162'),              -- Club Col Tw 330Cc X 30  $859,77 + envase 3500162 $100,00
    ('9845', 832.54, '3500162'),              -- Aguila Tw 330Cc X 30  $832,54 + envase 3500162 $100,00
    ('9856', 1072.18, '3500162'),             -- Aguila Tw 330Cc X 24 Manual  $1.072,18 + envase 3500162 $100,00
    ('13451', 190.33, '3501430'),             -- COSTENA BACANA BR 320CCX30  $190,33 + envase 3501430 $100,00
    ('14779', 243.28, '3500162'),             -- NATIVA BR 330CC X 30  $243,28 + envase 3500162 $100,00
    ('15781', 627.38, '3501539'),             -- CLUB COL DORADA R 850CC X 13  $627,38 + envase 3501539 $400,00
    ('20050', 1080.92, '3500213'),            -- CORONA NRB 330CC X6  $1.080,92 + envase 3500213 $100,00
    ('20463', 1077.00, '3501430'),            -- STELLA ARTOIS NRB 300CC X6  $1.077,00 + envase 3501430 $100,00
    ('20546', 186.13, '3500162'),             -- AGUILA ORIGINAL RB 250CC X38  $186,13 + envase 3500162 $100,00
    ('20867', 213.18, '3500162'),             -- COSTEÑA RB 330CC X30  $213,18 + envase 3500162 $100,00
    ('20877', 427.86, '3500373'),             -- COSTEÑA RB 750CC X16  $427,86 + envase 3500373 $400,00
    ('21156', 319.19, '3500162'),             -- CLUB COLOMBIA TRIGO RB 330CC X30  $319,19 + envase 3500162 $100,00
    ('22613', 198.61, '3500213'),             -- AGUILA LIGHT RB 330CC X30 THERMO INK  $198,61 + envase 3500213 $100,00
    ('23204', 978.39, null),                  -- MICHELOB ULTRA NRB 210CC X6  $978,39  (no retornable: sin envase)
    ('23224', 1779.11, '3500162')             -- POKER NR 330 X24 REEMP EXP USA TERC  $1.779,11 + envase 3500162 $100,00
  ;

  -- LOS QUE EL ARCHIVO NOMBRA Y LA BASE NO TIENE. Se dice y se para: un
  -- envase que falta deja sin la parte del envase a todos los productos
  -- que lo señalan, y eso son cobros cortos que nadie va a notar.
  select string_agg(sku, ', ') into v_falta from (
    select sku from _env where not exists (select 1 from public.productos p where p.sku = _env.sku)
    union all
    select sku from _pro where not exists (select 1 from public.productos p where p.sku = _pro.sku)
  ) q;
  if v_falta is not null then
    raise exception 'Estos codigos del archivo de precios no estan en el maestro: %. Cargalos primero en Inventario -> Maestro.', v_falta;
  end if;

  update public.productos p set precio_botella = e.precio from _env e where p.sku = e.sku;
  get diagnostics v_env = row_count;

  update public.productos p
     set precio_botella = x.precio, envase_sku = x.env
    from _pro x where p.sku = x.sku;
  get diagnostics v_pro = row_count;

  raise notice 'Precios: % envases y % productos. Los productos quedaron apuntando a su envase.', v_env, v_pro;
end $bloque$;

-- ---------------------------------------------------------------------
-- 3. LA LISTA DE «EN SITIO»: 32 PRODUCTOS Y 13 ENVASES
--
-- «que sea 13 en envase 32 en producto»
--
-- ESTA VEZ SÍ SE APAGAN LOS QUE SOBRAN. La primera carga (2026-09-
-- material-en-sitio) sembró una lista y a propósito no tocó lo que
-- alguien hubiera marcado a mano. Esta es la lista oficial, así que
-- manda: quedan encendidos exactamente los 45 del archivo de precios y
-- los demás se apagan.
--
-- Salen 6: 7599, 21177, 22003, 22284, 22398 y 23060.
-- Entran 2: 3501539 (BOTELLA MARRON 850 ML R) y 412375 (Envase Flint
-- 210NR Coronita).
--
-- Para volver a encender uno se marca desde Inventario -> Maestro; este
-- archivo no se vuelve a correr para eso.
-- ---------------------------------------------------------------------
do $bloque$
declare v_on int; v_off int;
begin
  update public.productos set en_sitio = true
   where precio_botella is not null and en_sitio is distinct from true;
  get diagnostics v_on = row_count;

  update public.productos set en_sitio = false
   where precio_botella is null and en_sitio;
  get diagnostics v_off = row_count;

  raise notice 'En sitio: % encendidos, % apagados. Quedan % (32 producto + 13 envase).',
    v_on, v_off, (select count(*) from public.productos where en_sitio);
end $bloque$;

-- ---------------------------------------------------------------------
-- 4. PARA MIRARLO
--
--   select sku, nombre, tipo_material, precio_botella, envase_sku,
--          (select e.precio_botella from public.productos e where e.sku = p.envase_sku) as precio_envase
--     from public.productos p
--    where en_sitio
--    order by tipo_material, sku;
-- ---------------------------------------------------------------------
