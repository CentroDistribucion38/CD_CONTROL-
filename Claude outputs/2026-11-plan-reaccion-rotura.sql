-- =====================================================================
-- PLAN DE REACCIÓN · ROTURA (paso 1: la base de datos)
--
-- Empalma el plan de reacción con el módulo de Roturas:
--   1. QUIÉN la causó (responsable), elegido del maestro de OPM.
--   2. CONDICIÓN o COMPORTAMIENTO, según la causa (tabla editable).
--   3. SEVERIDAD por cajas (rotas + contaminadas): leve / intermedia / grave.
--   4. EVENTO N.º de la persona en el mes y RECURRENCIA mes a mes.
--   5. ACCIONES exigidas (con plazo), quién las hizo y la evidencia.
--   6. VERIFICACIÓN DE EFICACIA: si volvió a pasar dentro de la ventana.
--   7. BITÁCORA que no se borra: todo cambio queda con usuario, hora y motivo.
--
-- REGLAS EN TABLAS, NO EN EL CÓDIGO: umbrales, escalera y plazos se editan
-- sin tocar la aplicación, y cada regla tiene FECHA DE VIGENCIA: un evento
-- de hace seis meses se evalúa con la regla de entonces.
--
-- DOS CONTADORES, A PROPÓSITO:
--   eventos  = los que la persona CAUSÓ (solo Comportamiento, no anuladas).
--   reportes = los que AVISÓ con su PIN (roturas.opm_id). Reportar no se castiga.
--
-- NO TOCA `v_roturas` NI NINGUNA FUNCIÓN EXISTENTE. Se puede correr varias veces.
-- Pantalla de permisos: '/roturas/en-sitio/plan-reaccion' (Ver / Editar).
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.roturas') is null or to_regclass('public.roturas_operarios') is null then
    raise exception 'Faltan las roturas o el maestro de OPM (2026-09-roturas-maestro-unico-y-opm.sql). Esos van primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 0. QUIÉN PUEDE VER Y QUIÉN PUEDE EDITAR
-- ---------------------------------------------------------------------
create or replace function public.plan_puede_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_nivel_pantalla('/roturas/en-sitio/plan-reaccion') <> 'ninguno'
$$;
create or replace function public.plan_puede_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_nivel_pantalla('/roturas/en-sitio/plan-reaccion') = 'editar'
$$;
grant execute on function public.plan_puede_ver()    to authenticated;
grant execute on function public.plan_puede_editar() to authenticated;

-- ---------------------------------------------------------------------
-- 1. EL RESPONSABLE
-- ---------------------------------------------------------------------
alter table public.roturas
  add column if not exists responsable_id uuid references public.roturas_operarios(id) on delete set null;
comment on column public.roturas.responsable_id is
  'Quién la causó (del maestro de OPM). No es quien la reportó (opm_id). Nulo = sin dueño: no cuenta para la persona.';
create index if not exists roturas_responsable_idx on public.roturas (responsable_id, reportada_en desc);

-- ---------------------------------------------------------------------
-- 2. LAS REGLAS, CON VERSIÓN (solo se agregan filas; no se editan ni se borran)
-- ---------------------------------------------------------------------
create table if not exists public.plan_reglas (
  id               uuid primary key default gen_random_uuid(),
  vigente_desde    date not null unique,
  leve_max         integer not null default 5  check (leve_max >= 0),   -- cajas: hasta aquí es leve
  grave_min        integer not null default 30 check (grave_min > leve_max), -- cajas: desde aquí es grave
  verificacion_dias integer not null default 30 check (verificacion_dias > 0),
  nota             text,
  creado_por       uuid references public.perfiles(id) on delete set null,
  creado_en        timestamptz not null default now()
);
comment on table public.plan_reglas is
  'Umbrales del plan. Leve ≤ leve_max cajas; grave ≥ grave_min; en medio, intermedia. Una fila nueva rige desde su fecha; las anteriores no se editan.';
insert into public.plan_reglas (vigente_desde, nota)
values ('2026-01-01', 'Primera versión: leve hasta 5 cajas, intermedia de 6 a 29, grave desde 30. Verificación a 30 días.')
on conflict (vigente_desde) do nothing;

