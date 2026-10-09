-- =====================================================================
-- INVENTARIO · VIDA ÚTIL DEL ENVASE: 365 DÍAS
--
-- «Si ya pusimos en el envase la fecha de fabricación, calculemos la de
--  vencimiento.» → 365 días.
--
-- El envase toma su fabricación = recepción (la pone la base, ver
-- 2026-10-inventario-fifo-envase.sql) y el vencimiento = recepción + vida
-- útil del Maestro. Los envases no tenían vida útil: aquí se les pone 365
-- a los que no la tengan. Al que ya tenga una, no se le toca. Después se
-- puede cambiar material por material en el Maestro.
-- Se puede correr dos veces.
-- =====================================================================
update public.productos
   set vida_util = 365
 where tipo_material = 'ENVASE'
   and coalesce(vida_util, 0) <= 0;

select p.sku, p.nombre, p.vida_util
  from public.productos p
 where p.tipo_material = 'ENVASE'
 order by p.sku;
