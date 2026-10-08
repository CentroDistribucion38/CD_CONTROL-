-- =====================================================================
-- CASCO DE VIDRIO — la columna UBICACIONES y la columna CALIDAD
-- ---------------------------------------------------------------------
-- «No veo la columna para yo agregarle la ubicación.»
--
-- En la hoja CASCO de tu Excel, junto al HL, hay dos columnas más:
--   UBICACIONES   dónde está ese material en el sitio: P19, P16/20,
--                 «P13/16/17 - SORTING»…  → aquí es `puesto`.
--   CALIDAD       una nota: «105 PICO ABAJO + 22 CAJAS»  → `calidad`.
-- Las dos son por renglón (día · sitio · material) y son TEXTO LIBRE:
-- en el Excel una ubicación puede ser varios puestos juntos.
--
-- TAMBIÉN: la política de lectura ahora deja ver los registros a quien
-- tiene el TABLERO de casco (antes solo a quien tenía «Registrar»).
--
-- Se puede correr dos veces. Correr DESPUÉS de 2026-10-casco-de-vidrio.sql.
-- =====================================================================

alter table public.casco_registros
  add column if not exists puesto  text,
  add column if not exists calidad text;

-- ---------------------------------------------------------------------
-- LA VISTA: las dos columnas nuevas van AL FINAL (así lo exige
-- `create or replace view`).
-- ---------------------------------------------------------------------
create or replace view public.v_casco
with (security_invoker = true) as
  select r.id, r.fecha, r.ubicacion, u.nombre as ubicacion_nombre, u.baja_rotulo,
         r.sku, coalesce(p.nombre, e.nombre, r.sku) as descripcion,
         r.inventario, r.inv_expr, r.baja, r.baja_expr,
         r.hl, r.hl_estiba, r.origen, r.actualizado_en,
         r.puesto, r.calidad
    from public.casco_registros r
    join public.casco_ubicaciones u on u.clave = r.ubicacion
    left join public.productos p on p.sku = r.sku
    left join public.casco_extras e on e.sku = r.sku;
grant select on public.v_casco to authenticated;

-- ---------------------------------------------------------------------
-- LA LECTURA: Registrar o Tablero.
-- ---------------------------------------------------------------------
drop policy if exists casco_ver on public.casco_registros;
create policy casco_ver on public.casco_registros
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco/tablero') in ('ver', 'editar'));

-- ---------------------------------------------------------------------
-- GUARDAR: ahora también `puesto` y `calidad` por renglón.
-- Mismas reglas de antes (permiso, fecha, sitio, factor del maestro).
-- ---------------------------------------------------------------------
create or replace function public.casco_guardar(p_fecha date, p_ubicacion text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_sku text; v_inv numeric; v_baja numeric; v_fac numeric;
  v_n integer := 0; v_skus text[] := '{}'; v_hoy date;
  v_tiene_baja boolean; v_puesto text; v_calidad text;
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

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_sku  := btrim(coalesce(f->>'sku', ''));
    v_inv  := coalesce(nullif(f->>'inventario', '')::numeric, 0);
    v_baja := case when v_tiene_baja then coalesce(nullif(f->>'baja', '')::numeric, 0) else 0 end;
    v_puesto  := nullif(left(btrim(coalesce(f->>'puesto', '')), 120), '');
    v_calidad := nullif(left(btrim(coalesce(f->>'calidad', '')), 240), '');

    if v_sku = '' then raise exception 'Hay un renglón sin material'; end if;
    if v_sku = any(v_skus) then raise exception 'El material % está dos veces en la lista', v_sku; end if;
    if v_inv < 0 or v_baja < 0 then
      raise exception 'El material %: las estibas no pueden quedar negativas (revisa la suma)', v_sku;
    end if;

    v_fac := public.casco_hl_estiba(v_sku);
    if v_fac is null then
      raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', v_sku;
    end if;

    insert into public.casco_registros as r
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad, creado_por)
    values
      (p_fecha, p_ubicacion, v_sku, v_inv, nullif(btrim(coalesce(f->>'inv_expr', '')), ''),
       case when v_tiene_baja then v_baja end,
       case when v_tiene_baja then nullif(btrim(coalesce(f->>'baja_expr', '')), '') end,
       round((v_inv + v_baja) * v_fac, 4), v_fac, 'registro', v_puesto, v_calidad, auth.uid())
    on conflict (fecha, ubicacion, sku) do update set
      inventario = excluded.inventario, inv_expr = excluded.inv_expr,
      baja = excluded.baja, baja_expr = excluded.baja_expr,
      hl = excluded.hl, hl_estiba = excluded.hl_estiba,
      puesto = excluded.puesto, calidad = excluded.calidad,
      origen = 'registro', actualizado_en = now();

    v_skus := v_skus || v_sku;
    v_n := v_n + 1;
  end loop;

  delete from public.casco_registros
   where fecha = p_fecha and ubicacion = p_ubicacion and not (sku = any(v_skus));

  return v_n;
end $$;
grant execute on function public.casco_guardar(date, text, jsonb) to authenticated;
