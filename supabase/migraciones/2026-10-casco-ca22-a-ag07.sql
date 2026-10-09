-- =====================================================================
-- CASCO DE VIDRIO · MOVIMIENTO · LA EXCEPCIÓN CA22 → AG07
--
-- «Cuando sea de CA22 ERR Atlántico a AG07 Alm. Bodega Carnaval no lo
--  suma a Carnaval ni se resta: esa es una excepción, se SUMA al
--  inventario de CA22 ERR Atlántico.»
--
-- 1. Un movimiento CA22 → AG07 que descuenta inventario ahora hace
--    CA22 +estibas (y AG07 no se toca). Los demás, igual que antes.
-- 2. CA22 como origen sale con «Descuenta inventario» encendida.
-- 3. Los movimientos CA22 → AG07 que YA se registraron con la regla
--    vieja (CA22 −, AG07 +) se corrigen: a AG07 se le quita lo que se le
--    sumó y a CA22 se le devuelve lo restado y se le suma (2 × estibas).
--    Cada uno se corrige UNA vez (después queda como «CA22 +»).
--
-- Correr DESPUÉS de 2026-10-casco-negativos.sql. Se puede correr las
-- veces que sea.
-- =====================================================================
begin;

-- El centro SAP (CA22, AG07…) de un almacén del maestro: el de su tabla de Control, o su código.
create or replace function public.casco_centro_de(m public.casco_mov_maestro)
returns text
language sql stable security definer
set search_path = public
as $$
  select upper(coalesce((select u.centro from public.casco_ubicaciones u where u.clave = m.ubicacion), m.codigo, ''))
$$;
revoke all on function public.casco_centro_de(public.casco_mov_maestro) from public, anon, authenticated;

-- 1. Registrar, con la excepción.
create or replace function public.casco_movimiento_registrar(p_fecha date, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_n integer := 0; v_i integer := 0;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  o public.casco_mov_maestro%rowtype; d public.casco_mov_maestro%rowtype;
  v_sku text; v_est numeric; v_afecta boolean; v_ca22_ag07 boolean;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para registrar movimientos de casco de vidrio';
  end if;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'Esa fecha todavía no ha llegado'; end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas tienen que venir como lista';
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_sku := btrim(coalesce(f->>'sku', ''));
    v_est := round(coalesce(nullif(f->>'estibas', '')::numeric, 0), 2);
    v_afecta := coalesce((f->>'afecta')::boolean, true);

    select * into o from public.casco_mov_maestro
     where id = nullif(f->>'origen_id', '')::uuid and tipo = 'origen' and activo;
    if not found then raise exception 'Línea %: escoge el almacén de origen', v_i; end if;
    select * into d from public.casco_mov_maestro
     where id = nullif(f->>'destino_id', '')::uuid and tipo in ('receptor', 'cliente') and activo;
    if not found then raise exception 'Línea %: escoge el almacén receptor o el cliente', v_i; end if;
    if v_sku = '' then raise exception 'Línea %: falta el material', v_i; end if;
    if v_est <= 0 then raise exception 'Línea %: la cantidad (estibas) tiene que ser mayor que cero', v_i; end if;
    if o.ubicacion is not null and o.ubicacion = d.ubicacion then
      raise exception 'Línea %: el origen y el receptor son el mismo almacén', v_i;
    end if;

    /* LA EXCEPCIÓN CA22 → AG07: no se resta de CA22 ni se suma a AG07; SE SUMA A CA22.
       Se guarda como «tocó CA22 sumando» (ubic_destino = CA22, sin origen), y así al deshacerlo
       se le resta a CA22 lo mismo. */
    v_ca22_ag07 := public.casco_centro_de(o) = 'CA22' and public.casco_centro_de(d) = 'AG07';

    insert into public.casco_movimientos
      (fecha, origen_id, destino_id, origen, destino, ubic_origen, ubic_destino, sku, estibas,
       entrega, placa, afecta, creado_por)
    values
      (p_fecha, o.id, d.id, o.nombre, d.nombre,
       case when v_afecta and not v_ca22_ag07 then o.ubicacion end,
       case when v_afecta then case when v_ca22_ag07 then o.ubicacion else d.ubicacion end end,
       v_sku, v_est, nullif(btrim(coalesce(f->>'entrega', '')), ''),
       nullif(upper(btrim(coalesce(f->>'placa', ''))), ''), v_afecta, auth.uid());

    if v_afecta and v_ca22_ag07 then
      if o.ubicacion is not null then perform public.casco_aplicar_delta(p_fecha, o.ubicacion, v_sku, v_est); end if;
    elsif v_afecta then
      if d.ubicacion is not null then perform public.casco_aplicar_delta(p_fecha, d.ubicacion, v_sku, v_est); end if;
      if o.ubicacion is not null then perform public.casco_aplicar_delta(p_fecha, o.ubicacion, v_sku, -v_est); end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.casco_movimiento_registrar(date, jsonb) to authenticated;

-- 2. CA22 como origen descuenta por defecto (ahora suma a CA22).
update public.casco_mov_maestro m set descuenta = true
 where m.tipo = 'origen' and public.casco_centro_de(m) = 'CA22' and not m.descuenta;

-- 3. Corregir los CA22 → AG07 ya registrados con la regla vieja.
do $corrige$
declare r record; v_n int := 0;
begin
  for r in
    select mv.* from public.casco_movimientos mv
      join public.casco_ubicaciones uo on uo.clave = mv.ubic_origen and uo.centro = 'CA22'
      join public.casco_ubicaciones ud on ud.clave = mv.ubic_destino and ud.centro = 'AG07'
     where mv.afecta
     order by mv.creado_en
  loop
    /* AG07: se le quita lo que se le sumó, y de la cuenta se borra el «+N» (no queda «+36-36»). */
    update public.casco_registros c set
      inventario = coalesce(c.inventario, 0) - r.estibas,
      inv_expr = public.casco_quitar_termino(c.inv_expr, r.estibas),
      hl = round((coalesce(c.inventario, 0) - r.estibas + coalesce(c.baja, 0)) * coalesce(c.hl_estiba, public.casco_hl_estiba(r.sku), 0), 4),
      actualizado_en = now()
     where c.fecha = r.fecha and c.ubicacion = r.ubic_destino and c.sku = r.sku;
    /* CA22: se borra el «−N» que se le restó y se le suma «+N». */
    update public.casco_registros c set
      inventario = coalesce(c.inventario, 0) + 2 * r.estibas,
      inv_expr = public.casco_agregar_termino(public.casco_quitar_termino(c.inv_expr, -r.estibas),
                                              coalesce(c.inventario, 0) + r.estibas, r.estibas),
      hl = round((coalesce(c.inventario, 0) + 2 * r.estibas + coalesce(c.baja, 0)) * coalesce(c.hl_estiba, public.casco_hl_estiba(r.sku), 0), 4),
      actualizado_en = now()
     where c.fecha = r.fecha and c.ubicacion = r.ubic_origen and c.sku = r.sku;
    update public.casco_movimientos set ubic_destino = r.ubic_origen, ubic_origen = null where id = r.id;
    v_n := v_n + 1;
  end loop;
  raise notice 'Movimientos CA22 → AG07 corregidos: %', v_n;
end $corrige$;

commit;