-- ---------------------------------------------------------------------
-- 3. CAUSA → CONDICIÓN O COMPORTAMIENTO
-- ---------------------------------------------------------------------
create table if not exists public.plan_causa_tipo (
  causa   text primary key references public.roturas_causas(clave) on delete cascade,
  tipo    text not null check (tipo in ('condicion', 'comportamiento', 'externa')),
  subtipo text
);
comment on table public.plan_causa_tipo is
  'condicion = se corrige el sitio/equipo y NO se le carga a la persona; comportamiento = suma a la persona; externa = falla ajena (máquina, pallet DEPA).';

insert into public.plan_causa_tipo (causa, tipo, subtipo)
select c.clave, x.tipo, x.subtipo
  from public.roturas_causas c
  join (values
    ('comportamiento',   'comportamiento', 'Comportamiento del personal'),
    ('estibas_malas',    'condicion',      'Estiba en mal estado'),
    ('mal_arrumado',     'condicion',      'Módulo mal arrumado'),
    ('condiciones',      'condicion',      'Condiciones del sitio (locativo)'),
    ('falla_montacarga', 'condicion',      'Equipo FLT'),
    ('falla_maquinas',   'externa',        'Falla de máquinas'),
    ('falla_depa',       'externa',        'Pallet DEPA'),
    -- causas viejas (apagadas): se clasifican por si quedan roturas con ellas
    ('mal_estibado',     'comportamiento', 'Mal estibado'),
    ('caida_cargue',     'comportamiento', 'Caída en el cargue'),
    ('manipulacion',     'comportamiento', 'Manipulación'),
    ('montacargas',      'comportamiento', 'Golpe de montacargas'),
    ('apilado',          'comportamiento', 'Apilado por encima de lo permitido'),
    ('falla_maquina',    'externa',        'Falla de máquina'),
    ('llego_roto',       'externa',        'Llegó roto de planta'),
    ('mal_despacho',     'externa',        'Mal despacho del origen'),
    ('dano_transporte',  'externa',        'Daño en el transporte'),
    ('empaque_malo',     'externa',        'Empaque en mal estado')
  ) as x(clave, tipo, subtipo) on x.clave = c.clave
on conflict (causa) do nothing;

-- LA RAMA DE CONDICIÓN del diagrama (equipo FLT / vehículo en atención / locativo / estiba):
-- cada una pide una acción distinta.
alter table public.plan_causa_tipo add column if not exists clave_condicion text;
update public.plan_causa_tipo set clave_condicion = 'equipo_flt'        where causa = 'falla_montacarga';
update public.plan_causa_tipo set clave_condicion = 'locativo'          where causa = 'condiciones';
update public.plan_causa_tipo set clave_condicion = 'estiba_transporte' where causa = 'estibas_malas';
update public.plan_causa_tipo set clave_condicion = 'estiba_zona_cd'    where causa = 'mal_arrumado';
-- «Vehículo en atención» ('vehiculo') todavía no tiene una causa en el sistema: cuando exista, se le pone esa clave aquí.

-- ---------------------------------------------------------------------
-- 4. LA ESCALERA: qué acción pide cada disparador, y en cuántas horas
-- ---------------------------------------------------------------------
create table if not exists public.plan_acciones_tipo (
  clave  text primary key,
  nombre text not null,
  orden  smallint
);
insert into public.plan_acciones_tipo (clave, nombre, orden) values
  ('guardian',            'Aviso al guardián',                  1),
  ('abordaje',            'Abordaje a la persona',              2),
  ('reentrenamiento',     'Reentrenamiento',                    3),
  ('llamado_atencion',    'Llamado de atención',                4),
  ('suspension',          'Suspensión',                         5),
  ('analisis_5_porques',  'Análisis de 5 porqués',              6),
  ('isl',                 'ISL (informe de seguridad)',         7),
  ('correctiva_condicion','Corrección de la condición',         8),
  ('comite',              'Comité Safety Compliance',           9),
  ('verificacion_eficacia','Verificación de eficacia',         10)
on conflict (clave) do nothing;
insert into public.plan_acciones_tipo (clave, nombre, orden) values
  ('suspension_5',        'Gestión de consecuencias · suspensión 5 días', 11),
  ('suspension_3',        'Gestión de consecuencias · suspensión 3 días', 12),
  ('cond_equipo_flt',     'Verificar condiciones en el preoperacional y llevar a taller', 13),
  ('cond_vehiculo',       'Verificar BPM y mínimos vitales del vehículo',  14),
  ('cond_locativo',       'Validar condición, reportar al dueño de territorio y llevar a la matriz de condiciones', 15),
  ('cond_estiba_transporte','Revisar el origen de las estibas y notificar a transporte', 16),
  ('cond_estiba_zona_cd', 'Zona de almacenamiento CD: validar el tiempo de permanencia de los lotes', 17)
