-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA · PASO 3: ANÁLISIS FINAL
--
-- «Análisis 1, luego ajuste, luego me debe dar el análisis final con los ajustes realizados para ver cómo
--  queda; guardar eso, y el 4 histórico.»
--   analisis_dif_obs       + comp_hecha (la compensación R ↔ NR ya se hizo en SAP) y ajuste_hecho (cuánto
--                          del ajuste se hizo; vacío = no se ha hecho).
--   analisis_dif_guardado  + final (la foto del análisis final), final_en y final_por.
--
-- Corre DESPUÉS de 2026-10-analisis-diferencia-ajustes.sql. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.analisis_dif_obs add column if not exists comp_hecha boolean not null default false;
alter table public.analisis_dif_obs add column if not exists ajuste_hecho numeric(16,2);

alter table public.analisis_dif_guardado add column if not exists final jsonb;
alter table public.analisis_dif_guardado add column if not exists final_en timestamptz;
alter table public.analisis_dif_guardado add column if not exists final_por uuid;

commit;
