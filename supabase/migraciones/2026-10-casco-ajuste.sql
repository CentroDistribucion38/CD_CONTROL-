-- =====================================================================
-- CASCO DE VIDRIO · MOVIMIENTO · AJUSTE POR ALMACÉN
--
-- «En Movimiento necesito un registro de ajuste por almacén, para que reste en el inventario de casco:
--  solo colocar almacén, SKU y la cantidad.»
--
-- Un ajuste es un movimiento sin receptor: se RESTA de la tabla de Control de ese almacén (Inventario
-- casco de vidrio) el día escogido. Queda en casco_movimientos (ajuste = true, destino «AJUSTE»), sale
-- en «Movimientos registrados» y se deshace con la misma × (casco_movimiento_quitar devuelve lo restado).
--
-- Correr DESPUÉS de 2026-10-casco-movimientos.sql y 2026-10-casco-negativos.sql. Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.casco_movimientos add column if not exists ajuste boolean not null default false;
alter table public.casco_movimientos add column if not exists motivo text;

create or replace view public.v_casco_movimientos
with (security_invoker = true) as
  select m.id, m.fecha, m.origen, m.destino, m.sku,
         coalesce(p.nombre, e.nombre, m.sku) as descripcion,
         m.estibas, m.entrega, m.placa, m.afecta, m.ubic_origen, m.ubic_destino, m.creado_en,
         m.ajuste, m.motivo
    from public.casco_movimientos m
    left join public.productos p on p.sku = m.sku
    left join public.casco_extras e on e.sku = m.sku;
grant select on public.v_casco_movimientos to authenticated;

-- p_filas: [{ "ubicacion": "<clave de la tabla de Control>", "sku": "3500887", "estibas": 5, "motivo": "…" }]
create or replace function public.casco_ajuste_registrar(p_fecha date, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_n integer := 0; v_i integer := 0;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  u public.casco_ubicaciones%rowtype; v_sku text; v_est numeric;
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
    select * into u from public.casco_ubicaciones where clave = btrim(coalesce(f->>'ubicacion', ''));
    if not found then raise exception 'Línea %: escoge el almacén', v_i; end if;
    if v_sku = '' then raise exception 'Línea %: falta el material', v_i; end if;
    if v_est <= 0 then raise exception 'Línea %: la cantidad (estibas) tiene que ser mayor que cero', v_i; end if;

    insert into public.casco_movimientos
      (fecha, origen, destino, ubic_origen, sku, estibas, afecta, ajuste, motivo, creado_por)
    values
      (p_fecha, u.nombre, 'AJUSTE', u.clave, v_sku, v_est, true, true,
       nullif(btrim(coalesce(f->>'motivo', '')), ''), auth.uid());

    perform public.casco_aplicar_delta(p_fecha, u.clave, v_sku, -v_est);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.casco_ajuste_registrar(date, jsonb) to authenticated;

commit;
