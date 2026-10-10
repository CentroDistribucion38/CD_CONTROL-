-- =====================================================================
-- CONTROL · INVENTARIO · MÓDULO BALANCE
-- supabase/migraciones/2026-10-balance.sql
--
-- Cruza el último conteo FEFO contra el módulo Casco de Vidrio y saca
-- lo que hoy el analista arma a mano en «CONTEO FABRICA.xlsx»: cinco
-- tablas dinámicas (baja, lavado, extrasucio) partidas en sorting y
-- presorting, con las columnas de cuadre al lado.
--
-- NO SE DIGITA NADA. Los factores salen del conteo (v_conteo_fefo), las
-- estibas salen del casco (v_casco). Lo único que se teclea aquí es el
-- ajuste de calidad, que hoy vive escondido dentro de las fórmulas.
--
-- Fuentes reales del repo:
--   public.v_conteo_fefo    codigo, material, calle, estado_envase,
--                           total_cajas, factor_estibado (cajas/estiba)
--   public.v_conteos_fefo   fecha_analisis del conteo
--   public.productos        unidades_por_caja
--   public.v_casco          fecha, ubicacion, baja_rotulo, sku,
--                           inventario, baja, calidad
--
-- Se puede correr las veces que sea.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. QUÉ CALLES LE TOCAN A CADA SITIO DE CASCO
--
-- Fábrica (AG18) cuadra contra la calle FABRICA  -> sorting.
-- Bodega 38 (AG22) cuadra contra TODO LO DEMÁS   -> presorting.
-- `excluyente` es lo que hace esa diferencia: en el Excel es el filtro
-- «FABRICA» contra «(Varios elementos)».
-- ---------------------------------------------------------------------
create table if not exists public.balance_sitios (
  ubicacion  text primary key references public.casco_ubicaciones(clave) on delete cascade,
  alcance    text not null check (alcance in ('SORTING', 'PRESORTING')),
  calles     text[] not null default '{}',
  excluyente boolean not null default false,   -- true = todas MENOS las listadas
  orden      integer,
  activo     boolean not null default true
);

insert into public.balance_sitios (ubicacion, alcance, calles, excluyente, orden)
select u.clave, 'SORTING', array['FABRICA'], false, 1
  from public.casco_ubicaciones u
 where upper(coalesce(u.centro, '')) = 'AG18' or u.clave = 'FABRICA'
 limit 1
on conflict (ubicacion) do nothing;

insert into public.balance_sitios (ubicacion, alcance, calles, excluyente, orden)
select u.clave, 'PRESORTING', array['FABRICA'], true, 2
  from public.casco_ubicaciones u
 where upper(coalesce(u.centro, '')) = 'AG22' or u.clave = 'BODEGA 38'
 limit 1
on conflict (ubicacion) do nothing;

-- ---------------------------------------------------------------------
-- 2. EL AJUSTE DE CALIDAD, A LA VISTA
--
-- En el Excel esto está enterrado dentro de las fórmulas y nadie que
-- revise la hoja lo ve:
--   BAJA SORTING    J8  = I8*E8-8              -> -8 cajas
--   BAJA PRESORTING L6  = K6*F6-((105*54)+22)*38
--                                              -> 105 estibas pico abajo + 22 cajas
-- Aquí es un número con su nota, en CAJAS y con signo, que se SUMA a
-- la diferencia. El campo `calidad` del módulo Casco ya trae el texto
-- («105 PICO ABAJO + 22 CAJA»); esto le pone la cifra al lado.
-- ---------------------------------------------------------------------
create table if not exists public.balance_ajustes (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  ubicacion  text not null references public.casco_ubicaciones(clave) on delete cascade,
  sku        text not null,
  estado     text not null check (estado in ('BAJA', 'LAVADO', 'EXTRASUCIO')),
  cajas      numeric(12,2) not null,            -- con signo
  nota       text not null,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en  timestamptz not null default now(),
  constraint balance_ajuste_unico unique (fecha, ubicacion, sku, estado)
);

