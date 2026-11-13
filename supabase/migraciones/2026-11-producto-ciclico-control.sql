-- =====================================================================
-- INVENTARIO · PRODUCTO · CONTROL E HISTORIAL DEL CÍCLICO (+ exportar los conteos)
--
-- «Como el fiscal, que pueda esos tres (Plan, Control, Historial), pero no fiscal sino cíclico, que pueda
--  exportar los conteos.»
--
--   1. inv_ciclico_ve(): también lo ve quien tiene «Control cíclico» o «Historial cíclico».
--   2. Las dos pantallas nuevas salen con el mismo permiso que cada rol ya tiene en «Cíclico».
--   3. inv_ciclico_detalle(p_fiscal): cada renglón contado del cíclico (hoja, equipo, quién, sitio, código,
--      estibas, cajas, unidades, total en unidades y hora) para el Excel de los conteos.
--   4. «ENVIAR CONTEO»: cuando la pareja cruza y TODO coincide, cualquiera de los dos envía el conteo y la hoja
--      queda cerrada (ya no se anota). Si falta algo, siguen contando. Quien edita el Cíclico puede reabrirla.
--      inv_ciclico_resumen() ahora dice también si la hoja ya se envió.
--   5. ARREGLO: La base (BD) traía como «FISCAL-… en conteo» los renglones de un cíclico abierto.
--      inv_fiscal_borradores_base ahora solo lee inventarios FISCALES.
--
-- Necesita 2026-11-producto-ciclico.sql y 2026-11-fiscal-unidades.sql. Se puede correr varias veces.
-- =====================================================================
begin;

-- 1 · QUIÉN VE EL CÍCLICO
create or replace function public.inv_ciclico_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/producto/control') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/producto/historial') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/producto/analisis') <> 'ninguno'
$$;
grant execute on function public.inv_ciclico_ve() to authenticated;

-- 2 · LAS PANTALLAS NUEVAS, CON EL PERMISO QUE CADA ROL YA TIENE EN «CÍCLICO» (si ya se le dio otro, se respeta)
insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, x.ruta, p.nivel
  from public.rol_permisos p
  cross join (values ('/inventario/producto/control'), ('/inventario/producto/historial')) as x(ruta)
 where p.seccion = '/inventario/producto/ciclico'
on conflict (rol, seccion) do nothing;

-- 3 · CADA RENGLÓN CONTADO DEL CÍCLICO
drop function if exists public.inv_ciclico_detalle(uuid);
create function public.inv_ciclico_detalle(p_fiscal uuid)
returns table (
  hoja integer, equipo text, persona text, ubicacion text, sku text, material text, familia text,
  estibas numeric, saldo numeric, cajas numeric, unidades numeric,
  cajas_por_estiba integer, unidades_por_caja integer, total_unidades bigint, nota text, contado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.inv_ciclico_ve() then
    raise exception 'Ver lo contado del cíclico requiere el permiso «Control cíclico» de Producto (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscales where id = p_fiscal and tipo = 'CICLICO') then
    raise exception 'Ese inventario cíclico no existe.';
  end if;
  return query
  select h.numero, m.equipo, pe.nombre, u.clave, p.sku, p.nombre, p.familia,
         c.estibas::numeric, c.saldo::numeric, c.cajas::numeric, c.unidades::numeric,
         p.cajas_por_estiba::integer, public.inv_fiscal_upc(p.unidades_por_caja)::integer,
         public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja)::bigint,
         c.nota, c.contado_en
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas h on h.id = c.hoja_id
    join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
    join public.productos p on p.id = c.producto_id
    join public.ubicaciones u on u.id = c.ubicacion_id
    left join public.perfiles pe on pe.id = c.contado_por
   where h.fiscal_id = p_fiscal
   order by h.numero, m.equipo desc, c.contado_en;
end $$;
revoke all on function public.inv_ciclico_detalle(uuid) from public, anon;
grant execute on function public.inv_ciclico_detalle(uuid) to authenticated;

