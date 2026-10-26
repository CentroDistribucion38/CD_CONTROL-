-- =====================================================================
-- INVENTARIO FISCAL · EL FISCAL CONCILIA: OL → LA BASE, BAVARIA → BD DEL FISCAL, SIN BORRADORES
--
-- «Si valido y para el fiscal concilia a las dos personas, el conteo de Bavaria se va a la BD del
--  inv fiscal y la del OL se va para el normal, y a ninguno de los dos, una vez enviado, se les
--  guarda nada en borradores.»
--
-- ANTES: un módulo APROBADO donde los dos conteos diferían y el fiscal no escogía cuál dejar NO pasaba a
-- La base y TAMPOCO salía del borrador: las líneas de las dos personas se quedaban como borrador para siempre.
--
-- AHORA, al aprobar un módulo:
--   · A LA BASE (normal) pasa el conteo del OPERADOR. Si el fiscal escogió dejar el de Bavaria, pasa ese;
--     si solo Bavaria contó ese módulo, pasa el de Bavaria (para no perder lo contado).
--   · El conteo de Bavaria queda guardado en la BD del fiscal (inv_fiscal_conteos), como todo lo que
--     cuenta cada persona. No se borra nada.
--   · Ese módulo deja de ser borrador para las DOS personas y para La base (con o sin coincidencia).
--
-- No cambia tablas. Se puede correr varias veces. Para que lo ya aprobado pase a La base con esta regla,
-- el fiscal vuelve a aprobar o cierra la hoja (consolidar se corre solo); los borradores se limpian al instante.
-- =====================================================================
begin;

-- El conteo que se toma de un módulo: el que el fiscal dejó como definitivo; si no escogió, el del OL;
-- si el OL no contó ese módulo, el de Bavaria.
drop function if exists public.inv_fiscal_equipo_definitivo(uuid, uuid);
create function public.inv_fiscal_equipo_definitivo(p_hoja uuid, p_ubi uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.adoptado from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = p_ubi),
    case when exists (
      select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
       where c.hoja_id = p_hoja and c.equipo = 'OL'
         and regexp_replace(u.clave, '_(IZQ|DER)$', '') = (select regexp_replace(u2.clave, '_(IZQ|DER)$', '') from public.ubicaciones u2 where u2.id = p_ubi)
    ) then 'OL' else 'BAVARIA' end)
