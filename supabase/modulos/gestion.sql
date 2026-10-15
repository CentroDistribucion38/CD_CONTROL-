-- =====================================================================
-- CONTROL · GESTIÓN — Entrega 1: parametrización, tablero KPI-PI-Meta, resultado por turno y disparadores.
--
-- El flujo completo será:
--   TABLERO (KPI · PI · META) → RESULTADO POR TURNO → DISPARADOR → 5 WHY → PLAN DE ACCIÓN
--   → CIERRE DEL PLAN → DASHBOARD
-- Esta entrega crea las tres primeras piezas y deja listo el DISPARADOR, que es lo que abrirá el 5 Why.
--
-- TODO ES PARAMETRIZABLE y vive en tablas, no en código:
--   gestion_turnos        los turnos (nombre y horas). Nacen Turno 1 (06–14), Turno 2 (14–22), Turno 3 (22–06).
--   gestion_procesos      los procesos a los que cuelgan los indicadores.
--   gestion_indicadores   KPI (resultado) y PI (indicador de proceso: explica el KPI), cada uno con:
--                         meta con operador, umbral amarillo y rojo (opcionales, cada uno con su operador),
--                         frecuencia (día · semana · mes), captura (por turno · valor único), nivel de reunión,
--                         y la regla del disparador (cuándo salta y tras cuántos resultados seguidos).
--   gestion_resultados    el número de cada indicador, por día y turno. Guarda el estado (verde · amarillo · rojo)
--                         que tuvo EN ESE MOMENTO: si mañana cambia la meta, lo histórico no se reescribe.
--   gestion_disparadores  lo que se activó por una desviación. Uno activo por indicador a la vez.
--
-- No toca nada de lo que ya existe. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.gestion_turnos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  hora_ini  time not null,
  hora_fin  time not null,
  orden     integer not null default 0,
  activo    boolean not null default true
);

create table if not exists public.gestion_procesos (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0,
  activo  boolean not null default true
);

create table if not exists public.gestion_indicadores (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  nombre              text not null,
  tipo                text not null default 'kpi' check (tipo in ('kpi', 'pi')),
  padre_id            uuid references public.gestion_indicadores (id) on delete set null,  -- un PI cuelga de un KPI
  proceso_id          uuid references public.gestion_procesos (id) on delete set null,
  nivel_reunion       integer not null default 1 check (nivel_reunion in (1, 2)),
  unidad              text not null default '%',
  decimales           integer not null default 0 check (decimales between 0 and 4),
  meta_op             text not null default '>=' check (meta_op in ('>', '>=', '<', '<=', '=')),
  meta_valor          numeric not null default 0,
  amarillo_op         text check (amarillo_op in ('>', '>=', '<', '<=', '=')),
  amarillo_valor      numeric,
  rojo_op             text check (rojo_op in ('>', '>=', '<', '<=', '=')),
  rojo_valor          numeric,
  frecuencia          text not null default 'dia' check (frecuencia in ('dia', 'semana', 'mes')),
  captura             text not null default 'turnos' check (captura in ('turnos', 'unico')),
  turnos              uuid[] not null default '{}',   -- en qué turnos se captura (si captura = 'turnos')
  responsable         text,
  disparo_activo      boolean not null default true,
  disparo_en          text not null default 'rojo' check (disparo_en in ('rojo', 'amarillo')),  -- 'amarillo' = salta con amarillo o rojo
  disparo_consecutivos integer not null default 1 check (disparo_consecutivos between 1 and 30),
  orden               integer not null default 0,
  activo              boolean not null default true,
  creado_en           timestamptz not null default now()
);
create index if not exists gestion_indicadores_proceso on public.gestion_indicadores (proceso_id);
create index if not exists gestion_indicadores_padre on public.gestion_indicadores (padre_id);

