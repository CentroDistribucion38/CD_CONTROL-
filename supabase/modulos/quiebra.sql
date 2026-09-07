-- =====================================================================
-- CONTROL · MÓDULO QUIEBRA (rotura de envase retornable)
-- Requiere: supabase/00-nucleo.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
--
-- El módulo se alimenta de dos hojas del maestro:
--   BAJA MB51 → bajas de SAP (la pérdida)
--   ZPREC     → producción (el denominador)
-- La quiebra es pérdida / producción, medida contra una meta mensual.
--
-- Cada importación REEMPLAZA POR RANGO: borra solo las fechas que trae
-- el archivo y vuelve a insertarlas. Así un archivo parcial no borra el
-- histórico anterior y volver a subir el mismo maestro no duplica nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Limpieza del módulo anterior (reporte manual de averías)
--    Se reemplazó por el flujo de importación. Si nunca lo usaste, no
--    pierdes nada; si tenías datos ahí, respáldalos antes de correr esto.
-- ---------------------------------------------------------------------
drop function if exists public.aprobar_quiebra(uuid, text);
drop function if exists public.rechazar_quiebra(uuid, text);
drop view if exists public.v_quiebras;
drop view if exists public.v_quiebras_por_causa;
drop view if exists public.v_quiebras_por_producto;
drop table if exists public.conteo_lineas_quiebra;
drop table if exists public.quiebras;
drop table if exists public.causas_quiebra;
drop type if exists estado_quiebra;

-- ---------------------------------------------------------------------
-- 1. Registro de cargas — la bitácora de quién subió qué
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_cargas (
  id                uuid primary key default gen_random_uuid(),
  archivo           text,
  desde             date not null,
  hasta             date not null,
  filas_bajas       integer not null default 0,
  filas_produccion  integer not null default 0,
  cargado_por       uuid references public.perfiles(id) on delete set null,
  cargado_en        timestamptz not null default now()
);

create index if not exists quiebra_cargas_fecha_idx on public.quiebra_cargas (cargado_en desc);

-- ---------------------------------------------------------------------
-- 2. Bajas (hoja BAJA MB51)
--    cantidad se guarda NETA y en positivo: los reversos de SAP vienen
--    con cantidad positiva y aquí entran en negativo, así la suma resta.
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_bajas (
  id           bigserial primary key,
  fecha        date not null,
  documento    text,
  material     text,
  denominacion text,
  causal       text not null default 'Otros',
  causal_sap   text,
  almacen      text,
  cmv          integer,
  cantidad     numeric(16,3) not null,
  carga_id     uuid references public.quiebra_cargas(id) on delete set null
);

create index if not exists quiebra_bajas_fecha_idx    on public.quiebra_bajas (fecha);
create index if not exists quiebra_bajas_causal_idx   on public.quiebra_bajas (causal);
create index if not exists quiebra_bajas_almacen_idx  on public.quiebra_bajas (almacen);
create index if not exists quiebra_bajas_material_idx on public.quiebra_bajas (material);

-- ---------------------------------------------------------------------
-- 3. Producción (hoja ZPREC)
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_produccion (
  id           bigserial primary key,
  fecha        date not null,
  centro       text,
  linea        integer,
  volumen      text,
  material     text,
  descripcion  text,
  orden        text,
  cantidad     numeric(16,3) not null,
  cantidad_hl  numeric(16,3),
  tipo         text,
  carga_id     uuid references public.quiebra_cargas(id) on delete set null
);

create index if not exists quiebra_prod_fecha_idx on public.quiebra_produccion (fecha);
create index if not exists quiebra_prod_linea_idx on public.quiebra_produccion (linea);

-- ---------------------------------------------------------------------
-- 4. Metas mensuales — editables desde la app
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_metas (
  anio  integer not null,
  mes   integer not null check (mes between 1 and 12),
  meta  numeric(6,5) not null,
  primary key (anio, mes)
);

