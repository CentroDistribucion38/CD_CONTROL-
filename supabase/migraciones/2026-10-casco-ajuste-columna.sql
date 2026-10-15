-- =====================================================================
-- CASCO DE VIDRIO · AJUSTE POR ALMACÉN · ELEGIR LA COLUMNA QUE SE RESTA
--
-- Antes el ajuste siempre restaba del «Inventario casco de vidrio». Ahora cada línea escoge la columna:
--   · Inventario casco de vidrio  → en cualquier almacén;
--   · «Lavado con baja»           → solo en el almacén que la lleva (AG18 · Fábrica);
--   · «Extrasucio con baja»       → solo en el almacén que la lleva (AG22 · Bodega 38).
-- (el rótulo sale de casco_ubicaciones.baja_rotulo, así que no hay nada quemado aquí).
--
-- Se guarda la columna en el movimiento para que «deshacer» devuelva lo restado EN ESA columna.
--
-- Correr DESPUÉS de 2026-10-casco-ajuste.sql. Se puede correr varias veces. No toca datos existentes
-- (los ajustes viejos quedan como 'inventario', que es lo que hicieron).
-- =====================================================================
begin;

alter table public.casco_movimientos add column if not exists columna text not null default 'inventario';
alter table public.casco_movimientos drop constraint if exists casco_movimientos_columna_chk;
alter table public.casco_movimientos add constraint casco_movimientos_columna_chk check (columna in ('inventario', 'baja'));

create or replace view public.v_casco_movimientos
with (security_invoker = true) as
  select m.id, m.fecha, m.origen, m.destino, m.sku,
         coalesce(p.nombre, e.nombre, m.sku) as descripcion,
         m.estibas, m.entrega, m.placa, m.afecta, m.ubic_origen, m.ubic_destino, m.creado_en,
         m.ajuste, m.motivo, m.columna
    from public.casco_movimientos m
    left join public.productos p on p.sku = m.sku
    left join public.casco_extras e on e.sku = m.sku;
grant select on public.v_casco_movimientos to authenticated;

-- Sumar o restar (p_delta lleva signo) en la columna «inventario» o «baja» de un almacén.
-- 'inventario' usa la función de siempre; 'baja' hace lo mismo sobre la columna «… con baja».
create or replace function public.casco_aplicar_delta_col(p_fecha date, p_ubic text, p_sku text, p_delta numeric, p_columna text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hl numeric; v_reg public.casco_registros%rowtype; v_baja numeric; v_nuevo numeric;
  v_nombre text; v_rotulo text;
begin
  if coalesce(p_columna, 'inventario') = 'inventario' then
    perform public.casco_aplicar_delta(p_fecha, p_ubic, p_sku, p_delta);
    return;
  end if;
  if p_columna <> 'baja' then raise exception 'Columna desconocida: %', p_columna; end if;

  select nombre, baja_rotulo into v_nombre, v_rotulo from public.casco_ubicaciones where clave = p_ubic;
  if v_rotulo is null then
    raise exception '% no lleva columna «con baja»: el ajuste va al Inventario casco de vidrio', coalesce(v_nombre, p_ubic);
  end if;
  v_hl := public.casco_hl_estiba(p_sku);
  if v_hl is null then
    raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', p_sku;
  end if;

  perform public.casco_asegurar_dia(p_fecha, p_ubic);
  select * into v_reg from public.casco_registros where fecha = p_fecha and ubicacion = p_ubic and sku = p_sku;

  if not found then
    insert into public.casco_registros
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, creado_por)
    values
      (p_fecha, p_ubic, p_sku, 0, null, p_delta, public.casco_agregar_termino(null, 0, p_delta),
       round(p_delta * v_hl, 4), v_hl, 'registro', auth.uid());
    return;
  end if;

  v_baja := coalesce(v_reg.baja, 0);
  v_nuevo := v_baja + p_delta;
  update public.casco_registros set
    baja = v_nuevo,
    baja_expr = public.casco_agregar_termino(v_reg.baja_expr, v_baja, p_delta),
    hl = round((coalesce(v_reg.inventario, 0) + v_nuevo) * v_hl, 4), hl_estiba = v_hl,
    origen = 'registro', actualizado_en = now()
   where id = v_reg.id;
