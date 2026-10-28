-- =====================================================================
-- TRASPASOS · TIEMPOS GPS (mapa, zonas y tiempos por zona)
--
-- «Dibujo el cuadrito en el mapa (Fábrica, Bodega 38, Arenosa, Exportación);
--  cuando el carro entra al cuadrito marca el inicio, cuando sale marca el
--  final, y al salir queda en tránsito hasta que entra a la siguiente zona.»
--
-- LO QUE GUARDA
--   gps_zonas      los cuadritos (polígonos) con su nombre y color; se dibujan
--                  en la pantalla o se traen de las geocercas de Traccar.
--   gps_vehiculos  cada equipo GPS (id de Traccar) con su placa.
--   gps_visitas    UNA FILA POR ENTRADA A UNA ZONA: entrada y salida
--                  (salida vacía = sigue adentro). Los tiempos de cada zona y
--                  los tramos en tránsito salen de aquí, no se escriben a mano.
--   gps_estado     la última posición de cada vehículo y en qué zona está.
--
-- QUIÉN VE Y QUIÉN CAMBIA
--   La pantalla es /traspasos/tiempos-gps (casilla propia en Admin → Roles).
--   Con «ver» se mira todo; con «editar» se dibujan zonas y se asignan placas.
--   Las entradas y salidas las escribe la función gps_registrar(), que
--   comprueba el permiso por dentro: así quien solo mira también deja el mapa
--   al día sin tener permiso de editar las zonas.
--
-- Va DESPUÉS de 2026-10-permisos-por-persona-en-la-base.sql (mi_nivel).
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regprocedure('public.mi_nivel(text)') is null then
    raise exception 'Falta correr antes: 2026-10-permisos-por-persona-en-la-base.sql';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.gps_zonas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  color      text not null default '#1d9bd1',
  /* [[lat, lng], [lat, lng], …] — mínimo tres vértices. */
  poligono   jsonb not null,
  origen     text not null default 'dibujada' check (origen in ('dibujada', 'traccar')),
  traccar_id bigint,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now(),
  constraint gps_zonas_poligono check (jsonb_typeof(poligono) = 'array' and jsonb_array_length(poligono) >= 3)
);
/* El punto de Traspasos al que corresponde la zona (para cruzar con el plan y los viajes). */
alter table public.gps_zonas add column if not exists punto text references public.traspasos_puntos(clave) on delete set null;
create unique index if not exists gps_zonas_nombre on public.gps_zonas (lower(nombre)) where activa;
create unique index if not exists gps_zonas_traccar on public.gps_zonas (traccar_id) where traccar_id is not null;