on conflict (clave) do nothing;

create table if not exists public.plan_acciones_regla (
  id         uuid primary key default gen_random_uuid(),
  disparador text not null check (disparador in ('evento_n', 'recurrencia', 'severidad', 'condicion')),
  valor      text not null,   -- evento_n: 1..4 · recurrencia: mes_a_mes · severidad: intermedia|grave · condicion: condicion
  accion     text not null references public.plan_acciones_tipo(clave),
  plazo_h    integer not null check (plazo_h > 0),
  nota       text,
  activo     boolean not null default true,
  unique (disparador, valor, accion)
);
comment on table public.plan_acciones_regla is
  'Escalera del plan. Se edita aquí (no en el código). Es el diagrama oficial «Plan de reacción rotura»: evento N.º × leve/grave, recurrencia mes a mes y las cuatro ramas de condición.';

-- LA ESCALERA DEL DIAGRAMA «PLAN DE REACCIÓN ROTURA» (comportamiento):
--   evento_n 'N:leve' / 'N:grave' = el N.º evento de la persona en el mes, según la gravedad de ESE evento.
--   Leve = hasta leve_max cajas · grave = desde grave_min · lo intermedio (6 a 29) sigue la columna leve
--   y además pide guardián + 5 porqués + ISL (regla de severidad).
-- Si ya se había corrido la primera versión, se quitan sus reglas viejas (escalera por número sin gravedad).
delete from public.plan_acciones_regla
 where (disparador = 'evento_n' and valor in ('1', '2', '3', '4'))
    or (disparador = 'condicion' and valor = 'condicion');

insert into public.plan_acciones_regla (disparador, valor, accion, plazo_h, nota) values
  ('evento_n',    '1:leve',       'abordaje',             8,   '1.er evento · leve: abordaje al colaborador (trazabilidad)'),
  ('evento_n',    '1:grave',      'reentrenamiento',      48,  '1.er evento · grave: reentrenamiento en escuela FLT + evaluación teórica y práctica'),
  ('evento_n',    '2:leve',       'llamado_atencion',     72,  '2.º evento · leve: llamado de atención…'),
  ('evento_n',    '2:leve',       'reentrenamiento',      72,  '…e ingresa a reentrenamiento FLT'),
  ('evento_n',    '2:grave',      'suspension_5',         72,  '2.º evento · grave: gestión de consecuencias, suspensión 5 días'),
  ('evento_n',    '3:leve',       'suspension_3',         72,  '3.er evento · leve: gestión de consecuencias, suspensión 3 días'),
  ('evento_n',    '3:grave',      'comite',               120, '3.er evento · grave: Comité Safety Compliance'),
  ('evento_n',    '4:leve',       'comite',               120, '4.ª falta leve o más: Comité Safety Compliance'),
  ('evento_n',    '4:grave',      'comite',               120, '4.º evento grave o más: Comité Safety Compliance'),
  ('recurrencia', 'mes_a_mes',    'comite',               120, 'Recurrente mes a mes: Comité Safety Compliance'),
  ('severidad',   'intermedia',   'guardian',             8,   '6 a 29 cajas: se reporta en guardián'),
  ('severidad',   'intermedia',   'analisis_5_porques',   48,  '6 a 29 cajas: 5 porqués'),
  ('severidad',   'intermedia',   'isl',                  72,  '6 a 29 cajas: se clasifica como ISL'),
  ('severidad',   'grave',        'isl',                  24,  '30 cajas o más: ISL SIF precursor'),
  ('severidad',   'grave',        'analisis_5_porques',   48,  '30 cajas o más: análisis del evento'),
  ('condicion',   'equipo_flt',        'cond_equipo_flt',        72, 'Condición · Equipo FLT'),
  ('condicion',   'vehiculo',          'cond_vehiculo',          72, 'Condición · Vehículo en atención'),
  ('condicion',   'locativo',          'cond_locativo',          72, 'Condición · Locativo'),
  ('condicion',   'estiba_transporte', 'cond_estiba_transporte', 72, 'Condición · Estiba en mal estado (transporte)'),
  ('condicion',   'estiba_zona_cd',    'cond_estiba_zona_cd',    72, 'Condición · Estiba en mal estado (zona de almacenamiento CD)')
