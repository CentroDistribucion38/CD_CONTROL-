-- =====================================================================
-- REASIGNAR UN ENVASE A RETORNO (Balance)
--
-- En el Balance, al cambiar el estado de un envase se puede escoger RETORNO (envase sano) además de BAJA / LAVADO /
-- EXTRASUCIO / ANDINA / HEINEKEN. La tabla balance_reclasificaciones solo aceptaba esos cinco; aquí se amplía la regla.
-- No toca datos. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.balance_reclasificaciones drop constraint if exists chk_estados;
alter table public.balance_reclasificaciones
  add constraint chk_estados check (estado_nuevo in ('BAJA', 'LAVADO', 'EXTRASUCIO', 'RETORNO', 'ANDINA', 'HEINEKEN'));

commit;
