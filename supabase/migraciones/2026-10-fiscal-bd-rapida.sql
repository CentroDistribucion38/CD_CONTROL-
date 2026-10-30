-- ---------------------------------------------------------------------
-- LA BD DEL FISCAL, RÁPIDA.
-- Antes, por CADA renglón contado (una hoja trae 300 o más) la base volvía a calcular si su módulo ya
-- estaba resuelto —una cuenta pesada— y a buscar su foto. Ahora eso se calcula UNA vez por ubicación y
-- una sola vez las fotos de la hoja. Devuelve exactamente lo mismo, pero en una fracción del tiempo.
-- Correr UNA vez en el SQL Editor de Supabase (se puede repetir sin problema).
-- ---------------------------------------------------------------------
create index if not exists inv_fiscal_fotos_conteo_idx on public.inv_fiscal_fotos (conteo_id);

drop function if exists public.inv_fiscal_bd_hoja(uuid);
create function public.inv_fiscal_bd_hoja(p_hoja uuid)
returns table (
  id uuid, equipo text, persona text, contado_en timestamptz, ubicacion_id uuid, ubicacion text, modulo text,
  sku text, material text, venc_dia integer, venc_mes integer, venc_anio integer,
  estibas integer, saldo integer, cajas integer, cajas_por_estiba integer, total_cajas bigint,
  estado_envase text, averia boolean, pnc boolean, nota text, ruta text, en_base boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'La BD del fiscal requiere el permiso «Inventario fiscal»';
  end if;
  return query
  with ubi as materialized (
    select distinct c0.ubicacion_id as uid from public.inv_fiscal_conteos c0 where c0.hoja_id = p_hoja
  ), base as materialized (
    select ub.uid,
           (exists (select 1 from public.inv_fiscal_hojas h
                      join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = ub.uid
                     where h.id = p_hoja)
            or public.inv_fiscal_modulo_resuelto(p_hoja, ub.uid)) as ok
      from ubi ub
  ), foto as materialized (
    select distinct on (f.conteo_id) f.conteo_id as cid, f.ruta as ruta_f
      from public.inv_fiscal_fotos f
     where f.hoja_id = p_hoja
     order by f.conteo_id, f.subida_en
  )
  select c.id, c.equipo::text, pe.nombre::text, c.contado_en, c.ubicacion_id, u.clave::text,
         regexp_replace(u.clave, '_(IZQ|DER)$', '')::text,
         p.sku::text, p.nombre::text, c.venc_dia::integer, c.venc_mes::integer, c.venc_anio::integer,
         coalesce(c.estibas, 0)::integer, coalesce(c.saldo, 0)::integer, coalesce(c.cajas, 0)::integer, coalesce(p.cajas_por_estiba, 0)::integer,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.estado_envase::text, coalesce(c.averia, false), coalesce(c.pnc, false), c.nota::text,
         fo.ruta_f::text,
         coalesce(b.ok, false)
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
    left join public.perfiles pe on pe.id = c.contado_por
    left join base b on b.uid = c.ubicacion_id
    left join foto fo on fo.cid = c.id
   where c.hoja_id = p_hoja
   order by u.clave, p.sku, c.equipo, c.contado_en;
end $$;
revoke all on function public.inv_fiscal_bd_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_bd_hoja(uuid) to authenticated;