on conflict (disparador, valor, accion) do nothing;

-- ---------------------------------------------------------------------
-- 5. EL EXPEDIENTE: acciones por rotura y bitácora
-- ---------------------------------------------------------------------
create table if not exists public.plan_acciones (
  id             uuid primary key default gen_random_uuid(),
  rotura_id      uuid not null,    -- sin FK a propósito: si la rotura se borra, la huella se queda
  codigo         text not null,
  responsable_id uuid references public.roturas_operarios(id) on delete set null,
  accion         text not null references public.plan_acciones_tipo(clave),
  origen_regla   text,
  vence_en       timestamptz not null,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'no_aplica')),
  hecha_por      uuid references public.perfiles(id) on delete set null,
  hecha_en       timestamptz,
  nota           text,
  evidencia_ruta text,
  creado_en      timestamptz not null default now(),
  constraint plan_acciones_no_aplica_con_nota
    check (estado <> 'no_aplica' or btrim(coalesce(nota, '')) <> '')
);
create unique index if not exists plan_acciones_unica
  on public.plan_acciones (rotura_id, accion) where estado <> 'no_aplica';
create index if not exists plan_acciones_pendientes
  on public.plan_acciones (vence_en) where estado = 'pendiente';
create index if not exists plan_acciones_resp on public.plan_acciones (responsable_id);

create table if not exists public.plan_bitacora (
  id        uuid primary key default gen_random_uuid(),
  rotura_id uuid not null,
  codigo    text,
  evento    text not null,
  detalle   jsonb,
  motivo    text,
  por       uuid references public.perfiles(id) on delete set null,
  en        timestamptz not null default now()
);
create index if not exists plan_bitacora_rotura on public.plan_bitacora (rotura_id, en desc);

-- RLS: se lee según el permiso de la pantalla; se escribe SOLO con las funciones de abajo.
alter table public.plan_reglas        enable row level security;
alter table public.plan_causa_tipo    enable row level security;
alter table public.plan_acciones_tipo enable row level security;
alter table public.plan_acciones_regla enable row level security;
alter table public.plan_acciones      enable row level security;
alter table public.plan_bitacora      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['plan_reglas','plan_causa_tipo','plan_acciones_tipo','plan_acciones_regla','plan_acciones','plan_bitacora'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.plan_puede_ver())', t || '_leer', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Quien manda ajusta las reglas. Las versiones de plan_reglas solo se AGREGAN.
drop policy if exists plan_reglas_agregar on public.plan_reglas;
create policy plan_reglas_agregar on public.plan_reglas for insert to authenticated with check (public.manda());
grant insert on public.plan_reglas to authenticated;

drop policy if exists plan_causa_tipo_manda on public.plan_causa_tipo;
create policy plan_causa_tipo_manda on public.plan_causa_tipo for all to authenticated
  using (public.manda()) with check (public.manda());
grant insert, update, delete on public.plan_causa_tipo to authenticated;

drop policy if exists plan_acciones_regla_manda on public.plan_acciones_regla;
create policy plan_acciones_regla_manda on public.plan_acciones_regla for all to authenticated
  using (public.manda()) with check (public.manda());
grant insert, update, delete on public.plan_acciones_regla to authenticated;

