begin;

-- =====================================================================
-- «QUE EN EL DESPLEGABLE SE VEA ESTO» — LOS QUE DE VERDAD SE ROMPEN
--
-- «En quiebra, en sitio, en EER o producto, que en el desplegable se
--  vea esto — cada uno corresponde a producto o EER — pero si busco los
--  demás que aparezcan; es para que el scroll no sea extenso.»
--
-- ---------------------------------------------------------------------
-- EL PROBLEMA: 494 MATERIALES PARA ESCOGER ENTRE 50
-- ---------------------------------------------------------------------
-- El maestro de Inventario tiene 494 materiales porque tiene que
-- tenerlos: es el maestro de TODO lo que entra y sale del CD. Pero en
-- sitio solo se rompen unos cincuenta, y abrir el desplegable con los
-- 494 es bajar treinta pantallazos de pie, con guante, para encontrar
-- el mismo de siempre.
--
-- ---------------------------------------------------------------------
-- UNA MARCA, NO UNA LISTA EN EL CÓDIGO
-- ---------------------------------------------------------------------
-- Los cincuenta se marcan en el maestro con una casilla. El día que
-- entre una referencia nueva se marca desde la pantalla y aparece: una
-- lista escrita dentro del programa obligaría a un despliegue cada vez,
-- que es exactamente lo que este proyecto ya decidió no hacer con las
-- zonas, las causas y los temas.
--
-- Y LOS DEMÁS NO DESAPARECEN. La marca solo decide QUÉ SALE DE ENTRADA;
-- escribiendo se busca en los 494. Esconder un material sería impedir
-- registrar una rotura que de verdad pasó, y eso es peor que un scroll
-- largo.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

do $bloque$
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la tabla productos: corre supabase/modulos/inventario.sql primero.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. LA MARCA
--
-- ARRANCA EN FALSO PARA TODOS. Si naciera en verdadero, el desplegable
-- seguiría teniendo los 494 y habría que apagar cuatrocientos cuarenta
-- a mano — al revés de lo que se pidió.
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists en_sitio boolean not null default false;

comment on column public.productos.en_sitio is
  'Sale de entrada en el desplegable de Quiebra en sitio. Los demás siguen apareciendo al buscar.';

create index if not exists productos_en_sitio_idx on public.productos (en_sitio)
  where en_sitio;

-- ---------------------------------------------------------------------
-- 2. LOS CINCUENTA
--
-- SON LOS QUE ÉL PASÓ, con su código tal como está en el maestro. Van
-- por SKU y no por nombre: el nombre se escribe de cuatro formas —«Aguila
-- Tw 330Cc X 30» y «AGUILA TW 330CC X30»— y el código es el que está
-- pegado en la estiba.
--
-- NO SE APAGAN LOS QUE YA ESTUVIERAN MARCADOS. Si alguien marcó otro
-- desde la pantalla antes de correr esto, se queda: este archivo siembra
-- una primera lista, no manda sobre lo que se decida después.
-- ---------------------------------------------------------------------
update public.productos
   set en_sitio = true
 where sku in (
   /* ---------- PRODUCTO TERMINADO (38) ---------- */
   '2182',    -- Pony Malta R 330cc X 30
   '2511',    -- Cola&Pola RN 330cc X 30
   '2512',    -- Poker R 330cc X 30
   '3128',    -- Aguila RN 330cc X 30
   '3583',    -- Aguila R 750cc X 16
   '3617',    -- Costeñita R 175cc X 38
   '3659',    -- Poker R 750cc X 16
   '3664',    -- Aguila Lig R 750cc X 16
   '3751',    -- Club Col R 330cc X 30 N
   '3759',    -- Club Col RJ R 330cc X 30 N
   '3787',    -- Club Col TW 330ccX6 N
   '7599',    -- BBC Cajica Miel Nr330ccX4
   '9139',    -- Aguila Light RN 250cc X 38
   '9150',    -- Poker Rn 250Cc X 38
   '9480',    -- Poker Rn 1000Cc X 13
   '9482',    -- Aguila Lig Rn 1000Cc X 13
   '9494',    -- Aguila Rn 1000Cc X 13
   '9508',    -- Coronita Nr 210Cc X 6
   '9798',    -- Club Col Tw 330Cc X 30
   '9845',    -- Aguila Tw 330Cc X 30
   '9856',    -- Aguila Tw 330Cc X 24 Manual
   '13451',   -- COSTENA BACANA BR 320CCX30
   '14779',   -- NATIVA BR 330CC X 30
   '15781',   -- CLUB COL DORADA R 850CC X 13
   '20050',   -- CORONA NRB 330CC X6
   '20463',   -- STELLA ARTOIS NRB 300CC X6
   '20546',   -- AGUILA ORIGINAL RB 250CC X38
   '20867',   -- COSTEÑA RB 330CC X30
   '20877',   -- COSTEÑA RB 750CC X16
   '21156',   -- CLUB COLOMBIA TRIGO RB 330CC X30
   '21177',   -- Modelo Especial Tw 355cc 4PX6U
   '22003',   -- BBC MONSERRATE ROJA BRR 29.7L X1
   '22284',   -- BBC LAGER BR 29.7L X1
   '22398',   -- MODELO NEGRA NRB 355CC X6 IMPO
   '22613',   -- AGUILA LIGHT RB 330CC X30 THERMO INK
   '23060',   -- CLUB COLOMBIA NEW DRAFT BRRL 30L X1
   '23204',   -- MICHELOB ULTRA NRB 210CC X6
   '23224',   -- POKER NR 330 X24 REEMP EXP USA TERC

   /* ---------- ENVASE · EER (12) ---------- */
   '3500005', -- Envase Costeñita 175R
   '3500162', -- Envase Marron 330R
   '3500213', -- Envase Flint 330R
   '3500373', -- Envase Marron 750R
   '3500383', -- Envase Flint 750R
   '3500446', -- Envase Marron Club Col 330R
   '3500887', -- BOTELLA FLINT 1000R
   '3500888', -- BOTELLA MARRON 1000CC
   '3501225', -- BOTELLA FLINT 250 CC
   '3501226', -- BOTELLA MARRON 250 CC
   '3501430', -- ENVASE COSTENA BACANA 320CC R
   '3501539'  -- BOTELLA MARRON 850 ML R
 );

