-- =====================================================================
-- CD38 · Datos de ejemplo (opcional). Ejecutar DESPUÉS de schema.sql.
-- Borra este archivo antes de usar la plantilla en producción real.
-- =====================================================================

insert into public.bodegas (codigo, nombre, direccion) values
  ('BG-01', 'Bodega principal', 'Soledad, Atlántico'),
  ('BG-02', 'Bodega tránsito',  'Barranquilla, Atlántico')
on conflict (codigo) do nothing;

insert into public.productos (sku, codigo_barras, nombre, categoria, unidad, costo_unitario, stock_min) values
  ('SKU-0001', '7700000000011', 'Guante de nitrilo talla M',   'EPP',        'PAR',  4200,  50),
  ('SKU-0002', '7700000000028', 'Casco de seguridad blanco',   'EPP',        'UND', 28000,  20),
  ('SKU-0003', '7700000000035', 'Cinta de embalaje 48mm',      'Empaque',    'ROLL', 3100, 100),
  ('SKU-0004', '7700000000042', 'Estiba plástica 1.2x1.0',     'Logística',  'UND', 92000,  15),
  ('SKU-0005', '7700000000059', 'Rollo stretch film 500mm',    'Empaque',    'ROLL',18500,  30)
on conflict (sku) do nothing;

-- Carga inicial como movimientos de entrada (alimenta el kardex y las existencias)
insert into public.movimientos (tipo, producto_id, bodega_id, cantidad, costo_unitario, referencia, nota)
select 'entrada', p.id, b.id, v.cant, p.costo_unitario, 'CARGA-INICIAL', 'Seed de ejemplo'
from public.productos p
cross join lateral (select id from public.bodegas where codigo = 'BG-01') b
join (values
  ('SKU-0001', 240),
  ('SKU-0002', 35),
  ('SKU-0003', 180),
  ('SKU-0004', 12),
  ('SKU-0005', 64)
) as v(sku, cant) on v.sku = p.sku
where not exists (
  select 1 from public.movimientos m where m.referencia = 'CARGA-INICIAL' and m.producto_id = p.id
);
