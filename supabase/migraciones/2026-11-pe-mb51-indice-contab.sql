-- Plan vs notificado: la consulta de la MB51 por fecha de contabilización se pasaba del tiempo («statement timeout»)
-- en Cruce a la hora y Validación del día. Índice para filtrar por día y clase y paginar en orden.
create index if not exists pe_mb51_contab_clase_id on public.pe_mb51 (fecha_contab, clase, id);
analyze public.pe_mb51;