$$;
revoke all on function public.inv_fiscal_equipo_definitivo(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_equipo_definitivo(uuid, uuid) to authenticated;

-- «Resuelto» = el fiscal APROBÓ ese módulo (ya no hay nada que seguir contando ni borrador de nadie).
drop function if exists public.inv_fiscal_modulo_resuelto(uuid, uuid);
create function public.inv_fiscal_modulo_resuelto(p_hoja uuid, p_ubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inv_fiscal_revisiones r
      join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = (select regexp_replace(u.clave, '_(IZQ|DER)$', '') from public.ubicaciones u where u.id = p_ubi)
  )
$$;
revoke all on function public.inv_fiscal_modulo_resuelto(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_modulo_resuelto(uuid, uuid) to authenticated;

-- CONSOLIDAR: lo aprobado por el fiscal pasa a La base con el conteo definitivo de cada módulo (OL por defecto).
drop function if exists public.inv_fiscal_consolidar(uuid);
create function public.inv_fiscal_consolidar(p_hoja uuid)
returns table (ubicaciones integer, renglones integer, sin_consolidar integer, conteo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_num integer; v_conteo uuid; v_fecha date; v_bodega uuid; v_codigo text;
  v_ok uuid[]; v_sin integer; v_ren integer; v_equipos integer; v_eq text := 'OL';
  rg record; v_lid uuid;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- ¿Terminó una sola persona? Entonces no hay cruce: lo aprobado se toma de la persona que terminó.
  select count(distinct m.equipo), coalesce(min(m.equipo), 'OL') into v_equipos, v_eq
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos <> 1 then v_eq := 'OL'; end if;

  -- Todo módulo APROBADO por el fiscal (coincida o no): ahí el fiscal ya concilió a las dos personas.
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id
                    and (v_equipos <> 1 or c.equipo = v_eq))
       );
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok))
     and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id);

  if v_conteo is null then
    if coalesce(array_length(v_ok, 1), 0) = 0 then
      raise exception 'Todavía no hay ubicaciones aprobadas que coincidan en esta hoja: no hay nada que consolidar.';
    end if;
    select u.bodega_id into v_bodega from public.ubicaciones u where u.id = v_ok[1];
    v_codigo := 'FISCAL-' || to_char(v_fecha, 'YYYYMMDD') || '-H' || lpad(v_num::text, 2, '0');
    if exists (select 1 from public.conteos where codigo = v_codigo) then
      v_codigo := v_codigo || '-' || substr(p_hoja::text, 1, 4);
    end if;
    insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
    values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
            ((v_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota'),
            'Inventario fiscal · Hoja ' || v_num || case when v_equipos = 1 then ' · lo aprobado por el fiscal, contado por una sola persona (sin cruce)' else ' · lo aprobado por el fiscal (coincidente entre las dos personas, o el conteo que el fiscal dejó como definitivo)' end)
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  delete from public.conteo_modulos where conteo_id = v_conteo;
  v_ren := 0;
  for rg in
    select c.id as cid, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
           c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en, c.contado_por, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0) as total
      from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja and c.ubicacion_id = any (v_ok)
       -- De cada módulo se toma el conteo del equipo que el fiscal dejó como definitivo; si no escogió, el de la persona que terminó (o el del operador).
       and c.equipo = case when v_equipos = 1 then v_eq else public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id) end
     order by c.contado_en
  loop
    insert into public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
       rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en, pnc_rotulo, pnc_bloqueo_mecanico)
    values (v_conteo, rg.producto_id, rg.ubicacion_id, rg.estibas, rg.cajas, rg.saldo, rg.venc_dia, rg.venc_mes, rg.venc_anio,
            null, rg.averia, rg.pnc, rg.estado_envase, rg.nota, rg.total, coalesce(rg.contado_por, v_yo), rg.contado_en, rg.pnc_rotulo, rg.pnc_bloqueo_mecanico)
    returning id into v_lid;
    -- La foto del renglón (si la hay) viaja con él a La base.
    insert into public.conteo_fotos (linea_id, conteo_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
    select v_lid, v_conteo, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
      from public.inv_fiscal_fotos f where f.conteo_id = rg.cid;
    v_ren := v_ren + 1;
  end loop;
  -- La hora real del conteo: del primer al último renglón que pasó (no la de quien aprueba).
  update public.conteos cn
     set iniciado_en = coalesce((select min(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.iniciado_en),
         cerrado_en  = coalesce((select max(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.cerrado_en)
   where cn.id = v_conteo;
  -- Mezclado / sin acceso de quien contó: de lo que pasó a La base y de los módulos donde nadie anotó renglones.
  insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_por, marcado_en)
  select v_conteo, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.user_id, m.marcado_en
    from public.inv_fiscal_modulos m
    join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
   where m.hoja_id = p_hoja
     and mi.equipo = case when v_equipos = 1 then v_eq else public.inv_fiscal_equipo_definitivo(p_hoja, m.ubicacion_id) end
     and (m.ubicacion_id = any (v_ok)
          or not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = m.ubicacion_id));

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null
     or to_regprocedure('public.inv_fiscal_modulo_resuelto(uuid,uuid)') is null
     or to_regprocedure('public.inv_fiscal_equipo_definitivo(uuid,uuid)') is null then
    raise exception 'No quedaron las funciones de conciliar el inventario fiscal.';
  end if;
  raise notice 'Listo: el fiscal concilia, el OL pasa a La base, Bavaria queda en la BD del fiscal y nadie queda en borradores.';
end $$;

commit;
select 'OK · conciliar fiscal listo' as resultado;
