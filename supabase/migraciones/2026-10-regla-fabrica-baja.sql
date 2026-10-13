-- =====================================================================
-- REGLA DE FÁBRICA: ESTOS MATERIALES EN FÁBRICA SON BAJA
--
-- «3500888, 3500887, 3500383 y 3500373: si están en calle FABRICA y en esos módulos (PATIO 1, PATIO 2,
--  SORTING L2, L4, L6), sí o sí cambia el estado a BAJA. Ellos pueden registrarlos a su manera, pero
--  deja tú la traza en notas y cambia el estado. Y el 3501539, donde sea que aparezca en fábrica, a BAJA.»
--
-- CÓMO: el conteo NO se toca (se guarda como lo registraron). La vista v_conteo_fefo —de donde leen la
-- Base, el Excel consolidado, el Balance, el Cuadre SAP, el Casco y Pasivos— muestra el estado de la
-- regla y en la nota la traza: «Regla fábrica: LAVADO → BAJA | <la nota que traía>».
--
-- Las reglas viven en la tabla conteo_reglas_estado: para agregar o quitar un código más adelante es
-- un insert / update (activa = false), sin tocar la vista. ubicacion vacía = cualquier ubicación de
-- fábrica (calle FABRICA o clave FABRICA_…).
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.conteo_reglas_estado (
  id        bigint generated always as identity primary key,
  sku       text not null,
  ubicacion text,                      -- clave exacta (FABRICA_PATIO_1…) o null = cualquiera de fábrica
  estado    text not null default 'BAJA',
  activa    boolean not null default true,
  nota      text,
  creado_en timestamptz not null default now()
);
create unique index if not exists conteo_reglas_estado_unica
  on public.conteo_reglas_estado (sku, ubicacion) nulls not distinct;

alter table public.conteo_reglas_estado enable row level security;
drop policy if exists conteo_reglas_estado_ver on public.conteo_reglas_estado;
create policy conteo_reglas_estado_ver on public.conteo_reglas_estado for select using (auth.uid() is not null);
grant select on public.conteo_reglas_estado to authenticated;

insert into public.conteo_reglas_estado (sku, ubicacion, estado, nota)
select s.sku, u.ubicacion, 'BAJA', 'En fábrica es baja'
  from (values ('3500888'), ('3500887'), ('3500383'), ('3500373')) s(sku)
 cross join (values ('FABRICA_PATIO_1'), ('FABRICA_PATIO_2'), ('FABRICA_SORTING_L2'), ('FABRICA_SORTING_L4'), ('FABRICA_SORTING_L6')) u(ubicacion)
on conflict do nothing;
insert into public.conteo_reglas_estado (sku, ubicacion, estado, nota)
values ('3501539', null, 'BAJA', 'Donde aparezca en fábrica es baja')
on conflict do nothing;

create or replace view public.v_conteo_fefo as
select
  cl.id, cl.conteo_id, c.codigo as conteo, c.estado, c.tipo,
  cl.producto_id,
  p.sku as codigo, p.nombre as material, p.tipo_material, p.familia, p.vida_util,
  p.cajas_por_estiba as factor_estibado,
  cl.ubicacion_id, u.clave as ubicacion, u.calle, u.modulo, u.lado, u.capacidad,
  cl.estibas, cl.cajas, cl.saldo,

  (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
     + coalesce(cl.cajas, 0)
     + coalesce(cl.saldo, 0))::bigint as total_cajas,
  coalesce(cl.estibas, 0) as total_estibas,

  cl.venc_dia, cl.venc_mes, cl.venc_anio,
  cl.fab_dia, cl.fab_mes, cl.fab_anio,
  /* EL ENVASE: fabricación = su recepción (la pone la base) y vencimiento = recepción + vida útil. */
  f.fab as fabricacion,
  f.ven as vencimiento,
  (f.ven - current_date)::integer as dias_para_vencer,
  (f.ven - current_date - coalesce(p.dias_minimo, 0))::integer as dias_para_salir,

  /* El estado y la nota con la REGLA DE FÁBRICA aplicada (conteo_reglas_estado). */
  cl.rotacion, cl.averia, cl.pnc, e.estado as estado_envase, e.nota as nota,
  u.clave as ubicacion_texto,
  u.clave
    || case when cl.averia then ' AVERIA' else '' end
    || case when cl.pnc then ' PNC' else '' end
    || case when e.estado is null then '' else ' ' || e.estado end
    || case when e.nota is null or e.nota = '' then '' else ' ' || e.nota end
    as ubicacion_combinada,
  cl.cantidad_teorica, cl.cantidad_contada,
  cl.contado_por, per.nombre as conto, cl.contado_en,
  /* FIFO DEL ENVASE: desde cuándo está ese material en esa posición, y cuántos días lleva. */
  cl.fecha_fifo,
  case when cl.fecha_fifo is null then null::integer
       else (now() at time zone 'America/Bogota')::date - cl.fecha_fifo end as dias_en_posicion
from public.conteo_lineas cl
join public.conteos c on c.id = cl.conteo_id
join public.productos p on p.id = cl.producto_id
left join public.ubicaciones u on u.id = cl.ubicacion_id
left join public.perfiles per on per.id = cl.contado_por
left join lateral (
  select
    case when cl.fab_anio is not null
           then make_date(2000 + cl.fab_anio, cl.fab_mes::integer, cl.fab_dia::integer)
         when p.tipo_material = 'ENVASE' then cl.fecha_fifo end as fab,
    case when cl.venc_anio is not null
           then make_date(2000 + cl.venc_anio, cl.venc_mes::integer, cl.venc_dia::integer)
         when p.tipo_material = 'ENVASE' and cl.fecha_fifo is not null and coalesce(p.vida_util, 0) > 0
           then cl.fecha_fifo + p.vida_util end as ven
) f on true
/* LA REGLA: la primera que aplique a ese material en esa ubicación (la de ubicación exacta antes que
   la de «cualquier ubicación de fábrica»). Si el renglón ya viene en ese estado, no se toca. */
left join lateral (
  select r.estado
    from public.conteo_reglas_estado r
   where r.activa and r.sku = p.sku
     and (r.ubicacion = u.clave
          or (r.ubicacion is null and (upper(coalesce(u.calle, '')) = 'FABRICA' or upper(coalesce(u.clave, '')) like 'FABRICA\_%')))
   order by (r.ubicacion is null), r.id
   limit 1
) rg on true
left join lateral (
  select
    case when rg.estado is not null and cl.estado_envase is distinct from rg.estado then rg.estado else cl.estado_envase end as estado,
    case when rg.estado is not null and cl.estado_envase is distinct from rg.estado
         then 'Regla fábrica: ' || coalesce(nullif(cl.estado_envase, ''), 'SIN ESTADO') || ' → ' || rg.estado
              || coalesce(' | ' || nullif(cl.nota, ''), '')
         else cl.nota end as nota
) e on true;

grant select on public.v_conteo_fefo to authenticated;

commit;

-- Para ver qué renglones toca la regla:
--   select conteo, ubicacion, codigo, estado_envase, nota from public.v_conteo_fefo where nota like 'Regla fábrica:%';
