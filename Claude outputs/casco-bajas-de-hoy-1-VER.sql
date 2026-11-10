-- =====================================================================
-- CASCO · BAJAS DE HOY · PASO 1 — SOLO MIRAR (no cambia nada)
--
-- Muestra, en una sola lista:
--   LIBRO    las bajas de HOY que todavía están en el registro de bajas
--            (si el "Deshacer" funcionó, aquí no sale ninguna).
--   ARCHIVO  los archivos de baja de hoy que siguen en el historial.
--   CELDA    las celdas de Control de HOY que NO cuadran con
--            "último saldo + movimientos/ajustes de hoy". Ahí están los
--            restos: lo que una baja dejó y el deshacer no devolvió.
--
-- Lectura de CELDA:
--   inv_hoy / baja_hoy     lo que tiene Control hoy.
--   inv_esperado / baja_esp lo que tendría sin bajas (saldo anterior ± movimientos de hoy).
--   dif_inv / dif_baja     hoy − esperado. Distinto de 0 = resto (o algo tecleado a mano hoy).
--   lote                   hora a la que se tocó la celda por última vez (las celdas de una misma
--                          subida o de un mismo deshacer comparten la hora exacta).
-- =====================================================================
with p as (select (now() at time zone 'America/Bogota')::date as hoy),
ult as (                                   -- último día ANTERIOR con registros, por sitio
  select r.ubicacion, max(r.fecha) as dia
    from public.casco_registros r, p where r.fecha < p.hoy group by r.ubicacion
),
ayer as (
  select r.ubicacion, r.sku, coalesce(r.inventario, 0) as inv, coalesce(r.baja, 0) as baja
    from public.casco_registros r join ult u on u.ubicacion = r.ubicacion and u.dia = r.fecha
),
mov as (                                   -- movimientos y ajustes de hoy que sí afectan Control
  select x.ubic, x.sku,
         sum(case when x.columna = 'inventario' then x.d else 0 end) as inv,
         sum(case when x.columna = 'baja' then x.d else 0 end) as baja
    from (
      select m.ubic_origen as ubic, m.sku, m.columna, -m.estibas as d
        from public.casco_movimientos m, p where m.fecha = p.hoy and m.afecta and m.ubic_origen is not null
      union all
      select m.ubic_destino, m.sku, m.columna, m.estibas
        from public.casco_movimientos m, p where m.fecha = p.hoy and m.afecta and m.ubic_destino is not null
    ) x group by x.ubic, x.sku
),
celdas as (
  select r.ubicacion, r.sku, r.id,
         coalesce(r.inventario, 0) as inv_hoy,
         coalesce(a.inv, 0) + coalesce(m.inv, 0) as inv_esp,
         coalesce(r.baja, 0) as baja_hoy,
         coalesce(a.baja, 0) + coalesce(m.baja, 0) as baja_esp,
         (a.sku is null) as sin_ayer,
         r.inv_expr, r.baja_expr, r.actualizado_en
    from public.casco_registros r
    join p on r.fecha = p.hoy
    left join ayer a on a.ubicacion = r.ubicacion and a.sku = r.sku
    left join mov  m on m.ubic = r.ubicacion and m.sku = r.sku
)
select * from (
  select 1 as orden, 'LIBRO' as tipo, b.ubicacion as sitio, b.sku,
         b.destino || ' · ' || b.estibas::text || ' est. · ' || coalesce(b.texto, '') as detalle,
         to_char(b.creado_en at time zone 'America/Bogota', 'HH24:MI:SS') as lote
    from public.casco_bajas b, p
   where b.fecha = p.hoy or (b.creado_en at time zone 'America/Bogota')::date = p.hoy
  union all
  select 2, 'ARCHIVO', '', '',
         a.nombre || ' · día de Control ' || a.dia_control::text || ' · ' || coalesce(a.aplicadas, 0)::text || ' filas',
         to_char(a.creado_en at time zone 'America/Bogota', 'HH24:MI:SS')
    from public.casco_archivos a, p
   where (a.creado_en at time zone 'America/Bogota')::date = p.hoy
  union all
  select 3, 'CELDA', c.ubicacion, c.sku,
         'inv_hoy ' || trim_scale(c.inv_hoy)::text || ' · inv_esperado ' || trim_scale(c.inv_esp)::text
           || ' · dif_inv ' || trim_scale(c.inv_hoy - c.inv_esp)::text
           || ' | baja_hoy ' || trim_scale(c.baja_hoy)::text || ' · baja_esp ' || trim_scale(c.baja_esp)::text
           || ' · dif_baja ' || trim_scale(c.baja_hoy - c.baja_esp)::text
           || case when c.sin_ayer then ' | NO existía ayer' else '' end
           || ' | cuenta inv: ' || coalesce(c.inv_expr, '—')
           || ' | cuenta baja: ' || coalesce(c.baja_expr, '—'),
         to_char(c.actualizado_en at time zone 'America/Bogota', 'HH24:MI:SS')
    from celdas c
   where c.inv_hoy <> c.inv_esp or c.baja_hoy <> c.baja_esp or c.sin_ayer
) z
order by orden, sitio, sku;