create table if not exists public.gestion_resultados (
  id            uuid primary key default gen_random_uuid(),
  indicador_id  uuid not null references public.gestion_indicadores (id) on delete cascade,
  fecha         date not null,                                   -- día; en semana/mes, el primer día del periodo
  turno_id      uuid references public.gestion_turnos (id) on delete set null,
  valor         numeric not null,
  estado        text not null check (estado in ('verde', 'amarillo', 'rojo')),
  comentario    text,
  capturado_por uuid default auth.uid(),
  capturado_en  timestamptz not null default now()
);
create unique index if not exists gestion_resultados_unico
  on public.gestion_resultados (indicador_id, fecha, coalesce(turno_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists gestion_resultados_fecha on public.gestion_resultados (fecha);

create table if not exists public.gestion_disparadores (
  id            uuid primary key default gen_random_uuid(),
  indicador_id  uuid not null references public.gestion_indicadores (id) on delete cascade,
  resultado_id  uuid references public.gestion_resultados (id) on delete set null,
  fecha         date not null,
  turno_id      uuid references public.gestion_turnos (id) on delete set null,
  valor         numeric not null,
  meta          text,                                            -- «>= 95 %» tal como estaba cuando saltó
  regla         text,                                            -- «rojo 2 veces seguidas»
  estado        text not null default 'activo' check (estado in ('activo', 'cerrado', 'descartado')),
  nota          text,
  creado_en     timestamptz not null default now(),
  cerrado_en    timestamptz,
  cerrado_por   uuid
);
-- Un solo disparador ACTIVO por indicador: si sigue mal no se abre otro encima.
create unique index if not exists gestion_disparadores_activo
  on public.gestion_disparadores (indicador_id) where estado = 'activo';
create index if not exists gestion_disparadores_estado on public.gestion_disparadores (estado);

-- ---------------------------------------------------------------------
-- Permisos: las pantallas son /gestion (Tablero), /gestion/resultados, /gestion/disparadores y /gestion/maestro.
-- Quien ve CUALQUIERA de ellas puede leer; escribir lo decide cada pantalla.
-- ---------------------------------------------------------------------
create or replace function public.gestion_puede_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_nivel_pantalla('/gestion') <> 'ninguno'
      or public.mi_nivel_pantalla('/gestion/resultados') <> 'ninguno'
      or public.mi_nivel_pantalla('/gestion/disparadores') <> 'ninguno'
      or public.mi_nivel_pantalla('/gestion/maestro') <> 'ninguno'
$$;
grant execute on function public.gestion_puede_ver() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['gestion_turnos', 'gestion_procesos', 'gestion_indicadores',
                           'gestion_resultados', 'gestion_disparadores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select using (public.gestion_puede_ver())', t || '_ver', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Turnos, procesos e indicadores: los edita quien tenga Maestro en «editar».
do $$
declare t text;
begin
  foreach t in array array['gestion_turnos', 'gestion_procesos', 'gestion_indicadores'] loop
    execute format('drop policy if exists %I on public.%I', t || '_esc', t);
    execute format('create policy %I on public.%I for all
      using (public.mi_nivel_pantalla(''/gestion/maestro'') = ''editar'')
      with check (public.mi_nivel_pantalla(''/gestion/maestro'') = ''editar'')', t || '_esc', t);
  end loop;
end $$;

-- Resultados: los captura quien tenga «Resultado por turno» en «editar».
drop policy if exists gestion_resultados_ins on public.gestion_resultados;
create policy gestion_resultados_ins on public.gestion_resultados for insert
  with check (public.mi_nivel_pantalla('/gestion/resultados') = 'editar');
drop policy if exists gestion_resultados_upd on public.gestion_resultados;
create policy gestion_resultados_upd on public.gestion_resultados for update
  using (public.mi_nivel_pantalla('/gestion/resultados') = 'editar');
drop policy if exists gestion_resultados_del on public.gestion_resultados;
create policy gestion_resultados_del on public.gestion_resultados for delete
  using (public.mi_nivel_pantalla('/gestion/resultados') = 'editar');

-- Disparadores: SALTAN al guardar un resultado (quien captura) y los gestiona quien tenga «Disparadores» en «editar».
drop policy if exists gestion_disparadores_ins on public.gestion_disparadores;
create policy gestion_disparadores_ins on public.gestion_disparadores for insert
  with check (public.mi_nivel_pantalla('/gestion/resultados') = 'editar'
           or public.mi_nivel_pantalla('/gestion/disparadores') = 'editar');
drop policy if exists gestion_disparadores_upd on public.gestion_disparadores;
create policy gestion_disparadores_upd on public.gestion_disparadores for update
  using (public.mi_nivel_pantalla('/gestion/disparadores') = 'editar');
drop policy if exists gestion_disparadores_del on public.gestion_disparadores;
create policy gestion_disparadores_del on public.gestion_disparadores for delete
  using (public.mi_nivel_pantalla('/gestion/disparadores') = 'editar');

-- Permisos por rol (no pisa lo que ya se haya puesto a mano):
--   admin y supervisor editan todo; el resto solo ve el Tablero y los Disparadores.
do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, s.ruta,
           (case when r.clave in ('admin', 'supervisor') then 'editar' else 'ver' end)::public.nivel_permiso
      from public.roles r
      cross join (values ('/gestion'), ('/gestion/disparadores')) as s(ruta)
    on conflict (rol, seccion) do nothing;

    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, s.ruta, 'editar'::public.nivel_permiso
      from public.roles r
      cross join (values ('/gestion/resultados'), ('/gestion/maestro')) as s(ruta)
     where r.clave in ('admin', 'supervisor')
    on conflict (rol, seccion) do nothing;
  end if;
end $$;

-- Los tres turnos de siempre (los mismos horarios del reloj de la app). Se editan en el Maestro.
insert into public.gestion_turnos (nombre, hora_ini, hora_fin, orden)
values ('Turno 1', '06:00', '14:00', 1), ('Turno 2', '14:00', '22:00', 2), ('Turno 3', '22:00', '06:00', 3)
on conflict (nombre) do nothing;

commit;

-- COMPROBACIÓN: todas tienen que decir 'ok'.
do $$
declare v_tablas integer; v_turnos integer;
begin
  select count(*) into v_tablas from information_schema.tables
   where table_schema = 'public'
     and table_name in ('gestion_turnos', 'gestion_procesos', 'gestion_indicadores', 'gestion_resultados', 'gestion_disparadores');
  select count(*) into v_turnos from public.gestion_turnos;
  raise notice 'las cinco tablas ... %', case when v_tablas = 5 then 'ok' else 'MAL (' || v_tablas || ')' end;
  raise notice 'turnos sembrados ... % (%)', case when v_turnos >= 3 then 'ok' else 'MAL' end, v_turnos;
end $$;
