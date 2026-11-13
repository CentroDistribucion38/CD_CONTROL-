-- =====================================================================
-- INVENTARIO · PRODUCTO · CONTROL CÍCLICO · LA BD (corregir y quitar renglones)
--
-- «En el Control cíclico debe estar como en el Control fiscal: la BD, si quiero eliminar un renglón o algo así;
--  estoy a ciegas.»
--
--   · inv_ciclico_detalle(p_fiscal): ahora trae el id de cada renglón (para corregirlo o quitarlo).
--   · inv_ciclico_corregir(p_conteo, p_cajas, p_unidades): deja ese renglón en cajas + unidades sueltas.
--   · inv_ciclico_quitar(p_conteo): borra ese renglón.
--   Las dos piden edición en «Plan cíclico» o «Control cíclico» de Producto. Una hoja que ya se envió hay que
--   reabrirla primero (el conteo enviado no se toca a escondidas).
--
-- Necesita 2026-11-producto-ciclico-control.sql. Se puede correr varias veces.
-- =====================================================================
begin;

drop function if exists public.inv_ciclico_detalle(uuid);
create function public.inv_ciclico_detalle(p_fiscal uuid)
returns table (
  id uuid, hoja integer, equipo text, persona text, ubicacion text, sku text, material text, familia text,
  estibas numeric, saldo numeric, cajas numeric, unidades numeric,
  cajas_por_estiba integer, unidades_por_caja integer, total_unidades bigint, nota text, contado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.inv_ciclico_ve() then
    raise exception 'Ver lo contado del cíclico requiere el permiso «Control cíclico» de Producto (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscales f where f.id = p_fiscal and f.tipo = 'CICLICO') then
    raise exception 'Ese inventario cíclico no existe.';
  end if;
  return query
  select c.id, h.numero, m.equipo, pe.nombre, u.clave, p.sku, p.nombre, p.familia,
         c.estibas::numeric, c.saldo::numeric, c.cajas::numeric, c.unidades::numeric,
         p.cajas_por_estiba::integer, public.inv_fiscal_upc(p.unidades_por_caja)::integer,
         public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja)::bigint,
         c.nota, c.contado_en
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas h on h.id = c.hoja_id
    join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
    join public.productos p on p.id = c.producto_id
    join public.ubicaciones u on u.id = c.ubicacion_id
    left join public.perfiles pe on pe.id = c.contado_por
   where h.fiscal_id = p_fiscal
   order by h.numero, m.equipo desc, c.contado_en;
end $$;
revoke all on function public.inv_ciclico_detalle(uuid) from public, anon;
grant execute on function public.inv_ciclico_detalle(uuid) to authenticated;

-- Quién puede tocar la BD del cíclico, y que el renglón sea de un cíclico con la hoja abierta.
create or replace function public.inv_ciclico_bd_puede(p_conteo uuid) returns void
language plpgsql stable security definer set search_path = public
as $$
declare v_tipo text; v_cerrada timestamptz; v_estado text;
begin
  if public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'editar'
     and public.mi_nivel_pantalla('/inventario/producto/control') <> 'editar' then
    raise exception 'Corregir la BD del cíclico requiere permiso de edición en «Control cíclico» de Producto (Roles)';
  end if;
  select f.tipo, h.cerrada_en, f.estado into v_tipo, v_cerrada, v_estado
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas h on h.id = c.hoja_id
    join public.inv_fiscales f on f.id = h.fiscal_id
   where c.id = p_conteo;
  if v_tipo is null then raise exception 'Ese renglón ya no existe: actualiza la pantalla.'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Ese renglón es de un inventario fiscal: se corrige en el Control fiscal.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este cíclico ya está cerrado.'; end if;
  if v_cerrada is not null then raise exception 'Esa hoja ya envió su conteo: reábrela primero (botón «Reabrir») y después corrige.'; end if;
end $$;
revoke all on function public.inv_ciclico_bd_puede(uuid) from public, anon;
grant execute on function public.inv_ciclico_bd_puede(uuid) to authenticated;

create or replace function public.inv_ciclico_corregir(p_conteo uuid, p_cajas integer, p_unidades integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.inv_ciclico_bd_puede(p_conteo);
  if coalesce(p_cajas, 0) < 0 or coalesce(p_unidades, 0) < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if coalesce(p_cajas, 0) = 0 and coalesce(p_unidades, 0) = 0 then raise exception 'Para dejarlo en cero, mejor quita el renglón.'; end if;
  update public.inv_fiscal_conteos
     set estibas = null, saldo = null, cajas = coalesce(p_cajas, 0), unidades = nullif(coalesce(p_unidades, 0), 0)
   where id = p_conteo;
end $$;
revoke all on function public.inv_ciclico_corregir(uuid, integer, integer) from public, anon;
grant execute on function public.inv_ciclico_corregir(uuid, integer, integer) to authenticated;

create or replace function public.inv_ciclico_quitar(p_conteo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.inv_ciclico_bd_puede(p_conteo);
  delete from public.inv_fiscal_conteos where id = p_conteo;
end $$;
revoke all on function public.inv_ciclico_quitar(uuid) from public, anon;
grant execute on function public.inv_ciclico_quitar(uuid) to authenticated;

commit;
select 'OK · la BD del cíclico: se ve cada renglón y se puede corregir o quitar' as resultado;