-- ---------------------------------------------------------------------
-- 6. LOS EVENTOS (el corazón): clasificación, número de evento y recurrencia
--    `plan_eventos_base` NO se da a la aplicación; `v_plan_eventos` la deja ver
--    solo a quien tiene la pantalla.
-- ---------------------------------------------------------------------
create or replace view public.plan_eventos_base as
with b as (
  select r.id as rotura_id, r.codigo, r.reportada_en,
         (r.reportada_en at time zone 'America/Bogota') as local_ts,
         r.estado::text as estado,
         (r.unidades + coalesce(r.contaminadas, 0)) as cajas,
         r.causa, c.nombre as causa_nombre,
         coalesce(t.tipo, 'sin_clasificar') as tipo, t.subtipo,
         r.area, r.responsable_id, o.nombre as responsable, o.empresa, o.turno,
         t.clave_condicion,
         r.opm_id, op.nombre as reportante,
         coalesce(r.responsable_id = r.opm_id, false) as autorreporte,
         g.leve_max, g.grave_min, g.verificacion_dias
    from public.roturas r
    left join public.roturas_causas c on c.clave = r.causa
    left join public.plan_causa_tipo t on t.causa = r.causa
    left join public.roturas_operarios o  on o.id  = r.responsable_id
    left join public.roturas_operarios op on op.id = r.opm_id
    left join lateral (
      select * from public.plan_reglas g
       where g.vigente_desde <= (r.reportada_en at time zone 'America/Bogota')::date
       order by g.vigente_desde desc limit 1
    ) g on true
), cl as (
  select b.*,
         date_trunc('month', local_ts)::date as mes,
         case when cajas <= leve_max then 'leve'
              when cajas >= grave_min then 'grave'
              else 'intermedia' end as severidad,
         (estado <> 'anulada' and responsable_id is not null and tipo = 'comportamiento') as cuenta_persona
    from b
), num as (
  select rotura_id,
         row_number() over (partition by responsable_id, mes order by reportada_en, rotura_id) as n_mes,
         row_number() over (partition by responsable_id order by reportada_en, rotura_id)      as n_total
    from cl where cuenta_persona
)
select cl.rotura_id, cl.codigo, cl.reportada_en, cl.mes, cl.estado, cl.cajas, cl.causa, cl.causa_nombre,
       cl.tipo, cl.subtipo, cl.area, cl.severidad, cl.responsable_id, cl.responsable, cl.empresa, cl.turno,
       cl.opm_id, cl.reportante, cl.autorreporte, cl.cuenta_persona,
       num.n_mes, num.n_total,
       (cl.cuenta_persona and exists (
          select 1 from cl p
           where p.cuenta_persona and p.responsable_id = cl.responsable_id
             and p.mes = (cl.mes - interval '1 month')::date)) as recurrente_mes_a_mes,
       -- ¿volvió a pasar dentro de la ventana de verificación? (persona: la misma; condición: misma causa y área)
       exists (
          select 1 from cl p
           where p.rotura_id <> cl.rotura_id and p.estado <> 'anulada'
             and p.reportada_en > cl.reportada_en
             and p.reportada_en <= cl.reportada_en + make_interval(days => cl.verificacion_dias)
             and ((cl.cuenta_persona and p.cuenta_persona and p.responsable_id = cl.responsable_id)
               or (cl.tipo = 'condicion' and p.causa = cl.causa and p.area is not distinct from cl.area))
       ) as reincidio_en_ventana,
       cl.clave_condicion
  from cl left join num on num.rotura_id = cl.rotura_id;

create or replace view public.v_plan_eventos as
select * from public.plan_eventos_base where public.plan_puede_ver();
grant select on public.v_plan_eventos to authenticated;

-- ---------------------------------------------------------------------
-- 7. LAS ACCIONES, CON SU ESTADO REAL (vencida = pendiente y pasó el plazo)
-- ---------------------------------------------------------------------
create or replace view public.v_plan_acciones as
select a.id, a.rotura_id, a.codigo, a.responsable_id, o.nombre as responsable,
       a.accion, t.nombre as accion_nombre, a.origen_regla, a.vence_en, a.estado,
       (a.estado = 'pendiente' and a.vence_en < now()) as vencida,
       (a.estado = 'hecha' and a.hecha_en > a.vence_en) as hecha_tarde,
       a.hecha_por, a.hecha_en, a.nota, a.evidencia_ruta, a.creado_en
  from public.plan_acciones a
  join public.plan_acciones_tipo t on t.clave = a.accion
  left join public.roturas_operarios o on o.id = a.responsable_id
 where public.plan_puede_ver();
grant select on public.v_plan_acciones to authenticated;

