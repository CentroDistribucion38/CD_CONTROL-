-- =====================================================================
-- INVENTARIO FISCAL · FAMILIAS: SIN TOPE Y CON LOS ENVASES (EER)
--
-- «Aquí debo poder seleccionar varias familias a la vez, no solo dos, y faltan
--  los SKU de envase (EER): esos sí los tienes del maestro.»
--
-- QUÉ CAMBIA (corre DESPUÉS de 2026-11-fiscal-familias.sql)
--   1. inv_fiscal_familias_validas   ya no limita a 2: una hoja lleva las que se le pongan.
--                                    Acepta las familias del maestro de PRODUCTO (Lata, Tw, Ret, Pet,
--                                    Barril) y las del maestro de ENVASES / pasivos (Envase, Caja,
--                                    Estiba, No retornable…), sin importar mayúsculas.
--   2. inv_fiscal_familias_catalogo  las familias que se ofrecen al armar el plan, con su tipo
--                                    (PT = producto, EER = envase) y cuántos códigos tiene cada una.
--   3. inv_fiscal_hoja_codigos       los códigos de las familias de UNA hoja (SKU, descripción y
--                                    factor de estibado), de los dos maestros, para el toolbox de Contar.
--
-- Todo es de CONSULTA: no limita lo que se puede anotar. Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists familias text[] not null default '{}';

create or replace function public.inv_fiscal_familias_validas(p_json jsonb, p_hoja integer)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_fams  text[] := '{}';
  v_x     text;
  v_canon text;
begin
  if p_json is null or jsonb_typeof(p_json) <> 'array' then
    return v_fams;
  end if;
  for v_x in select btrim(e) from jsonb_array_elements_text(p_json) as e loop
    if v_x = '' then continue; end if;
    v_canon := null;
    select familia into v_canon from public.productos where lower(familia) = lower(v_x) limit 1;
    if v_canon is null then
      select familia into v_canon from public.pasivos_maestro where lower(familia) = lower(v_x) limit 1;
    end if;
    if v_canon is null then
      raise exception 'La familia «%» de la hoja % no existe en el maestro', v_x, p_hoja;
    end if;
    if not (v_canon = any (v_fams)) then v_fams := v_fams || v_canon; end if;
  end loop;
  return v_fams;
end $$;

-- ---------------------------------------------------------------------
-- LAS FAMILIAS QUE SE OFRECEN AL ARMAR EL PLAN
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_familias_catalogo()
returns table (nombre text, tipo text, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select min(p.familia) as nombre, 'PT'::text as tipo, count(*)::int as n
      from public.productos p
     where p.activo and p.tipo_material = 'PRODUCTO' and btrim(coalesce(p.familia, '')) <> ''
     group by lower(p.familia)
    union all
    select min(m.familia), 'EER'::text, count(*)::int
      from public.pasivos_maestro m
     where m.activo and btrim(coalesce(m.familia, '')) <> ''
     group by lower(m.familia)
  ) x
  where public.puede_ver('/inventario/fiscal')
$$;
revoke all on function public.inv_fiscal_familias_catalogo() from public, anon;
grant execute on function public.inv_fiscal_familias_catalogo() to authenticated;

-- ---------------------------------------------------------------------
-- LOS CÓDIGOS DE LAS FAMILIAS DE UNA HOJA (toolbox de Contar)
-- La ven las dos personas de la hoja y quien tiene permiso de ver el plan fiscal.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_hoja_codigos(p_hoja uuid)
returns table (sku text, descripcion text, familia text, tipo text, cajas_por_estiba numeric, unidades_por_caja numeric)
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select hh.id, hh.familias
      from public.inv_fiscal_hojas hh
     where hh.id = p_hoja
       and (
         public.puede_ver('/inventario/fiscal')
         or exists (select 1 from public.inv_fiscal_miembros mm where mm.hoja_id = hh.id and mm.user_id = auth.uid())
       )
  )
  select p.sku::text, p.nombre::text, p.familia::text, 'PT'::text, p.cajas_por_estiba::numeric, p.unidades_por_caja::numeric
    from h join public.productos p on lower(p.familia) = any (select lower(f) from unnest(h.familias) f)
   where p.activo and p.tipo_material = 'PRODUCTO'
  union all
  select m.codigo::text, m.descripcion::text, m.familia::text, 'EER'::text, m.cajas_por_estiba::numeric, m.unidades_por_caja::numeric
    from h join public.pasivos_maestro m on lower(m.familia) = any (select lower(f) from unnest(h.familias) f)
   where m.activo
$$;
revoke all on function public.inv_fiscal_hoja_codigos(uuid) from public, anon;
grant execute on function public.inv_fiscal_hoja_codigos(uuid) to authenticated;

commit;
