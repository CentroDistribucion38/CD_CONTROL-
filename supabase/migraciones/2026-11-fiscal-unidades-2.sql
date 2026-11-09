-- =====================================================================
-- UNIDADES SUELTAS · ETAPA 2 (tablero, corte, informe, FIFO, balance, Excel)
--
-- Requiere haber corrido antes 2026-11-fiscal-unidades.sql (etapa 1).
--
-- Qué hace (solo agrega columnas a dos vistas; no toca datos):
--   · v_conteo_fefo   +unidades_por_caja  → con ella la aplicación pasa las
--                      sueltas a fracción de caja (cajas + sueltas / unidades por caja).
--   · v_conteos_fefo  +unidades           → el total de sueltas de cada recorrido.
--
-- Se puede correr dos veces: si la columna ya está, no hace nada.
-- =====================================================================
begin;

do $$
declare d text;
begin
  if to_regclass('public.v_conteo_fefo') is null then
    raise exception 'No existe v_conteo_fefo.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_conteo_fefo' and column_name = 'unidades') then
    raise exception 'Falta la etapa 1: corre primero 2026-11-fiscal-unidades.sql.';
  end if;

  /* 1 · v_conteo_fefo + unidades_por_caja (el alias del producto en la vista es «p»). */
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_conteo_fefo' and column_name = 'unidades_por_caja') then
    d := pg_get_viewdef('public.v_conteo_fefo'::regclass, true);
    if d !~* E'\\mFROM (public\\.)?conteo_lineas cl' or d !~* E'JOIN (public\\.)?productos p ' then
      raise exception 'No pude agregar «unidades_por_caja» a v_conteo_fefo: no reconozco su definición.';
    end if;
    d := regexp_replace(rtrim(d, E' \n;'), E'\\s+FROM (public\\.)?conteo_lineas cl', E',\n  p.unidades_por_caja\nFROM public.conteo_lineas cl', 'i');
    execute 'create or replace view public.v_conteo_fefo as ' || d;
  end if;

  /* 2 · v_conteos_fefo + unidades (suma de las sueltas del recorrido). */
  if to_regclass('public.v_conteos_fefo') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'v_conteos_fefo' and column_name = 'unidades') then
    d := pg_get_viewdef('public.v_conteos_fefo'::regclass, true);
    if d !~* E'\\mFROM (public\\.)?conteos c\\M' or d !~* E'conteo_lineas cl' then
      raise exception 'No pude agregar «unidades» a v_conteos_fefo: no reconozco su definición.';
    end if;
    d := regexp_replace(rtrim(d, E' \n;'), E'\\s+FROM (public\\.)?conteos c\\M', E',\n  COALESCE(sum(cl.unidades), 0)::bigint AS unidades\nFROM public.conteos c', 'i');
    execute 'create or replace view public.v_conteos_fefo as ' || d;
  end if;
end $$;

grant select on public.v_conteo_fefo  to authenticated;
grant select on public.v_conteos_fefo to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_conteo_fefo' and column_name = 'unidades_por_caja') then
    raise exception 'v_conteo_fefo no quedó con unidades_por_caja.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_conteos_fefo' and column_name = 'unidades') then
    raise exception 'v_conteos_fefo no quedó con unidades.';
  end if;
  raise notice 'Listo: tablero, corte, informe, FIFO, balance y Excel cuentan las unidades sueltas.';
end $$;

commit;
select 'OK · unidades sueltas, etapa 2 lista' as resultado;
