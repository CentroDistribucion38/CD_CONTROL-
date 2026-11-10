-- =====================================================================
-- FISCAL NOVIEMBRE 2026 · COMPLEMENTO DE LOS AJUSTES: SE LE AGREGA A AMBOS
--
-- El ajuste de «2026-11-fiscal-ajustes-parejas.sql» quedó solo en el operador (OL). La indicación
-- era sumarlo A LOS DOS de la pareja. Este archivo completa lo que le falta a la persona de Bavaria:
--
--   JAULA PNC · 21173 · +4 estibas   · pareja YESID – JAIRO      → a Bavaria (JairoCelis) le crea el renglón con 4 estibas
--   CH        · 23047 · +1 estiba    · pareja YURANIS – MELISSA  → a Bavaria (Melissa) le suma 1 estiba a lo que ya anotó
--   (el cambio de código 22265 → 22269 de A15 ya se aplicó a los dos: no se toca)
--
-- Solo toca el inventario fiscal (el cruce y el Excel); La base queda con el OL, como se decidió.
-- Todo o nada: si el estado no es el esperado (el operador no tiene el renglón, o ya hay dos renglones
-- del código), se detiene SIN cambiar nada y lo dice.
-- Córrelo UNA sola vez.
-- =====================================================================
begin;

do $$
declare
  v_fiscal uuid; v_n int;
  a record; o record; b record;
  v_hojas uuid[]; v_ubis uuid[]; v_prod uuid; v_hoja uuid; v_bav uuid; v_nb int; v_hechos int := 0; v_quien text;
begin
  select count(*), max(id::text)::uuid into v_n, v_fiscal
    from public.inv_fiscales where fecha = date '2026-11-09' and nombre ilike '%NOVIEMBRE%2026%';
  if v_n <> 1 then
    raise exception 'Esperaba UN inventario fiscal del 09/11/2026 con «NOVIEMBRE 2026» en el nombre y encontré %.', v_n;
  end if;

  alter table public.inv_fiscal_conteos disable trigger user;   -- una hoja finalizada no deja tocar sus renglones: se apaga solo mientras se ajusta

  for a in
    select * from (values
      (1, 'JAULAPNC', '21173', 4, 'yesid',   'jair'),
      (2, 'CH',       '23047', 1, 'yuranis', 'meliss')
    ) t(n, ubic, sku, estibas, p1, p2)
  loop
    select id into v_prod from public.productos where upper(btrim(sku)) = a.sku;
    if v_prod is null then raise exception 'Ajuste %: el código % no existe en el maestro.', a.n, a.sku; end if;
    v_hojas := array(
      select distinct m1.hoja_id from public.inv_fiscal_miembros m1
        join public.perfiles p1 on p1.id = m1.user_id and lower(replace(p1.nombre, ' ', '')) like a.p1 || '%'
        join public.inv_fiscal_miembros m2 on m2.hoja_id = m1.hoja_id
        join public.perfiles p2 on p2.id = m2.user_id and lower(replace(p2.nombre, ' ', '')) like a.p2 || '%'
       where m1.fiscal_id = v_fiscal and m1.user_id <> m2.user_id);
    if coalesce(array_length(v_hojas, 1), 0) = 0 then raise exception 'Ajuste %: no encuentro la pareja «% – %».', a.n, a.p1, a.p2; end if;
    v_ubis := array(select id from public.ubicaciones
                     where regexp_replace(upper(regexp_replace(clave, '_(IZQ|DER)$', '')), '[^A-Z0-9]', '', 'g') = a.ubic);
    if coalesce(array_length(v_ubis, 1), 0) = 0 then raise exception 'Ajuste %: no encuentro la ubicación %.', a.n, a.ubic; end if;

    -- El renglón del operador (debe existir: ahí quedó el ajuste anterior).
    select count(*) into v_n from public.inv_fiscal_conteos c
     where c.hoja_id = any (v_hojas) and c.producto_id = v_prod and c.ubicacion_id = any (v_ubis) and c.equipo = 'OL';
    if v_n <> 1 then raise exception 'Ajuste %: esperaba UN renglón del operador de % en % y hay %: no se cambió nada.', a.n, a.sku, a.ubic, v_n; end if;
    select c.* into o from public.inv_fiscal_conteos c
     where c.hoja_id = any (v_hojas) and c.producto_id = v_prod and c.ubicacion_id = any (v_ubis) and c.equipo = 'OL';
    v_hoja := o.hoja_id;
    select m.user_id into v_bav from public.inv_fiscal_miembros m where m.hoja_id = v_hoja and m.equipo = 'BAVARIA';
    if v_bav is null then raise exception 'Ajuste %: la hoja de la pareja no tiene persona de Bavaria.', a.n; end if;
    select p.nombre into v_quien from public.perfiles p where p.id = v_bav;

    select count(*) into v_nb from public.inv_fiscal_conteos c
     where c.hoja_id = v_hoja and c.producto_id = v_prod and c.ubicacion_id = o.ubicacion_id and c.equipo = 'BAVARIA';

    if v_nb = 0 then
      -- Bavaria no lo anotó: se le crea igual que al operador.
      insert into public.inv_fiscal_conteos (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, venc_dia, venc_mes, venc_anio, averia, pnc, estado_envase, contado_en)
      values (v_fiscal, v_hoja, 'BAVARIA', v_bav, o.ubicacion_id, v_prod, a.estibas, o.venc_dia, o.venc_mes, o.venc_anio, o.averia, o.pnc, o.estado_envase, now());
      raise notice 'Ajuste % (%, %): Bavaria (%) no lo tenía; se creó con % estibas.', a.n, a.ubic, a.sku, v_quien, a.estibas;
    elsif v_nb = 1 then
      select c.* into b from public.inv_fiscal_conteos c
       where c.hoja_id = v_hoja and c.producto_id = v_prod and c.ubicacion_id = o.ubicacion_id and c.equipo = 'BAVARIA';
      if b.cajas is not null and b.estibas is null then raise exception 'Ajuste %: el renglón de Bavaria está contado en cajas (%), no en estibas: dime cómo sumarle.', a.n, b.cajas; end if;
      -- Si el renglón del operador es justo el que creó el ajuste anterior (nadie lo había anotado) y Bavaria ya lo tenía, el ajuste fue a Bavaria: ya está en los dos.
      if o.estibas = a.estibas and o.contado_en > now() - interval '3 hours' and b.estibas is not null and b.estibas >= a.estibas then
        raise notice 'Ajuste % (%, %): ya estaba en los dos; no se tocó.', a.n, a.ubic, a.sku; continue;
      end if;
      update public.inv_fiscal_conteos set estibas = coalesce(estibas, 0) + a.estibas where id = b.id;
      raise notice 'Ajuste % (%, %): renglón de Bavaria (%): estibas % → %.', a.n, a.ubic, a.sku, v_quien, coalesce(b.estibas, 0), coalesce(b.estibas, 0) + a.estibas;
    else
      raise exception 'Ajuste %: hay % renglones de Bavaria de % en %; dime a cuál sumar.', a.n, v_nb, a.sku, a.ubic;
    end if;
    v_hechos := v_hechos + 1;
  end loop;

  alter table public.inv_fiscal_conteos enable trigger user;
  raise notice 'Listo: % ajustes completados para Bavaria.', v_hechos;
end $$;

commit;
