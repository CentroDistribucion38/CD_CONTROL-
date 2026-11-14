-- =====================================================================
-- SEGURIDAD · CERTIFICACIONES — RESPONSABLES CON CÉDULA
-- Del Interventor ABI y del Coordinador de la contratista solo se pide el nombre y la cédula.
-- Se puede correr varias veces.
-- =====================================================================
alter table public.seg_responsables add column if not exists cedula text;
notify pgrst, 'reload schema';
