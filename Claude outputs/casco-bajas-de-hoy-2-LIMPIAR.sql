-- =====================================================================
-- CASCO · BAJAS DE HOY · PASO 2 — QUITAR LOS RESTOS (solo BODEGA 38, solo estas 6 celdas)
--
-- Del paso 1 salió: no queda nada en el libro de bajas ni en el historial, pero 6 celdas de
-- AG22 EER Barranquilla conservan el ÚLTIMO «+N» de la baja que se subió y nunca se devolvió
-- (se ve en la cuenta: …+65+4-65-4+65+4-65-4+65). Aquí se quita ese último término de la
-- cuenta y se resta del inventario, y se recalcula el HL. Nada más se toca.
--
-- Seguridad:
--   · primero guarda una copia de esas 6 celdas (tabla casco_respaldo_bajas_hoy);
--   · cada celda solo se corrige si su cuenta TERMINA exactamente en ese «+N»;
--     si no termina así, no la toca.
-- Para volver atrás: ver el final del archivo.
-- Se corre completo, una sola vez (si se corre dos veces, la segunda no cambia nada).
-- =====================================================================
create table if not exists public.casco_respaldo_bajas_hoy as
  select now() as respaldado_en, r.* from public.casco_registros r where false;

insert into public.casco_respaldo_bajas_hoy
select now(), r.*
  from public.casco_registros r
 where r.fecha = (now() at time zone 'America/Bogota')::date
   and r.ubicacion = 'BODEGA 38'
   and r.sku in ('3500005', '3500162', '3500446', '3501225', '3501226', '3501430')
   and not exists (select 1 from public.casco_respaldo_bajas_hoy z where z.id = r.id);

with resto(sku, n) as (values
  ('3500005', 65::numeric), ('3500162', 48.22), ('3500446', 8), ('3501225', 10.51),
  ('3501226', 16), ('3501430', 18)
)
update public.casco_registros r set
  inventario = r.inventario - x.n,
  inv_expr   = nullif(left(r.inv_expr, length(r.inv_expr) - length('+' || trim_scale(x.n)::text)), ''),
  baja_expr  = nullif(regexp_replace(coalesce(r.baja_expr, ''), '(-0)+$', ''), ''),
  hl         = round((r.inventario - x.n + coalesce(r.baja, 0)) * r.hl_estiba, 4),
  actualizado_en = now()
from resto x
where r.fecha = (now() at time zone 'America/Bogota')::date
  and r.ubicacion = 'BODEGA 38'
  and r.sku = x.sku
  and r.hl_estiba is not null
  and r.inv_expr like '%+' || trim_scale(x.n)::text;

-- RESULTADO: antes (la copia) y ahora. Las 6 deben decir «CORREGIDA».
select r.sku,
       z.inventario as antes, r.inventario as ahora,
       case when z.inventario <> r.inventario then 'CORREGIDA' else 'NO TOCADA' end as estado,
       r.inv_expr as cuenta_ahora
  from public.casco_registros r
  join public.casco_respaldo_bajas_hoy z on z.id = r.id
 where r.fecha = (now() at time zone 'America/Bogota')::date and r.ubicacion = 'BODEGA 38'
 order by r.sku;

-- PARA VOLVER ATRÁS (solo si hiciera falta; deja las celdas como estaban antes de este archivo):
-- update public.casco_registros r set inventario = z.inventario, inv_expr = z.inv_expr, baja_expr = z.baja_expr,
--        hl = z.hl, actualizado_en = now()
--   from public.casco_respaldo_bajas_hoy z where z.id = r.id;
