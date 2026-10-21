-- =====================================================================
-- INVENTARIO FISCAL · CONSOLIDAR EN LA BASE (UN CONTEO POR HOJA)
--
-- «Cuando el fiscal aprueba lo de ambos, eso se envía a la base de datos de una:
--  el conteo debe corresponder y coincidir. Para mi análisis y todo lo que hago
--  sería por hoja y no por usuario.»
--
-- QUÉ HACE
--   · Cada HOJA del fiscal tiene UN solo conteo en La base (tipo FEFO, ya enviado),
--     con código FISCAL-AAAAMMDD-H01, firmado por quien aprueba. Balance, Análisis
--     de diferencia, Tablero y demás lo leen como cualquier recorrido, por hoja y no
--     por persona. Su fecha de análisis es la del inventario fiscal.
--   · Entra SOLO lo que el fiscal APROBÓ y donde el operador y Bavaria COINCIDEN.
--     Una ubicación aprobada que todavía difiere NO se consolida (se avisa cuántas):
--     primero tiene que coincidir.
--   · Los renglones que entran son los del operador logístico (idénticos en cajas a
--     los de Bavaria, que es lo que significa coincidir).
--   · Se puede repetir las veces que sea: cada vez deja en La base exactamente lo
--     aprobado y coincidente hoy (si una ubicación vuelve a validarse, sale hasta
--     que se apruebe de nuevo). Cada calle que se aprueba se suma al mismo conteo.
--   · NO toca los conteos de las personas (inv_fiscal_conteos): el fiscal sigue a ciegas.
--
-- Se puede correr dos veces. Necesita 2026-10-fiscal-validar.sql.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas
  add column if not exists conteo_id uuid references public.conteos(id) on delete set null;

-- El cruce de siempre, pero sin exigir que las dos personas hayan terminado
-- (esa regla es del botón «cruzar»). Solo lo usa la función de abajo.
drop function if exists public.inv_fiscal_cruce_filas(uuid);
create function public.inv_fiscal_cruce_filas(p_hoja uuid)
returns table (ubicacion_id uuid, estado text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo,
           sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA')
  select coalesce(o.ubicacion_id, b.ubicacion_id),
         case when o.cajas is null then 'SOLO_BAVARIA' when b.cajas is null then 'SOLO_OL'
              when o.cajas = b.cajas then 'COINCIDE' else 'DIFIERE' end
    from o full join b
      on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
     and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)
     and coalesce(o.venc_mes, 0) = coalesce(b.venc_mes, 0)
     and coalesce(o.venc_anio, 0) = coalesce(b.venc_anio, 0)
$$;
revoke all on function public.inv_fiscal_cruce_filas(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- CONSOLIDAR UNA HOJA
-- ---------------------------------------------------------------------
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
  v_ok uuid[]; v_sin integer; v_ren integer;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- Lo aprobado Y coincidente (todos sus renglones iguales entre las dos personas).
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id)
       and not exists (select 1 from public.inv_fiscal_cruce_filas(p_hoja) x
                        where x.ubicacion_id = r.ubicacion_id and x.estado <> 'COINCIDE'));
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok));

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
            'Inventario fiscal · Hoja ' || v_num || ' · lo aprobado por el fiscal y coincidente entre las dos personas')
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
     rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en)
  select v_conteo, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
         null, false, false, null, c.nota,
         coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0),
         v_yo, c.contado_en
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.equipo = 'OL' and c.ubicacion_id = any (v_ok);
  get diagnostics v_ren = row_count;

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LO CONSOLIDADO DE CADA HOJA (para mostrarlo en el panel del fiscal)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_consolidados(uuid);
create function public.inv_fiscal_consolidados(p_fiscal uuid)
returns table (hoja_id uuid, numero integer, conteo text, ubicaciones integer, renglones integer, cajas bigint, enviado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver lo consolidado del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
  select h.id, h.numero, c.codigo,
         count(distinct cl.ubicacion_id)::integer, count(cl.id)::integer,
         coalesce(sum(coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0) + coalesce(cl.cajas, 0) + coalesce(cl.saldo, 0)), 0)::bigint,
         c.enviado_en
    from public.inv_fiscal_hojas h
    join public.conteos c on c.id = h.conteo_id
    left join public.conteo_lineas cl on cl.conteo_id = c.id
    left join public.productos p on p.id = cl.producto_id
   where h.fiscal_id = p_fiscal
   group by h.id, h.numero, c.codigo, c.enviado_en
   order by h.numero;
end $$;
revoke all on function public.inv_fiscal_consolidados(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidados(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null
     or to_regprocedure('public.inv_fiscal_consolidados(uuid)') is null then
    raise exception 'No quedaron las funciones de consolidar. Revisa que corrió antes 2026-10-fiscal-validar.sql.';
  end if;
end $$;

commit;
select 'OK · consolidar listo' as resultado;
