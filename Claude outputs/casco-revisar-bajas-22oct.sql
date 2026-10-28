-- =====================================================================
-- CASCO · REVISAR LAS BAJAS DEL 22/10 (SOLO LEE: no cambia nada)
-- Pégalo entero en el SQL Editor de Supabase y dale Run. Cambia la fecha de abajo si es otro día.
-- Devuelve dos tipos de filas:
--   DUPLICADA  = la misma baja (documento, almacén, código, texto y unidades) guardada más de una vez.
--   DESCUADRE  = la cuenta de la celda de Control no tiene la baja las veces que debería
--                (faltan_o_sobran > 0: falta sumarla; < 0: está de más).
-- Mándame el resultado y con eso te doy el arreglo exacto, celda por celda.
-- =====================================================================
with p as (select date '2026-10-22' as dia),

-- Lo que hay en el libro de bajas ese día, por celda (sitio + código) y por estibas.
bj as (
  select b.fecha, b.ubicacion, b.sku, b.destino, b.estibas, count(*) as n
    from public.casco_bajas b, p
   where b.fecha = p.dia
   group by 1, 2, 3, 4, 5
),
-- Cada término «+N» / «-N» que tiene la cuenta de cada celda (la primera cifra, sin signo, es positiva).
term as (
  select r.fecha, r.ubicacion, r.sku, 'inventario'::text as col, m[1] as sg, m[2]::numeric as v
    from public.casco_registros r, p,
         lateral regexp_matches(coalesce(r.inv_expr, ''), '([+-]?)(\d+(?:\.\d+)?)', 'g') as m
   where r.fecha = p.dia
  union all
  select r.fecha, r.ubicacion, r.sku, 'baja', m[1], m[2]::numeric
    from public.casco_registros r, p,
         lateral regexp_matches(coalesce(r.baja_expr, ''), '([+-]?)(\d+(?:\.\d+)?)', 'g') as m
   where r.fecha = p.dia
),
-- Cuántas veces quedó puesta de verdad cada baja en la cuenta (inventario suma «+N»; baja resta «-N»).
cuenta as (
  select bj.*, coalesce((
           select sum(case when bj.destino = 'inventario'
                           then case when t.sg = '-' then -1 else 1 end
                           else case when t.sg = '-' then 1 else -1 end end)
             from term t
            where t.fecha = bj.fecha and t.ubicacion = bj.ubicacion and t.sku = bj.sku
              and t.col = case when bj.destino = 'inventario' then 'inventario' else 'baja' end
              and t.v = bj.estibas), 0) as puesta
    from bj
)
select 'DESCUADRE'::text as tipo, c.ubicacion, c.sku,
       format('baja de %s est. (%s en el libro) · puesta %s vez/veces en la cuenta de %s', c.estibas, c.n, c.puesta, c.destino) as detalle,
       (c.n - c.puesta)::numeric as faltan_o_sobran,
       r.inventario, r.baja, r.inv_expr, r.baja_expr
  from cuenta c
  left join public.casco_registros r on r.fecha = c.fecha and r.ubicacion = c.ubicacion and r.sku = c.sku
 where c.n <> c.puesta
union all
select 'DUPLICADA', b.centro, b.sku,
       format('documento %s · %s · %s unidades · %s filas en %s archivo(s) · ids: %s',
              coalesce(b.documento, '—'), coalesce(b.texto, '—'), b.unidades, count(*),
              count(distinct b.archivo_id), string_agg(b.id::text, ', ' order by b.creado_en)),
       (count(*) - 1)::numeric, null, null, null, null
  from public.casco_bajas b, p
 where b.fecha = p.dia
 group by b.centro, b.sku, b.documento, b.texto, b.unidades, b.clase
having count(*) > 1
order by 1, 3, 2;
