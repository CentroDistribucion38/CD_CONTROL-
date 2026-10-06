-- =====================================================================
-- INVENTARIO · CONTEO · DÓNDE EMPEZÓ Y CÓMO FUE DE UN RENGLÓN AL SIGUIENTE
--
-- «Quiero visualizar de un registro a otro, dentro del tiempo de conteo, para saber si
--  están haciendo trampa; y quiero la ubicación apenas inicien el conteo: apenas le den
--  Contar, eso se activa de una.»
--
-- 1. UBICACIÓN AL INICIAR. Al tocar «Empezar a contar» la pantalla pide la posición del
--    celular y la manda aquí UNA SOLA VEZ por conteo (no se sobrescribe). Si la persona dice
--    que no, o el celular no puede ubicarse, también queda anotado («denegada»,
--    «no_disponible», «tiempo»): en el Tablero se ve «Sin ubicación» y por qué.
--    El navegador SIEMPRE pide permiso la primera vez, y la pantalla avisa que se registra.
--
-- 2. EL RECORRIDO RENGLÓN POR RENGLÓN. `conteo_recorrido(conteo)` devuelve cada renglón en el
--    orden en que se anotó, con la hora y los segundos desde el renglón anterior (el primero,
--    desde que se tocó «Empezar a contar»).
--
-- Solo lee quien puede ver el Tablero o el Conteo. Requiere 2026-10-conteo-tiempos.sql.
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas' and column_name = 'registrado_en') then
    raise exception 'Falta supabase/migraciones/2026-10-conteo-tiempos.sql. Ese va primero.';
  end if;
end $$;

alter table public.conteos
  add column if not exists inicio_lat       double precision,
  add column if not exists inicio_lng       double precision,
  add column if not exists inicio_precision real,
  add column if not exists inicio_pos_en    timestamptz,
  add column if not exists inicio_pos_estado text;

alter table public.conteos drop constraint if exists conteos_inicio_pos_estado_chk;
alter table public.conteos add constraint conteos_inicio_pos_estado_chk
  check (inicio_pos_estado is null or inicio_pos_estado in ('ok', 'denegada', 'no_disponible', 'tiempo'));

drop function if exists public.conteo_fefo_posicion(uuid, double precision, double precision, real, text);
create function public.conteo_fefo_posicion(
  p_conteo uuid, p_lat double precision, p_lng double precision, p_precision real, p_estado text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  if p_estado not in ('ok', 'denegada', 'no_disponible', 'tiempo') then raise exception 'Estado de ubicación inválido.'; end if;
  if p_estado = 'ok' and (p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    raise exception 'La ubicación no es válida.';
  end if;
  /* Solo el dueño, solo mientras está abierto, y UNA vez: lo primero que se anota es lo que vale. */
  update public.conteos
     set inicio_lat = case when p_estado = 'ok' then p_lat end,
         inicio_lng = case when p_estado = 'ok' then p_lng end,
         inicio_precision = case when p_estado = 'ok' then p_precision end,
         inicio_pos_en = now(),
         inicio_pos_estado = p_estado
   where id = p_conteo and tipo = 'fefo' and responsable_id = auth.uid()
     and estado = 'en_proceso' and inicio_pos_estado is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function public.conteo_fefo_posicion(uuid, double precision, double precision, real, text) from public, anon;
grant execute on function public.conteo_fefo_posicion(uuid, double precision, double precision, real, text) to authenticated;

drop function if exists public.conteo_inicio_ubicacion(date, date);
create function public.conteo_inicio_ubicacion(p_desde date, p_hasta date)
returns table (conteo_id uuid, lat double precision, lng double precision, precision_m real, tomada_en timestamptz, estado text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.puede_ver('/inventario/tablero') or public.puede_ver('/inventario/conteo')) then
    raise exception 'Sin permiso para ver los tiempos del conteo';
  end if;
  return query
    select c.id, c.inicio_lat, c.inicio_lng, c.inicio_precision, c.inicio_pos_en, c.inicio_pos_estado
      from public.conteos c
     where c.tipo = 'fefo'
       and (coalesce(c.iniciado_en, c.creado_en) at time zone 'America/Bogota')::date between p_desde - 1 and p_hasta + 1;
end $$;
revoke all on function public.conteo_inicio_ubicacion(date, date) from public, anon;
grant execute on function public.conteo_inicio_ubicacion(date, date) to authenticated;

drop function if exists public.conteo_recorrido(uuid);
create function public.conteo_recorrido(p_conteo uuid)
returns table (
  n integer, registrado_en timestamptz, seg_desde_anterior integer,
  ubicacion text, codigo text, material text,
  estibas integer, cajas integer, saldo integer, corregido boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.puede_ver('/inventario/tablero') or public.puede_ver('/inventario/conteo')) then
    raise exception 'Sin permiso para ver los tiempos del conteo';
  end if;
  return query
  with base as (
    select cl.id, coalesce(cl.registrado_en, cl.contado_en) as t, cl.contado_en,
           u.clave::text as ubi, p.sku::text as sku, p.nombre::text as nom,
           cl.estibas::int as est, cl.cajas::int as caj, cl.saldo::int as sal
      from public.conteo_lineas cl
      left join public.ubicaciones u on u.id = cl.ubicacion_id
      left join public.productos p on p.id = cl.producto_id
     where cl.conteo_id = p_conteo
  ),
  ord as (
    select b.*, row_number() over (order by b.t, b.id) as rn,
           lag(b.t) over (order by b.t, b.id) as t_ant
      from base b
  )
  select o.rn::int, o.t,
         round(extract(epoch from (o.t - coalesce(o.t_ant, (select coalesce(c.iniciado_en, c.creado_en) from public.conteos c where c.id = p_conteo)))))::int,
         o.ubi, o.sku, o.nom, o.est, o.caj, o.sal,
         (o.contado_en is not null and o.contado_en > o.t + interval '5 seconds')
    from ord o
   order by o.rn;
end $$;
revoke all on function public.conteo_recorrido(uuid) from public, anon;
grant execute on function public.conteo_recorrido(uuid) to authenticated;

commit;
-- LISTO · ubicación al iniciar y recorrido renglón por renglón
