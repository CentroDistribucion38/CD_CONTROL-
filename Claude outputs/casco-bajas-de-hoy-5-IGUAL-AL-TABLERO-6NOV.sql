-- =====================================================================
-- CASCO · DEJAR AG22 y AG18 IGUALES AL TABLERO DEL 6-NOV (el de ayer)
--
-- Fuente: «Detalle por almacén · Casco de vidrio por partir · al viernes 6 de noviembre de 2026»
-- (AG22 EER Barranquilla 1.132,2 HL · AG18 EER Fábrica 2.599,8 HL).
-- Pone, en los días 6 y 7 de noviembre, el inventario y la columna «con baja» de cada material
-- exactamente como en ese tablero. Solo corrige las celdas que NO coinciden (hoy: AG18 · 3501225
-- sobran 72 y AG18 · 3501226 sobran 36). A la cuenta de la celda le agrega el término que cuadra
-- (…-72 / …-36); el historial de la cuenta no se borra. Recalcula el HL.
-- LAS BAJAS QUE SÍ ESTÁN BIEN SE RESPETAN: a lo del tablero se le suma lo que hoy tiene el libro de bajas
-- (inventario: +estibas · columna «con baja»: −estibas) para ese día y ese material. O sea,
-- objetivo = tablero del 6-nov + bajas vigentes de ese día. Sirve corrido antes o después de subir el archivo,
-- y también si ya lo corriste antes (no duplica nada).
-- Si una celda ya coincide, no se toca. Si no existe, no se crea. Carnaval (AG07) y CA22 no se tocan.
--
-- Seguridad: copia primero las celdas de esos dos días en casco_respaldo_tablero_6nov.
-- Se corre completo, una sola vez.
-- =====================================================================
create table if not exists public.casco_respaldo_tablero_6nov as
  select now() as respaldado_en, r.* from public.casco_registros r where false;

insert into public.casco_respaldo_tablero_6nov
select now(), r.*
  from public.casco_registros r
 where r.ubicacion in ('BODEGA 38', 'FABRICA')
   and r.fecha in ((now() at time zone 'America/Bogota')::date - 1, (now() at time zone 'America/Bogota')::date)
   and not exists (select 1 from public.casco_respaldo_tablero_6nov z where z.id = r.id);

with objetivo(ubicacion, sku, inv, baja) as (values
  -- AG22 EER Barranquilla (BODEGA 38): inventario casco · extrasucio con baja
  ('BODEGA 38','3501225', 85.49, 0), ('BODEGA 38','3500887', 0, 74),   ('BODEGA 38','3500162', 42.78, 0),
  ('BODEGA 38','3501226', 14, 0),    ('BODEGA 38','3500213', 12, 0),   ('BODEGA 38','3500207', 7, 0),
  ('BODEGA 38','3500446', 7, 0),     ('BODEGA 38','3501430', 4, 0),    ('BODEGA 38','421887', 4, 0),
  ('BODEGA 38','3500005', 3, 0),     ('BODEGA 38','3500888', 1.99, 0), ('BODEGA 38','3500383', 1, 0),
  -- AG18 EER Fábrica (FABRICA): inventario casco · lavado con baja
  ('FABRICA','3500887', 112.01, 132), ('FABRICA','3500888', 94.01, 96), ('FABRICA','3501226', 40, 0),
  ('FABRICA','3500446', 37, 0),       ('FABRICA','ANDINA', 20.78, 0),   ('FABRICA','3501539', 12, 10),
  ('FABRICA','3501225', 3.78, 0),     ('FABRICA','HEINEKEN', 4, 0),     ('FABRICA','3500373', 2, 0),
  ('FABRICA','3500207', 1, 0),        ('FABRICA','3501430', 0.99, 0),   ('FABRICA','3500213', 0.82, 0),
  ('FABRICA','3500162', 0.22, 0)
),
libro as (                                 -- lo que las bajas vigentes aportan a cada celda
  select b.fecha, b.ubicacion, b.sku,
         sum(case when b.destino = 'inventario' then b.estibas else 0 end) as inv,
         sum(case when b.destino = 'baja' then b.signo * b.estibas else 0 end) as baja
    from public.casco_bajas b
   group by 1, 2, 3
),
viejo as (
  select r.id, o.inv + coalesce(l.inv, 0) as inv_obj, o.baja + coalesce(l.baja, 0) as baja_obj,
         coalesce(r.inventario, 0) as inv_ant, coalesce(r.baja, 0) as baja_ant
    from public.casco_registros r
    join objetivo o on o.ubicacion = r.ubicacion and o.sku = r.sku
    left join libro l on l.fecha = r.fecha and l.ubicacion = r.ubicacion and l.sku = r.sku
   where r.fecha in ((now() at time zone 'America/Bogota')::date - 1, (now() at time zone 'America/Bogota')::date)
     and r.hl_estiba is not null
     and (coalesce(r.inventario, 0) <> o.inv + coalesce(l.inv, 0) or coalesce(r.baja, 0) <> o.baja + coalesce(l.baja, 0))
)
update public.casco_registros r set
  inventario = v.inv_obj,
  inv_expr = case when v.inv_obj <> v.inv_ant
                  then public.casco_agregar_termino(r.inv_expr, v.inv_ant, v.inv_obj - v.inv_ant) else r.inv_expr end,
  baja = case when r.baja is null and v.baja_obj = 0 then null else v.baja_obj end,
  baja_expr = case when v.baja_obj <> v.baja_ant
                   then public.casco_agregar_termino(r.baja_expr, v.baja_ant, v.baja_obj - v.baja_ant) else r.baja_expr end,
  hl = round((v.inv_obj + v.baja_obj) * r.hl_estiba, 4),
  actualizado_en = now()
from viejo v
where r.id = v.id;

-- RESULTADO: cada celda que cambió (antes → ahora). Debe salir 3501225 y 3501226 de Fábrica.
select r.fecha, r.ubicacion, r.sku,
       z.inventario as inv_antes, r.inventario as inv_ahora,
       z.baja as baja_antes, r.baja as baja_ahora
  from public.casco_registros r
  join public.casco_respaldo_tablero_6nov z on z.id = r.id
 where r.inventario is distinct from z.inventario or r.baja is distinct from z.baja
 order by r.fecha, r.ubicacion, r.sku;

-- PARA VOLVER ATRÁS:
-- update public.casco_registros r set inventario = z.inventario, inv_expr = z.inv_expr, baja = z.baja,
--        baja_expr = z.baja_expr, hl = z.hl, actualizado_en = now()
--   from public.casco_respaldo_tablero_6nov z where z.id = r.id;
