-- SOLO LEE. Las cuentas completas de las celdas dudosas (en la pantalla salen cortadas), una cifra por renglón,
-- junto a las bajas que el libro tiene de cada una. Mándame el resultado.
select r.ubicacion, r.sku, r.inventario, r.baja, 'inv_expr' as cuenta, t.n, t.termino
  from public.casco_registros r,
       lateral (select row_number() over () as n, m[1] || m[2] as termino
                  from regexp_matches(coalesce(r.inv_expr, ''), '([+-]?)(\d+(?:\.\d+)?)', 'g') as m) t
 where r.fecha = date '2026-10-22'
   and ((r.ubicacion = 'BODEGA 38' and r.sku in ('3500162', '3500213', '3500446')))
union all
select b.ubicacion, b.sku, null, null, 'BAJA DEL LIBRO', null,
       format('%s est. · %s unidades · doc %s · %s · %s', b.estibas, b.unidades, coalesce(b.documento, '—'), coalesce(b.texto, '—'), b.destino)
  from public.casco_bajas b
 where b.fecha = date '2026-10-22' and b.ubicacion = 'BODEGA 38' and b.sku in ('3500162', '3500213', '3500446')
order by 2, 5, 6;
