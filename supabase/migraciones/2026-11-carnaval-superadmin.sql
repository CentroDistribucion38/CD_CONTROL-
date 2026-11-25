-- =====================================================================
-- AG07 · CARNAVAL — el SUPERADMINISTRADOR (rol que «manda») puede agregar códigos al maestro de Carnaval
-- (código, descripción, unidades por pallet, cc) desde Control. Los movimientos ya los deja la regla de siempre.
-- Se puede correr varias veces.
-- =====================================================================
drop policy if exists carnaval_prod_ins on public.carnaval_productos;
create policy carnaval_prod_ins on public.carnaval_productos for insert with check (public.manda());
drop policy if exists carnaval_prod_upd on public.carnaval_productos;
create policy carnaval_prod_upd on public.carnaval_productos for update using (public.manda()) with check (public.manda());
grant insert, update on public.carnaval_productos to authenticated;
notify pgrst, 'reload schema';
