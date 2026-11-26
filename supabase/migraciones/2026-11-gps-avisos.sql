-- =====================================================================
-- TIEMPOS GPS · ZONAS LIGADAS SOLAS + AVISOS AL CELULAR
--
-- 1. LIGAR CADA ZONA A SU PUNTO DE TRASPASOS SIN QUE NADIE LO HAGA
--    Una zona sin punto se liga sola al punto de Traspasos que se llama igual (sin tildes, mayúsculas ni signos:
--    «Bodega 38» = «BODEGA 38», «Fábrica» = «FABRICA»). Pasa al crearla, al cambiarle el nombre y ahora mismo con
--    las que ya existen. Si alguien la liga a mano, se respeta.
--
-- 2. AVISOS QUE SUENAN EN EL CELULAR (notificaciones push)
--    push_suscripciones       cada celular o computador donde alguien tocó «Activar avisos» (uno por navegador).
--    gps_alerta_destinatarios a quién le llegan y de qué: parado, espera larga, llegó, salió.
--    gps_alertas_enviadas     lo ya avisado, para no repetir el mismo aviso cada 10 segundos.
--    Quién escoge a los destinatarios: el superadmin o quien edita Tiempos GPS. Cada persona maneja sus celulares.
--    El envío lo hace el servidor (llave de servicio); nadie escribe gps_alertas_enviadas desde el navegador.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regclass('public.gps_zonas') is null then raise exception 'Falta correr antes: 2026-10-traspasos-gps.sql'; end if;
  if to_regclass('public.traspasos_puntos') is null then raise exception 'Falta Traspasos (traspasos_puntos).'; end if;
end $bloque$;

/* ---------------------------------------------------------------- 1. ligar zonas a puntos */
create or replace function public.gps_clave_nombre(t text) returns text
language sql immutable as $$
  select regexp_replace(upper(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^A-Z0-9]', '', 'g')
$$;

create or replace function public.gps_zona_ligar_punto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.punto is null then
    select p.clave into new.punto from public.traspasos_puntos p
     where public.gps_clave_nombre(p.nombre) = public.gps_clave_nombre(new.nombre)
        or public.gps_clave_nombre(p.clave) = public.gps_clave_nombre(new.nombre)
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists gps_zonas_ligar_punto on public.gps_zonas;
create trigger gps_zonas_ligar_punto before insert or update of nombre, punto on public.gps_zonas
  for each row execute function public.gps_zona_ligar_punto();

/* las que ya existen sin punto */
update public.gps_zonas z set punto = p.clave
  from public.traspasos_puntos p
 where z.punto is null
   and (public.gps_clave_nombre(p.nombre) = public.gps_clave_nombre(z.nombre) or public.gps_clave_nombre(p.clave) = public.gps_clave_nombre(z.nombre));

/* ---------------------------------------------------------------- 2. avisos al celular */
create table if not exists public.push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  usuario    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  equipo     text,
  creado_en  timestamptz not null default now(),
  ultimo_ok  timestamptz
);
create index if not exists push_suscripciones_usuario on public.push_suscripciones (usuario);

create table if not exists public.gps_alerta_destinatarios (
  usuario     uuid primary key references auth.users(id) on delete cascade,
  tipos       text[] not null default array['parado', 'espera', 'llego']::text[],
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  constraint gps_alerta_tipos check (tipos <@ array['parado', 'espera', 'llego', 'salio', 'tramo']::text[])
);

create table if not exists public.gps_alertas_enviadas (
  id         bigint generated always as identity primary key,
  clave      text not null unique,
  tipo       text not null,
  placa      text,
  titulo     text not null,
  cuerpo     text,
  enviadas   int not null default 0,
  en         timestamptz not null default now()
);
create index if not exists gps_alertas_enviadas_en on public.gps_alertas_enviadas (en desc);

alter table public.push_suscripciones enable row level security;
alter table public.gps_alerta_destinatarios enable row level security;
alter table public.gps_alertas_enviadas enable row level security;

drop policy if exists push_sus_propias on public.push_suscripciones;
create policy push_sus_propias on public.push_suscripciones for all to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());

drop policy if exists gps_dest_ver on public.gps_alerta_destinatarios;
create policy gps_dest_ver on public.gps_alerta_destinatarios for select to authenticated
  using (usuario = auth.uid() or public.manda() or public.mi_nivel('/traspasos/tiempos-gps') = 'editar');
drop policy if exists gps_dest_editar on public.gps_alerta_destinatarios;
create policy gps_dest_editar on public.gps_alerta_destinatarios for all to authenticated
  using (public.manda() or public.mi_nivel('/traspasos/tiempos-gps') = 'editar')
  with check (public.manda() or public.mi_nivel('/traspasos/tiempos-gps') = 'editar');

drop policy if exists gps_env_ver on public.gps_alertas_enviadas;
create policy gps_env_ver on public.gps_alertas_enviadas for select to authenticated
  using (public.manda() or public.mi_nivel('/traspasos/tiempos-gps') <> 'ninguno');
revoke insert, update, delete on public.gps_alertas_enviadas from authenticated, anon;

grant select, insert, update, delete on public.push_suscripciones to authenticated;
grant select, insert, update, delete on public.gps_alerta_destinatarios to authenticated;
grant select on public.gps_alertas_enviadas to authenticated;

do $$
declare n int; l int;
begin
  select count(*), count(punto) into n, l from public.gps_zonas where activa;
  raise notice 'Listo: % de % zonas ligadas a su punto de Traspasos. Avisos al celular creados.', l, n;
end $$;

commit;
