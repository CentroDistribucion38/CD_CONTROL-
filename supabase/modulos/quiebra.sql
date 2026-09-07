-- =====================================================================
-- CONTROL · MÓDULO QUIEBRA (producto averiado)
-- Requiere: supabase/00-nucleo.sql y supabase/modulos/inventario.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
--
-- Flujo: el operario REPORTA la avería → un supervisor la APRUEBA →
-- al aprobarse se genera la salida de inventario. Mientras esté
-- reportada no toca existencias.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type estado_quiebra as enum ('reportada', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Catálogo de causas — se administra desde la app, sin tocar SQL
-- ---------------------------------------------------------------------
create table if not exists public.causas_quiebra (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  nombre    text not null,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into public.causas_quiebra (codigo, nombre) values
  ('GOLPE',     'Golpe o caída en manipulación'),
  ('MONTAC',    'Daño con montacargas o estibador'),
  ('ESTIBA',    'Mal estibado o estiba colapsada'),
  ('EMPAQUE',   'Empaque defectuoso de fábrica'),
  ('DERRAME',   'Derrame o rotura de contenido'),
  ('TRANSPORT', 'Daño en transporte'),
  ('ALMACEN',   'Deterioro por condiciones de almacenamiento'),
  ('OTRO',      'Otra causa')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- 3. Quiebras
-- ---------------------------------------------------------------------
create sequence if not exists public.quiebras_consecutivo_seq;

create table if not exists public.quiebras (
  id              uuid primary key default gen_random_uuid(),
  consecutivo     text not null unique
                    default 'QB-' || lpad(nextval('public.quiebras_consecutivo_seq')::text, 6, '0'),
  producto_id     uuid not null references public.productos(id) on delete restrict,
  bodega_id       uuid not null references public.bodegas(id) on delete restrict,
  causa_id        uuid references public.causas_quiebra(id) on delete set null,
  cantidad        numeric(14,3) not null check (cantidad > 0),
  lote            text,
  nota            text,
  estado          estado_quiebra not null default 'reportada',

  reportado_por   uuid references public.perfiles(id) on delete set null,
  reportado_en    timestamptz not null default now(),

  resuelto_por    uuid references public.perfiles(id) on delete set null,
  resuelto_en     timestamptz,
  nota_resolucion text,

  movimiento_id   uuid references public.movimientos(id) on delete set null
);

create index if not exists quiebras_estado_idx   on public.quiebras (estado, reportado_en desc);
create index if not exists quiebras_producto_idx on public.quiebras (producto_id);
create index if not exists quiebras_fecha_idx    on public.quiebras (reportado_en desc);

-- ---------------------------------------------------------------------
-- 4. Aprobar / rechazar
-- ---------------------------------------------------------------------

-- Aprueba la quiebra y descuenta el producto del inventario.
create or replace function public.aprobar_quiebra(
  p_quiebra_id uuid,
  p_nota       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q            public.quiebras%rowtype;
  v_movimiento uuid;
  v_costo      numeric(14,2);
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede aprobar una quiebra';
  end if;

  select * into q from public.quiebras where id = p_quiebra_id for update;

  if q.id is null then
    raise exception 'La quiebra no existe';
  end if;
  if q.estado <> 'reportada' then
    raise exception 'La quiebra ya fue % y no se puede volver a procesar', q.estado;
  end if;

  select costo_unitario into v_costo from public.productos where id = q.producto_id;

  insert into public.movimientos
    (tipo, producto_id, bodega_id, cantidad, costo_unitario, referencia, nota, usuario_id)
  values
    ('salida', q.producto_id, q.bodega_id, q.cantidad, coalesce(v_costo, 0),
     q.consecutivo, 'Salida por quiebra (producto averiado)', auth.uid())
  returning id into v_movimiento;

  update public.quiebras
     set estado          = 'aprobada',
         resuelto_por    = auth.uid(),
         resuelto_en     = now(),
         nota_resolucion = p_nota,
         movimiento_id   = v_movimiento
   where id = p_quiebra_id;

  return v_movimiento;
end $$;

-- Rechaza la quiebra. No toca inventario.
create or replace function public.rechazar_quiebra(
  p_quiebra_id uuid,
  p_nota       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado estado_quiebra;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede rechazar una quiebra';
  end if;

  select estado into v_estado from public.quiebras where id = p_quiebra_id for update;

  if v_estado is null then
    raise exception 'La quiebra no existe';
  end if;
  if v_estado <> 'reportada' then
    raise exception 'La quiebra ya fue % y no se puede volver a procesar', v_estado;
  end if;

  update public.quiebras
     set estado          = 'rechazada',
         resuelto_por    = auth.uid(),
         resuelto_en     = now(),
         nota_resolucion = p_nota
   where id = p_quiebra_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Vistas de reporte
-- ---------------------------------------------------------------------
create or replace view public.v_quiebras as
select
  q.id,
  q.consecutivo,
  q.estado,
  q.cantidad,
  q.lote,
  q.nota,
  q.reportado_en,
  q.resuelto_en,
  q.nota_resolucion,
  p.sku,
  p.nombre                                   as producto,
  p.unidad,
  p.costo_unitario,
  round(q.cantidad * p.costo_unitario, 2)    as valor_perdido,
  b.codigo                                   as bodega_codigo,
  b.nombre                                   as bodega,
  c.codigo                                   as causa_codigo,
  c.nombre                                   as causa,
  rep.nombre                                 as reportado_por,
  res.nombre                                 as resuelto_por
from public.quiebras q
join public.productos p       on p.id = q.producto_id
join public.bodegas   b       on b.id = q.bodega_id
left join public.causas_quiebra c on c.id = q.causa_id
left join public.perfiles rep on rep.id = q.reportado_por
left join public.perfiles res on res.id = q.resuelto_por;

-- Pérdida acumulada por causa (solo lo aprobado)
create or replace view public.v_quiebras_por_causa as
select
  coalesce(c.nombre, 'Sin causa')         as causa,
  count(*)                                as casos,
  sum(q.cantidad)                         as unidades,
  round(sum(q.cantidad * p.costo_unitario), 2) as valor_perdido
from public.quiebras q
join public.productos p on p.id = q.producto_id
left join public.causas_quiebra c on c.id = q.causa_id
where q.estado = 'aprobada'
group by 1
order by 4 desc;

-- Pérdida acumulada por producto (solo lo aprobado)
create or replace view public.v_quiebras_por_producto as
select
  p.sku,
  p.nombre                                as producto,
  p.unidad,
  count(*)                                as casos,
  sum(q.cantidad)                         as unidades,
  round(sum(q.cantidad * p.costo_unitario), 2) as valor_perdido
from public.quiebras q
join public.productos p on p.id = q.producto_id
where q.estado = 'aprobada'
group by 1, 2, 3
order by 6 desc;

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table public.causas_quiebra enable row level security;
alter table public.quiebras       enable row level security;

-- Causas: todos leen, solo editores administran
drop policy if exists causas_quiebra_select on public.causas_quiebra;
create policy causas_quiebra_select on public.causas_quiebra
  for select to authenticated using (true);

drop policy if exists causas_quiebra_write on public.causas_quiebra;
create policy causas_quiebra_write on public.causas_quiebra
  for all to authenticated
  using (public.es_editor()) with check (public.es_editor());

-- Quiebras: todos leen
drop policy if exists quiebras_select on public.quiebras;
create policy quiebras_select on public.quiebras
  for select to authenticated using (true);

-- Cualquier usuario autenticado REPORTA, siempre a su propio nombre
-- y siempre en estado 'reportada'. No puede auto-aprobarse.
drop policy if exists quiebras_insert on public.quiebras;
create policy quiebras_insert on public.quiebras
  for insert to authenticated
  with check (
    estado = 'reportada'
    and reportado_por = auth.uid()
    and movimiento_id is null
    and resuelto_por is null
  );

-- Corregir una quiebra propia mientras siga pendiente
drop policy if exists quiebras_update_propia on public.quiebras;
create policy quiebras_update_propia on public.quiebras
  for update to authenticated
  using (reportado_por = auth.uid() and estado = 'reportada')
  with check (estado = 'reportada');

-- Aprobar y rechazar pasan por las funciones security definer de arriba,
-- que verifican el rol. No se abre update general a supervisores para que
-- nadie pueda cambiar un estado sin generar el movimiento correspondiente.

grant select on
  public.v_quiebras,
  public.v_quiebras_por_causa,
  public.v_quiebras_por_producto
to authenticated;
