-- =====================================================================
-- CASCO DE VIDRIO · FACTOR DE LAS BOTELLAS DE 250 cc (3501225 y 3501226)
--
-- «3501225 BOTELLA FLINT 250 CC con 4 + 34 estibas debe dar 128,3 de HL y me da 162,45.»
--
-- QUÉ PASABA: el maestro de inventario trae 38 botellas por caja para estas dos referencias, y la hoja
-- CASCO del Excel multiplica la estiba por 45 cajas × 30 botellas × 0,0025 HL = 3,375 HL por estiba
-- (38 estibas → 128,25). Con 45 × 38 = 1.710 botellas por estiba la app daba 4,275 por estiba (162,45).
--
-- QUÉ SE HACE: SOLO PARA EL CASCO, estas dos referencias se miden con 1.350 botellas por estiba, como el
-- Excel. Se guarda como un «cajón» de casco (casco_extras), que manda sobre el maestro SOLO en Casco de
-- vidrio: el maestro de inventario y los conteos no se tocan. Para volver al maestro, basta borrar esas
-- dos filas de casco_extras.
--
-- Después recalcula el HL de lo que ya está guardado (registros tecleados en la app). Lo que vino de la
-- hoja PARTIR (solo trae el HL total) no se toca.
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $reemplazado$ begin
  raise exception 'Este archivo quedó reemplazado por 2026-10-casco-factor-250cc-maestro.sql: no se corre (el 250 cc va con el factor del maestro, 38 botellas por caja).';
end $reemplazado$;

insert into public.casco_extras (sku, nombre, unidades_por_estiba, hl_unidad)
select v.sku, coalesce(p.nombre, v.nombre), 1350, 0.0025
  from (values ('3501225', 'BOTELLA FLINT 250 CC'), ('3501226', 'BOTELLA MARRON 250 CC')) v(sku, nombre)
  left join public.productos p on p.sku = v.sku
on conflict (sku) do update
  set unidades_por_estiba = excluded.unidades_por_estiba, hl_unidad = excluded.hl_unidad, activo = true;

update public.casco_registros r
   set hl_estiba = public.casco_hl_estiba(r.sku),
       hl = round((coalesce(r.inventario, 0) + coalesce(r.baja, 0)) * public.casco_hl_estiba(r.sku), 4),
       actualizado_en = now()
 where r.sku in ('3501225', '3501226')
   and r.origen = 'registro'
   and r.inventario is not null;

commit;

select e.sku, e.nombre, e.unidades_por_estiba as botellas_por_estiba, e.hl_unidad,
       public.casco_hl_estiba(e.sku) as hl_por_estiba
  from public.casco_extras e where e.sku in ('3501225', '3501226');
