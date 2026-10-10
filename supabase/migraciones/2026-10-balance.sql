/* =====================================================================
   INVENTARIO · BALANCE — v3
   ===================================================================== */

-- PRIMERO: borrar vistas viejas (las columnas cambiaron y CREATE OR
-- REPLACE no puede renombrar columnas de una vista existente).
drop view if exists public.v_balance_bloques cascade;
drop view if exists public.v_balance cascade;
drop view if exists public.v_balance_fisico cascade;
drop view if exists public.v_balance_casco cascade;

/* =====================================================================
   TABLAS REALES:
     fefo_conteos       (id uuid, fecha date, estado text, ...)
     fefo_lineas        (id uuid, conteo_id uuid, codigo bigint, calle text,
                         modulo text, lado text, estibas int, cajas int,
                         estado_envase text, ...)
     fefo_materiales    (codigo bigint, descripcion text, cajas_por_estiba int,
                         unidades_por_caja int, ...)
     casco_registros    (id uuid, fecha date, ubicacion text, sku text,
                         baja numeric, baja_expr text, hl numeric, ...)
   ===================================================================== */

-- =====================================================================
-- 1. TABLA DE SITIOS — mapeo alcance <-> ubicaciones de casco
-- =====================================================================
create table if not exists public.balance_sitios (
  id         bigint generated always as identity primary key,
  alcance    text not null,
  ubicacion  text not null unique
);

truncate public.balance_sitios;
insert into public.balance_sitios (alcance, ubicacion)
select 'SORTING', u.clave
  from public.casco_ubicaciones u
 where u.clave ilike '%fabrica%'
    or u.clave ilike '%fábrica%'
    or u.centro ilike '%AG18%'
    or u.centro ilike '%fabrica%'
    or u.centro ilike '%fábrica%'
on conflict (ubicacion) do nothing;

insert into public.balance_sitios (alcance, ubicacion)
select 'PRESORTING', u.clave
  from public.casco_ubicaciones u
 where u.clave ilike '%bodega 38%'
    or u.clave ilike '%bodega38%'
    or u.clave ilike '%barranquilla%'
    or u.centro ilike '%AG22%'
    or u.centro ilike '%bodega%38%'
    or u.centro ilike '%barranquilla%'
on conflict (ubicacion) do nothing;

-- =====================================================================
-- 2. TABLA DE RECLASIFICACIONES (conteo_envase_id es UUID)
-- =====================================================================
drop table if exists public.balance_reclasificaciones cascade;
create table public.balance_reclasificaciones (
  id              bigint generated always as identity primary key,
  conteo_envase_id uuid not null,
  estado_original text not null,
  estado_nuevo    text not null,
  motivo          text,
  usuario_id      uuid default auth.uid(),
  creado_en       timestamptz default now(),
  constraint chk_estados check (estado_nuevo in ('BAJA','LAVADO','EXTRASUCIO'))
);

create index if not exists ix_bal_reclas_envase
  on public.balance_reclasificaciones (conteo_envase_id);

alter table public.balance_reclasificaciones enable row level security;
drop policy if exists "bal_reclas_ver" on public.balance_reclasificaciones;
create policy "bal_reclas_ver" on public.balance_reclasificaciones
  for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
drop policy if exists "bal_reclas_ins" on public.balance_reclasificaciones;
create policy "bal_reclas_ins" on public.balance_reclasificaciones
  for insert with check (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));
drop policy if exists "bal_reclas_del" on public.balance_reclasificaciones;
create policy "bal_reclas_del" on public.balance_reclasificaciones
  for delete using (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));

-- =====================================================================
-- 3. TABLA DE AJUSTES — ANTES de las vistas porque v_balance la usa
-- =====================================================================
drop table if exists public.balance_ajustes cascade;
create table public.balance_ajustes (
  id       bigint generated always as identity primary key,
  fecha    date not null,
  estado   text not null,
  alcance  text not null,
  codigo   text not null,
  cajas    int not null default 0,
  nota     text,
  calidad  text,
  unique(fecha, estado, alcance, codigo)
);

alter table public.balance_ajustes enable row level security;
drop policy if exists "bal_aj_ver" on public.balance_ajustes;
create policy "bal_aj_ver" on public.balance_ajustes
  for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
drop policy if exists "bal_aj_ins" on public.balance_ajustes;
create policy "bal_aj_ins" on public.balance_ajustes
  for insert with check (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));

-- =====================================================================
-- 4. VISTA — LADO FÍSICO (fefo_conteos + fefo_lineas + fefo_materiales)
-- =====================================================================
create or replace view public.v_balance_fisico as
select
  cf.fecha                                                        as fecha,
  coalesce(rc.estado_nuevo,
    case
      when e.estado_envase ilike '%extrasucio%' then 'EXTRASUCIO'
      when e.estado_envase ilike '%lavado%'     then 'LAVADO'
      when e.estado_envase ilike '%baja%'       then 'BAJA'
      else upper(e.estado_envase)
    end)                                                          as estado,
  case when e.calle = 'FABRICA' then 'SORTING' else 'PRESORTING' end as alcance,
  e.codigo::text                                                  as codigo,
  max(m.descripcion)                                              as material,
  string_agg(distinct (e.calle || '-' || e.modulo || '-' || e.lado), ', '
    order by (e.calle || '-' || e.modulo || '-' || e.lado))       as ubicacion,
  max(m.cajas_por_estiba)                                         as cajas_estiba,
  max(m.unidades_por_caja)                                        as un_caja,
  sum(e.cajas)                                                    as fisico_cajas,
  max(rc.id)                                                      as reclasificacion_id
