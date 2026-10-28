-- =====================================================================
-- CASCO · QUITAR LO QUE QUEDÓ REPETIDO EN CONTROL AL BORRAR Y VOLVER A SUBIR UNA BAJA (22/10)
-- Qué pasó: borraste la baja del libro (sin «Deshacer»), la cantidad se quedó en la celda de Control,
-- y al subirla otra vez se sumó de nuevo. Aquí se resta lo que sobra, una cifra por celda.
--
-- PASO A PASO (no cambia nada hasta que tú lo digas):
--   1. Corre este archivo TAL CUAL: el resultado muestra cada celda, lo que tiene hoy y lo que quedaría.
--   2. Compara «queda_en» con tu conteo (Balance, hoja Baja · Bodega 38, estibas del físico).
--   3. Si cuadra, cambia  false  por  true  en la línea «aplicar» y córrelo otra vez.
--
-- Cada fila de abajo dice: sitio, código, estibas de la baja y CUÁNTAS VECES sobra.
--   Solo está lista la del 3500162 (35 est. de más dos veces = subida tres veces).
--   El 3500213 (1 est.) y el 3500446 (4 est.) quedan en 0 porque ese número también lo pudiste digitar tú:
--   si estás seguro de que sobran, cambia el 0 por las veces.
-- =====================================================================
with p as (select false as aplicar),
a(ubicacion, sku, estibas, veces) as (
  values ('BODEGA 38', '3500162', 35::numeric, 2),
         ('BODEGA 38', '3500213',  1::numeric, 0),
         ('BODEGA 38', '3500446',  4::numeric, 0)
),
hecho as (
  update public.casco_registros r
     set inventario = r.inventario - a.estibas * a.veces,
         inv_expr   = coalesce(r.inv_expr, '') || repeat('-' || trim_scale(a.estibas)::text, a.veces),
         hl         = round((r.inventario - a.estibas * a.veces + coalesce(r.baja, 0)) * coalesce(r.hl_estiba, public.casco_hl_estiba(r.sku), 0), 4),
         actualizado_en = now()
    from a, p
   where p.aplicar and a.veces > 0
     and r.fecha = date '2026-10-22' and r.ubicacion = a.ubicacion and r.sku = a.sku
     and r.inventario - a.estibas * a.veces >= 0          -- nunca deja el inventario negativo
     and exists (select 1 from public.casco_bajas b       -- y solo si el libro tiene esa baja
                  where b.fecha = r.fecha and b.ubicacion = r.ubicacion and b.sku = r.sku
                    and b.destino = 'inventario' and b.estibas = a.estibas)
  returning r.sku
)
select a.ubicacion, a.sku, a.estibas as estibas_de_la_baja, a.veces as veces_que_sobra,
       r.inventario as tiene_hoy,
       case when a.veces = 0 then 'sin cambio'
            when r.inventario - a.estibas * a.veces < 0 then 'NO SE PUEDE: quedaría negativo'
            else (r.inventario - a.estibas * a.veces)::text end as queda_en,
       (select aplicar from p) as aplicar_activado,
       (select count(*) from hecho) as celdas_cambiadas_ahora,
       r.inv_expr
  from a
  left join public.casco_registros r on r.fecha = date '2026-10-22' and r.ubicacion = a.ubicacion and r.sku = a.sku
 order by a.sku;
