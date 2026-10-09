-- =====================================================================
-- CASCO DE VIDRIO · LOS 250 cc VUELVEN AL FACTOR DEL MAESTRO (3501225 y 3501226)
--
-- «Estás mal, mira»: el maestro de inventario dice para el 250 cc
-- factor estibado 45 cajas × 38 botellas por caja × 0,0025 HL = 4,275 HL
-- por estiba (1.710 botellas). 2026-10-casco-factor-250cc.sql había puesto
-- un «cajón» de casco con 1.350 botellas (30 por caja) para copiar la hoja
-- de Bodega 38 y Carnaval del Excel; ese 30 era el error del Excel, no del
-- maestro.
--
-- QUÉ HACE:
--   1. Borra esos dos cajones de casco_extras: el factor vuelve a salir del
--      maestro (productos), que es el que manda.
--   2. Recalcula el HL de lo tecleado en Control para esos dos códigos.
--   3. Avisa si hay bajas importadas con el factor viejo: esas guardaron
--      las estibas con 1.350 botellas; se corrigen deshaciendo el archivo
--      en Registrar → Baja y volviéndolo a subir.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

delete from public.casco_extras
 where sku in ('3501225', '3501226')
   and unidades_por_estiba = 1350;

update public.casco_registros r
   set hl_estiba = public.casco_hl_estiba(r.sku),
       hl = round((coalesce(r.inventario, 0) + coalesce(r.baja, 0)) * public.casco_hl_estiba(r.sku), 4),
       actualizado_en = now()
 where r.sku in ('3501225', '3501226')
   and r.origen = 'registro'
   and r.inventario is not null;

do $bloque$
declare v1 numeric; v2 numeric; n int;
begin
  v1 := public.casco_hl_estiba('3501225'); v2 := public.casco_hl_estiba('3501226');
  if v1 is distinct from 4.275 or v2 is distinct from 4.275 then
    raise exception 'NO QUEDÓ: el maestro da % y % HL por estiba para los 250 cc (se esperaba 4,275). Revisa el maestro de esos códigos.', v1, v2;
  end if;
  select count(*) into n from public.casco_bajas
   where sku in ('3501225', '3501226') and botellas_estiba = 1350;
  if n > 0 then
    raise notice 'OJO: % fila(s) de bajas de 250 cc se importaron con 1.350 botellas por estiba. Deshaz ese archivo en Registrar → Baja y súbelo otra vez.', n;
  end if;
  raise notice 'LISTO: los 250 cc salen del maestro: 4,275 HL por estiba.';
end $bloque$;

commit;

select p.sku, p.nombre, public.casco_botellas_estiba(p.sku) as botellas_por_estiba,
       public.casco_hl_estiba(p.sku) as hl_por_estiba
  from public.productos p where p.sku in ('3501225', '3501226');