-- ---------------------------------------------------------------------
-- 8. LAS PERSONAS: eventos (causó) y reportes (avisó), lado a lado
-- ---------------------------------------------------------------------
create or replace view public.v_plan_personas as
select o.id, o.nombre, o.empresa, o.turno, o.activo,
       coalesce(e.eventos_total, 0)  as eventos_total,
       coalesce(e.eventos_mes, 0)    as eventos_mes,
       coalesce(e.meses_con_evento, 0) as meses_con_evento,
       e.ultimo_evento,
       coalesce(e.recurrente, false) as recurrente_mes_a_mes,
       coalesce(rp.reportes, 0)      as reportes,
       coalesce(ac.pendientes, 0)    as acciones_pendientes,
       coalesce(ac.vencidas, 0)      as acciones_vencidas
  from public.roturas_operarios o
  left join lateral (
    select count(*) as eventos_total,
           count(*) filter (where x.mes = date_trunc('month', now() at time zone 'America/Bogota')::date) as eventos_mes,
           count(distinct x.mes) as meses_con_evento,
           max(x.reportada_en) as ultimo_evento,
           bool_or(x.recurrente_mes_a_mes) as recurrente
      from public.plan_eventos_base x
     where x.responsable_id = o.id and x.cuenta_persona
  ) e on true
  left join lateral (
    select count(*) as reportes from public.roturas r
     where r.opm_id = o.id and r.estado::text <> 'anulada'
  ) rp on true
  left join lateral (
    select count(*) filter (where a.estado = 'pendiente') as pendientes,
           count(*) filter (where a.estado = 'pendiente' and a.vence_en < now()) as vencidas
      from public.plan_acciones a where a.responsable_id = o.id
  ) ac on true
 where public.plan_puede_ver();
grant select on public.v_plan_personas to authenticated;

-- Si ya se había corrido la primera versión: lo pendiente con la numeración vieja se cierra (se regenera con la escalera nueva).
update public.plan_acciones set estado = 'no_aplica', nota = 'Regla reemplazada por la escalera del diagrama', hecha_en = now()
 where estado = 'pendiente'
   and (origen_regla in ('evento_n:1', 'evento_n:2', 'evento_n:3', 'evento_n:4', 'condicion:condicion'));