create table if not exists public.gps_vehiculos (
  id         uuid primary key default gen_random_uuid(),
  traccar_id bigint unique,
  nombre     text not null,
  placa      text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

create table if not exists public.gps_visitas (
  id          bigint generated always as identity primary key,
  vehiculo_id uuid not null references public.gps_vehiculos(id) on delete cascade,
  zona_id     uuid not null references public.gps_zonas(id) on delete cascade,
  entrada     timestamptz not null,
  salida      timestamptz,
  constraint gps_visitas_orden check (salida is null or salida >= entrada)
);
/* Un vehículo no puede estar «adentro» dos veces de la misma zona a la vez. */
create unique index if not exists gps_visitas_abierta on public.gps_visitas (vehiculo_id, zona_id) where salida is null;
create index if not exists gps_visitas_por_vehiculo on public.gps_visitas (vehiculo_id, entrada desc);
create index if not exists gps_visitas_por_zona on public.gps_visitas (zona_id, entrada desc);

create table if not exists public.gps_estado (
  vehiculo_id uuid primary key references public.gps_vehiculos(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  velocidad   double precision,
  rumbo       double precision,
  /* La hora de la última posición ya procesada: de ahí en adelante se sigue. */
  fix_en      timestamptz not null,
  zona_id     uuid references public.gps_zonas(id) on delete set null,
  actualizado timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. QUIÉN VE Y QUIÉN CAMBIA
-- ---------------------------------------------------------------------
alter table public.gps_zonas      enable row level security;
alter table public.gps_vehiculos  enable row level security;
alter table public.gps_visitas    enable row level security;
alter table public.gps_estado     enable row level security;

do $politicas$
declare t text;
begin
  foreach t in array array['gps_zonas', 'gps_vehiculos', 'gps_visitas', 'gps_estado'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format($p$create policy %I on public.%I for select to authenticated
                      using (public.mi_nivel('/traspasos/tiempos-gps') <> 'ninguno')$p$, t || '_ver', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  /* Zonas y placas: solo con «editar». Visitas y estado: solo las escribe gps_registrar(). */
  foreach t in array array['gps_zonas', 'gps_vehiculos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                      using (public.mi_nivel('/traspasos/tiempos-gps') = 'editar')
                      with check (public.mi_nivel('/traspasos/tiempos-gps') = 'editar')$p$, t || '_editar', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $politicas$;

-- ---------------------------------------------------------------------
-- 3. REGISTRAR LO QUE SE VIO (lo llama la pantalla)
--
-- p_vehiculos: [{"traccar_id":12,"nombre":"Camión 3","placa":"ABC123"}]   (se crean o se actualizan)
-- p_eventos:   [{"traccar_id":12,"zona_id":"…","tipo":"entra"|"sale","en":"2026-10-28T10:00:00Z"}]
-- p_estados:   [{"traccar_id":12,"lat":..,"lng":..,"velocidad":..,"rumbo":..,"fix_en":"…","zona_id":"…"|null}]
--
-- Es a prueba de repeticiones: dos pantallas abiertas a la vez mandan lo mismo
-- sin duplicar nada (una entrada abierta por vehículo y zona, y una salida
-- solo cierra lo que está abierto).
-- ---------------------------------------------------------------------
create or replace function public.gps_registrar(p_vehiculos jsonb, p_eventos jsonb, p_estados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e jsonb; v_id uuid; n_ent int := 0; n_sal int := 0;
begin
  /* El reloj de fondo entra con la llave de servicio (sin usuario): ese sí pasa. */
  if coalesce(auth.role(), '') <> 'service_role'
     and public.mi_nivel('/traspasos/tiempos-gps') = 'ninguno' then
    raise exception 'No tienes permiso para ver Tiempos GPS.';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_vehiculos, '[]'::jsonb)) loop
    insert into gps_vehiculos (traccar_id, nombre, placa)
    values ((e->>'traccar_id')::bigint, coalesce(nullif(e->>'nombre', ''), 'Vehículo ' || (e->>'traccar_id')), nullif(e->>'placa', ''))
    on conflict (traccar_id) do update
      set nombre = excluded.nombre,
          /* La placa que se escribió a mano en la pantalla no se pisa con la de Traccar. */
          placa  = coalesce(gps_vehiculos.placa, excluded.placa);
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) order by (value->>'en')::timestamptz loop
    select id into v_id from gps_vehiculos where traccar_id = (e->>'traccar_id')::bigint;
    if v_id is null then continue; end if;
    if e->>'tipo' = 'entra' then
      insert into gps_visitas (vehiculo_id, zona_id, entrada)
      values (v_id, (e->>'zona_id')::uuid, (e->>'en')::timestamptz)
      on conflict (vehiculo_id, zona_id) where salida is null do nothing;
      if found then n_ent := n_ent + 1; end if;
    elsif e->>'tipo' = 'sale' then
      update gps_visitas set salida = greatest((e->>'en')::timestamptz, entrada)
       where vehiculo_id = v_id and zona_id = (e->>'zona_id')::uuid and salida is null;
      if found then n_sal := n_sal + 1; end if;
    end if;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_estados, '[]'::jsonb)) loop
    select id into v_id from gps_vehiculos where traccar_id = (e->>'traccar_id')::bigint;
    if v_id is null then continue; end if;
    insert into gps_estado (vehiculo_id, lat, lng, velocidad, rumbo, fix_en, zona_id, actualizado)
    values (v_id, (e->>'lat')::float8, (e->>'lng')::float8, nullif(e->>'velocidad', '')::float8, nullif(e->>'rumbo', '')::float8,
            (e->>'fix_en')::timestamptz, nullif(e->>'zona_id', '')::uuid, now())
    on conflict (vehiculo_id) do update
      set lat = excluded.lat, lng = excluded.lng, velocidad = excluded.velocidad, rumbo = excluded.rumbo,
          zona_id = excluded.zona_id, actualizado = now(),
          fix_en = greatest(gps_estado.fix_en, excluded.fix_en)
      where excluded.fix_en >= gps_estado.fix_en;
  end loop;

  return jsonb_build_object('entradas', n_ent, 'salidas', n_sal);
end $$;

revoke all on function public.gps_registrar(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.gps_registrar(jsonb, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. LOS TRAMOS EN TRÁNSITO: de la salida de una zona a la entrada de la siguiente
-- ---------------------------------------------------------------------
create or replace view public.v_gps_tramos with (security_invoker = true) as
select v.vehiculo_id,
       v.zona_id  as zona_origen,
       v.salida   as salio,
       s.zona_id  as zona_destino,
       s.entrada  as llego,
       extract(epoch from (s.entrada - v.salida))::int as segundos
  from public.gps_visitas v
  join lateral (
    select x.zona_id, x.entrada from public.gps_visitas x
     where x.vehiculo_id = v.vehiculo_id and x.entrada >= v.salida and x.id <> v.id
     order by x.entrada asc limit 1
  ) s on true
 where v.salida is not null;
grant select on public.v_gps_tramos to authenticated;

commit;
