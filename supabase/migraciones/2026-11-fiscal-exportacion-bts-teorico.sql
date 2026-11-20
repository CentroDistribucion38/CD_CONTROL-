-- =====================================================================
-- INVENTARIO FISCAL 09/11 · EXPORTACIÓN (AG17) Y BTS (AG16) AL TEÓRICO DE SAP
--
-- «Necesito crear otras dos planillas donde lleves el último conteo de bodega Exportación y BTS, y lo lleves en la planilla
--  al teórico.» Dos hojas nuevas en el FISCAL del 09/11:
--      · «Exportación · AG17» (ubicación EXPORTACION1): 3500159 Caja Plástica Café 330cc X 30 · 37.337
--                                                        3500163 Estiba Cerv Madera                · 830
--      · «BTS · AG16»         (ubicación BTS1):         3500005 Envase Costeñita 175R             · 28.728 (756 cajas × 38)
--                                                        3500163 Estiba Cerv Madera                · 491
--                                                        3501211 Caja Plástica Marrón 1000cc x13   · 16.848
--                                                        3501226 Botella Marrón 250 cc             · 5.130 (135 cajas × 38)
-- Un renglón por código con el TOTAL GENERAL de SAP (libre + control de calidad + bloqueado), sin marca. El operador y Bavaria
-- con el mismo conteo (no hay diferencia), la ubicación aprobada, la hoja culminada y pasada a La base. La pareja queda en
-- blanco para firmar a mano (la nota «Teórico SAP» le dice a la planilla que no ponga nombres).
--
-- Se puede correr varias veces: si las hojas ya existen, no hace nada. Todo en una sola transacción: si algo no cuadra, no
-- cambia nada.
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid; v_quien uuid; v_num int; v_hoja uuid; v_ubi uuid; v_prod uuid; v_upc int; v_cajas int; v_sueltas int;
  h record; r record; v_n int := 0;
begin
  select id, creado_por into v_fiscal, v_quien
    from public.inv_fiscales where tipo = 'FISCAL' and fecha = date '2026-11-09'
   order by creado_en desc limit 1;
  if v_fiscal is null then raise exception 'No encontré el inventario FISCAL del 09/11.'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where fiscal_id = v_fiscal and nombre in ('Exportación · AG17', 'BTS · AG16')) then
    raise notice 'Las hojas «Exportación · AG17» y «BTS · AG16» ya existen en el fiscal del 09/11: no se toca nada.';
    return;
  end if;
  /* Consolidar pide el permiso del fiscal: se hace con el usuario que creó el inventario. */
  perform set_config('request.jwt.claims', json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

  for h in select * from (values ('Exportación · AG17', 'EXPORTACION', 'EXPORTACION1', 1), ('BTS · AG16', 'BTS', 'BTS1', 2)) t(nombre, calle, ubi, orden) order by orden
  loop
    select id into v_ubi from public.ubicaciones where clave = h.ubi;
    if v_ubi is null then raise exception 'No existe la ubicación %.', h.ubi; end if;
    select coalesce(max(numero), 0) + 1 into v_num from public.inv_fiscal_hojas where fiscal_id = v_fiscal;
    insert into public.inv_fiscal_hojas (fiscal_id, numero, calle, nombre)
    values (v_fiscal, v_num, h.calle, h.nombre) returning id into v_hoja;

    for r in select * from (values
        ('Exportación · AG17', '3500159', 37337), ('Exportación · AG17', '3500163', 830),
        ('BTS · AG16', '3500005', 28728), ('BTS · AG16', '3500163', 491), ('BTS · AG16', '3501211', 16848), ('BTS · AG16', '3501226', 5130)
      ) t(hoja, sku, unidades) where t.hoja = h.nombre
    loop
      select id, coalesce(nullif(unidades_por_caja, 0), 1) into v_prod, v_upc from public.productos where sku = r.sku;
      if v_prod is null then raise exception 'No existe el producto %.', r.sku; end if;
      /* En cajas completas y sueltas (lo que no completa una caja), igual que Contar; el total queda en unidades exactas. */
      v_cajas := r.unidades / v_upc; v_sueltas := r.unidades % v_upc;
      insert into public.inv_fiscal_conteos (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, cajas, unidades, nota, contado_en)
      select v_fiscal, v_hoja, e.eq, v_quien, v_ubi, v_prod, v_cajas, nullif(v_sueltas, 0),
             'Teórico SAP ' || split_part(h.nombre, ' · ', 2) || ' · ' || replace(to_char(r.unidades, 'FM999,999,999'), ',', '.') || ' un.',
             (date '2026-11-09' + time '12:00') at time zone 'America/Bogota'
        from (values ('OL'), ('BAVARIA')) e(eq);
      v_n := v_n + 1;
    end loop;

    /* La ubicación aprobada (los dos lados iguales), la hoja terminada y culminada, y a La base. */
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, nota, aprobado_por, aprobado_en, compensado)
    values (v_hoja, v_ubi, 'APROBADA', 0, 'Teórico SAP: último conteo de la bodega llevado al teórico', v_quien, now(), false);
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (v_hoja, v_quien) on conflict do nothing;
    update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = v_quien where id = v_hoja;
    perform public.inv_fiscal_consolidar(v_hoja);
    raise notice 'Hoja % «%»: lista, aprobada y en La base.', v_num, h.nombre;
  end loop;
  raise notice '% renglones por lado (operador y Bavaria).', v_n;
end $$;

commit;

-- Para ver cómo quedaron:
select h.numero, h.nombre, p.sku, p.nombre as material, c.equipo, c.cajas, c.unidades as sueltas,
       c.cajas * coalesce(nullif(p.unidades_por_caja, 0), 1) + coalesce(c.unidades, 0) as total_unidades
  from public.inv_fiscal_hojas h
  join public.inv_fiscal_conteos c on c.hoja_id = h.id
  join public.productos p on p.id = c.producto_id
 where h.nombre in ('Exportación · AG17', 'BTS · AG16')
 order by h.numero, p.sku, c.equipo desc;
