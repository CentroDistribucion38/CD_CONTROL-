-- =====================================================================
-- GESTIÓN · TABLERO CON 5W EN RELEVO (Sup OL → Coord OL → Sup AB → OPL)
--
-- Agrega, sin borrar nada:
--   gestion_analisis.paso     en qué estación del relevo va el 5W (1 Sup OL · 2 Coord OL · 3 Sup AB · 4 OPL)
--   gestion_analisis.relevos  la historia de los pases: [{ "de": 1, "a": 2, "en": "...", "por": "uuid" }]
--   gestion_analisis.opl      la lección de un punto con la que se cierra
--   gestion_acciones.tipo     'correctiva' o 'preventiva'
-- Correr DESPUÉS de 2026-10-gestion-5why-plan.sql. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.gestion_analisis add column if not exists paso smallint not null default 1;
alter table public.gestion_analisis add column if not exists relevos jsonb not null default '[]'::jsonb;
alter table public.gestion_analisis add column if not exists opl text not null default '';
do $$ begin
  alter table public.gestion_analisis add constraint gestion_analisis_paso_ck check (paso between 1 and 4);
exception when duplicate_object then null; end $$;

alter table public.gestion_acciones add column if not exists tipo text not null default 'correctiva';
do $$ begin
  alter table public.gestion_acciones add constraint gestion_acciones_tipo_ck check (tipo in ('correctiva', 'preventiva'));
exception when duplicate_object then null; end $$;

commit;
notify pgrst, 'reload schema';
