-- =====================================================================
-- REASIGNAR UN ENVASE A NUEVO (Balance)
--
-- En el Balance (y en la hoja Consolidado) se puede pasar un envase a NUEVO además de BAJA / LAVADO / EXTRASUCIO /
-- RETORNO / ANDINA / HEINEKEN. La tabla balance_reclasificaciones no lo aceptaba; aquí se amplía la regla.
-- No toca datos. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.balance_reclasificaciones drop constraint if exists chk_estados;
alter table public.balance_reclasificaciones
  add constraint chk_estados check (estado_nuevo in ('BAJA', 'LAVADO', 'EXTRASUCIO', 'RETORNO', 'NUEVO', 'ANDINA', 'HEINEKEN'));

commit;
