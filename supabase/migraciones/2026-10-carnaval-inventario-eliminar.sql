-- =====================================================================
-- CARNAVAL AG07 · INVENTARIO DIARIO · PODER ELIMINAR UN DÍA
--
-- Quien puede editar el Cuadre SAP puede eliminar la hoja de inventario de un día (la pantalla pide motivo y, si esa hoja hizo
-- ajustes de pallets, deja anularlos). Los movimientos nunca se borran: se anulan. Se puede correr varias veces.
-- =====================================================================
begin;

drop policy if exists carnaval_exis_del on public.carnaval_existencias;
create policy carnaval_exis_del on public.carnaval_existencias for delete
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');

grant delete on public.carnaval_existencias to authenticated;

commit;
