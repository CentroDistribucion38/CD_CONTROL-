-- =====================================================================
-- CASCO DE VIDRIO · EL HISTORIAL IMPORTADO DE «PARTIR» CON EL FACTOR BUENO
--
-- La hoja PARTIR del Excel calculaba el HL con dos fórmulas equivocadas, y
-- la app importó ese HL tal cual (renglones con origen = 'importado'):
--
--   · 250 cc (3501225 Flint, 3501226 Ámbar) en BODEGA 38 y CARNAVAL:
--     45 × 30 botellas × 0,0025 = 3,375 HL por estiba. El maestro dice
--     38 botellas por caja → 4,275. Se multiplica por 38/30.
--     En FÁBRICA la hoja ya usaba 38, salvo unos días viejos de 3501225
--     que dan exacto con 30 y no con 38: solo esos se corrigen.
--   · 750R (3500383 Flint, 3500373 Marrón) en CARNAVAL: 36 × 0,0075 =
--     0,27 por estiba, le faltaba × 16 botellas por caja → 4,32. × 16.
--
-- Lo tecleado en la app (origen = 'registro') NO se toca: ese ya se
-- calcula con el maestro.
--
-- CORRER DESPUÉS de 2026-10-casco-factor-250cc-maestro.sql.
-- Se puede correr dos veces: cada renglón corregido queda marcado en la
-- nota y no se vuelve a multiplicar.
-- =====================================================================
begin;

do $bloque$
begin
  if public.casco_hl_estiba('3501225') is distinct from 4.275
     or public.casco_hl_estiba('3501226') is distinct from 4.275 then
    raise exception 'Corre primero 2026-10-casco-factor-250cc-maestro.sql: los 250 cc todavía no salen con 4,275 HL por estiba.';
  end if;
end $bloque$;

with a_corregir as (
  select r.id,
         case
           when r.sku in ('3501225', '3501226') and r.ubicacion in ('BODEGA 38', 'CARNAVAL')
             then 38.0 / 30
           when r.sku in ('3501225', '3501226') and r.ubicacion = 'FABRICA'
                and mod(r.hl, 3.375) = 0 and mod(r.hl, 4.275) <> 0
             then 38.0 / 30
           when r.sku in ('3500383', '3500373') and r.ubicacion = 'CARNAVAL'
             then 16
         end as k
    from public.casco_registros r
   where r.origen = 'importado'
     and r.hl <> 0
     and coalesce(r.nota, '') not like '%[factor corregido]%'
)
update public.casco_registros r
   set hl = round(r.hl * a.k, 4),
       hl_estiba = public.casco_hl_estiba(r.sku),
       inventario = round(round(r.hl * a.k, 4) / nullif(public.casco_hl_estiba(r.sku), 0), 2),
       nota = coalesce(r.nota, '') || ' [factor corregido]',
       actualizado_en = now()
  from a_corregir a
 where a.id = r.id and a.k is not null;

do $bloque$
declare n int;
begin
  select count(*) into n from public.casco_registros where nota like '%[factor corregido]%';
  raise notice 'LISTO: % renglón(es) del historial quedaron con el factor del maestro.', n;
end $bloque$;

commit;

-- ---------------------------------------------------------------------
-- PARA COMPARAR CON EL EXCEL: el último día de cada sitio, total y por
-- material. Mándame una captura de este resultado.
-- ---------------------------------------------------------------------
with ultimo as (
  select ubicacion, max(fecha) as fecha from public.casco_registros group by ubicacion
)
select r.ubicacion, r.fecha, r.sku,
       coalesce(r.inventario, 0) + coalesce(r.baja, 0) as estibas,
       r.hl_estiba, r.hl, r.origen,
       sum(r.hl) over (partition by r.ubicacion) as total_sitio
  from public.casco_registros r
  join ultimo u on u.ubicacion = r.ubicacion and u.fecha = r.fecha
 where r.hl <> 0
 order by r.ubicacion, r.sku;
