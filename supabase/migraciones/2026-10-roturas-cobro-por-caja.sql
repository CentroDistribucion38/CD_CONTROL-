-- =====================================================================
-- QUIEBRA EN SITIO · EL COBRO VA POR CAJA
--
-- «Si reportan 4, son 4 cajas: se debe multiplicar.» Lo que se reporta
-- (rotas y contaminadas) son CAJAS. Los precios del maestro siguen
-- siendo por BOTELLA, así que el precio de la caja es:
--
--     precio de la caja = precio de la botella × factor
--     factor            = unidades por caja del material (maestro de Inventario)
--
--     ROTA         cajas × factor × precio botella del envase
--     CONTAMINADA  cajas × factor × (precio botella del envase + del producto)
--
-- SIN FACTOR, EL COBRO SALE NULO (no cero): un cero se suma callado y
-- deja un cobro corto; un nulo se ve como «sin precio».
--
-- Se vuelve a envolver `v_roturas` cambiando SOLO las tres columnas del
-- cobro (mismo nombre y mismo orden) y se agregan al final:
--     factor_caja, precio_caja_envase, precio_caja_producto
--
-- Se puede correr varias veces: si ya trae `factor_caja`, no hace nada.
-- =====================================================================

do $bloque$
declare v_def text; v_cols text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_roturas'
                    and column_name = 'cobro_total') then
    raise exception 'Falta 2026-09-roturas-cobro.sql: córrelo antes que este.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'v_roturas'
                and column_name = 'factor_caja') then
    raise notice 'La vista ya cobra por caja.';
    return;
  end if;

  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');

  /* LAS COLUMNAS EN SU ORDEN; las tres del cobro se cambian por la cuenta por caja. */
  select string_agg(
           case a.attname
             when 'cobro_rotas' then
               '(b.unidades * f.unidades_x_caja * b.precio_envase)::numeric as cobro_rotas'
             when 'cobro_contaminadas' then
               '(coalesce(b.contaminadas, 0) * f.unidades_x_caja * (b.precio_envase + b.precio_producto))::numeric as cobro_contaminadas'
             when 'cobro_total' then
               '((b.unidades * f.unidades_x_caja * b.precio_envase)
                 + case when coalesce(b.contaminadas, 0) = 0 then 0
                        else b.contaminadas * f.unidades_x_caja * (b.precio_envase + b.precio_producto) end)::numeric as cobro_total'
             else format('b.%I', a.attname)
           end, ', ' order by a.attnum)
    into v_cols
    from pg_attribute a
   where a.attrelid = 'public.v_roturas'::regclass and a.attnum > 0 and not a.attisdropped;

  execute format($f$
    create or replace view public.v_roturas as
      with base as ( %s )
      select %s,
             f.unidades_x_caja                          as factor_caja,
             (b.precio_envase * f.unidades_x_caja)      as precio_caja_envase,
             (b.precio_producto * f.unidades_x_caja)    as precio_caja_producto
        from base b
        left join public.productos f on f.sku = b.material
  $f$, v_def, v_cols);
  raise notice 'La vista ya cobra por caja (cajas × factor × precio de la botella).';
end $bloque$;

grant select on public.v_roturas to authenticated;

-- ---------------------------------------------------------------------
-- PARA MIRARLO
--
--   select codigo, material, unidades as cajas_rotas, contaminadas as cajas_contaminadas,
--          factor_caja, precio_caja_envase, precio_caja_producto, cobro_total, etapa
--     from public.v_roturas order by reportada_en desc limit 20;
--
--   -- las que quedan sin cobro porque al material le falta el factor:
--   select distinct material from public.v_roturas
--    where etapa = 'cobro' and factor_caja is null;
-- ---------------------------------------------------------------------
