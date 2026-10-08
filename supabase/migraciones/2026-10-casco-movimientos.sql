-- =====================================================================
-- CASCO DE VIDRIO — REGISTRAR · MOVIMIENTO (entre almacenes y al cliente)
-- ---------------------------------------------------------------------
-- La hoja «Movimiento» del Excel trae, por material:
--   FECHA · ALM ORIGEN · ALM RECEPTOR // CLIENTE · MATERIAL · DESCRIPCIÓN ·
--   CANTIDAD (EST) · N° ENTREGA · PLACA
--
-- COMO SE ALIMENTA CONTROL (lo que dijiste):
--   · Sale de AG22 o AG18 hacia AG07 → se RESTA del origen y se SUMA a AG07.
--   · Sale de AG07 hacia el cliente   → se RESTA de AG07.
--   · Un movimiento que solo se REGISTRA (ej. CA22 → AG07) no toca el
--     inventario: la casilla «Descuenta inventario» va apagada.
--
-- LOS DESPLEGABLES SON UN MAESTRO QUE SE EDITA (agregar, cambiar, borrar):
--   · ALM ORIGEN        AG22, AG18, AG07, CA22
--   · ALM RECEPTOR      AG07
--   · CLIENTE           0005201060 CRISTALERIA PELDAR S A
-- Cada almacén del maestro puede apuntar a una tabla de Control; eso es
-- lo que decide a cuál se resta o se suma. El cliente no tiene tabla.
--
-- Se puede correr varias veces. Correr DESPUÉS de 2026-10-casco-registrar-baja.sql.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. EL MAESTRO DE LOS DESPLEGABLES
-- ---------------------------------------------------------------------
create table if not exists public.casco_mov_maestro (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null check (tipo in ('origen', 'receptor', 'cliente')),
  codigo    text,
  nombre    text not null,
  /* La tabla de Control que este almacén mueve. NULL = no tiene (un cliente, o un almacén que solo se registra). */
  ubicacion text references public.casco_ubicaciones(clave) on delete set null,
  orden     integer,
  activo    boolean not null default true,
  /* Si un movimiento que SALE de este almacén descuenta el inventario por defecto. En la línea se puede cambiar.
     CA22 sale con «no descuenta»: se registra el movimiento pero no mueve el inventario de casco. */
  descuenta boolean not null default true,
  constraint casco_mov_maestro_unico unique (tipo, nombre)
);

alter table public.casco_mov_maestro add column if not exists descuenta boolean not null default true;

insert into public.casco_mov_maestro (tipo, codigo, nombre, ubicacion, orden, descuenta)
select 'origen', u.centro, u.nombre, u.clave, u.orden, (u.centro <> 'CA22')
  from public.casco_ubicaciones u where u.centro is not null
on conflict (tipo, nombre) do nothing;

insert into public.casco_mov_maestro (tipo, codigo, nombre, ubicacion, orden)
select 'receptor', u.centro, u.nombre, u.clave, u.orden
  from public.casco_ubicaciones u where u.centro = 'AG07'
on conflict (tipo, nombre) do nothing;

insert into public.casco_mov_maestro (tipo, codigo, nombre, ubicacion, orden) values
  ('cliente', '0005201060', '0005201060 CRISTALERIA PELDAR S A', null, 1)
on conflict (tipo, nombre) do nothing;

alter table public.casco_mov_maestro enable row level security;
drop policy if exists casco_mov_maestro_ver on public.casco_mov_maestro;
create policy casco_mov_maestro_ver on public.casco_mov_maestro
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco/registrar') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/maestro') in ('ver', 'editar'));
revoke insert, update, delete on public.casco_mov_maestro from authenticated;
grant select on public.casco_mov_maestro to authenticated;

-- ---------------------------------------------------------------------
-- 2. LOS MOVIMIENTOS
-- ---------------------------------------------------------------------
-- Guardan el NOMBRE de origen y destino tal como estaban (si el maestro cambia o se borra, el histórico
-- no se mueve) y las tablas de Control que de verdad se tocaron (`ubic_*`), para poder deshacerlos igual.
create table if not exists public.casco_movimientos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  origen_id    uuid references public.casco_mov_maestro(id) on delete set null,
  destino_id   uuid references public.casco_mov_maestro(id) on delete set null,
  origen       text not null,
  destino      text not null,
  ubic_origen  text references public.casco_ubicaciones(clave),
  ubic_destino text references public.casco_ubicaciones(clave),
  sku          text not null,
  estibas      numeric(12,2) not null check (estibas > 0),
  entrega      text,
  placa        text,
  afecta       boolean not null default true,
  creado_por   uuid references public.perfiles(id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index if not exists casco_mov_fecha_idx on public.casco_movimientos (fecha desc);
create index if not exists casco_mov_sku_idx on public.casco_movimientos (sku);

alter table public.casco_movimientos enable row level security;
drop policy if exists casco_mov_ver on public.casco_movimientos;
create policy casco_mov_ver on public.casco_movimientos
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco/registrar') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar'));
revoke insert, update, delete on public.casco_movimientos from authenticated;
grant select on public.casco_movimientos to authenticated;

