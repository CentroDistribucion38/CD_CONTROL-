-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA · EMPAQUE DE CADA PRODUCTO
--
-- No todo producto va en caja plástica: algunos van en cartón. Aquí se deja definido, producto por producto,
-- cómo va empacado, para que el análisis sume (o no) su caja plástica:
--   CARTON    va en cartón: no suma caja plástica.
--   PLASTICA  va en la caja plástica `caja` (código del maestro de Pasivos): suma esa caja.
-- Lo que no esté aquí sigue la regla de siempre (maestro de productos → envase → caja; si no, por presentación).
--
-- Mismo permiso que la pantalla del análisis. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.analisis_dif_empaque (
  sku             text primary key,
  empaque         text not null check (empaque in ('CARTON', 'PLASTICA')),
  caja            text,
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  constraint analisis_dif_empaque_caja check (empaque <> 'PLASTICA' or caja is not null)
);

alter table public.analisis_dif_empaque enable row level security;
drop policy if exists analisis_dif_empaque_ver on public.analisis_dif_empaque;
create policy analisis_dif_empaque_ver on public.analisis_dif_empaque for select
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') <> 'ninguno');
drop policy if exists analisis_dif_empaque_ins on public.analisis_dif_empaque;
create policy analisis_dif_empaque_ins on public.analisis_dif_empaque for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_empaque_upd on public.analisis_dif_empaque;
create policy analisis_dif_empaque_upd on public.analisis_dif_empaque for update
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_empaque_del on public.analisis_dif_empaque;
create policy analisis_dif_empaque_del on public.analisis_dif_empaque for delete
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
grant select, insert, update, delete on public.analisis_dif_empaque to authenticated;

commit;
