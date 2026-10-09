-- =====================================================================
-- QUIEBRA EN SITIO · EL COBRO CRUZADO CON EL MAESTRO DE INVENTARIO
--
-- «Los precios están por botella; crúzalo, que en el maestro del
--  inventario está el factor.» Lo reportado son CAJAS:
--
--     ROTA         cajas × UNID. POR CAJA × precio botella del envase
--     CONTAMINADA  cajas × UNID. POR CAJA × (precio botella envase + producto)
--
--     UNID. POR CAJA = productos.unidades_por_caja (la que se ve y se edita
--                      en Inventario → Maestro). Ej.: 4 cajas de Envase
--                      Marrón 330R = 4 × 30 = 120 botellas × precio botella.
--
-- Reemplaza 2026-10-roturas-cobro-por-caja.sql, que leía `unidades_x_caja`,
-- una columna vieja que casi nadie tiene llena: por eso salía $0 y «le falta
-- factor». Sirve se haya corrido ese archivo o no.
--
-- Se puede correr varias veces.
-- =====================================================================

do $bloque$
declare v_def text; v_cols text; v_extra text := '';
  v_tipo jsonb;
  v_exp jsonb := jsonb_build_object(
    'cobro_rotas',          '(b.unidades * f.unidades_por_caja * b.precio_envase)',
    'cobro_contaminadas',   '(coalesce(b.contaminadas, 0) * f.unidades_por_caja * (b.precio_envase + b.precio_producto))',
    'cobro_total',          '((b.unidades * f.unidades_por_caja * b.precio_envase) + case when coalesce(b.contaminadas, 0) = 0 then 0 else b.contaminadas * f.unidades_por_caja * (b.precio_envase + b.precio_producto) end)',
    'factor_caja',          'f.unidades_por_caja',
    'precio_caja_envase',   '(b.precio_envase * f.unidades_por_caja)',
    'precio_caja_producto', '(b.precio_producto * f.unidades_por_caja)');
  k text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_roturas'
                    and column_name = 'cobro_total') then
    raise exception 'Falta 2026-09-roturas-cobro.sql: córrelo antes que este.';
  end if;
  if obj_description('public.v_roturas'::regclass, 'pg_class') = 'cobro x unidades por caja del maestro' then
    raise notice 'La vista ya cobra con las unidades por caja del maestro.';
    return;
  end if;

  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');

  /* Las columnas en su orden y con su mismo tipo; las de la plata con la cuenta nueva. */
  select string_agg(
           case when v_exp ? a.attname
                then format('(%s)::%s as %I', v_exp ->> a.attname, format_type(a.atttypid, a.atttypmod), a.attname)
                else format('b.%I', a.attname) end, ', ' order by a.attnum)
    into v_cols
    from pg_attribute a
   where a.attrelid = 'public.v_roturas'::regclass and a.attnum > 0 and not a.attisdropped;

  /* Si no se había corrido el de por caja, estas tres se agregan al final. */
  foreach k in array array['factor_caja', 'precio_caja_envase', 'precio_caja_producto'] loop
    if not exists (select 1 from pg_attribute a where a.attrelid = 'public.v_roturas'::regclass
                     and a.attname = k and not a.attisdropped) then
      v_extra := v_extra || format(', %s as %I', v_exp ->> k, k);
    end if;
  end loop;

  execute format($f$
    create or replace view public.v_roturas as
      with base as ( %s )
      select %s %s
        from base b
        left join public.productos f on f.sku = b.material
  $f$, v_def, v_cols, v_extra);
  comment on view public.v_roturas is 'cobro x unidades por caja del maestro';
  raise notice 'La vista ya cobra: cajas × unidades por caja × precio de la botella.';
end $bloque$;

grant select on public.v_roturas to authenticated;

-- PARA MIRARLO:
--   select codigo, material, unidades, contaminadas, factor_caja as unid_por_caja,
--          precio_envase, precio_producto, cobro_total, etapa
--     from public.v_roturas where etapa = 'cobro' order by reportada_en desc;
