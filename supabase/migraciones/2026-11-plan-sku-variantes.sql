-- =====================================================================
-- Plan vs notificado · SKU de las etiquetas cortas del instructivo
-- «Pok330» en TREN-2 es el Poker R 330 (2512), no el Poker NR de exportación USA (23223).
-- «PM» en TREN-2 es la Pony Malta R 330 (2182), no la EXP TW (2912).
-- La de exportación solo cuando la etiqueta trae su SAP («23223», «PM 2912») o dice EXP/USA/TW.
-- Corrige lo que ya se cargó; lo que se suba desde ahora ya sale bien. Se puede correr varias veces.
-- =====================================================================

update public.pe_plan_filas
   set sku = '2512', nombre = 'Poker R 330cc X 30'
 where sku = '23223' and coalesce(etiqueta, '') !~ '23223' and coalesce(etiqueta, '') !~* '(usa|exp|nr)';

update public.pe_plan_filas
   set sku = '2182', nombre = 'Pony Malta R 330cc X 30'
 where sku = '2912' and coalesce(etiqueta, '') !~ '2912' and coalesce(etiqueta, '') !~* '(exp|tw)';

-- Revisión: qué etiqueta quedó con qué SKU en TREN-2
select p.semana, f.tren, f.etiqueta, f.sku, f.nombre, round(sum(f.hl)) as hl
  from public.pe_plan_filas f join public.pe_planes p on p.id = f.plan_id
 where f.tren = 'TREN-2'
 group by 1, 2, 3, 4, 5 order by 1, 2, 3;
