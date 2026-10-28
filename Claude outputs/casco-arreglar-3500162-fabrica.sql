-- =====================================================================
-- CASCO · ARREGLO 1 (el único que está comprobado): 3500162 en AG18 Fábrica, 22/10
-- El libro de bajas tiene la baja de 0,78 est. (documento 6359067689) una vez, pero la cuenta de la celda
-- la quitó dos veces al deshacer y re-subir: quedó en 117,00 y debe quedar en 117,78.
-- Se puede correr varias veces: solo actúa si la celda sigue en 117,00.
-- =====================================================================
begin;

-- Antes
select fecha, ubicacion, sku, inventario, baja, hl, inv_expr
  from public.casco_registros
 where fecha = date '2026-10-22' and ubicacion = 'FABRICA' and sku = '3500162';

update public.casco_registros
   set inventario = inventario + 0.78,
       inv_expr   = public.casco_agregar_termino(inv_expr, inventario, 0.78),
       hl         = round((inventario + 0.78 + coalesce(baja, 0)) * coalesce(hl_estiba, public.casco_hl_estiba(sku), 0), 4),
       actualizado_en = now()
 where fecha = date '2026-10-22' and ubicacion = 'FABRICA' and sku = '3500162'
   and inventario = 117.00
   and exists (select 1 from public.casco_bajas b
                where b.fecha = date '2026-10-22' and b.ubicacion = 'FABRICA' and b.sku = '3500162'
                  and b.destino = 'inventario' and b.estibas = 0.78);

-- Después
select fecha, ubicacion, sku, inventario, baja, hl, inv_expr
  from public.casco_registros
 where fecha = date '2026-10-22' and ubicacion = 'FABRICA' and sku = '3500162';

commit;
