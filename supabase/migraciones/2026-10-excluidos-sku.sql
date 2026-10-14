-- =====================================================================
-- CUADRE SAP / PASIVOS · LOS SKU QUE NO ENTRAN (se escogen en un toolbox)
--
-- «Que esos SKU no entren como quemados: que yo pueda seleccionar en un toolbox con filtro de
--  código. Siempre van a estar seleccionados los que dijimos, pero que no me amarre solo a esos.»
--
-- Los de siempre (barril, 412644, 412671, 412707 y, en AG22, la estiba 3500163) los sigue poniendo
-- la app. Aquí solo se guarda lo que el usuario cambia:
--   · fuera = true  → ese SKU se saca (aunque no sea de los de siempre).
--   · fuera = false → ese SKU vuelve a entrar (aunque sea de los de siempre).
-- ámbito AG18 = el cuadre SAP de AG18 · ámbito AG22 = el cuadre SAP de AG22 y la base de Pasivos.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.excluidos_sku (
  ambito      text not null check (ambito in ('AG18', 'AG22')),
  codigo      text not null,
  fuera       boolean not null,
  nombre      text,
  puesto_en   timestamptz not null default now(),
  puesto_por  uuid default auth.uid(),
  primary key (ambito, codigo)
);

alter table public.excluidos_sku enable row level security;
drop policy if exists excluidos_sku_ver on public.excluidos_sku;
create policy excluidos_sku_ver on public.excluidos_sku for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/balance/pasivos') <> 'ninguno');
drop policy if exists excluidos_sku_ins on public.excluidos_sku;
create policy excluidos_sku_ins on public.excluidos_sku for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists excluidos_sku_upd on public.excluidos_sku;
create policy excluidos_sku_upd on public.excluidos_sku for update
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists excluidos_sku_del on public.excluidos_sku;
create policy excluidos_sku_del on public.excluidos_sku for delete
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');

grant select, insert, update, delete on public.excluidos_sku to authenticated;

commit;