insert into public.quiebra_metas (anio, mes, meta) values
  (2026,1,0.0173),(2026,2,0.0433),(2026,3,0.0108),(2026,4,0.0108),
  (2026,5,0.0109),(2026,6,0.0164),(2026,7,0.0142),(2026,8,0.0119),
  (2026,9,0.0168),(2026,10,0.0192),(2026,11,0.0212),(2026,12,0.0289)
on conflict (anio, mes) do nothing;

-- ---------------------------------------------------------------------
-- 5. Reemplazo por rango — el corazón de la importación
--    Borra únicamente las fechas que trae el archivo.
-- ---------------------------------------------------------------------
create or replace function public.quiebra_limpiar_rango(p_desde date, p_hasta date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede importar';
  end if;
  delete from public.quiebra_bajas      where fecha between p_desde and p_hasta;
  delete from public.quiebra_produccion where fecha between p_desde and p_hasta;
end $$;

-- ---------------------------------------------------------------------
-- 6. Vistas de lectura para el tablero
-- ---------------------------------------------------------------------

-- Día: producción, pérdida y porcentaje
create or replace view public.v_quiebra_dia as
with p as (select fecha, sum(cantidad) prod from public.quiebra_produccion group by 1),
     b as (select fecha, sum(cantidad) perd from public.quiebra_bajas      group by 1)
select
  coalesce(p.fecha, b.fecha)                       as fecha,
  coalesce(p.prod, 0)                              as produccion,
  coalesce(b.perd, 0)                              as perdida,
  case when coalesce(p.prod,0) > 0
       then coalesce(b.perd,0) / p.prod end        as pct
from p full outer join b on b.fecha = p.fecha;

-- Mes: contra la meta
create or replace view public.v_quiebra_mes as
with p as (select date_trunc('month',fecha)::date m, sum(cantidad) prod
             from public.quiebra_produccion group by 1),
     b as (select date_trunc('month',fecha)::date m, sum(cantidad) perd
             from public.quiebra_bajas group by 1)
select
  coalesce(p.m, b.m)                                as mes,
  extract(year  from coalesce(p.m, b.m))::int       as anio,
  extract(month from coalesce(p.m, b.m))::int       as num_mes,
  coalesce(p.prod, 0)                               as produccion,
  coalesce(b.perd, 0)                               as perdida,
  case when coalesce(p.prod,0) > 0
       then coalesce(b.perd,0) / p.prod end         as pct,
  mt.meta
from p full outer join b on b.m = p.m
left join public.quiebra_metas mt
  on mt.anio = extract(year  from coalesce(p.m,b.m))::int
 and mt.mes  = extract(month from coalesce(p.m,b.m))::int;

-- Causal
create or replace view public.v_quiebra_causal as
select causal, sum(cantidad) as unidades, count(*) as movimientos
from public.quiebra_bajas group by causal order by 2 desc;

-- Material
create or replace view public.v_quiebra_material as
select material, max(denominacion) as denominacion,
       sum(cantidad) as unidades, count(*) as movimientos
from public.quiebra_bajas group by material order by 3 desc;

-- Almacén
create or replace view public.v_quiebra_almacen as
select almacen, sum(cantidad) as unidades, count(*) as movimientos
from public.quiebra_bajas group by almacen order by 2 desc;

-- ---------------------------------------------------------------------
-- 7. RLS — todos leen, solo editores importan
-- ---------------------------------------------------------------------
alter table public.quiebra_cargas     enable row level security;
alter table public.quiebra_bajas      enable row level security;
alter table public.quiebra_produccion enable row level security;
alter table public.quiebra_metas      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['quiebra_cargas','quiebra_bajas','quiebra_produccion','quiebra_metas'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_editor()) with check (public.es_editor())',
      t||'_write', t);
  end loop;
end $$;

grant select on
  public.v_quiebra_dia, public.v_quiebra_mes, public.v_quiebra_causal,
  public.v_quiebra_material, public.v_quiebra_almacen
to authenticated;