create index if not exists balance_ajustes_fecha_idx on public.balance_ajustes (fecha desc);

-- ---------------------------------------------------------------------
-- 3. EL FÍSICO: el conteo agrupado por material, estado y alcance
--
-- Es exactamente la tabla dinámica del Excel: suma de «Total cajas» por
-- código, filtrando estado de envase y calle.
-- ---------------------------------------------------------------------
create or replace view public.v_balance_fisico
with (security_invoker = true) as
select
  vc.fecha_analisis                                             as fecha,
  cf.conteo_id,
  case when cf.calle = 'FABRICA' then 'SORTING' else 'PRESORTING' end as alcance,
  upper(btrim(cf.estado_envase))                                as estado,
  cf.codigo,
  max(cf.material)                                              as material,
  max(cf.factor_estibado)                                       as cajas_estiba,
  max(p.unidades_por_caja)                                      as un_caja,
  sum(cf.total_cajas)::bigint                                   as fisico_cajas
from public.v_conteo_fefo cf
join public.v_conteos_fefo vc on vc.id = cf.conteo_id
left join public.productos p  on p.sku = cf.codigo
where nullif(btrim(coalesce(cf.estado_envase, '')), '') is not null
group by vc.fecha_analisis, cf.conteo_id, 3, 4, cf.codigo;

grant select on public.v_balance_fisico to authenticated;

-- ---------------------------------------------------------------------
-- 4. EL CASCO: las dos columnas de la pantalla, vueltas estado
--
-- `inventario` es siempre BAJA. La segunda columna cambia de nombre
-- según el sitio y `baja_rotulo` es lo que dice cuál es.
-- ---------------------------------------------------------------------
create or replace view public.v_balance_casco
with (security_invoker = true) as
select k.fecha, s.alcance, s.ubicacion, k.sku as codigo,
       'BAJA'::text as estado, k.inventario as estibas, k.calidad
  from public.v_casco k
  join public.balance_sitios s on s.ubicacion = k.ubicacion and s.activo
 where coalesce(k.inventario, 0) <> 0
union all
select k.fecha, s.alcance, s.ubicacion, k.sku,
       case when k.baja_rotulo ilike '%lavado%'     then 'LAVADO'
            when k.baja_rotulo ilike '%extrasucio%' then 'EXTRASUCIO' end,
       k.baja, k.calidad
  from public.v_casco k
  join public.balance_sitios s on s.ubicacion = k.ubicacion and s.activo
 where k.baja_rotulo is not null and coalesce(k.baja, 0) <> 0;

grant select on public.v_balance_casco to authenticated;

-- ---------------------------------------------------------------------
-- 5. EL CUADRE
--
--   dif cajas = físico − (estibas × cajas por estiba) + ajuste
--   unidades  = dif cajas × unidades por caja
--
-- Es un FULL JOIN a propósito. El Excel hace una dinámica y le pega el
-- casco al lado, así que lo que está en el casco y NO en el conteo
-- desaparece sin avisar: el 9 de octubre se perdieron así 5 estibas de
-- Flint 250 y Marrón 250 que el conteo había puesto en EXTRASUCIO.
-- Aquí esos renglones salen, con su alerta.
-- ---------------------------------------------------------------------
create or replace view public.v_balance
with (security_invoker = true) as
select
  coalesce(f.fecha,   k.fecha)        as fecha,
  coalesce(f.estado,  k.estado)       as estado,
  coalesce(f.alcance, k.alcance)      as alcance,
  coalesce(f.codigo,  k.codigo)       as codigo,
  f.material,
  k.ubicacion,
  f.cajas_estiba,
  f.un_caja,
  coalesce(f.fisico_cajas, 0)         as fisico_cajas,
  coalesce(k.estibas, 0)              as estibas_casco,
  (coalesce(k.estibas, 0) * coalesce(f.cajas_estiba, 0))::numeric as cajas_casco,
  coalesce(a.cajas, 0)                as ajuste_cajas,
  a.nota                              as ajuste_nota,
  k.calidad,

  coalesce(f.fisico_cajas, 0)
    - coalesce(k.estibas, 0) * coalesce(f.cajas_estiba, 0)
    + coalesce(a.cajas, 0)            as dif_cajas,

  (coalesce(f.fisico_cajas, 0)
    - coalesce(k.estibas, 0) * coalesce(f.cajas_estiba, 0)
    + coalesce(a.cajas, 0)) * f.un_caja as unidades,

  /* LO QUE EL EXCEL PIERDE EN SILENCIO */
  case
    when f.codigo is null
      then 'Está en el casco y no en el conteo'
    when f.un_caja is null or f.cajas_estiba is null
      then 'Sin factor en el maestro: no se puede convertir a unidades'
    when coalesce(k.estibas, 0) < 0
      then 'Baja negativa'
    when k.codigo is null and coalesce(f.fisico_cajas, 0) <> 0
      then 'Contado y sin casco registrado'
  end                                 as alerta
