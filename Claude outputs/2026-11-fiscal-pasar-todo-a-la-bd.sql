-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · lunes 09/11 · TODO LO CONTADO PASA A LA BD (nada en Borradores)
--
-- «Nada debe quedar en borrador: todo lo que se contó en el fiscal debe estar en la BD.»
--
-- Qué hace (todo o nada):
--   · Recorre las hojas de ese inventario fiscal. Todo sitio contado que todavía NO está en La base
--     (lo que hoy se ve en «Borradores») se pasa al recorrido FISCAL-…-Hnn de su hoja, enviado, para
--     que salga en la BD. Si la hoja no tenía recorrido (p. ej. la hoja 2), se crea.
--   · De cada módulo pasa UN solo conteo, para no contar dos veces el mismo piso: el que el fiscal dejó
--     como definitivo; si no escogió, el del operador; si el operador no contó ese sitio, el de Bavaria.
--     (Si cada persona contó un lado distinto del módulo, pasan los dos lados.)
--   · NO borra ni cambia nada de lo que ya está en La base (cantidades corregidas, códigos cambiados,
--     renglones «pasados»…). Las fotos y las marcas de «mezclado / sin acceso» viajan con lo que pasa.
--   · NO aprueba nada por el fiscal: las revisiones quedan como estaban. Lo que no cuadra entre las dos
--     personas sigue viéndose en el cruce; aquí solo se asegura que esté en La base.
--   · Si al final algo seguiría en Borradores, se detiene SIN cambiar nada y lo dice.
--
-- Se puede correr más de una vez: si ya no queda nada pendiente, avisa y no cambia nada.
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid; v_n int;
  h record; rg record;
  v_conteo uuid; v_bodega uuid; v_codigo text; v_yo uuid; v_lid uuid;
  v_ubis uuid[]; v_ren int; v_nuevo boolean;
  v_total int := 0; v_hojas int := 0; v_quedan int;
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales
   where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;

  for h in select x.id, x.numero, x.conteo_id from public.inv_fiscal_hojas x where x.fiscal_id = v_fiscal order by x.numero loop
    -- ¿Hay algo contado en esta hoja que todavía no esté en La base?
    if not exists (
      select 1 from public.inv_fiscal_conteos c
       where c.hoja_id = h.id
         and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id)
    ) then continue; end if;

    v_conteo := h.conteo_id; v_nuevo := false;
    v_yo := coalesce(auth.uid(), (select m.user_id from public.inv_fiscal_miembros m where m.hoja_id = h.id order by m.equipo limit 1));

    if v_conteo is null then
      select u.bodega_id into v_bodega
        from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
       where c.hoja_id = h.id order by c.contado_en limit 1;
      v_codigo := 'FISCAL-' || to_char(date '2026-11-09', 'YYYYMMDD') || '-H' || lpad(h.numero::text, 2, '0');
      if exists (select 1 from public.conteos where codigo = v_codigo) then
        v_codigo := v_codigo || '-' || substr(h.id::text, 1, 4);
      end if;
      insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
      values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
              ((date '2026-11-09'::timestamp + interval '12 hours') at time zone 'America/Bogota'),
              'Inventario fiscal · Hoja ' || h.numero || ' · todo lo contado pasado a La base (un conteo por módulo: el definitivo, o el del operador)')
      returning id into v_conteo;
      update public.inv_fiscal_hojas set conteo_id = v_conteo where id = h.id;
      v_nuevo := true;
    end if;

    v_ubis := '{}'; v_ren := 0;
    for rg in
      select c.id as cid, c.ubicacion_id, c.producto_id, c.estibas, c.cajas, c.saldo, c.unidades, c.venc_dia, c.venc_mes, c.venc_anio,
             c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en, c.contado_por, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
             coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0) as total
        from public.inv_fiscal_conteos c
        join public.productos p on p.id = c.producto_id
       where c.hoja_id = h.id
         and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = v_conteo and cl.ubicacion_id = c.ubicacion_id)
         -- Un conteo por módulo: el definitivo; y si ese equipo no anotó este lado exacto, se toma lo que sí hay.
         and (c.equipo = public.inv_fiscal_equipo_definitivo(h.id, c.ubicacion_id)
              or not exists (select 1 from public.inv_fiscal_conteos c2
                              where c2.hoja_id = h.id and c2.ubicacion_id = c.ubicacion_id
                                and c2.equipo = public.inv_fiscal_equipo_definitivo(h.id, c.ubicacion_id)))
       order by c.contado_en
    loop
      insert into public.conteo_lineas
        (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, unidades, venc_dia, venc_mes, venc_anio,
         rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en, pnc_rotulo, pnc_bloqueo_mecanico)
      values (v_conteo, rg.producto_id, rg.ubicacion_id, rg.estibas, rg.cajas, rg.saldo, rg.unidades, rg.venc_dia, rg.venc_mes, rg.venc_anio,
              null, rg.averia, rg.pnc, rg.estado_envase, rg.nota, rg.total, coalesce(rg.contado_por, v_yo), rg.contado_en, rg.pnc_rotulo, rg.pnc_bloqueo_mecanico)
      returning id into v_lid;
      insert into public.conteo_fotos (linea_id, conteo_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
      select v_lid, v_conteo, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
        from public.inv_fiscal_fotos f where f.conteo_id = rg.cid;
      v_ubis := v_ubis || rg.ubicacion_id;
      v_ren := v_ren + 1;
    end loop;

    -- «Mezclado / sin acceso» de los sitios que acaban de pasar (si todavía no estaban marcados en La base).
    insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_por, marcado_en)
    select v_conteo, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.user_id, m.marcado_en
      from public.inv_fiscal_modulos m
      join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
     where m.hoja_id = h.id and m.ubicacion_id = any (v_ubis)
       and mi.equipo = public.inv_fiscal_equipo_definitivo(h.id, m.ubicacion_id)
       and not exists (select 1 from public.conteo_modulos cm where cm.conteo_id = v_conteo and cm.ubicacion_id = m.ubicacion_id);

    if v_nuevo then
      update public.conteos cn
         set iniciado_en = coalesce((select min(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.iniciado_en),
             cerrado_en  = coalesce((select max(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.cerrado_en)
       where cn.id = v_conteo;
    end if;

    raise notice 'Hoja %: % renglones pasaron a La base.', h.numero, v_ren;
    v_total := v_total + v_ren; v_hojas := v_hojas + 1;
  end loop;

  -- ¿Queda algo en Borradores? (lo contado en el fiscal que sigue sin estar en La base)
  select count(*) into v_quedan
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas x on x.id = c.hoja_id
   where x.fiscal_id = v_fiscal
     and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = x.conteo_id and cl.ubicacion_id = c.ubicacion_id);
  if v_quedan > 0 then
    raise exception 'Después de pasar todo todavía quedarían % renglones sin estar en La base: no se cambió nada. Avísame.', v_quedan;
  end if;

  if v_total = 0 then
    raise notice 'No había nada pendiente: todo lo contado en el fiscal ya está en La base.';
  else
    raise notice 'Listo: % renglones de % hojas pasaron a La base. Borradores queda en 0.', v_total, v_hojas;
  end if;
end $$;

commit;

-- Cómo quedó: lo que hay en La base por hoja del fiscal.
select h.numero as hoja, c.codigo as recorrido, c.estado, count(cl.id) as renglones
  from public.inv_fiscal_hojas h
  join public.inv_fiscales f on f.id = h.fiscal_id
  left join public.conteos c on c.id = h.conteo_id
  left join public.conteo_lineas cl on cl.conteo_id = c.id
 where f.fecha = date '2026-11-09' and f.nombre ilike '%NOVIEMBRE%2026%'
 group by h.numero, c.codigo, c.estado
 order by h.numero;
