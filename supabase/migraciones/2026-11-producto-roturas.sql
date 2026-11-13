-- =====================================================================
-- INVENTARIO · PRODUCTO · ANÁLISIS DE DIFERENCIA · ROTURAS DE PRODUCTO TERMINADO
--
-- «En el conteo debe sumar lo de la rotura de producto terminado, así como lo tenemos en el otro análisis de
--  diferencia: lo trae de acuerdo al rango y, si uno quiere, lo modifica. Exacto lo mismo.»
--
-- El producto que se rompió (o se contaminó) en sitio ya no está en la bodega y SAP todavía lo tiene: suma al
-- CONTEO de su código. Por defecto, del 1 del mes al día del cíclico (el rango se cambia en la pantalla).
-- Cajas (rotas + contaminadas) × unidades por caja del producto. Las anuladas no cuentan.
--
--   · prod_dif_roturas_pt(desde, hasta): por código, cajas rotas, contaminadas y cuántos reportes.
--   · prod_dif_roturas: la cantidad corregida a mano de un código en un cíclico (sin fila = vale lo calculado).
--
-- Necesita 2026-11-producto-ciclico.sql y el módulo de Roturas. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.prod_dif_roturas (
  fiscal_id       uuid not null references public.inv_fiscales(id) on delete cascade,
  codigo          text not null,
  unidades        numeric(16,2) not null check (unidades >= 0),
  nota            text,
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  primary key (fiscal_id, codigo)
);
alter table public.prod_dif_roturas enable row level security;
drop policy if exists prod_dif_roturas_ver on public.prod_dif_roturas;
create policy prod_dif_roturas_ver on public.prod_dif_roturas for select using (public.mi_nivel_pantalla('/inventario/producto/analisis') <> 'ninguno');
drop policy if exists prod_dif_roturas_ins on public.prod_dif_roturas;
create policy prod_dif_roturas_ins on public.prod_dif_roturas for insert with check (public.mi_nivel_pantalla('/inventario/producto/analisis') = 'editar');
drop policy if exists prod_dif_roturas_upd on public.prod_dif_roturas;
create policy prod_dif_roturas_upd on public.prod_dif_roturas for update using (public.mi_nivel_pantalla('/inventario/producto/analisis') = 'editar');
drop policy if exists prod_dif_roturas_del on public.prod_dif_roturas;
create policy prod_dif_roturas_del on public.prod_dif_roturas for delete using (public.mi_nivel_pantalla('/inventario/producto/analisis') = 'editar');
grant select, insert, update, delete on public.prod_dif_roturas to authenticated;

drop function if exists public.prod_dif_roturas_pt(date, date);
create function public.prod_dif_roturas_pt(p_desde date, p_hasta date)
returns table (codigo text, rotas bigint, contaminadas bigint, reportes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.mi_nivel_pantalla('/inventario/producto/analisis') = 'ninguno' then
    raise exception 'Ver las roturas del análisis requiere el permiso «Análisis de diferencia» de Producto (Roles)';
  end if;
  return query
  select btrim(r.material::text), sum(coalesce(r.unidades, 0))::bigint, sum(coalesce(r.contaminadas, 0))::bigint, count(*)::bigint
    from public.roturas r
   where r.tipo::text = 'producto_terminado'
     and r.estado::text <> 'anulada'
     and (r.reportada_en at time zone 'America/Bogota')::date between p_desde and p_hasta
     and coalesce(btrim(r.material::text), '') <> ''
   group by btrim(r.material::text);
end $$;
revoke all on function public.prod_dif_roturas_pt(date, date) from public, anon;
grant execute on function public.prod_dif_roturas_pt(date, date) to authenticated;

commit;
select 'OK · las roturas de producto terminado suman al CONTEO del análisis de Producto' as resultado;
