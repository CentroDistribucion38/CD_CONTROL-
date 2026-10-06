-- =====================================================================
-- INVENTARIO · CONTEO · CONTROL DE TIEMPOS Y RANKING
--
-- «Llevar el control de los tiempos de conteo: cada usuario, desde el primer
-- registro hasta que lo envía; hoy inició a tal hora y finalizó a tal hora; y
-- llevar el ranking.»
--
-- Por cada conteo FEFO:
--   · primer renglón   la hora en que se anotó el PRIMER renglón (no la de abrir el recorrido)
--   · fin              la hora de envío (si todavía no se envía: «en curso»)
--   · bruto            fin − primer renglón, tal cual
--   · activo           lo anterior SIN las pausas largas: los huecos de más de 30 min
--                      entre un renglón y el siguiente (o entre el último y el envío)
--   · pausas           lo que se descontó
--
-- `contado_en` se reescribe cada vez que se CORRIGE un renglón, así que no sirve para
-- saber cuándo se anotó por primera vez: se agrega `registrado_en`, que solo se escribe
-- al insertar. Los renglones que ya existían heredan su `contado_en`.
--
-- Solo lee quien puede ver «Conteo». No escribe nada. Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.conteo_lineas add column if not exists registrado_en timestamptz;
update public.conteo_lineas set registrado_en = coalesce(contado_en, now()) where registrado_en is null;
alter table public.conteo_lineas alter column registrado_en set default now();

drop function if exists public.conteo_tiempos(date, date);
create function public.conteo_tiempos(p_desde date, p_hasta date)
returns table (
  conteo_id uuid, codigo text, responsable_id uuid, persona text, dia date,
  primer_renglon timestamptz, fin timestamptz, enviado boolean,
  renglones int, ubicaciones int, total_cajas bigint,
  bruto_min numeric, activo_min numeric, pausas_min numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/conteo') then
    raise exception 'Sin permiso para ver los tiempos del conteo';
  end if;
  return query
  with eventos as (
    /* Un evento por renglón anotado, y el envío como último evento del conteo. */
    select cl.conteo_id as cid, coalesce(cl.registrado_en, cl.contado_en) as t
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id and c.tipo = 'fefo'
     where coalesce(cl.registrado_en, cl.contado_en) is not null
    union all
    select c.id, c.enviado_en from public.conteos c
     where c.tipo = 'fefo' and c.estado = 'cerrado' and c.enviado_en is not null
  ),
  huecos as (
    select cid, t, t - lag(t) over (partition by cid order by t) as hueco from eventos
  ),
  por_conteo as (
    select cid, min(t) as primero, max(t) as ultimo,
           coalesce(sum(extract(epoch from hueco)) filter (where hueco <= interval '30 minutes'), 0) / 60.0 as activo,
           coalesce(sum(extract(epoch from hueco)) filter (where hueco >  interval '30 minutes'), 0) / 60.0 as pausas
      from huecos group by cid
  )
  select c.id, c.codigo::text, c.responsable_id, per.nombre::text,
         (pc.primero at time zone 'America/Bogota')::date,
         pc.primero,
         case when c.estado = 'cerrado' then c.enviado_en else null end,
         (c.estado = 'cerrado'),
         v.renglones::int, v.ubicaciones::int, v.total_cajas::bigint,
         round((extract(epoch from (pc.ultimo - pc.primero)) / 60.0)::numeric, 1),
         round(pc.activo::numeric, 1),
         round(pc.pausas::numeric, 1)
    from por_conteo pc
    join public.conteos c on c.id = pc.cid
    join public.v_conteos_fefo v on v.id = c.id
    left join public.perfiles per on per.id = c.responsable_id
   where (pc.primero at time zone 'America/Bogota')::date between p_desde and p_hasta
   order by pc.primero desc;
end $$;
revoke all on function public.conteo_tiempos(date, date) from public, anon;
grant execute on function public.conteo_tiempos(date, date) to authenticated;

commit;
-- LISTO · tiempos del conteo
