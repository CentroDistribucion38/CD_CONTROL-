-- =====================================================================
-- CUADRE SAP · HISTÓRICO DE BALANCEOS
--
-- «Necesito un botón para ir guardando mis balanceos por día; ya yo veo si quiero editarlo o no,
--  pero es para llevar dentro del Cuadre SAP mi histórico.»
--
-- El botón «Guardar balanceo del día» congela en el renglón de ese día cómo quedó el cuadre (las
-- cifras de cada material, el resumen y el porqué de cada ajuste), con quién y cuándo. Volver a
-- guardar reemplaza lo guardado. Lo de en vivo (ZEXI, movimientos, OTROS…) sigue igual.
--
-- Se puede correr varias veces.
-- =====================================================================
alter table public.cuadre_sap add column if not exists cierre         jsonb;
alter table public.cuadre_sap add column if not exists cerrado_en     timestamptz;
alter table public.cuadre_sap add column if not exists cerrado_por    uuid;
alter table public.cuadre_sap add column if not exists cerrado_nombre text;