from public.fefo_conteos cf
join public.fefo_lineas e on e.conteo_id = cf.id
left join public.fefo_materiales m on m.codigo = e.codigo
left join lateral (
  select r.estado_nuevo, r.id
    from public.balance_reclasificaciones r
   where r.conteo_envase_id = e.id
   order by r.creado_en desc
   limit 1
) rc on true
where cf.estado = 'cerrado'
group by
  cf.fecha,
  coalesce(rc.estado_nuevo,
    case
      when e.estado_envase ilike '%extrasucio%' then 'EXTRASUCIO'
      when e.estado_envase ilike '%lavado%'     then 'LAVADO'
      when e.estado_envase ilike '%baja%'       then 'BAJA'
      else upper(e.estado_envase)
    end),
  case when e.calle = 'FABRICA' then 'SORTING' else 'PRESORTING' end,
  e.codigo::text;

-- =====================================================================
-- 5. VISTA — LADO CASCO (casco_registros)
-- =====================================================================
create or replace view public.v_balance_casco as
select
  k.fecha,
  case
    when k.baja_expr ilike '%extrasucio%' then 'EXTRASUCIO'
    when k.baja_expr ilike '%lavado%'     then 'LAVADO'
    else 'BAJA'
  end                                           as estado,
  coalesce(s.alcance, 'PRESORTING')             as alcance,
  k.sku                                         as codigo,
  0::numeric                                    as estibas_casco,
  sum(k.baja)                                   as cajas_casco
from public.casco_registros k
left join public.balance_sitios s on s.ubicacion = k.ubicacion
where k.baja_expr is not null
  and k.baja_expr <> ''
group by
  k.fecha,
  case
    when k.baja_expr ilike '%extrasucio%' then 'EXTRASUCIO'
    when k.baja_expr ilike '%lavado%'     then 'LAVADO'
    else 'BAJA'
  end,
  coalesce(s.alcance, 'PRESORTING'),
  k.sku;

-- =====================================================================
-- 6. VISTA CRUZADA — Balance completo
-- =====================================================================
create or replace view public.v_balance as
select
  coalesce(f.fecha, k.fecha)     as fecha,
  coalesce(f.estado, k.estado)   as estado,
  coalesce(f.alcance, k.alcance) as alcance,
  coalesce(f.codigo, k.codigo)   as codigo,
  f.material,
  f.ubicacion,
  f.cajas_estiba,
  f.un_caja,
  coalesce(f.fisico_cajas, 0)    as fisico_cajas,
  coalesce(k.estibas_casco, 0)   as estibas_casco,
  coalesce(k.cajas_casco, 0)     as cajas_casco,

  coalesce(a.cajas, 0)           as ajuste_cajas,
  a.nota                         as ajuste_nota,
  a.calidad,

  coalesce(f.fisico_cajas, 0)
    - coalesce(k.cajas_casco, 0)
    - coalesce(a.cajas, 0)       as dif_cajas,

  case when f.un_caja is not null and f.un_caja > 0
    then (coalesce(f.fisico_cajas, 0) - coalesce(k.cajas_casco, 0) - coalesce(a.cajas, 0)) * f.un_caja
    else null
  end                            as unidades,

  case
    when f.codigo is null then 'En casco y no contado'
    when k.codigo is null then 'Contado y sin casco registrado'
    when abs(coalesce(f.fisico_cajas, 0) - coalesce(k.cajas_casco, 0) - coalesce(a.cajas, 0)) > 0
      then 'Diferencia'
    else null
  end                            as alerta,

  f.reclasificacion_id

from public.v_balance_fisico f
full join public.v_balance_casco k
  on k.fecha = f.fecha
 and k.estado = f.estado
 and k.alcance = f.alcance
 and k.codigo = f.codigo
left join public.balance_ajustes a
  on a.fecha = coalesce(f.fecha, k.fecha)
 and a.estado = coalesce(f.estado, k.estado)
 and a.alcance = coalesce(f.alcance, k.alcance)
 and a.codigo = coalesce(f.codigo, k.codigo);

-- =====================================================================
-- 7. VISTA DE BLOQUES (resumen por estado x alcance)
-- =====================================================================
create or replace view public.v_balance_bloques as
select
  fecha, estado, alcance,
  count(*)                                    as renglones,
  count(*) filter (where alerta is not null)  as con_alerta,
  sum(fisico_cajas)                           as fisico_cajas,
  sum(estibas_casco)                          as estibas_casco,
  sum(dif_cajas)                              as dif_cajas,
  sum(unidades)                               as unidades
from public.v_balance
group by fecha, estado, alcance;

-- =====================================================================
-- 8. RLS para balance_sitios
-- =====================================================================
alter table public.balance_sitios enable row level security;
drop policy if exists "bal_sit_ver" on public.balance_sitios;
create policy "bal_sit_ver" on public.balance_sitios
  for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
