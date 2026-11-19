-- =====================================================================
-- TRASPASOS → CASCO DE VIDRIO: LOS ALMACENES CON SU NOMBRE DE SAP
--
-- Va DESPUÉS de 2026-11-traspasos-materiales-casco.sql.
--
-- Cuando facturación da el aval de un viaje con casco, Traspasos sigue
-- viéndose normal (FABRICA, BODEGA 38, CARNAVAL), pero en Casco de vidrio ›
-- Movimientos registrados el movimiento se escribe como se lleva la data:
--   FABRICA   → AG18 EER Fábrica
--   BODEGA 38 → AG22 EER Barranquilla
--   CARNAVAL  → AG07 Alm. Bodega Carnaval
-- (el nombre sale del maestro de Casco de vidrio de esa tabla de Control).
-- También corrige los movimientos que ya se crearon desde Traspasos.
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- El almacén de Casco de vidrio (con su nombre de SAP) que corresponde a una tabla de Control:
-- del maestro de movimientos si está (origen para la salida; receptor y si no cliente para la llegada),
-- y si no, el nombre de la ubicación (que ya es el de SAP: «AG22 EER Barranquilla»).
create or replace function public.traspasos_casco_almacen(p_ubic text, p_origen boolean)
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public
as $$
  select z.id, z.nombre from (
    select mm.id, mm.nombre, case when mm.tipo = 'cliente' then 1 else 0 end as pref, mm.orden
      from public.casco_mov_maestro mm
     where mm.ubicacion = p_ubic and mm.activo
       and (case when p_origen then mm.tipo = 'origen' else mm.tipo in ('receptor', 'cliente') end)
    union all
    select null::uuid, u.nombre, 2, null from public.casco_ubicaciones u where u.clave = p_ubic
  ) z
  where p_ubic is not null
  order by z.pref, z.orden nulls last
  limit 1
$$;
revoke all on function public.traspasos_casco_almacen(text, boolean) from public, anon;

create or replace function public.traspasos_materiales_al_aval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.traspasos_viaje_materiales%rowtype;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_o text; v_d text; v_oid uuid; v_did uuid; v_mov uuid;
begin
  /* EL AVAL: el viaje recibe su DOC. */
  if old.salida_en is null and new.salida_en is not null then
    for m in select * from public.traspasos_viaje_materiales where viaje = new.id and aplicado_en is null loop
      /* En Casco de vidrio el movimiento se escribe como se lleva la data de SAP: FABRICA = «AG18 EER Fábrica»,
         BODEGA 38 = «AG22 EER Barranquilla», CARNAVAL = «AG07 Alm. Bodega Carnaval» (no como se llaman en Traspasos). */
      select x.id, x.nombre into v_oid, v_o from public.traspasos_casco_almacen(m.ubic_origen, true) x;
      select x.id, x.nombre into v_did, v_d from public.traspasos_casco_almacen(m.ubic_destino, false) x;
      if v_o is null then select nombre into v_o from public.traspasos_puntos where clave = new.origen; end if;
      if v_d is null then select nombre into v_d from public.traspasos_puntos where clave = new.destino; end if;
      insert into public.casco_movimientos
        (fecha, origen_id, destino_id, origen, destino, ubic_origen, ubic_destino, sku, estibas, entrega, placa, afecta, creado_por)
      values
        (v_hoy, v_oid, v_did, coalesce(v_o, new.origen, '—'), coalesce(v_d, new.destino, '—'), m.ubic_origen, m.ubic_destino,
         m.sku, m.estibas, new.factura_documento, new.placa, true, auth.uid())
      returning id into v_mov;
      if m.ubic_destino is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_destino, m.sku, m.estibas); end if;
      if m.ubic_origen is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_origen, m.sku, -m.estibas); end if;
      update public.traspasos_viaje_materiales
         set aplicado_en = now(), aplicado_fecha = v_hoy, casco_mov = v_mov
       where id = m.id;
    end loop;

  /* REABRIR LA SALIDA: lo descontado vuelve, hoy. */
  elsif old.salida_en is not null and new.salida_en is null then
    for m in select * from public.traspasos_viaje_materiales where viaje = new.id and aplicado_en is not null loop
      if m.ubic_origen is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_origen, m.sku, m.estibas); end if;
      if m.ubic_destino is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_destino, m.sku, -m.estibas); end if;
      if m.casco_mov is not null then delete from public.casco_movimientos where id = m.casco_mov; end if;
      update public.traspasos_viaje_materiales set aplicado_en = null, aplicado_fecha = null, casco_mov = null where id = m.id;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.traspasos_materiales_al_aval() from public, anon, authenticated;

-- LOS QUE YA ESTÁN: los movimientos creados desde Traspasos, con el nombre de SAP.
update public.casco_movimientos c
   set origen_id  = coalesce(o.id, c.origen_id),
       origen     = coalesce(o.nombre, c.origen),
       destino_id = coalesce(d.id, c.destino_id),
       destino    = coalesce(d.nombre, c.destino)
  from public.traspasos_viaje_materiales t
  left join lateral public.traspasos_casco_almacen(t.ubic_origen, true) o on true
  left join lateral public.traspasos_casco_almacen(t.ubic_destino, false) d on true
 where t.casco_mov = c.id;

commit;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.casco_movimientos c join public.traspasos_viaje_materiales t on t.casco_mov = c.id;
  raise notice '----------------------------------------------------------';
  raise notice 'movimientos de Traspasos con nombre de SAP ... %', v_n;
  raise notice '----------------------------------------------------------';
end $$;
