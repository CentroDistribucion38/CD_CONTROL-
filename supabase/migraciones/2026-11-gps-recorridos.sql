-- =====================================================================
-- TIEMPOS GPS · RECORRIDOS POR VIAJE (parte 2, en prueba: solo superadmin)
--
-- «Apenas el facturador confirme la salida del vehículo, al conductor le
--  aparecen los recorridos que le toca hacer; él da check al que va a
--  iniciar y se le lleva el seguimiento desde el GPS.»
--
-- LO QUE GUARDA
--   gps_recorridos  UNA FILA POR VIAJE QUE EL CONDUCTOR INICIA: la placa, el
--                   viaje de Traspasos, la geocerca destino, cuándo empezó,
--                   cuándo llegó (se cierra solo al entrar a la geocerca
--                   destino) y los km recorridos.
--   gps_posiciones  cada posición que manda el celular (cada ~10 s), con el
--                   recorrido al que pertenece si había uno en curso. De aquí
--                   sale la línea del recorrido en el mapa.
--
-- QUIÉN ESCRIBE
--   Nadie desde el navegador: lo hacen las rutas /api/traspasos/gps/celular y
--   /api/traspasos/gps/conductor con la llave de servicio, después de
--   comprobar la sesión y el permiso. Ver: el superadmin o quien tenga
--   Tiempos GPS.
--
-- Va DESPUÉS de 2026-10-traspasos-gps.sql y 2026-09-traspasos-facturacion.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regclass('public.gps_zonas') is null then
    raise exception 'Falta correr antes: 2026-10-traspasos-gps.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'traspasos_viajes' and column_name = 'salida_en') then
    raise exception 'Falta correr antes: 2026-09-traspasos-facturacion.sql';
  end if;
end $bloque$;

create table if not exists public.gps_recorridos (
  id            uuid primary key default gen_random_uuid(),
  viaje         uuid not null references public.traspasos_viajes(id) on delete cascade,
  placa         text not null,
  zona_origen   uuid references public.gps_zonas(id) on delete set null,
  zona_destino  uuid references public.gps_zonas(id) on delete set null,
  estado        text not null default 'en_curso' check (estado in ('en_curso', 'llego', 'cancelado')),
  /* Cómo terminó: 'geocerca' (entró a la zona destino) o 'manual' (el destino no tenía geocerca). */
  cierre        text check (cierre in ('geocerca', 'manual')),
  inicio        timestamptz not null default now(),
  fin           timestamptz,
  km            numeric(10,3) not null default 0,
  /* Ya se le vio por fuera de la geocerca destino: sin esto, un viaje que arranca
     parado dentro del destino se cerraría en el primer envío. */
  fuera_destino boolean not null default false,
  ultimo_lat    double precision,
  ultimo_lng    double precision,
  ultimo_en     timestamptz,
  iniciado_por  uuid references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint gps_recorridos_fin check (fin is null or fin >= inicio)
);
/* Un viaje se recorre una vez (si se cancela, se puede volver a iniciar). */
create unique index if not exists gps_recorridos_un_viaje on public.gps_recorridos (viaje) where estado <> 'cancelado';
/* Una placa no puede tener dos viajes en curso a la vez. */
create unique index if not exists gps_recorridos_uno_en_curso on public.gps_recorridos (placa) where estado = 'en_curso';
create index if not exists gps_recorridos_por_placa on public.gps_recorridos (placa, inicio desc);

create table if not exists public.gps_posiciones (
  id         bigint generated always as identity primary key,
  placa      text not null,
  recorrido  uuid references public.gps_recorridos(id) on delete set null,
  lat        double precision not null,
  lng        double precision not null,
  precision  double precision,
  velocidad  double precision,
  rumbo      double precision,
  en         timestamptz not null default now()
);
create index if not exists gps_posiciones_por_recorrido on public.gps_posiciones (recorrido, en) where recorrido is not null;
create index if not exists gps_posiciones_por_placa on public.gps_posiciones (placa, en desc);

alter table public.gps_recorridos enable row level security;
alter table public.gps_posiciones enable row level security;

do $politicas$
declare t text;
begin
  foreach t in array array['gps_recorridos', 'gps_posiciones'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format($p$create policy %I on public.%I for select to authenticated
                      using (public.manda() or public.mi_nivel('/traspasos/tiempos-gps') <> 'ninguno')$p$, t || '_ver', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $politicas$;

do $$
begin
  if to_regclass('public.gps_recorridos') is null or to_regclass('public.gps_posiciones') is null then
    raise exception 'FALTÓ: gps_recorridos / gps_posiciones';
  end if;
  raise notice 'Listo: recorridos por viaje y posiciones del GPS.';
end $$;

commit;