-- 4 · ENVIAR EL CONTEO (solo si todo coincide) Y REABRIR
create or replace function public.inv_ciclico_enviar(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tipo text; v_estado text; v_total bigint; v_dif bigint;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para enviar el conteo.'; end if;
  select f.tipo, f.estado into v_tipo, v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_tipo is null then raise exception 'Esa hoja no existe.'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Esa hoja es de un inventario fiscal.'; end if;
  if not exists (select 1 from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.user_id = auth.uid()) then
    raise exception 'Solo la pareja de la hoja puede enviar el conteo.';
  end if;
  if v_estado <> 'abierto' then raise exception 'Este cíclico ya está cerrado.'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then return; end if;
  select count(*), count(*) filter (where c.estado <> 'COINCIDE') into v_total, v_dif from public.inv_ciclico_cruce(p_hoja) c;
  if v_total = 0 then raise exception 'Todavía no hay nada contado en esta hoja.'; end if;
  if v_dif > 0 then
    raise exception 'Todavía % que no %: sigan contando y vuelvan a cruzar.',
      case when v_dif = 1 then 'hay 1 renglón' else 'hay ' || v_dif || ' renglones' end,
      case when v_dif = 1 then 'coincide' else 'coinciden' end;
  end if;
  update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = p_hoja;
end $$;
revoke all on function public.inv_ciclico_enviar(uuid) from public, anon;
grant execute on function public.inv_ciclico_enviar(uuid) to authenticated;

create or replace function public.inv_ciclico_reabrir(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'editar'
     and public.mi_nivel_pantalla('/inventario/producto/control') <> 'editar' then
    raise exception 'Reabrir una hoja del cíclico requiere permiso de edición en «Cíclico» o «Control cíclico» de Producto (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id
                  where h.id = p_hoja and f.tipo = 'CICLICO') then
    raise exception 'Esa hoja no es de un cíclico.';
  end if;
  update public.inv_fiscal_hojas set cerrada_en = null, cerrada_por = null where id = p_hoja;
end $$;
revoke all on function public.inv_ciclico_reabrir(uuid) from public, anon;
grant execute on function public.inv_ciclico_reabrir(uuid) to authenticated;

-- El resumen por hoja, ahora con «enviada».
drop function if exists public.inv_ciclico_resumen();
create function public.inv_ciclico_resumen()
returns table (fiscal_id uuid, hoja_id uuid, numero integer, total bigint, con_diferencia bigint, enviada_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.inv_ciclico_ve() then
    raise exception 'Ver el cruce del cíclico requiere el permiso «Cíclico» de Producto (Roles)';
  end if;
  return query
  select h.fiscal_id, h.id, h.numero, x.total, x.dif, h.cerrada_en
    from public.inv_fiscal_hojas h
    join public.inv_fiscales f on f.id = h.fiscal_id
    cross join lateral (
      select count(*)::bigint as total, count(*) filter (where c.estado <> 'COINCIDE')::bigint as dif
        from public.inv_ciclico_cruce(h.id) c
    ) x
   where f.tipo = 'CICLICO' and f.estado = 'abierto'
   order by h.fiscal_id, h.numero;
end $$;
revoke all on function public.inv_ciclico_resumen() from public, anon;
grant execute on function public.inv_ciclico_resumen() to authenticated;

-- 5 · LA BASE SOLO TOMA LOS BORRADORES DEL FISCAL (no los del cíclico)
create or replace function public.inv_fiscal_borradores_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_filas jsonb; v_conteos jsonb;
begin
  if not public.puede_ver('/inventario/fiscal') then
    return jsonb_build_object('filas', '[]'::jsonb, 'conteos', '[]'::jsonb);
  end if;
  with b as (
    select c.id, h.id as hoja_id, h.numero, f.fecha, c.ubicacion_id, c.producto_id, c.estibas, c.saldo, c.cajas, c.unidades,
           c.venc_dia, c.venc_mes, c.venc_anio, c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en,
           u.clave, u.calle, u.modulo, u.lado, p.sku, p.nombre as material, p.tipo_material, p.cajas_por_estiba, p.unidades_por_caja,
           pe.nombre as conto,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as total
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_hojas h on h.id = c.hoja_id
      join public.inv_fiscales f on f.id = h.fiscal_id
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
      left join public.perfiles pe on pe.id = c.contado_por
     where f.estado = 'abierto' and coalesce(f.tipo, 'FISCAL') = 'FISCAL'   -- el cíclico no va a La base
       and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id)
        -- Ni lo de la otra persona de la pareja en un módulo que el fiscal ya aprobó: eso ya está en La base con el conteo definitivo.
        and not public.inv_fiscal_modulo_resuelto(h.id, c.ubicacion_id)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'conteo_id', b.hoja_id,
      'conteo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
      'estado', 'en_proceso', 'codigo', b.sku, 'material', b.material, 'tipo_material', b.tipo_material,
      'familia', null, 'factor_estibado', b.cajas_por_estiba,
      'ubicacion', b.clave, 'calle', b.calle, 'modulo', b.modulo, 'lado', b.lado,
      'estibas', b.estibas, 'cajas', b.cajas, 'saldo', b.saldo, 'unidades', b.unidades, 'unidades_por_caja', b.unidades_por_caja, 'total_cajas', b.total,
      'total_estibas', case when coalesce(b.cajas_por_estiba, 0) > 0 then round(b.total::numeric / b.cajas_por_estiba, 2) else 0 end,
      'capacidad', null, 'venc_dia', b.venc_dia, 'venc_mes', b.venc_mes, 'venc_anio', b.venc_anio,
      'fab_dia', null, 'fab_mes', null, 'fab_anio', null, 'fabricacion', null, 'vencimiento', null,
      'dias_para_vencer', null, 'dias_para_salir', null, 'rotacion', null,
      'averia', coalesce(b.averia, false), 'pnc', coalesce(b.pnc, false), 'estado_envase', b.estado_envase, 'nota', b.nota,
      'ubicacion_combinada', regexp_replace(b.clave, '_(IZQ|DER)$', ''), 'conto', b.conto, 'contado_en', b.contado_en,
      'producto_id', b.producto_id, 'ubicacion_id', b.ubicacion_id) order by b.contado_en desc) from b), '[]'::jsonb),
    coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'id', b.hoja_id,
        'codigo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
        'estado', 'en_proceso', 'bodega', '', 'responsable', 'Inventario fiscal · Hoja ' || b.numero,
        'fecha_analisis', b.fecha, 'enviado_en', null, 'envio_nombre', null,
        'renglones', count(*), 'ubicaciones', count(distinct b.ubicacion_id), 'total_cajas', sum(b.total), 'unidades', coalesce(sum(b.unidades), 0)) as x
        from b group by b.hoja_id, b.numero, b.fecha) q), '[]'::jsonb)
  into v_filas, v_conteos;
  return jsonb_build_object('filas', v_filas, 'conteos', v_conteos);
end $$;

commit;
select 'OK · Control e Historial del cíclico, con sus conteos para exportar' as resultado;