end $$;
revoke all on function public.casco_aplicar_delta_col(date, text, text, numeric, text) from public, anon, authenticated;

-- p_filas: [{ "ubicacion": "<clave>", "sku": "3501225", "estibas": 34, "signo": "-" | "+", "columna": "inventario" | "baja", "motivo": "…" }]
-- signo «-» resta de la columna (como siempre); «+» suma. Sin signo = resta.
create or replace function public.casco_ajuste_registrar(p_fecha date, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_n integer := 0; v_i integer := 0;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  u public.casco_ubicaciones%rowtype; v_sku text; v_est numeric; v_col text; v_sig integer;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para registrar ajustes de casco de vidrio';
  end if;
  if p_fecha is null or p_fecha > v_hoy then raise exception 'Esa fecha todavía no ha llegado'; end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas tienen que venir como lista';
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_sku := btrim(coalesce(f->>'sku', ''));
    v_est := round(coalesce(nullif(f->>'estibas', '')::numeric, 0), 2);
    v_col := case when f->>'columna' = 'baja' then 'baja' else 'inventario' end;
    v_sig := case when btrim(coalesce(f->>'signo', '-')) in ('+', '1', 'suma') then 1 else -1 end;
    select * into u from public.casco_ubicaciones where clave = btrim(coalesce(f->>'ubicacion', ''));
    if not found then raise exception 'Línea %: escoge el almacén', v_i; end if;
    if v_sku = '' then raise exception 'Línea %: falta el material', v_i; end if;
    if v_est <= 0 then raise exception 'Línea %: la cantidad (estibas) tiene que ser mayor que cero', v_i; end if;
    if v_col = 'baja' and u.baja_rotulo is null then
      raise exception 'Línea %: % no lleva columna «con baja»', v_i, u.nombre;
    end if;

    -- Resta: el almacén es el ORIGEN (sale). Suma: el almacén es el DESTINO (entra).
    insert into public.casco_movimientos
      (fecha, origen, destino, ubic_origen, ubic_destino, sku, estibas, afecta, ajuste, motivo, columna, creado_por)
    values
      (p_fecha,
       case when v_sig < 0 then u.nombre else 'AJUSTE' end,
       case when v_sig < 0 then 'AJUSTE' else u.nombre end,
       case when v_sig < 0 then u.clave end,
       case when v_sig > 0 then u.clave end,
       v_sku, v_est, true, true,
       nullif(btrim(coalesce(f->>'motivo', '')), ''), v_col, auth.uid());

    perform public.casco_aplicar_delta_col(p_fecha, u.clave, v_sku, v_sig * v_est, v_col);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.casco_ajuste_registrar(date, jsonb) to authenticated;

-- Deshacer: devuelve lo restado EN LA COLUMNA donde se restó.
create or replace function public.casco_movimiento_quitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare m public.casco_movimientos%rowtype;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para quitar movimientos de casco de vidrio';
  end if;
  select * into m from public.casco_movimientos where id = p_id;
  if not found then raise exception 'Ese movimiento ya no está'; end if;
  if m.ubic_origen is not null then perform public.casco_aplicar_delta_col(m.fecha, m.ubic_origen, m.sku, m.estibas, m.columna); end if;
  if m.ubic_destino is not null then perform public.casco_aplicar_delta_col(m.fecha, m.ubic_destino, m.sku, -m.estibas, m.columna); end if;
  delete from public.casco_movimientos where id = p_id;
end $$;
grant execute on function public.casco_movimiento_quitar(uuid) to authenticated;

commit;

-- Verificación: debe devolver las 3 funciones y la columna.
select (select count(*) from information_schema.columns where table_name = 'casco_movimientos' and column_name = 'columna') as columna_ok,
       (select count(*) from pg_proc where proname in ('casco_aplicar_delta_col', 'casco_ajuste_registrar', 'casco_movimiento_quitar')) as funciones_ok;
