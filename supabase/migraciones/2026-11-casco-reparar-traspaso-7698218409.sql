-- =====================================================================
-- REPARAR (una sola vez): el -36 de Fábrica del traspaso 7698218409
--
-- El 18 nov el traspaso 7698218409 (placa SNR719) sacó 36 estibas de
-- 3500162 de Fábrica hacia Carnaval. Carnaval quedó con su +36, pero el
-- -36 de Fábrica se borró al guardar Control a las 23:37 con saldos viejos.
-- Esto vuelve a restar las 36 en Fábrica ese día, SOLO si Fábrica sigue
-- en 128,22 (el saldo sin el descuento): correrlo dos veces no resta dos
-- veces.
-- =====================================================================
do $$
declare v_inv numeric; v_ubic text; v_fecha date;
begin
  select t.ubic_origen, t.aplicado_fecha into v_ubic, v_fecha
    from public.traspasos_viaje_materiales t
    join public.traspasos_viajes v on v.id = t.viaje
   where v.factura_documento = '7698218409' and t.sku = '3500162' and t.aplicado_en is not null
   limit 1;
  if v_ubic is null then raise exception 'No encontré el traspaso 7698218409 con 3500162 aplicado.'; end if;

  select inventario into v_inv from public.casco_registros where fecha = v_fecha and ubicacion = v_ubic and sku = '3500162';
  if round(coalesce(v_inv, 0), 2) <> 128.22 then
    raise notice 'Fábrica (3500162, %) está en %, no en 128,22: no se toca (ya se corrigió o cambió). Revisa antes de restar a mano.', v_fecha, v_inv;
    return;
  end if;

  perform public.casco_aplicar_delta(v_fecha, v_ubic, '3500162', -36);
  select inventario into v_inv from public.casco_registros where fecha = v_fecha and ubicacion = v_ubic and sku = '3500162';
  raise notice 'Listo: Fábrica (3500162, %) quedó en % (128,22 - 36).', v_fecha, v_inv;
end $$;
