-- =====================================================================
-- CONTROL · MÓDULO INVENTARIO
-- Requiere haber ejecutado antes supabase/00-nucleo.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos del módulo
-- ---------------------------------------------------------------------
do $$ begin
  create type tipo_movimiento as enum ('entrada', 'salida', 'ajuste', 'traslado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_conteo as enum ('borrador', 'en_proceso', 'cerrado', 'anulado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Catálogos
-- ---------------------------------------------------------------------
create table if not exists public.bodegas (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  nombre    text not null,
  direccion text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.productos (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,
  codigo_barras  text unique,
  nombre         text not null,
  descripcion    text,
  categoria      text,
  unidad         text not null default 'UND',
  costo_unitario numeric(14,2) not null default 0,
  stock_min      numeric(14,3) not null default 0,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists productos_nombre_idx on public.productos using gin (to_tsvector('spanish', nombre));
create index if not exists productos_categoria_idx on public.productos (categoria);

-- ---------------------------------------------------------------------
-- 3. Existencias (saldo por producto + bodega). La mantiene un trigger.
-- ---------------------------------------------------------------------
create table if not exists public.existencias (
  bodega_id      uuid not null references public.bodegas(id) on delete cascade,
  producto_id    uuid not null references public.productos(id) on delete cascade,
  cantidad       numeric(14,3) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (bodega_id, producto_id)
);

-- ---------------------------------------------------------------------
-- 4. Movimientos (kardex)
-- ---------------------------------------------------------------------
create table if not exists public.movimientos (
  id                uuid primary key default gen_random_uuid(),
  fecha             timestamptz not null default now(),
  tipo              tipo_movimiento not null,
  producto_id       uuid not null references public.productos(id) on delete restrict,
  bodega_id         uuid not null references public.bodegas(id) on delete restrict,
  bodega_destino_id uuid references public.bodegas(id) on delete restrict,
  cantidad          numeric(14,3) not null,
  costo_unitario    numeric(14,2) not null default 0,
  referencia        text,
  nota              text,
  conteo_id         uuid,
  usuario_id        uuid references public.perfiles(id) on delete set null,
  creado_en         timestamptz not null default now(),
  constraint cantidad_no_cero check (cantidad <> 0),
  constraint traslado_con_destino check (
    (tipo = 'traslado' and bodega_destino_id is not null and bodega_destino_id <> bodega_id)
    or (tipo <> 'traslado' and bodega_destino_id is null)
  )
);

create index if not exists movimientos_fecha_idx on public.movimientos (fecha desc);
create index if not exists movimientos_producto_idx on public.movimientos (producto_id, fecha desc);
create index if not exists movimientos_bodega_idx on public.movimientos (bodega_id, fecha desc);

create or replace function public.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta numeric(14,3);
begin
  delta := case
    when new.tipo = 'entrada'  then abs(new.cantidad)
    when new.tipo = 'salida'   then -abs(new.cantidad)
    when new.tipo = 'traslado' then -abs(new.cantidad)
    else new.cantidad -- ajuste: respeta el signo
  end;

  insert into public.existencias (bodega_id, producto_id, cantidad, actualizado_en)
  values (new.bodega_id, new.producto_id, delta, now())
  on conflict (bodega_id, producto_id)
  do update set cantidad = public.existencias.cantidad + excluded.cantidad,
                actualizado_en = now();

  if new.tipo = 'traslado' then
    insert into public.existencias (bodega_id, producto_id, cantidad, actualizado_en)
    values (new.bodega_destino_id, new.producto_id, abs(new.cantidad), now())
    on conflict (bodega_id, producto_id)
    do update set cantidad = public.existencias.cantidad + excluded.cantidad,
                  actualizado_en = now();
  end if;

  return new;
end $$;

drop trigger if exists trg_aplicar_movimiento on public.movimientos;
create trigger trg_aplicar_movimiento
  after insert on public.movimientos
  for each row execute function public.aplicar_movimiento();

-- ---------------------------------------------------------------------
-- 5. Conteos físicos
-- ---------------------------------------------------------------------
create table if not exists public.conteos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  bodega_id      uuid not null references public.bodegas(id) on delete restrict,
  estado         estado_conteo not null default 'borrador',
  nota           text,
  responsable_id uuid references public.perfiles(id) on delete set null,
  iniciado_en    timestamptz,
  cerrado_en     timestamptz,
  creado_en      timestamptz not null default now()
);

create table if not exists public.conteo_lineas (
  id               uuid primary key default gen_random_uuid(),
  conteo_id        uuid not null references public.conteos(id) on delete cascade,
  producto_id      uuid not null references public.productos(id) on delete restrict,
  cantidad_teorica numeric(14,3) not null default 0,
  cantidad_contada numeric(14,3),
  nota             text,
  contado_por      uuid references public.perfiles(id) on delete set null,
  contado_en       timestamptz,
  unique (conteo_id, producto_id)
);

create index if not exists conteo_lineas_conteo_idx on public.conteo_lineas (conteo_id);

alter table public.movimientos drop constraint if exists movimientos_conteo_id_fkey;
alter table public.movimientos
  add constraint movimientos_conteo_id_fkey
  foreign key (conteo_id) references public.conteos(id) on delete set null;

-- Congela el teórico y pasa el conteo a 'en_proceso'
create or replace function public.iniciar_conteo(p_conteo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bodega uuid;
begin
  select bodega_id into v_bodega from public.conteos where id = p_conteo_id and estado = 'borrador';
  if v_bodega is null then
    raise exception 'El conteo no existe o ya fue iniciado';
  end if;

  insert into public.conteo_lineas (conteo_id, producto_id, cantidad_teorica)
  select p_conteo_id, p.id, coalesce(e.cantidad, 0)
  from public.productos p
  left join public.existencias e on e.producto_id = p.id and e.bodega_id = v_bodega
  where p.activo
  on conflict (conteo_id, producto_id) do nothing;

  update public.conteos set estado = 'en_proceso', iniciado_en = now() where id = p_conteo_id;
end $$;

-- Cierra el conteo y genera los ajustes por diferencia
create or replace function public.cerrar_conteo(p_conteo_id uuid)
returns table (lineas_ajustadas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bodega uuid;
  v_count  integer := 0;
begin
  select bodega_id into v_bodega
    from public.conteos where id = p_conteo_id and estado = 'en_proceso';
  if v_bodega is null then
    raise exception 'El conteo no existe o no está en proceso';
  end if;

  with dif as (
    select producto_id, (cantidad_contada - cantidad_teorica) as delta
    from public.conteo_lineas
    where conteo_id = p_conteo_id
      and cantidad_contada is not null
      and cantidad_contada <> cantidad_teorica
  ), ins as (
    insert into public.movimientos
      (tipo, producto_id, bodega_id, cantidad, referencia, nota, conteo_id, usuario_id)
    select 'ajuste', producto_id, v_bodega, delta,
           'CONTEO', 'Ajuste automático por conteo físico', p_conteo_id, auth.uid()
    from dif
    returning 1
  )
  select count(*)::int into v_count from ins;

  update public.conteos set estado = 'cerrado', cerrado_en = now() where id = p_conteo_id;

  return query select v_count;
end $$;

-- ---------------------------------------------------------------------
-- 6. Vistas para reportes
-- ---------------------------------------------------------------------
create or replace view public.v_existencias as
select
  e.bodega_id,
  b.codigo as bodega_codigo,
  b.nombre as bodega_nombre,
  e.producto_id,
  p.sku,
  p.nombre as producto,
  p.categoria,
  p.unidad,
  p.costo_unitario,
  e.cantidad,
  p.stock_min,
  (e.cantidad <= p.stock_min) as bajo_minimo,
  round(e.cantidad * p.costo_unitario, 2) as valor,
  e.actualizado_en
from public.existencias e
join public.productos p on p.id = e.producto_id
join public.bodegas  b on b.id = e.bodega_id;

create or replace view public.v_conteo_diferencias as
select
  cl.conteo_id,
  c.codigo as conteo,
  c.estado,
  p.sku,
  p.nombre as producto,
  p.unidad,
  cl.cantidad_teorica,
  cl.cantidad_contada,
  coalesce(cl.cantidad_contada, 0) - cl.cantidad_teorica as diferencia,
  round((coalesce(cl.cantidad_contada, 0) - cl.cantidad_teorica) * p.costo_unitario, 2) as impacto_valor,
  cl.contado_en
from public.conteo_lineas cl
join public.conteos   c on c.id = cl.conteo_id
join public.productos p on p.id = cl.producto_id;

-- ---------------------------------------------------------------------
-- 7. RLS del módulo
-- ---------------------------------------------------------------------
alter table public.bodegas       enable row level security;
alter table public.productos     enable row level security;
alter table public.existencias   enable row level security;
alter table public.movimientos   enable row level security;
alter table public.conteos       enable row level security;
alter table public.conteo_lineas enable row level security;

-- Lectura: todo usuario autenticado
do $$
declare t text;
begin
  foreach t in array array['bodegas','productos','existencias','movimientos','conteos','conteo_lineas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
  end loop;
end $$;

-- Escritura en catálogos y apertura de conteos: admin y supervisor
do $$
declare t text;
begin
  foreach t in array array['bodegas','productos','conteos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_editor()) with check (public.es_editor())',
      t || '_write', t
    );
  end loop;
end $$;

-- Movimientos: cualquier autenticado registra; nadie edita ni borra
drop policy if exists movimientos_insert on public.movimientos;
create policy movimientos_insert on public.movimientos
  for insert to authenticated with check (true);

-- Líneas de conteo: cualquier autenticado captura cantidades
drop policy if exists conteo_lineas_write on public.conteo_lineas;
create policy conteo_lineas_write on public.conteo_lineas
  for all to authenticated using (true) with check (true);

-- existencias: sin política de escritura. Solo la toca el trigger.

grant select on public.v_existencias, public.v_conteo_diferencias to authenticated;
