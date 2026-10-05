-- =====================================================================
-- ADMINISTRACIÓN · USO DE LA APP POR USUARIO
-- ---------------------------------------------------------------------
-- «Necesito en la administración la usabilidad por usuario.»
-- Quién entra, cuántas veces, qué módulos y pantallas abre y cuánto
-- tiempo está de verdad en la app —y quién no la usa—.
--
--   1. uso_visitas: una fila por pantalla que alguien abre (ruta,
--      módulo, hora) con los segundos que estuvo activo en ella. No
--      guarda lo que escribió ni lo que vio: solo DÓNDE estuvo.
--   2. uso_visita / uso_latido: lo que llama la app de cada persona (solo
--      puede anotar SU propio uso; nadie lo edita ni lo borra desde fuera).
--   3. uso_usuarios / uso_dias / uso_pantallas: lo que lee Administración
--      (solo quien administra). Incluye a quienes NO usaron la app.
-- El día es el de Colombia (UTC−5). Se puede correr dos veces.
-- Lo anterior a este archivo no se puede reconstruir: se cuenta desde hoy.
-- =====================================================================
begin;

create table if not exists public.uso_visitas (
  id         bigint generated always as identity primary key,
  usuario    uuid not null,            -- sin llave: el uso sobrevive a la persona
  ruta       text not null,            -- ya sin ids sueltos: /roturas/salida/:id
  modulo     text,
  entro_en   timestamptz not null default now(),
  activo_seg integer not null default 0 check (activo_seg >= 0)
);
create index if not exists uso_visitas_usuario_idx on public.uso_visitas (usuario, entro_en desc);
create index if not exists uso_visitas_en_idx on public.uso_visitas (entro_en desc);

alter table public.uso_visitas enable row level security;
drop policy if exists uso_visitas_ver on public.uso_visitas;
create policy uso_visitas_ver on public.uso_visitas for select to authenticated using (public.manda());
revoke insert, update, delete on public.uso_visitas from authenticated, anon;
grant select on public.uso_visitas to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE ANOTA LA APP. Cada quien anota lo suyo y nada más: el usuario
-- sale de la sesión, nunca de lo que mande el navegador.
-- ---------------------------------------------------------------------
create or replace function public.uso_visita(p_ruta text, p_modulo text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint; v_ruta text := left(coalesce(nullif(trim(p_ruta), ''), '/'), 120);
begin
  if auth.uid() is null then return null; end if;
  /* La misma pantalla dos veces en 2 segundos es un rebote del navegador, no otra visita. */
  select id into v_id from public.uso_visitas
   where usuario = auth.uid() and ruta = v_ruta and entro_en > now() - interval '2 seconds'
   order by id desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.uso_visitas (usuario, ruta, modulo)
  values (auth.uid(), v_ruta, left(nullif(trim(p_modulo), ''), 40))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.uso_visita(text, text) from public, anon;
grant execute on function public.uso_visita(text, text) to authenticated;

/* Suma segundos ACTIVOS (con la pestaña a la vista y la persona moviéndose) a SU propia visita. Tope de 2 minutos por aviso. */
create or replace function public.uso_latido(p_id bigint, p_seg integer)
returns void
language sql security definer
set search_path = public
as $$
  update public.uso_visitas
     set activo_seg = activo_seg + least(greatest(coalesce(p_seg, 0), 0), 120)
   where id = p_id and usuario = auth.uid();
$$;
revoke all on function public.uso_latido(bigint, integer) from public, anon;
grant execute on function public.uso_latido(bigint, integer) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE LEE ADMINISTRACIÓN
-- ---------------------------------------------------------------------
/* Una fila por persona activa (también quien no usó nada): visitas, días con uso, minutos activos, último uso y los módulos que abre. */
create or replace function public.uso_usuarios(p_desde date, p_hasta date)
returns table (
  id uuid, usuario text, nombre text, rol text, activo boolean,
  ultimo_uso timestamptz, visitas integer, dias_activos integer, minutos numeric,
  modulos jsonb
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  return query
  with v as (
    select u.usuario as uid, u.modulo as mod, u.entro_en, u.activo_seg,
           (u.entro_en at time zone 'America/Bogota')::date as dia
      from public.uso_visitas u
     where (u.entro_en at time zone 'America/Bogota')::date between p_desde and p_hasta
  ),
  por_modulo as (
    select uid, coalesce(mod, 'otros') as mod, count(*)::int as n from v group by uid, coalesce(mod, 'otros')
  ),
  suma as (
    select uid, count(*)::int as visitas, count(distinct dia)::int as dias, round(sum(activo_seg) / 60.0, 1) as min
      from v group by uid
  ),
  ultimo as (select x.usuario as uid, max(x.entro_en) as ult from public.uso_visitas x group by x.usuario)
  select p.id, p.usuario::text, p.nombre::text, p.rol::text, p.activo,
         ul.ult, coalesce(s.visitas, 0), coalesce(s.dias, 0), coalesce(s.min, 0),
         coalesce((select jsonb_object_agg(m.mod, m.n) from por_modulo m where m.uid = p.id), '{}'::jsonb)
    from public.perfiles p
    left join suma s on s.uid = p.id
    left join ultimo ul on ul.uid = p.id
   where p.activo is not false
   order by coalesce(s.min, 0) desc, coalesce(s.visitas, 0) desc, p.nombre;
end $$;
revoke all on function public.uso_usuarios(date, date) from public, anon;
grant execute on function public.uso_usuarios(date, date) to authenticated;

/* Visitas y minutos activos de cada persona en cada día del rango. */
create or replace function public.uso_dias(p_desde date, p_hasta date)
returns table (usuario uuid, dia date, visitas integer, minutos numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  return query
  select u.usuario, (u.entro_en at time zone 'America/Bogota')::date as d,
         count(*)::int, round(sum(u.activo_seg) / 60.0, 1)
    from public.uso_visitas u
   where (u.entro_en at time zone 'America/Bogota')::date between p_desde and p_hasta
   group by u.usuario, d
   order by d, u.usuario;
end $$;
revoke all on function public.uso_dias(date, date) from public, anon;
grant execute on function public.uso_dias(date, date) to authenticated;

/* Las pantallas que abre cada persona: cuántas veces y cuántos minutos activos. */
create or replace function public.uso_pantallas(p_desde date, p_hasta date)
returns table (usuario uuid, modulo text, ruta text, visitas integer, minutos numeric, ultima timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.manda() then raise exception 'Solo quien administra'; end if;
  return query
  select u.usuario, coalesce(u.modulo, 'otros'), u.ruta, count(*)::int, round(sum(u.activo_seg) / 60.0, 1), max(u.entro_en)
    from public.uso_visitas u
   where (u.entro_en at time zone 'America/Bogota')::date between p_desde and p_hasta
   group by u.usuario, coalesce(u.modulo, 'otros'), u.ruta
   order by count(*) desc, u.ruta;
end $$;
revoke all on function public.uso_pantallas(date, date) from public, anon;
grant execute on function public.uso_pantallas(date, date) to authenticated;

do $$ begin raise notice 'LISTO: uso de la app por usuario (se cuenta desde hoy).'; end $$;
commit;