create or replace view public.v_casco_movimientos
with (security_invoker = true) as
  select m.id, m.fecha, m.origen, m.destino, m.sku,
         coalesce(p.nombre, e.nombre, m.sku) as descripcion,
         m.estibas, m.entrega, m.placa, m.afecta, m.ubic_origen, m.ubic_destino, m.creado_en
    from public.casco_movimientos m
    left join public.productos p on p.sku = m.sku
    left join public.casco_extras e on e.sku = m.sku;
grant select on public.v_casco_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- 3. SUMAR O RESTAR ESTIBAS EN CONTROL (interna: la usan las dos funciones de abajo)
-- ---------------------------------------------------------------------
-- Si ese día no hay registro en ese sitio, arranca con el último saldo (igual que Control y que la baja).
create or replace function public.casco_asegurar_dia(p_fecha date, p_ubic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_prev date;
begin
  if exists (select 1 from public.casco_registros where fecha = p_fecha and ubicacion = p_ubic) then return; end if;
  select max(fecha) into v_prev from public.casco_registros where ubicacion = p_ubic and fecha < p_fecha;
  if v_prev is null then return; end if;
  insert into public.casco_registros
    (fecha, ubicacion, sku, inventario, baja, hl, hl_estiba, origen, puesto, calidad, creado_por)
  select p_fecha, ubicacion, sku, inventario, baja, hl, hl_estiba, 'registro', puesto, calidad, auth.uid()
    from public.casco_registros where ubicacion = p_ubic and fecha = v_prev;
end $$;
revoke all on function public.casco_asegurar_dia(date, text) from public, anon, authenticated;

-- p_delta lleva signo. El inventario NO puede quedar negativo: si no alcanza, avisa cuánto hay.
create or replace function public.casco_aplicar_delta(p_fecha date, p_ubic text, p_sku text, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hl numeric; v_reg public.casco_registros%rowtype; v_inv numeric; v_nuevo numeric;
  v_nombre text; v_rotulo text;
begin
  select nombre, baja_rotulo into v_nombre, v_rotulo from public.casco_ubicaciones where clave = p_ubic;
  v_hl := public.casco_hl_estiba(p_sku);
  if v_hl is null then
    raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', p_sku;
  end if;

  perform public.casco_asegurar_dia(p_fecha, p_ubic);
  select * into v_reg from public.casco_registros where fecha = p_fecha and ubicacion = p_ubic and sku = p_sku;

  if not found then
    if p_delta < 0 then
      raise exception 'En % no hay % registrado el %: el movimiento saca % estibas. Regístralo primero en Control.',
        v_nombre, p_sku, to_char(p_fecha, 'DD/MM/YYYY'), trim_scale(abs(p_delta));
    end if;
    insert into public.casco_registros
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, creado_por)
    values
      (p_fecha, p_ubic, p_sku, p_delta, public.casco_agregar_termino(null, 0, p_delta),
       case when v_rotulo is not null then 0 end, null,
       round(p_delta * v_hl, 4), v_hl, 'registro', auth.uid());
    return;
  end if;

  v_inv := coalesce(v_reg.inventario, 0);
  v_nuevo := v_inv + p_delta;
  if v_nuevo < 0 then
    raise exception 'En % el % hay % estibas de % y el movimiento saca %. Ajusta Control o la cantidad.',
      v_nombre, to_char(p_fecha, 'DD/MM/YYYY'), trim_scale(v_inv), p_sku, trim_scale(abs(p_delta));
  end if;
  update public.casco_registros set
    inventario = v_nuevo,
    inv_expr = public.casco_agregar_termino(v_reg.inv_expr, v_inv, p_delta),
    hl = round((v_nuevo + coalesce(v_reg.baja, 0)) * v_hl, 4), hl_estiba = v_hl,
    origen = 'registro', actualizado_en = now()
   where id = v_reg.id;
end $$;
revoke all on function public.casco_aplicar_delta(date, text, text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. REGISTRAR MOVIMIENTOS
-- ---------------------------------------------------------------------
-- p_filas = [{ "origen_id": "…", "destino_id": "…", "sku": "3500005", "estibas": 10,
--              "entrega": "7690228620", "placa": "SNR719", "afecta": true }, …]
-- Todo o nada: si una línea no se puede (no alcanza el inventario, falta el factor…), no entra ninguna.
-- Las líneas se aplican EN ORDEN: primero lo que llega a AG07 y después lo que sale de AG07.
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
  v_sku text; v_est numeric; v_afecta boolean;
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

    insert into public.casco_movimientos
      (fecha, origen_id, destino_id, origen, destino, ubic_origen, ubic_destino, sku, estibas,
       entrega, placa, afecta, creado_por)
    values
      (p_fecha, o.id, d.id, o.nombre, d.nombre,
       case when v_afecta then o.ubicacion end, case when v_afecta then d.ubicacion end,
       v_sku, v_est, nullif(btrim(coalesce(f->>'entrega', '')), ''),
       nullif(upper(btrim(coalesce(f->>'placa', ''))), ''), v_afecta, auth.uid());

    if v_afecta then
      if d.ubicacion is not null then perform public.casco_aplicar_delta(p_fecha, d.ubicacion, v_sku, v_est); end if;
      if o.ubicacion is not null then perform public.casco_aplicar_delta(p_fecha, o.ubicacion, v_sku, -v_est); end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.casco_movimiento_registrar(date, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. DESHACER UN MOVIMIENTO (revierte exactamente lo que se aplicó)
-- ---------------------------------------------------------------------
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
  if m.ubic_origen is not null then perform public.casco_aplicar_delta(m.fecha, m.ubic_origen, m.sku, m.estibas); end if;
  if m.ubic_destino is not null then perform public.casco_aplicar_delta(m.fecha, m.ubic_destino, m.sku, -m.estibas); end if;
  delete from public.casco_movimientos where id = p_id;
end $$;
grant execute on function public.casco_movimiento_quitar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. EDITAR EL MAESTRO DE LOS DESPLEGABLES
-- ---------------------------------------------------------------------
/* Los desplegables se editan en INVENTARIO · MAESTRO (lo ve y lo edita quien edita el maestro); quien registra
   movimientos solo los usa. Por si alguien ya tenía permiso de editar Registrar, también puede. */
create or replace function public.casco_mov_maestro_puede_editar()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.mi_nivel_pantalla('/inventario/maestro') = 'editar'
          or public.mi_nivel_pantalla('/inventario/casco/registrar') = 'editar' $$;
grant execute on function public.casco_mov_maestro_puede_editar() to authenticated;

drop function if exists public.casco_mov_maestro_guardar(uuid, text, text, text, text);
create or replace function public.casco_mov_maestro_guardar(
  p_id uuid, p_tipo text, p_codigo text, p_nombre text, p_ubicacion text, p_descuenta boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_nombre text := btrim(coalesce(p_nombre, ''));
        v_ubic text := nullif(btrim(coalesce(p_ubicacion, '')), '');
begin
  if not public.casco_mov_maestro_puede_editar() then
    raise exception 'No tienes permiso para editar los desplegables de movimientos';
  end if;
  if p_tipo not in ('origen', 'receptor', 'cliente') then raise exception 'Tipo de desplegable no válido'; end if;
  if v_nombre = '' then raise exception 'Escribe el nombre'; end if;
  if p_tipo = 'cliente' then v_ubic := null; end if;
  if v_ubic is not null and not exists (select 1 from public.casco_ubicaciones where clave = v_ubic) then
    raise exception 'Esa tabla de Control no existe';
  end if;

  if p_id is null then
    insert into public.casco_mov_maestro (tipo, codigo, nombre, ubicacion, orden, descuenta)
    values (p_tipo, nullif(btrim(coalesce(p_codigo, '')), ''), v_nombre, v_ubic,
            coalesce((select max(orden) from public.casco_mov_maestro where tipo = p_tipo), 0) + 1,
            coalesce(p_descuenta, true))
    returning id into v_id;
  else
    update public.casco_mov_maestro
       set codigo = nullif(btrim(coalesce(p_codigo, '')), ''), nombre = v_nombre, ubicacion = v_ubic,
           descuenta = coalesce(p_descuenta, true)
     where id = p_id and tipo = p_tipo
    returning id into v_id;
    if v_id is null then raise exception 'Ese renglón ya no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay uno con el nombre «%» en esa lista', v_nombre;
end $$;
grant execute on function public.casco_mov_maestro_guardar(uuid, text, text, text, text, boolean) to authenticated;

-- Borrar es seguro: los movimientos ya hechos guardan el nombre tal como estaba.
create or replace function public.casco_mov_maestro_borrar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.casco_mov_maestro_puede_editar() then
    raise exception 'No tienes permiso para editar los desplegables de movimientos';
  end if;
  delete from public.casco_mov_maestro where id = p_id;
end $$;
grant execute on function public.casco_mov_maestro_borrar(uuid) to authenticated;

commit;

select tipo, codigo, nombre, ubicacion, descuenta from public.casco_mov_maestro order by tipo, orden;