-- ---------------------------------------------------------------------
-- 9. GENERAR LAS ACCIONES (idempotente: no repite las que ya existen)
-- ---------------------------------------------------------------------
create or replace function public.plan_generar_acciones(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare e record; n integer;
begin
  select * into e from public.plan_eventos_base where rotura_id = p_id;
  if not found or e.estado = 'anulada' then return 0; end if;

  insert into public.plan_acciones (rotura_id, codigo, responsable_id, accion, origen_regla, vence_en)
  select e.rotura_id, e.codigo,
         case when a.disparador in ('evento_n', 'recurrencia') then e.responsable_id else null end,
         a.accion, a.disparador || ':' || a.valor, e.reportada_en + make_interval(hours => a.plazo_h)
    from public.plan_acciones_regla a
   where a.activo and (
        (a.disparador = 'severidad'   and a.valor = e.severidad)
     or (a.disparador = 'condicion'   and e.tipo = 'condicion' and a.valor = e.clave_condicion)
     or (a.disparador = 'evento_n'    and e.cuenta_persona
                                      and a.valor = least(e.n_mes, 4)::text || ':' || (case when e.severidad = 'grave' then 'grave' else 'leve' end))
     or (a.disparador = 'recurrencia' and e.cuenta_persona and e.recurrente_mes_a_mes and a.valor = 'mes_a_mes'))
  on conflict (rotura_id, accion) where estado <> 'no_aplica' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.plan_generar_acciones(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9b. RECONCILIAR: cuando cambia un responsable o se anula una rotura, los eventos
--     de esa persona se RENUMERAN. Lo pendiente que ya no corresponde se cierra
--     (como «no aplica», con motivo) y se generan las acciones que sí corresponden.
-- ---------------------------------------------------------------------
create or replace function public.plan_reconciliar(p_resp uuid[], p_mes date, p_rotura uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[]; x uuid;
begin
  select array_agg(rotura_id) into v_ids from public.plan_eventos_base
   where (mes >= p_mes and responsable_id = any(p_resp)) or rotura_id = p_rotura;
  if v_ids is null then return; end if;

  update public.plan_acciones a
     set estado = 'no_aplica', nota = 'Cambió la numeración o el responsable del evento',
         hecha_en = now(), hecha_por = auth.uid()
    from public.plan_eventos_base e
   where e.rotura_id = a.rotura_id and a.rotura_id = any(v_ids) and a.estado = 'pendiente'
     and ((a.origen_regla like 'evento_n:%'
            and (not e.cuenta_persona or a.responsable_id is distinct from e.responsable_id
                 or substr(a.origen_regla, 10) <> least(e.n_mes, 4)::text || ':' || (case when e.severidad = 'grave' then 'grave' else 'leve' end)))
       or (a.origen_regla like 'recurrencia:%'
            and (not e.cuenta_persona or a.responsable_id is distinct from e.responsable_id
                 or not e.recurrente_mes_a_mes))
       or (a.origen_regla like 'condicion:%'
            and (e.tipo <> 'condicion' or substr(a.origen_regla, 11) is distinct from e.clave_condicion)));

  foreach x in array v_ids loop
    perform public.plan_generar_acciones(x);
  end loop;
end $$;
revoke all on function public.plan_reconciliar(uuid[], date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. PONER (O CAMBIAR) AL RESPONSABLE — con motivo cuando se cambia o se quita
-- ---------------------------------------------------------------------
create or replace function public.rotura_responsable_poner(
  p_id uuid, p_responsable uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.roturas;
begin
  if not (public.manda() or public.plan_puede_editar()) then
    raise exception 'Asignar el responsable es de quien tiene Editar en el Plan de reacción';
  end if;
  select * into r from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if r.estado::text = 'anulada' then raise exception 'Una rotura anulada no se puede asignar'; end if;
  if p_responsable is not null and not exists (
       select 1 from public.roturas_operarios where id = p_responsable and activo) then
    raise exception 'Ese colaborador no existe o está inactivo en el maestro de OPM';
  end if;
  if r.responsable_id is not distinct from p_responsable then return; end if;
  if r.responsable_id is not null and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Cambiar o quitar al responsable exige un motivo';
  end if;

  perform set_config('plan.motivo', coalesce(nullif(btrim(p_motivo), ''), 'Asignación inicial'), true);
  update public.roturas set responsable_id = p_responsable where id = p_id;

  perform public.plan_reconciliar(array[p_responsable, r.responsable_id],
            date_trunc('month', r.reportada_en at time zone 'America/Bogota')::date, p_id);
end $$;
grant execute on function public.rotura_responsable_poner(uuid, uuid, text) to authenticated;

-- 10b. LOS COLABORADORES QUE SE PUEDEN ASIGNAR (sin el PIN: eso es solo del administrador)
create or replace function public.plan_colaboradores()
returns table (id uuid, nombre text, empresa text, turno text)
language sql stable security definer set search_path = public as $$
  select o.id, o.nombre, o.empresa, o.turno
    from public.roturas_operarios o
   where o.activo and (public.manda() or public.plan_puede_editar())
   order by o.nombre
$$;
grant execute on function public.plan_colaboradores() to authenticated;

-- ---------------------------------------------------------------------
-- 11. MARCAR UNA ACCIÓN (hecha / no aplica / volver a pendiente)
-- ---------------------------------------------------------------------
create or replace function public.plan_accion_marcar(
  p_id uuid, p_estado text, p_nota text default null, p_evidencia text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.plan_acciones; v_dias integer;
begin
  if not (public.manda() or public.plan_puede_editar()) then
    raise exception 'Marcar acciones es de quien tiene Editar en el Plan de reacción';
  end if;
  if p_estado not in ('pendiente', 'hecha', 'no_aplica') then
    raise exception 'El estado es pendiente, hecha o no_aplica';
  end if;
  select * into a from public.plan_acciones where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;
  if p_estado = 'no_aplica' and btrim(coalesce(p_nota, '')) = '' then
    raise exception 'Decir que una acción no aplica exige un motivo';
  end if;

  update public.plan_acciones
     set estado = p_estado,
         nota = coalesce(nullif(btrim(p_nota), ''), nota),
         evidencia_ruta = coalesce(p_evidencia, evidencia_ruta),
         hecha_por = case when p_estado = 'pendiente' then null else auth.uid() end,
         hecha_en  = case when p_estado = 'pendiente' then null else now() end
   where id = p_id;

  -- al cerrar una acción se abre su verificación de eficacia (si no existe ya)
  if p_estado = 'hecha' and a.accion <> 'verificacion_eficacia' then
    select coalesce((select g.verificacion_dias from public.plan_reglas g
                      order by g.vigente_desde desc limit 1), 30) into v_dias;
    insert into public.plan_acciones (rotura_id, codigo, responsable_id, accion, origen_regla, vence_en)
    values (a.rotura_id, a.codigo, a.responsable_id, 'verificacion_eficacia', 'cierre', now() + make_interval(days => v_dias))
    on conflict (rotura_id, accion) where estado <> 'no_aplica' do nothing;
  end if;
end $$;
grant execute on function public.plan_accion_marcar(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. LA BITÁCORA: TRIGGERS (nada de esto se puede saltar)
-- ---------------------------------------------------------------------
create or replace function public.plan_bitacora_responsable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.plan_bitacora (rotura_id, codigo, evento, detalle, motivo, por)
  values (new.id, new.codigo, case when old.responsable_id is null then 'responsable_asignado'
                                   when new.responsable_id is null then 'responsable_quitado'
                                   else 'responsable_cambiado' end,
          jsonb_build_object('antes', (select nombre from public.roturas_operarios where id = old.responsable_id),
                             'despues', (select nombre from public.roturas_operarios where id = new.responsable_id)),
          coalesce(nullif(current_setting('plan.motivo', true), ''), 'sin motivo (edición directa)'),
          auth.uid());
  return new;
end $$;
drop trigger if exists plan_bitacora_responsable on public.roturas;
create trigger plan_bitacora_responsable
  after update of responsable_id on public.roturas
  for each row when (old.responsable_id is distinct from new.responsable_id)
  execute function public.plan_bitacora_responsable();

create or replace function public.plan_bitacora_accion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.plan_bitacora (rotura_id, codigo, evento, detalle, por)
    values (new.rotura_id, new.codigo, 'accion_creada',
            jsonb_build_object('accion', new.accion, 'regla', new.origen_regla, 'vence_en', new.vence_en), auth.uid());
  elsif new.estado is distinct from old.estado then
    insert into public.plan_bitacora (rotura_id, codigo, evento, detalle, motivo, por)
    values (new.rotura_id, new.codigo, 'accion_' || new.estado,
            jsonb_build_object('accion', new.accion, 'antes', old.estado, 'evidencia', new.evidencia_ruta),
            new.nota, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists plan_bitacora_accion on public.plan_acciones;
create trigger plan_bitacora_accion
  after insert or update on public.plan_acciones
  for each row execute function public.plan_bitacora_accion();

-- Nadie edita ni borra la bitácora, ni siquiera quien manda.
create or replace function public.plan_bitacora_inmutable()
returns trigger language plpgsql as $$
begin raise exception 'La bitácora del plan no se edita ni se borra'; end $$;
drop trigger if exists plan_bitacora_inmutable on public.plan_bitacora;
create trigger plan_bitacora_inmutable
  before update or delete on public.plan_bitacora
  for each row execute function public.plan_bitacora_inmutable();

-- ---------------------------------------------------------------------
-- 13. AL REGISTRAR O CORREGIR UNA ROTURA, SE GENERAN LAS ACCIONES
--     (si algo falla aquí, NUNCA se bloquea el registro de la rotura: solo avisa)
-- ---------------------------------------------------------------------
create or replace function public.plan_al_cambiar_rotura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'UPDATE' and new.estado::text = 'anulada' and old.estado::text <> 'anulada' then
      update public.plan_acciones
         set estado = 'no_aplica', nota = 'La rotura se anuló', hecha_en = now(), hecha_por = auth.uid()
       where rotura_id = new.id and estado = 'pendiente';
      perform public.plan_reconciliar(array[new.responsable_id],
                date_trunc('month', new.reportada_en at time zone 'America/Bogota')::date, null);
    else
      perform public.plan_generar_acciones(new.id);
    end if;
  exception when others then
    raise warning 'Plan de reacción: no se pudieron generar las acciones de % (%)', new.codigo, sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists plan_al_registrar on public.roturas;
create trigger plan_al_registrar after insert on public.roturas
  for each row execute function public.plan_al_cambiar_rotura();
drop trigger if exists plan_al_corregir on public.roturas;
create trigger plan_al_corregir after update of unidades, contaminadas, causa, estado on public.roturas
  for each row execute function public.plan_al_cambiar_rotura();

commit;

-- ---------------------------------------------------------------------
-- PARA MIRARLO (solo lectura; como administrador)
--
--   -- cómo quedó la clasificación de lo ya registrado:
--   select tipo, severidad, count(*) from public.v_plan_eventos group by 1, 2 order by 1, 2;
--
--   -- cuántas siguen sin dueño (todas, hasta que se asignen):
--   select count(*) filter (where responsable_id is null) sin_responsable, count(*) total
--     from public.v_plan_eventos where estado <> 'anulada';
--
--   -- las personas (eventos que causó vs. reportes que avisó):
--   select nombre, eventos_mes, eventos_total, reportes from public.v_plan_personas order by eventos_total desc;
--
--   -- causas que no quedaron clasificadas (deberían ser cero):
--   select distinct causa, causa_nombre from public.v_plan_eventos where tipo = 'sin_clasificar';
-- ---------------------------------------------------------------------
