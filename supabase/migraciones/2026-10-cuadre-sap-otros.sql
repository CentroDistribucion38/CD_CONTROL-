-- =====================================================================
-- CUADRE SAP · OTROS (Andina…)
--
-- «Andina viene del estado OTROS y puede estar asociado a cualquier envase: muéstrame qué tengo
--  de Andina u otros y yo te digo a qué envase lo asignamos para que sume.»
--
-- Por día: { id del renglón del conteo: código del envase | 'NO' (no sumar) }.
-- Una línea que no está aquí suma al código con que se contó.
--
-- Se puede correr varias veces.
-- =====================================================================
alter table public.cuadre_sap add column if not exists otros jsonb;

-- =====================================================================
-- LA BASE CON LO RECLASIFICADO EN EL BALANCE
--
-- «En el balance hago reclasificaciones y cambios de estado: eso se debe reflejar en la base para
--  que cuando baje y exporte el consolidado se vea como en realidad es.»
-- Quien ve La base (y exporta el consolidado) puede LEER las reclasificaciones, aunque no tenga el
-- Balance. Solo leer: reclasificar sigue siendo del Balance.
-- =====================================================================
drop policy if exists bal_reclas_ver_base on public.balance_reclasificaciones;
create policy bal_reclas_ver_base on public.balance_reclasificaciones for select
  using (public.mi_nivel_pantalla('/inventario/base') <> 'ninguno');
