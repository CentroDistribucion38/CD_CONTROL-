-- =====================================================================
-- TRASPASOS › PET · LOS VIAJES DE PET DE ANTES (sin SKU)
--
-- «Y sale que no hay, cuando sí ha habido viajes.» La vista solo traía los Vhs registrados con su SKU (desde que
-- Registrar lo pide). Los de antes son viajes del tipo PET sin renglones de SKU: ahora entran también, como
-- «Sin formato», con su carga en estibas. Así PET y Programar cuentan TODOS los Vhs de PET.
-- Se puede correr varias veces.
-- =====================================================================
create or replace view public.v_traspasos_pet with (security_invoker = true) as
select x.id, x.viaje, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time as hora,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen)   as origen,
       coalesce(pd.nombre, v.destino_texto, v.destino) as destino,
       x.sku, coalesce(p.nombre, x.sku) as descripcion,
       coalesce(x.formato_ml, public.traspasos_formato_ml(p.nombre, p.contenido)) as formato_ml,
       x.estibas,
       round(x.estibas * p.cajas_por_estiba, 0)              as pacas,
       round(x.estibas * public.casco_hl_estiba(x.sku), 2)  as hl
  from public.traspasos_viaje_pet x
  join public.traspasos_viajes v on v.id = x.viaje and v.estado = 'registrado'
  left join public.productos p on p.sku = x.sku
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
union all
/* Los viajes del tipo PET que no tienen SKU (los de antes): un renglón por viaje, sin formato. */
select v.id, v.id, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen),
       coalesce(pd.nombre, v.destino_texto, v.destino),
       '' as sku, 'Sin SKU' as descripcion,
       null::integer as formato_ml,
       coalesce(v.carga, 0)::numeric(12,2) as estibas,
       null::numeric as pacas, null::numeric as hl
  from public.traspasos_viajes v
  join public.traspasos_tipos t on t.clave = v.tipo
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino
 where v.estado = 'registrado' and coalesce(v.vacio, false) = false
   and (t.materiales = 'pet' or t.clave = 'pet' or t.nombre ilike 'pet' or t.nombre ilike 'pet %')
   and not exists (select 1 from public.traspasos_viaje_pet x where x.viaje = v.id);
grant select on public.v_traspasos_pet to authenticated;

notify pgrst, 'reload schema';

do $$
declare n int; s int;
begin
  select count(*) filter (where sku = ''), count(*) filter (where sku <> '') into n, s from public.v_traspasos_pet;
  raise notice 'Vhs de PET sin SKU (de antes): % · renglones con SKU: %', n, s;
end $$;
