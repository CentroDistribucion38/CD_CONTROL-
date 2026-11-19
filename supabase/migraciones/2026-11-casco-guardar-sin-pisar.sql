-- =====================================================================
-- CASCO DE VIDRIO · GUARDAR CONTROL YA NO PISA LO QUE ENTRÓ MIENTRAS TANTO
--
-- Lo que pasó (18 nov): el traspaso 7698218409 (36 estibas de 3500162)
-- restó en Fábrica a las 23:30 y sumó en Carnaval; a las 23:37 se guardó
-- la tabla de Fábrica en Control con los saldos que tenía la pantalla
-- desde antes, y el -36 se borró (Fábrica volvió a 128,22).
--
-- Control guarda la tabla COMPLETA. La pantalla ya revisaba si la base
-- había cambiado, pero desde el navegador (si esa consulta falla, o con
-- un borrador viejo, o en otro equipo) se podía colar. Ahora lo revisa
-- la BASE en el mismo momento de guardar: si la tabla de ese día cambió
-- después de que la pantalla la trajo, no se guarda y se avisa.
-- Además queda QUIÉN guardó por última vez cada renglón (actualizado_por).
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.casco_registros add column if not exists actualizado_por uuid references public.perfiles(id) on delete set null;

drop function if exists public.casco_guardar(date, text, jsonb);
create or replace function public.casco_guardar(p_fecha date, p_ubicacion text, p_filas jsonb, p_marca text default 'sin-marca')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_sku text; v_inv numeric; v_baja numeric; v_fac numeric;
  v_n integer := 0; v_skus text[] := '{}'; v_hoy date;
  v_tiene_baja boolean; v_puesto text; v_calidad text; v_ult timestamptz;
begin
  if not public.casco_puede_editar() then
    raise exception 'No tienes permiso para registrar casco de vidrio';
  end if;
  v_hoy := (now() at time zone 'America/Bogota')::date;
  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'Esa fecha todavía no ha llegado';
  end if;
  select (baja_rotulo is not null) into v_tiene_baja
    from public.casco_ubicaciones where clave = p_ubicacion and activo;
  if v_tiene_baja is null then
    raise exception 'Esa ubicación no existe o está apagada';
  end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas tienen que venir como lista';
  end if;

  /* NO PISAR LO QUE CAMBIÓ MIENTRAS LA TABLA ESTABA ABIERTA. Control guarda la tabla COMPLETA; si entre que se
     abrió y se guardó entró un traspaso, una baja, un movimiento u otro guardado, guardar devolvería los saldos
     viejos y borraría eso (así se perdió un -36 de Fábrica). p_marca = la hora del último cambio que traía la
     pantalla (null = la tabla arrancó vacía ese día). 'sin-marca' = una pantalla vieja que no la manda. */
  if p_marca is distinct from 'sin-marca' then
    select max(actualizado_en) into v_ult from public.casco_registros where fecha = p_fecha and ubicacion = p_ubicacion;
    if v_ult is not null and (p_marca is null or v_ult > p_marca::timestamptz) then
      raise exception 'CHOQUE: mientras tenías esta tabla abierta entraron bajas, movimientos, un traspaso o alguien la guardó. No se guardó para no borrarlo: toca «Descartar cambios» para traer lo actual y vuelve a teclear lo tuyo.';
    end if;
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_sku  := btrim(coalesce(f->>'sku', ''));
    v_inv  := coalesce(nullif(f->>'inventario', '')::numeric, 0);
    v_baja := case when v_tiene_baja then coalesce(nullif(f->>'baja', '')::numeric, 0) else 0 end;
    v_puesto  := nullif(left(btrim(coalesce(f->>'puesto', '')), 120), '');
    v_calidad := nullif(left(btrim(coalesce(f->>'calidad', '')), 240), '');

    if v_sku = '' then raise exception 'Hay un renglón sin material'; end if;
    if v_sku = any(v_skus) then raise exception 'El material % está dos veces en la lista', v_sku; end if;
    -- NEGATIVOS PERMITIDOS: si ayer salieron 80 y había 26, queda -54. La pantalla lo pinta en rojo.

    v_fac := public.casco_hl_estiba(v_sku);
    if v_fac is null then
      raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', v_sku;
    end if;

    insert into public.casco_registros as r
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad, creado_por, actualizado_por)
    values
      (p_fecha, p_ubicacion, v_sku, v_inv, nullif(btrim(coalesce(f->>'inv_expr', '')), ''),
       case when v_tiene_baja then v_baja end,
       case when v_tiene_baja then nullif(btrim(coalesce(f->>'baja_expr', '')), '') end,
       round((v_inv + v_baja) * v_fac, 4), v_fac, 'registro', v_puesto, v_calidad, auth.uid(), auth.uid())
    on conflict (fecha, ubicacion, sku) do update set
      inventario = excluded.inventario, inv_expr = excluded.inv_expr,
      baja = excluded.baja, baja_expr = excluded.baja_expr,
      hl = excluded.hl, hl_estiba = excluded.hl_estiba,
      puesto = excluded.puesto, calidad = excluded.calidad,
      origen = 'registro', actualizado_en = now(), actualizado_por = auth.uid();

    v_skus := v_skus || v_sku;
    v_n := v_n + 1;
  end loop;

  delete from public.casco_registros
   where fecha = p_fecha and ubicacion = p_ubicacion and not (sku = any(v_skus));

  return v_n;
end $$;
grant execute on function public.casco_guardar(date, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;

do $$ begin
  raise notice '----------------------------------------------------------';
  raise notice 'Control de casco ya no pisa traspasos, bajas ni movimientos ... ok';
  raise notice '----------------------------------------------------------';
end $$;
