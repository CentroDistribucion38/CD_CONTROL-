-- =====================================================================
-- INVENTARIO · MAESTRO · CAJA PLÁSTICA DE CADA PRODUCTO
--
-- Amarra cada producto terminado con la caja plástica en la que va, tal como lo dice el «Maestro Sku vs Caja»
-- de la cervecería (2026.10.20 actualizado: 117 productos, 5 tipos de caja). Queda como columna `caja_sku` de `productos`
-- (se ve y se corrige en Inventario · Maestro) y el Análisis de diferencia la usa para sumar la caja de lo contado.
--
-- Se puede correr varias veces. Lo último que devuelve es la VALIDACIÓN: si no sale ninguna fila, todo quedó amarrado.
-- =====================================================================
alter table public.productos add column if not exists caja_sku text;

drop table if exists _maestro_caja;
create temp table _maestro_caja (sku text primary key, caja text not null);
insert into _maestro_caja (sku, caja) values
  ('11635','3500159'),
  ('11812','3500159'),
  ('11815','3500231'),
  ('12257','3500159'),
  ('12260','3500231'),
  ('12273','3500159'),
  ('12275','3500159'),
  ('12503','3500159'),
  ('13451','3500159'),
  ('14588','3500159'),
  ('14779','3500159'),
  ('14968','3500159'),
  ('15012','3500159'),
  ('15781','3501211'),
  ('17349','3500159'),
  ('17349P','3500159'),
  ('19954P','3501224'),
  ('20205','3501224'),
  ('20251P','3500159'),
  ('20282','3500159'),
  ('20546','3501224'),
  ('20867','3500159'),
  ('20867P','3500159'),
  ('20877','3500374'),
  ('20877P','3500374'),
  ('21145','3501211'),
  ('21156','3500159'),
  ('21165P','3500159'),
  ('21182','3500159'),
  ('21184','3500159'),
  ('21186','3500374'),
  ('21187','3500374'),
  ('2160','3500159'),
  ('2160P','3500159'),
  ('2182','3500159'),
  ('2183','3500231'),
  ('21871P','3500159'),
  ('21872P','3500159'),
  ('22124P','3500159'),
  ('22244P','3501224'),
  ('22272','3500159'),
  ('2228','3500159'),
  ('22363P','3500159'),
  ('22512','3500159'),
  ('22513P','3500159'),
  ('22613','3500159'),
  ('22613P','3500159'),
  ('22615','3500159'),
  ('22643','3500159'),
  ('23223','3500159'),
  ('23424','3500159'),
  ('2511','3500159'),
  ('2512','3500159'),
  ('2634','3500159'),
  ('2772','3500159'),
  ('2912','3500159'),
  ('2986','3500159'),
  ('3035','3500159'),
  ('3059','3500159'),
  ('3078','3500159'),
  ('3128','3500159'),
  ('3130','3500231'),
  ('3139','3500159'),
  ('3157','3500159'),
  ('3162','3500159'),
  ('3198','3500159'),
  ('3485','3500159'),
  ('3514','3500159'),
  ('3518','3500231'),
  ('3583','3500374'),
  ('3617','3500231'),
  ('3647','3500159'),
  ('3658','3500374'),
  ('3659','3500374'),
  ('3664','3500374'),
  ('3734','3500374'),
  ('3751','3500159'),
  ('3759','3500159'),
  ('3760','3500159'),
  ('3785','3500159'),
  ('3910','3500374'),
  ('4773','3500159'),
  ('5049','3500159'),
  ('5119','3500159'),
  ('5354','3500231'),
  ('5428','3500374'),
  ('5726','3500159'),
  ('5727','3500374'),
  ('5768','3500231'),
  ('6002','3500374'),
  ('6029','3500374'),
  ('6117','3500159'),
  ('7167','3500159'),
  ('7872','3500231'),
  ('7928','3500159'),
  ('8228','3500374'),
  ('8814','3500159'),
  ('8830','3500159'),
  ('8880','3500159'),
  ('9139','3501224'),
  ('9142','3500159'),
  ('9143','3500159'),
  ('9150','3501224'),
  ('9480','3501211'),
  ('9482','3501211'),
  ('9484','3501211'),
  ('9494','3501211'),
  ('9551','3500159'),
  ('9675','3500159'),
  ('9798','3500159'),
  ('9800','3500159'),
  ('9801','3500159'),
  ('9802','3500159'),
  ('9845','3500159'),
  ('9845P','3500159'),
  ('9846','3500159'),
  ('9847','3500159');

update public.productos p set caja_sku = f.caja, actualizado_en = now()
from _maestro_caja f where p.sku = f.sku and p.caja_sku is distinct from f.caja;

-- VALIDACIÓN: lo que queda por fuera
select problema, codigo, detalle from (
  select 1 as o, 'Está en el maestro de la cervecería y NO en productos' as problema, f.sku as codigo, f.caja as detalle
    from _maestro_caja f where not exists (select 1 from public.productos p where p.sku = f.sku)
  union all
  select 2, 'La caja no existe como material en productos', f.caja, string_agg(f.sku, ', ' order by f.sku)
    from _maestro_caja f where not exists (select 1 from public.productos p where p.sku = f.caja) group by f.caja
  union all
  select 3, 'Producto activo en botella SIN caja', p.sku, p.nombre
    from public.productos p
   where p.tipo_material = 'PRODUCTO' and p.activo and p.tipo_envase ilike 'botella%' and p.caja_sku is null
  union all
  select 4, 'Unidades por caja del producto ≠ las de su caja', p.sku, p.nombre || ' · ' || p.unidades_por_caja || ' u vs ' || c.nombre
    from public.productos p join public.productos c on c.sku = p.caja_sku
   where p.unidades_por_caja is not null
     and substring(c.nombre from '(?i)x\s*(\d+)\s*$') is not null
     and p.unidades_por_caja <> substring(c.nombre from '(?i)x\s*(\d+)\s*$')::int
) t order by o, codigo;
