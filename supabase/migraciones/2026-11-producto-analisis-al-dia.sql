-- =====================================================================
-- INVENTARIO · PRODUCTO · EL ANÁLISIS AMARRADO A LA BD
--
-- «Cuando yo modifique algún conteo (en la BD) o de más, se debe actualizar de una todo el flujo donde se usa ese dato.»
--
-- El análisis de diferencia se guarda como una foto (prod_dif_guardado). Ahora, si después se corrige, quita o agrega
-- un renglón en la BD del cíclico, la foto se vuelve a armar sola con lo de ahora, y con ella los ajustes, el análisis
-- final y el histórico. Para eso la foto recuerda:
--   · ro_desde / ro_hasta: el rango de roturas con que se armó (para volver a armarla igual).
--   · actualizado_en: la última vez que se puso al día con la BD.
--
-- Sin este SQL también se pone al día, pero con el rango de roturas de siempre (del 1 del mes al día del cíclico).
-- Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.prod_dif_guardado add column if not exists ro_desde date;
alter table public.prod_dif_guardado add column if not exists ro_hasta date;
alter table public.prod_dif_guardado add column if not exists actualizado_en timestamptz;

notify pgrst, 'reload schema';
commit;
