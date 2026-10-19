-- =====================================================================
-- REASIGNAR UN ENVASE A ANDINA / HEINEKEN (Balance)
--
-- En el Balance, al reasignar un envase se puede escoger ANDINA o HEINEKEN además de BAJA / LAVADO / EXTRASUCIO.
-- La tabla balance_reclasificaciones solo aceptaba esos tres; aquí se amplía la regla. No toca datos.
-- Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.balance_reclasificaciones drop constraint if exists chk_estados;
alter table public.balance_reclasificaciones
  add constraint chk_estados check (estado_nuevo in ('BAJA', 'LAVADO', 'EXTRASUCIO', 'ANDINA', 'HEINEKEN'));

commit;
