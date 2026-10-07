-- =====================================================================
-- INVENTARIO · TABLERO · EVIDENCIAS (tendencias por ubicación, día a día)
--
-- «Generar informes en PDF y Word de las evidencias, con módulos claros, para ver
--  las tendencias por ubicación de cada día: ayer encontré novedad en esta ubicación,
--  hoy ya no; hoy sí.»
--
-- Dos lecturas, las dos solo de consulta (no escriben nada):
--
--   conteo_evidencias(desde, hasta)   UNA FILA POR NOVEDAD encontrada, de cuatro tipos:
--        averia      renglón marcado «averiada»
--        pnc         renglón marcado PNC (con las dos respuestas de la política de bloqueo:
--                    rótulo y bloqueo mecánico; «cumple» = las dos en sí; null = sin respuesta)
--        mezclado    módulo marcado «mezclado»
--        sin_acceso  módulo marcado «sin acceso»
--      con el día (hora de Colombia), la ubicación, el material, quién la anotó, a qué hora
--      y la ruta de la foto (si la hay) en el bucket «inventario».
--
--   conteo_cobertura(desde, hasta)    qué ubicaciones se CONTARON cada día (con renglones o con
--      el estado del módulo anotado). Sin esto no se puede distinguir «hoy ya no hay novedad»
--      de «hoy no se contó esa ubicación»: son cosas muy distintas.
--
-- Cuentan los recorridos FEFO que no están anulados ni en borrador (enviados y en proceso).
-- El «día» es el de Colombia (America/Bogota) de la hora en que se anotó el renglón.
-- Solo lee quien puede ver el Tablero o el Conteo. Se puede correr dos veces.
-- =====================================================================
begin;

drop function if exists public.conteo_evidencias(date, date);
create function public.conteo_evidencias(p_desde date, p_hasta date)
returns table (
  dia date, conteo_id uuid, conteo text, ubicacion_id uuid, ubicacion text, calle text, modulo text, lado text,
  tipo text, linea_id uuid, codigo text, material text, cajas bigint,
  persona text, hora timestamptz, ruta text,
  pnc_rotulo boolean, pnc_bloqueo_mecanico boolean, cumple boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.puede_ver('/inventario/tablero') or public.puede_ver('/inventario/conteo')) then
    raise exception 'Sin permiso para ver las evidencias del conteo';
  end if;
  return query
  with lin as (
    select cl.id, cl.conteo_id, cl.ubicacion_id, cl.producto_id, cl.averia, cl.pnc, cl.pnc_rotulo, cl.pnc_bloqueo_mecanico,
           cl.contado_por, coalesce(cl.registrado_en, cl.contado_en) as t,
           (coalesce(cl.estibas, 0) * coalesce(p.cajas_por_estiba, 0) + coalesce(cl.cajas, 0))::bigint as cj,
           p.sku::text as sku, p.nombre::text as nom
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
      left join public.productos p on p.id = cl.producto_id
     where (cl.averia or cl.pnc) and coalesce(cl.registrado_en, cl.contado_en) is not null
  ),
  de_renglon as (
    select (l.t at time zone 'America/Bogota')::date as d, l.conteo_id as cid, l.ubicacion_id as uid,
           case when l.averia then 'averia' else 'pnc' end as tp,
           l.id as lid, l.sku, l.nom, l.cj, l.contado_por as quien, l.t as h, f.ruta,
           l.pnc_rotulo as rot, l.pnc_bloqueo_mecanico as blo
      from lin l left join public.conteo_fotos f on f.linea_id = l.id
    union all
    /* Un renglón que es AVERIA y además PNC aparece también como PNC (las dos novedades cuentan). */
    select (l.t at time zone 'America/Bogota')::date, l.conteo_id, l.ubicacion_id, 'pnc',
           l.id, l.sku, l.nom, l.cj, l.contado_por, l.t, f.ruta, l.pnc_rotulo, l.pnc_bloqueo_mecanico
      from lin l left join public.conteo_fotos f on f.linea_id = l.id
     where l.averia and l.pnc
  ),
  de_modulo as (
    select (m.marcado_en at time zone 'America/Bogota')::date as d, m.conteo_id as cid, m.ubicacion_id as uid,
           case when m.sin_acceso then 'sin_acceso' else 'mezclado' end as tp,
           null::uuid as lid, null::text as sku, null::text as nom, null::bigint as cj, m.marcado_por as quien,
           coalesce(m.tomada_en, m.marcado_en) as h, m.ruta, null::boolean as rot, null::boolean as blo
      from public.conteo_modulos m
      join public.conteos c on c.id = m.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
     where m.sin_acceso or m.mezclado
    union all
    /* Un módulo marcado sin acceso Y mezclado cuenta las dos. */
    select (m.marcado_en at time zone 'America/Bogota')::date, m.conteo_id, m.ubicacion_id, 'mezclado',
           null, null, null, null, m.marcado_por, coalesce(m.tomada_en, m.marcado_en), m.ruta, null, null
      from public.conteo_modulos m
      join public.conteos c on c.id = m.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
     where m.sin_acceso and m.mezclado
  ),
  todo as (select * from de_renglon union all select * from de_modulo)
  select t.d, t.cid, c.codigo::text, t.uid, u.clave::text, u.calle::text, u.modulo::text, u.lado::text,
         t.tp, t.lid, t.sku, t.nom, t.cj,
         per.nombre::text, t.h, t.ruta,
         t.rot, t.blo,
         case when t.tp = 'pnc' and t.rot is not null and t.blo is not null then (t.rot and t.blo) else null end
    from todo t
    join public.conteos c on c.id = t.cid
    left join public.ubicaciones u on u.id = t.uid
    left join public.perfiles per on per.id = t.quien
   where t.d between p_desde and p_hasta
   order by t.d, u.clave, t.tp, t.h;
end $$;
revoke all on function public.conteo_evidencias(date, date) from public, anon;
grant execute on function public.conteo_evidencias(date, date) to authenticated;

drop function if exists public.conteo_cobertura(date, date);
create function public.conteo_cobertura(p_desde date, p_hasta date)
returns table (dia date, ubicacion_id uuid, ubicacion text, calle text, modulo text, lado text, renglones int, conteos int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.puede_ver('/inventario/tablero') or public.puede_ver('/inventario/conteo')) then
    raise exception 'Sin permiso para ver las evidencias del conteo';
  end if;
  return query
  with visto as (
    select (coalesce(cl.registrado_en, cl.contado_en) at time zone 'America/Bogota')::date as d, cl.ubicacion_id as uid, cl.conteo_id as cid, 1 as r
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
     where cl.ubicacion_id is not null and coalesce(cl.registrado_en, cl.contado_en) is not null
    union all
    select (m.marcado_en at time zone 'America/Bogota')::date, m.ubicacion_id, m.conteo_id, 0
      from public.conteo_modulos m
      join public.conteos c on c.id = m.conteo_id and c.tipo = 'fefo' and c.estado not in ('anulado', 'borrador')
  )
  select v.d, v.uid, u.clave::text, u.calle::text, u.modulo::text, u.lado::text,
         sum(v.r)::int, count(distinct v.cid)::int
    from visto v
    left join public.ubicaciones u on u.id = v.uid
   where v.d between p_desde and p_hasta
   group by v.d, v.uid, u.clave, u.calle, u.modulo, u.lado
   order by v.d, u.clave;
end $$;
revoke all on function public.conteo_cobertura(date, date) from public, anon;
grant execute on function public.conteo_cobertura(date, date) to authenticated;

commit;
-- LISTO · evidencias del conteo