-- ---------------------------------------------------------------------
-- 3. LA VISTA LO LLEVA HASTA LA PANTALLA
--
-- `v_roturas_materiales_maestro` es de donde lee el desplegable de en
-- sitio. Se borra y se vuelve a crear: Postgres NO deja meter una
-- columna en MEDIO de una vista que ya existe —contesta «cannot change
-- name of view column», que no menciona el problema real— y es
-- justamente lo que dejó trancado `2026-09-corregir-viajes.sql` durante
-- semanas.
--
-- SIN `cascade`, a propósito: si algún día algo cuelga de esta vista,
-- que el archivo se caiga diciéndolo y no se lleve por delante lo que
-- colgaba, en silencio.
-- ---------------------------------------------------------------------
drop view if exists public.v_roturas_materiales_maestro;

create view public.v_roturas_materiales_maestro as
  select p.sku                      as clave,
         p.nombre,
         case when p.tipo_material = 'ENVASE' then 'eer' else 'producto_terminado' end as tipo,
         p.color_vidrio             as color,
         p.unidades_x_caja          as botellas_x_empaque,
         p.familia,
         /* LO QUE LE FALTA PARA PODER USARSE BIEN. La pantalla lo dice
            en vez de callarse: un envase sin color acaba en un análisis
            por color que no cuadra, y un producto sin unidades por caja
            obliga a teclear las unidades a mano. */
         (p.tipo_material = 'ENVASE' and p.color_vidrio is null)    as le_falta_color,
         (p.tipo_material = 'PRODUCTO' and p.unidades_x_caja is null) as le_falta_caja,
         p.en_sitio
    from public.productos p
   where p.activo;
grant select on public.v_roturas_materiales_maestro to authenticated;

-- ---------------------------------------------------------------------
-- 4. QUIÉN PUEDE MARCARLOS
--
-- Quien mantiene el maestro de Inventario. No hace falta función: la
-- pantalla ya escribe en `productos` con las políticas que esa tabla
-- tenga; esto solo se asegura de que la columna nueva no se quede
-- fuera del grant.
-- ---------------------------------------------------------------------
grant select on public.productos to authenticated;

do $$
declare v_pt int; v_eer int; v_tot int;
begin
  select count(*) into v_tot from public.productos where activo;
  select count(*) into v_pt from public.productos
   where en_sitio and activo and tipo_material = 'PRODUCTO';
  select count(*) into v_eer from public.productos
   where en_sitio and activo and tipo_material = 'ENVASE';
  raise notice 'En sitio: % productos y % envases marcados, de % materiales activos.', v_pt, v_eer, v_tot;
  if v_pt + v_eer < 50 then
    raise notice 'Se esperaban 50. Los que falten es que ese SKU no esta en el maestro o esta apagado:';
    raise notice '  select sku, nombre, activo from public.productos where sku in (...);';
  end if;
  raise notice 'Los demas NO desaparecen: siguen saliendo al escribir en el buscador.';
end $$;

commit;
