-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · lunes 09/11 · TRES AJUSTES A LOS CONTEOS DE LAS PAREJAS
--
--   JAULA PNC · 21173 · añadir 4 estibas                      · pareja YESID – JAIRO
--   CH        · 23047 · sumarle 1 estiba a la posición        · pareja YURANIS – MELISSA
--   A15       · 22269 · cambiar el código 22265 por 22269     · pareja YURANIS – MELISSA
--
-- Cómo se aplican:
--   · SUMAR: se le suman las estibas al renglón de ese código en esa ubicación. Si el operador (OL) de la
--     pareja lo tiene, es el suyo (es el que vale en La base); si solo lo tiene Bavaria, el de Bavaria;
--     si nadie lo anotó, se crea el renglón nuevo con esas estibas para el operador.
--   · CAMBIAR: el código se corrige en TODOS los renglones de esa pareja en esa ubicación que tengan el código viejo.
--   · Se toca el inventario fiscal y, si ya pasó a La base, también allá, para que sigan cuadrando.
--   · Todo o nada: si algo no se encuentra o es ambiguo, se detiene SIN cambiar nada y dice cuál y por qué.
--
-- Córrelo UNA sola vez (las estibas se suman cada vez que se corre).
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid; v_n int;
  a record; rc record;
  v_hojas uuid[]; v_ubis uuid[]; v_prod uuid; v_prod2 uuid; v_cpe numeric; v_hechos int := 0;
  v_ids uuid[]; v_conteo uuid; v_ol uuid; v_hoja uuid; v_quien text; v_eq text;
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;

  alter table public.inv_fiscal_conteos disable trigger user;   -- una hoja finalizada no deja tocar sus renglones: se apaga solo mientras se ajusta

  for a in
    select * from (values
      (1, 'SUMAR',   'JAULAPNC', '21173', null::text, 4, 'yesid',   'jair'),
      (2, 'SUMAR',   'CH',       '23047', null::text, 1, 'yuranis', 'meliss'),
      (3, 'CAMBIAR', 'A15',      '22265', '22269',    0, 'yuranis', 'meliss')
    ) t(n, que, ubic, sku, sku_nuevo, estibas, p1, p2)
  loop
    select id into v_prod from public.productos where upper(btrim(sku)) = a.sku;
    if v_prod is null then raise exception 'Ajuste %: el código % no existe en el maestro de materiales.', a.n, a.sku; end if;

    -- Hojas de la pareja (las dos personas, por el principio de su nombre).
    v_hojas := array(
      select distinct m1.hoja_id from public.inv_fiscal_miembros m1
        join public.perfiles p1 on p1.id = m1.user_id and lower(replace(p1.nombre, ' ', '')) like a.p1 || '%'
        join public.inv_fiscal_miembros m2 on m2.hoja_id = m1.hoja_id
        join public.perfiles p2 on p2.id = m2.user_id and lower(replace(p2.nombre, ' ', '')) like a.p2 || '%'
       where m1.fiscal_id = v_fiscal and m1.user_id <> m2.user_id);
    if coalesce(array_length(v_hojas, 1), 0) = 0 then
      raise exception 'Ajuste %: no encuentro la pareja «% – %» en este inventario fiscal.', a.n, a.p1, a.p2;
    end if;

    -- Ubicaciones con ese nombre (con o sin lado IZQ/DER; sin guiones ni espacios).
    v_ubis := array(select id from public.ubicaciones
                     where regexp_replace(upper(regexp_replace(clave, '_(IZQ|DER)$', '')), '[^A-Z0-9]', '', 'g') = a.ubic);
    if coalesce(array_length(v_ubis, 1), 0) = 0 then raise exception 'Ajuste %: no encuentro la ubicación %.', a.n, a.ubic; end if;

    -- Los renglones de esa pareja con ese código en esa ubicación.
    v_ids := array(select c.id from public.inv_fiscal_conteos c
                    where c.hoja_id = any (v_hojas) and c.producto_id = v_prod and c.ubicacion_id = any (v_ubis));

    if a.que = 'SUMAR' then
      -- Si el operador lo anotó, es el suyo; si no, el que haya.
      if exists (select 1 from public.inv_fiscal_conteos c where c.id = any (v_ids) and c.equipo = 'OL') then
        v_ids := array(select c.id from public.inv_fiscal_conteos c where c.id = any (v_ids) and c.equipo = 'OL');
      end if;
      if coalesce(array_length(v_ids, 1), 0) > 1 then
        raise exception 'Ajuste %: hay % renglones de % en % (otro vencimiento, marcas o lado); dime a cuál sumar.', a.n, array_length(v_ids, 1), a.sku, a.ubic;
      end if;

      if coalesce(array_length(v_ids, 1), 0) = 0 then
        -- Nadie lo anotó: se crea para el operador de la pareja.
        if array_length(v_hojas, 1) <> 1 then raise exception 'Ajuste %: la pareja tiene varias hojas y el código no está contado en ninguna; dime en cuál va.', a.n; end if;
        if array_length(v_ubis, 1) <> 1 then raise exception 'Ajuste %: la ubicación % tiene varios lados y el código no está contado en ninguno; dime cuál lado.', a.n, a.ubic; end if;
        select x.id, x.conteo_id, (select m.user_id from public.inv_fiscal_miembros m where m.hoja_id = x.id and m.equipo = 'OL')
          into v_hoja, v_conteo, v_ol from public.inv_fiscal_hojas x where x.id = v_hojas[1];
        if v_ol is null then raise exception 'Ajuste %: la hoja de la pareja no tiene operador (OL).', a.n; end if;
        insert into public.inv_fiscal_conteos (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, contado_en)
        values (v_fiscal, v_hoja, 'OL', v_ol, v_ubis[1], v_prod, a.estibas, now());
        if v_conteo is not null then
          insert into public.conteo_lineas (conteo_id, producto_id, ubicacion_id, estibas, cantidad_contada, contado_por, contado_en)
          select v_conteo, v_prod, v_ubis[1], a.estibas, a.estibas * coalesce(p.cajas_por_estiba, 0), v_ol, now() from public.productos p where p.id = v_prod;
        end if;
        raise notice 'Ajuste % (%, %): nadie lo había anotado; se creó con % estibas para el operador.', a.n, a.ubic, a.sku, a.estibas;
        v_hechos := v_hechos + 1;
        continue;
      end if;

      select x.* into rc from public.inv_fiscal_conteos x where x.id = v_ids[1];
      if rc.cajas is not null and rc.estibas is null then
        raise exception 'Ajuste %: ese renglón está contado en cajas (%), no en estibas: dime cómo sumarle.', a.n, rc.cajas;
      end if;
      select h.conteo_id into v_conteo from public.inv_fiscal_hojas h where h.id = rc.hoja_id;
      select p.nombre into v_quien from public.perfiles p where p.id = rc.contado_por;
      update public.inv_fiscal_conteos set estibas = coalesce(estibas, 0) + a.estibas where id = rc.id;
      select coalesce(cajas_por_estiba, 0) into v_cpe from public.productos where id = v_prod;
      update public.conteo_lineas l
         set estibas = coalesce(l.estibas, 0) + a.estibas,
             cantidad_contada = (coalesce(l.estibas, 0) + a.estibas) * v_cpe + coalesce(l.cajas, 0) + coalesce(l.saldo, 0)
       where v_conteo is not null and l.conteo_id = v_conteo and l.ubicacion_id = rc.ubicacion_id and l.producto_id = v_prod
         and l.contado_por is not distinct from rc.contado_por and l.contado_en is not distinct from rc.contado_en;
      raise notice 'Ajuste % (%, %): renglón de % (%): estibas % → %.', a.n, a.ubic, a.sku, v_quien, rc.equipo, coalesce(rc.estibas, 0), coalesce(rc.estibas, 0) + a.estibas;
      v_hechos := v_hechos + 1;

    else  -- CAMBIAR el código
      if coalesce(array_length(v_ids, 1), 0) = 0 then
        raise exception 'Ajuste %: nadie de la pareja tiene anotado el código % en %.', a.n, a.sku, a.ubic;
      end if;
      select id into v_prod2 from public.productos where upper(btrim(sku)) = a.sku_nuevo;
      if v_prod2 is null then raise exception 'Ajuste %: el código nuevo % no existe en el maestro de materiales.', a.n, a.sku_nuevo; end if;
      for rc in select * from public.inv_fiscal_conteos x where x.id = any (v_ids) loop
        select h.conteo_id into v_conteo from public.inv_fiscal_hojas h where h.id = rc.hoja_id;
        select p.nombre into v_quien from public.perfiles p where p.id = rc.contado_por;
        begin
          update public.inv_fiscal_conteos set producto_id = v_prod2 where id = rc.id;
          update public.conteo_lineas l set producto_id = v_prod2
           where v_conteo is not null and l.conteo_id = v_conteo and l.ubicacion_id = rc.ubicacion_id and l.producto_id = v_prod
             and l.contado_por is not distinct from rc.contado_por and l.contado_en is not distinct from rc.contado_en;
        exception when unique_violation then
          raise exception 'Ajuste %: en % ya hay un renglón del código % con el mismo vencimiento y marcas; no se junta solo.', a.n, a.ubic, a.sku_nuevo;
        end;
        raise notice 'Ajuste % (%): renglón de % (%): código % → %.', a.n, a.ubic, v_quien, rc.equipo, a.sku, a.sku_nuevo;
        v_hechos := v_hechos + 1;
      end loop;
    end if;
  end loop;

  alter table public.inv_fiscal_conteos enable trigger user;
  raise notice 'Listo: % ajustes aplicados.', v_hechos;
end $$;

commit;
