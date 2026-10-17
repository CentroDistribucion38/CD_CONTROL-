-- =====================================================================
-- REGLA DE FÁBRICA · RETORNO → LAVADO
--
-- «Si en fábrica me sale un envase como RETORNO, llévalo a LAVADO de una y muéstramelo en Reasignaciones.»
--
-- CÓMO: igual que la regla de baja, el conteo NO se toca (se guarda como lo registraron). La vista v_conteo_fefo
-- muestra el estado de la regla y la traza en la nota: «Regla fábrica: RETORNO → LAVADO | <nota>». Esa traza es
-- la que sale en el Balance · Reasignaciones (origen «Regla de fábrica»).
--
-- La regla es una fila de conteo_reglas_estado con sku '*' (todos los envases) y si_estado 'RETORNO'. Las reglas de un
-- material concreto (3500888 → BAJA, etc.) mandan sobre esta. Para apagarla: update conteo_reglas_estado set activa = false
-- where sku = '*'. No toca cajas plásticas ni la estiba.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.conteo_reglas_estado add column if not exists si_estado text;   -- null = cualquier estado; 'RETORNO' = solo si viene en ese estado

insert into public.conteo_reglas_estado (sku, ubicacion, estado, si_estado, nota)
values ('*', null, 'LAVADO', 'RETORNO', 'Envase en retorno en fábrica pasa a lavado')
on conflict (sku, ubicacion) do update set estado = excluded.estado, si_estado = excluded.si_estado, nota = excluded.nota;

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
/* LA REGLA: la primera que aplique a ese renglón. Orden: la de un material concreto antes que la de «todos los envases» (sku '*'),
   y la de ubicación exacta antes que la de «cualquier ubicación de fábrica». `si_estado` = solo cuando el renglón viene con ESE estado
   (p. ej. RETORNO). La general de envases no toca la caja plástica ni la estiba de madera. Si ya viene en ese estado, no se toca. */
left join lateral (
  select r.estado
    from public.conteo_reglas_estado r
   where r.activa
     and (r.sku = p.sku
          or (r.sku = '*' and p.tipo_material = 'ENVASE' and p.sku <> '3500163' and coalesce(p.nombre, '') !~* 'CAJA\s+PL'))
     and (r.si_estado is null or upper(btrim(coalesce(cl.estado_envase, ''))) = r.si_estado)
     and (r.ubicacion = u.clave
          or (r.ubicacion is null and (upper(coalesce(u.calle, '')) = 'FABRICA' or upper(coalesce(u.clave, '')) like 'FABRICA\_%')))
   order by (r.sku = '*'), (r.ubicacion is null), r.id
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

-- Para ver qué renglones toca esta regla:
--   select conteo, ubicacion, codigo, material, estado_envase, nota from public.v_conteo_fefo where nota like 'Regla fábrica: RETORNO → LAVADO%';
