/* =====================================================================
   INVENTARIO · BALANCE — v4  (FIXES CRÍTICOS: cajas, estibas, fechas)
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

   BUGS CORREGIDOS EN v4:
     1. fefo_lineas.cajas = SALDO (cajas sueltas), NO total.
        Total = estibas × cajas_por_estiba + cajas.
     2. casco_registros.baja = ESTIBAS, NO cajas.
        cajas_casco = round(baja × cajas_por_estiba).
     3. El balance consolida TODOS los conteos cerrados, no filtra por
        fecha. Una ubicación contada dos veces usa el conteo más reciente.
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
/* SE PUEDE CORRER VARIAS VECES: la tabla solo se rehace si es la versión vieja (conteo_envase_id
   que no es uuid); si ya está bien, se conserva con lo que tenga. */
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'balance_reclasificaciones' and column_name = 'conteo_envase_id'
              and data_type <> 'uuid') then
    drop table public.balance_reclasificaciones cascade;
  end if;
end $$;
create table if not exists public.balance_reclasificaciones (
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
/* Se conserva si ya existe: los ajustes son trabajo de la gente. */
create table if not exists public.balance_ajustes (
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
--
--    CONSOLIDACIÓN: una misma ubicación (calle-modulo-lado) puede
--    aparecer en varios conteos cerrados de distintas fechas.
--    Se usa DISTINCT ON para quedarnos con el conteo MÁS RECIENTE
--    de cada (calle, modulo, lado, codigo, estado_envase) y evitar
--    doble conteo.
--
--    CAJAS: fefo_lineas.cajas = SALDO (cajas sueltas fuera de estiba).
--    Total cajas = estibas × cajas_por_estiba + cajas.
-- =====================================================================
create or replace view public.v_balance_fisico as
with lineas_unicas as (
  /* Para cada combinación (calle, modulo, lado, codigo), quedarnos
     solo con el conteo más reciente. Así si FABRICA se contó el 8
     y Bodega 38 el 9, ambos aparecen sin pisarse. Y si una
     ubicación se recontó, gana el último. */
  select distinct on (e.calle, e.modulo, e.lado, e.codigo)
    e.id,
    e.conteo_id,
    e.codigo,
    e.calle,
    e.modulo,
    e.lado,
    e.estibas,
    e.cajas,
    e.estado_envase,
    cf.fecha
  from public.fefo_lineas e
  join public.fefo_conteos cf on cf.id = e.conteo_id
  where cf.estado = 'cerrado'
  order by e.calle, e.modulo, e.lado, e.codigo, cf.fecha desc, cf.cerrado_en desc nulls last
)
select
  coalesce(rc.estado_nuevo,
    case
      when lu.estado_envase ilike '%extrasucio%' then 'EXTRASUCIO'
      when lu.estado_envase ilike '%lavado%'     then 'LAVADO'
      when lu.estado_envase ilike '%baja%'       then 'BAJA'
      else upper(lu.estado_envase)
    end)                                                          as estado,
  case when lu.calle = 'FABRICA' then 'SORTING' else 'PRESORTING' end as alcance,
  lu.codigo::text                                                  as codigo,
  max(m.descripcion)                                              as material,
  string_agg(distinct (lu.calle || '-' || lu.modulo || '-' || lu.lado), ', '
    order by (lu.calle || '-' || lu.modulo || '-' || lu.lado))    as ubicacion,
  max(m.cajas_por_estiba)                                         as cajas_estiba,
  max(m.unidades_por_caja)                                        as un_caja,
  /* FIX #1: Total cajas = estibas × cajas_por_estiba + saldo */
  sum(lu.estibas * coalesce(m.cajas_por_estiba, 0) + lu.cajas)   as fisico_cajas,
  max(lu.fecha)                                                   as fecha_conteo,
  max(rc.id)                                                      as reclasificacion_id
from lineas_unicas lu
left join public.fefo_materiales m on m.codigo = lu.codigo
left join lateral (
  select r.estado_nuevo, r.id
    from public.balance_reclasificaciones r
   where r.conteo_envase_id = lu.id
   order by r.creado_en desc
   limit 1
) rc on true
group by
  coalesce(rc.estado_nuevo,
    case
      when lu.estado_envase ilike '%extrasucio%' then 'EXTRASUCIO'
      when lu.estado_envase ilike '%lavado%'     then 'LAVADO'
      when lu.estado_envase ilike '%baja%'       then 'BAJA'
      else upper(lu.estado_envase)
    end),
  case when lu.calle = 'FABRICA' then 'SORTING' else 'PRESORTING' end,
  lu.codigo::text;

-- =====================================================================
-- 5. VISTA — LADO CASCO (casco_registros)
--
--    FIX #2: casco_registros.baja = ESTIBAS, no cajas.
--    Hay que multiplicar por cajas_por_estiba del material.
--    Se joinea fefo_materiales con codigo::text = sku.
--
--    CONSOLIDACIÓN: sin filtro de fecha, suma todo el casco
--    registrado (el casco normalmente tiene una sola foto vigente
--    por SKU+ubicación, pero si hay varias fechas, se suman).
-- =====================================================================
create or replace view public.v_balance_casco as
select
  case
    when k.baja_expr ilike '%extrasucio%' then 'EXTRASUCIO'
    when k.baja_expr ilike '%lavado%'     then 'LAVADO'
    else 'BAJA'
  end                                                   as estado,
  coalesce(s.alcance, 'PRESORTING')                     as alcance,
  k.sku                                                 as codigo,
  sum(k.baja)                                           as estibas_casco,
  /* FIX #2: convertir estibas a cajas */
  sum(round(k.baja * coalesce(m.cajas_por_estiba, 0)))  as cajas_casco,
  max(k.fecha)                                          as fecha_casco
from public.casco_registros k
left join public.balance_sitios s on s.ubicacion = k.ubicacion
left join public.fefo_materiales m on m.codigo::text = k.sku
where k.baja_expr is not null
  and k.baja_expr <> ''
group by
  case
    when k.baja_expr ilike '%extrasucio%' then 'EXTRASUCIO'
    when k.baja_expr ilike '%lavado%'     then 'LAVADO'
    else 'BAJA'
  end,
  coalesce(s.alcance, 'PRESORTING'),
  k.sku;

-- =====================================================================
-- 6. VISTA CRUZADA — Balance completo
--
--    FIX #3: ya no cruza por fecha — cruza solo por
--    (estado, alcance, codigo). La fecha se muestra como referencia
--    pero no es dimensión de cruce.
-- =====================================================================
create or replace view public.v_balance as
select
  coalesce(f.fecha_conteo, k.fecha_casco)  as fecha,
  coalesce(f.estado, k.estado)             as estado,
  coalesce(f.alcance, k.alcance)           as alcance,
  coalesce(f.codigo, k.codigo)             as codigo,
  f.material,
  f.ubicacion,
  f.cajas_estiba,
  f.un_caja,
  coalesce(f.fisico_cajas, 0)              as fisico_cajas,
  coalesce(k.estibas_casco, 0)             as estibas_casco,
  coalesce(k.cajas_casco, 0)               as cajas_casco,

  coalesce(a.cajas, 0)                     as ajuste_cajas,
  a.nota                                   as ajuste_nota,
  a.calidad,

  coalesce(f.fisico_cajas, 0)
    - coalesce(k.cajas_casco, 0)
    - coalesce(a.cajas, 0)                 as dif_cajas,

  case when f.un_caja is not null and f.un_caja > 0
    then (coalesce(f.fisico_cajas, 0) - coalesce(k.cajas_casco, 0) - coalesce(a.cajas, 0)) * f.un_caja
    else null
  end                                      as unidades,

  case
    when f.codigo is null then 'En casco y no contado'
    when k.codigo is null then 'Contado y sin casco registrado'
    when abs(coalesce(f.fisico_cajas, 0) - coalesce(k.cajas_casco, 0) - coalesce(a.cajas, 0)) > 0
      then 'Diferencia'
    else null
  end                                      as alerta,

  f.reclasificacion_id

from public.v_balance_fisico f
full join public.v_balance_casco k
  on k.estado = f.estado
 and k.alcance = f.alcance
 and k.codigo = f.codigo
left join public.balance_ajustes a
  on a.estado = coalesce(f.estado, k.estado)
 and a.alcance = coalesce(f.alcance, k.alcance)
 and a.codigo = coalesce(f.codigo, k.codigo);

-- =====================================================================
-- 7. VISTA DE BLOQUES (resumen por estado x alcance)
-- =====================================================================
create or replace view public.v_balance_bloques as
select
  estado, alcance,
  count(*)                                    as renglones,
  count(*) filter (where alerta is not null)  as con_alerta,
  sum(fisico_cajas)                           as fisico_cajas,
  sum(estibas_casco)                          as estibas_casco,
  sum(cajas_casco)                            as cajas_casco,
  sum(dif_cajas)                              as dif_cajas,
  sum(unidades)                               as unidades
from public.v_balance
group by estado, alcance;

-- =====================================================================
-- 8. RLS para balance_sitios
-- =====================================================================
alter table public.balance_sitios enable row level security;
drop policy if exists "bal_sit_ver" on public.balance_sitios;
create policy "bal_sit_ver" on public.balance_sitios
  for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
