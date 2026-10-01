-- =====================================================================
-- EL MISMO MATERIAL EN EL MISMO MÓDULO, CON OTRO «ESTADO DEL ENVASE»,
-- NO ES UN DUPLICADO.
--
-- Caso real: en un módulo de capacidad 80 hay 50 de un envase NUEVO,
-- 10 LAVADO y 20 EXTRASUCIO. Son tres renglones de verdad (el mismo SKU,
-- el mismo módulo, la misma fecha) y la base los rechazaba como «ya
-- existe uno igual» porque la llave única no miraba el estado.
--
-- Ahora el estado es parte de la llave: solo es duplicado lo que repite
-- material + módulo + vencimiento + avería + PNC + ESTADO. Sin estado
-- (vacío) sigue valiendo como un estado más: dos renglones sin estado del
-- mismo material en el mismo sitio y fecha siguen siendo duplicado, que es
-- lo que ya pasaba (por eso `nulls not distinct`).
--
-- Se puede aplicar las veces que sea: si la llave ya incluye el estado,
-- no toca nada.
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'conteo_lineas_unico'
       and indexdef like '%estado_envase%'
  ) then
    drop index if exists public.conteo_lineas_unico;
    create unique index conteo_lineas_unico on public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, venc_dia, venc_mes, venc_anio, averia, pnc, estado_envase)
      nulls not distinct;
  end if;
end $$;