from public.v_balance_fisico f
full join public.v_balance_casco k
  on  k.fecha   = f.fecha
  and k.estado  = f.estado
  and k.alcance = f.alcance
  and k.codigo  = f.codigo
left join public.balance_ajustes a
  on  a.fecha     = coalesce(f.fecha, k.fecha)
  and a.estado    = coalesce(f.estado, k.estado)
  and a.sku       = coalesce(f.codigo, k.codigo)
  and a.ubicacion = k.ubicacion
where coalesce(f.fisico_cajas, 0) <> 0 or coalesce(k.estibas, 0) <> 0;

grant select on public.v_balance to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL TOTAL POR BLOQUE (los cinco encabezados de la pantalla)
-- ---------------------------------------------------------------------
create or replace view public.v_balance_bloques
with (security_invoker = true) as
select fecha, estado, alcance,
       count(*)                                      as renglones,
       count(*) filter (where alerta is not null)    as con_alerta,
       sum(fisico_cajas)                             as fisico_cajas,
       sum(estibas_casco)                            as estibas_casco,
       sum(dif_cajas)                                as dif_cajas,
       sum(unidades)                                 as unidades
  from public.v_balance
 group by fecha, estado, alcance;

grant select on public.v_balance_bloques to authenticated;

-- ---------------------------------------------------------------------
-- 7. PERMISOS, igual que el resto de los módulos
-- ---------------------------------------------------------------------
alter table public.balance_sitios  enable row level security;
alter table public.balance_ajustes enable row level security;

drop policy if exists balance_sitios_ver on public.balance_sitios;
create policy balance_sitios_ver on public.balance_sitios
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/balance') in ('ver', 'editar'));

drop policy if exists balance_ajustes_ver on public.balance_ajustes;
create policy balance_ajustes_ver on public.balance_ajustes
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/balance') in ('ver', 'editar'));

drop policy if exists balance_ajustes_editar on public.balance_ajustes;
create policy balance_ajustes_editar on public.balance_ajustes
  for all to authenticated
  using (public.mi_nivel_pantalla('/inventario/balance') = 'editar')
  with check (public.mi_nivel_pantalla('/inventario/balance') = 'editar');

commit;

-- =====================================================================
-- COMPROBACIÓN. Debe dar los cinco bloques del 9 de octubre.
--
--   select * from public.v_balance_bloques
--    where fecha = '2026-10-09' order by estado, alcance;
--
--   select * from public.v_balance
--    where fecha = '2026-10-09' and estado = 'BAJA' and alcance = 'SORTING'
--    order by codigo;
-- =====================================================================

-- =====================================================================
-- 8. PERMISOS POR ROL: quien ve Casco, ve Balance
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/balance', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/casco'
on conflict (rol, seccion) do nothing;

commit;
