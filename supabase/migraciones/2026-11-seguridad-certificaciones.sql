-- =====================================================================
-- SEGURIDAD · CERTIFICACIONES — LICENCIAS VACA («Licencia para cuidar»)
--
-- «Un módulo Seguridad, y dentro Certificaciones con las licencias VACA. Por ahora solo el departamento de
--  LOGÍSTICA. A cada empresa (y a grupos de su gente) se le asigna el Interventor ABI y el Coordinador de la
--  contratista, para saber a quién exigirle. Alerta con un mes de antelación. Se actualiza registrando en la app
--  o importando el Excel como hasta ahora.»
--
--   seg_reglas        vigencia (180 días), aviso (30), urgente (7) y los departamentos que entran (LOGISTICA).
--   seg_responsables  los Interventores ABI y los Coordinadores de las contratistas.
--   seg_validadores   quién valida (la lista del registro).
--   seg_empresas      cada empresa con su interventor y su coordinador por defecto (y cómo venía escrita: alias).
--   seg_grupos        un grupo de gente de una empresa que responde a otro interventor o coordinador.
--   seg_personas      la persona HOY: empresa, estado, motivo, grupo. Una fila por cédula.
--   seg_validaciones  CADA validación (la licencia): la última es la vigente; las anteriores son el historial.
--                     Renovar = una validación nueva, no una fila repetida de la persona.
--   seg_eventos       lo que se le hizo a la persona (estado, grupo, importación…), con quién y cuándo.
--   v_seg_personas    la persona con su última validación y a quién se le exige (grupo › empresa).
--
--   seg_importar(jsonb)   la carga del Excel por tandas (actualiza por cédula; renovación = validación nueva).
--   seg_registrar(jsonb)  registrar una validación desde la app (nueva o renovación).
--   seg_estado(...)       cambiar estado (activo, no activo, bloqueado, vacaciones) con su motivo.
--
-- PERMISOS (Admin › Roles): ven las pantallas de Certificaciones; Personas y Base registran; Maestro configura.
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- QUIÉN VE Y QUIÉN EDITA
-- ---------------------------------------------------------------------
create or replace function public.seg_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mi_nivel_pantalla('/seguridad/certificaciones') <> 'ninguno'
      or public.mi_nivel_pantalla('/seguridad/certificaciones/indicadores') <> 'ninguno'
      or public.mi_nivel_pantalla('/seguridad/certificaciones/personas') <> 'ninguno'
      or public.mi_nivel_pantalla('/seguridad/certificaciones/base') <> 'ninguno'
      or public.mi_nivel_pantalla('/seguridad/certificaciones/maestro') <> 'ninguno'
$$;
grant execute on function public.seg_ve() to authenticated;

create or replace function public.seg_edita(p_ruta text) returns boolean
language sql stable security definer set search_path = public
as $$ select public.mi_nivel_pantalla(p_ruta) = 'editar' $$;
grant execute on function public.seg_edita(text) to authenticated;

-- ---------------------------------------------------------------------
-- TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.seg_reglas (
  id            integer primary key default 1 check (id = 1),
  vigencia      integer not null default 180 check (vigencia between 1 and 3650),
  aviso         integer not null default 30  check (aviso between 1 and 365),
  criticos      integer not null default 7   check (criticos between 0 and 365),
  departamentos text[]  not null default '{LOGISTICA}',
  actualizado   timestamptz not null default now()
);
insert into public.seg_reglas (id) values (1) on conflict (id) do nothing;

create table if not exists public.seg_responsables (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null check (length(trim(nombre)) > 0),
  tipo      text not null check (tipo in ('interventor', 'coordinador')),
  telefono  text,
  correo    text,
  activo    boolean not null default true,
  creado    timestamptz not null default now(),
  unique (tipo, nombre)
);

create table if not exists public.seg_validadores (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique check (length(trim(nombre)) > 0),
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

create table if not exists public.seg_empresas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique check (length(trim(nombre)) > 0),
  alias           text[] not null default '{}',
  departamento    text not null default 'LOGISTICA',
  activa          boolean not null default true,
  interventor_id  uuid references public.seg_responsables(id) on delete set null,
  coordinador_id  uuid references public.seg_responsables(id) on delete set null,
  creado          timestamptz not null default now()
);

create table if not exists public.seg_grupos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.seg_empresas(id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  interventor_id  uuid references public.seg_responsables(id) on delete set null,
  coordinador_id  uuid references public.seg_responsables(id) on delete set null,
  creado          timestamptz not null default now(),
  unique (empresa_id, nombre)
);

create table if not exists public.seg_personas (
  cedula          text primary key check (cedula ~ '^[0-9A-Za-z]+$'),
  nombre          text not null,
  empresa_id      uuid references public.seg_empresas(id) on delete set null,
  departamento    text not null default 'LOGISTICA',
  estado          text not null default 'ACTIVO' check (estado in ('ACTIVO', 'NO ACTIVO', 'BLOQUEADO', 'VACACIONES')),
  motivo          text,
  grupo_id        uuid references public.seg_grupos(id) on delete set null,
  actualizado     timestamptz not null default now(),
  creado          timestamptz not null default now()
);
create index if not exists seg_personas_empresa on public.seg_personas (empresa_id);

create table if not exists public.seg_validaciones (
  id           uuid primary key default gen_random_uuid(),
  cedula       text not null references public.seg_personas(cedula) on delete cascade on update cascade,
  expedicion   date not null,
  vencimiento  date not null,
  permisos     text[] not null default '{}',
  nivel        text,
  validador    text,
  sop          text,
  origen       text not null default 'app' check (origen in ('app', 'importe')),
  creado_por   uuid default auth.uid(),
  creado       timestamptz not null default now(),
  unique (cedula, expedicion)
);
create index if not exists seg_validaciones_ced on public.seg_validaciones (cedula, expedicion desc);

create table if not exists public.seg_eventos (
  id          bigserial primary key,
  cedula      text not null references public.seg_personas(cedula) on delete cascade on update cascade,
  tipo        text not null,
  detalle     text,
  por         uuid default auth.uid(),
  por_nombre  text,
  en          timestamptz not null default now()
);
create index if not exists seg_eventos_ced on public.seg_eventos (cedula, en desc);

-- ---------------------------------------------------------------------
-- RLS: leer quien ve; escribir quien edita la pantalla que toca
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seg_reglas','seg_responsables','seg_validadores','seg_empresas','seg_grupos','seg_personas','seg_validaciones','seg_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.seg_ve())', t || '_ver', t);
  end loop;
  -- El Maestro configura
  foreach t in array array['seg_reglas','seg_responsables','seg_validadores','seg_empresas','seg_grupos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.seg_edita(''/seguridad/certificaciones/maestro'')) with check (public.seg_edita(''/seguridad/certificaciones/maestro''))', t || '_editar', t);
  end loop;
end $$;
-- Personas y validaciones se escriben por las funciones de abajo (registrar, importar, estado); quien tiene
-- «Personas» en editar también puede asignar el grupo directo.
drop policy if exists seg_personas_grupo on public.seg_personas;
create policy seg_personas_grupo on public.seg_personas for update to authenticated
  using (public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro'))
  with check (public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro'));

drop policy if exists seg_eventos_anotar on public.seg_eventos;
create policy seg_eventos_anotar on public.seg_eventos for insert to authenticated
  with check (public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro'));

grant select, insert, update, delete on public.seg_reglas, public.seg_responsables, public.seg_validadores,
  public.seg_empresas, public.seg_grupos, public.seg_personas, public.seg_validaciones, public.seg_eventos to authenticated;
grant usage on sequence public.seg_eventos_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- LA PERSONA CON SU LICENCIA VIGENTE Y A QUIÉN SE LE EXIGE
-- ---------------------------------------------------------------------
drop view if exists public.v_seg_personas;
create view public.v_seg_personas with (security_invoker = true) as
select p.cedula, p.nombre, p.departamento, p.estado, p.motivo, p.actualizado,
       p.empresa_id, e.nombre as empresa,
       p.grupo_id, g.nombre as grupo,
       v.expedicion, v.vencimiento, coalesce(v.permisos, '{}') as permisos, v.nivel, v.validador, v.sop,
       coalesce(gi.nombre, ei.nombre) as interventor,
       coalesce(gc.nombre, ec.nombre) as coordinador,
       (select count(*) from public.seg_validaciones x where x.cedula = p.cedula)::int as validaciones
  from public.seg_personas p
  left join public.seg_empresas e on e.id = p.empresa_id
  left join public.seg_grupos g on g.id = p.grupo_id
  left join lateral (select * from public.seg_validaciones x where x.cedula = p.cedula order by x.expedicion desc limit 1) v on true
  left join public.seg_responsables gi on gi.id = g.interventor_id
  left join public.seg_responsables gc on gc.id = g.coordinador_id
  left join public.seg_responsables ei on ei.id = e.interventor_id
  left join public.seg_responsables ec on ec.id = e.coordinador_id;
grant select on public.v_seg_personas to authenticated;

-- ---------------------------------------------------------------------
-- AYUDAS
-- ---------------------------------------------------------------------
create or replace function public.seg_texto(p text) returns text
language sql immutable
as $$ select nullif(upper(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')), '') $$;

-- La empresa por su nombre o por cómo venía escrita (alias). Si no existe, se crea.
create or replace function public.seg_empresa_de(p_nombre text, p_depto text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare k text := public.seg_texto(p_nombre); v uuid;
begin
  if k is null then return null; end if;
  select id into v from public.seg_empresas where upper(nombre) = k or k = any(alias) limit 1;
  if v is null then
    insert into public.seg_empresas (nombre, departamento) values (k, coalesce(public.seg_texto(p_depto), 'LOGISTICA'))
    on conflict (nombre) do update set nombre = excluded.nombre returning id into v;
  end if;
  return v;
end $$;

create or replace function public.seg_quien() returns text
language sql stable security definer set search_path = public
as $$ select nullif(nombre, '') from public.perfiles where id = auth.uid() $$;

-- ---------------------------------------------------------------------
-- IMPORTAR EL EXCEL (por tandas). Cada fila: cedula, nombre, empresa, departamento, estado, motivo,
-- expedicion, vencimiento, permisos[], nivel, validador, sop.
--   · persona nueva → se crea con su validación.
--   · fecha de expedición nueva → RENOVACIÓN (validación nueva; la anterior queda en el historial).
--   · misma expedición → se actualizan los datos de esa validación y de la persona.
-- Solo entran los departamentos de las Reglas.
-- ---------------------------------------------------------------------
create or replace function public.seg_importar(p_filas jsonb)
returns table (nuevas integer, renovaciones integer, actualizadas integer, fuera integer)
language plpgsql security definer set search_path = public
as $$
declare
  r jsonb; ced text; emp uuid; dep text; est text; exp_ date; ven date; ult date; habia boolean;
  deps text[]; vig int; quien text := public.seg_quien();
  n_n int := 0; n_r int := 0; n_a int := 0; n_f int := 0;
begin
  if not (public.seg_edita('/seguridad/certificaciones/base') or public.seg_edita('/seguridad/certificaciones/personas')) then
    raise exception 'Importar requiere el permiso «Base» de Certificaciones en editar (Admin › Roles).';
  end if;
  select departamentos, vigencia into deps, vig from public.seg_reglas where id = 1;
  for r in select * from jsonb_array_elements(p_filas) loop
    ced := regexp_replace(coalesce(r->>'cedula', ''), '[^0-9A-Za-z]', '', 'g');
    dep := public.seg_texto(translate(r->>'departamento', 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));
    exp_ := nullif(r->>'expedicion', '')::date;
    if ced = '' or exp_ is null or dep is null or not (dep = any(deps)) then n_f := n_f + 1; continue; end if;
    ven := coalesce(nullif(r->>'vencimiento', '')::date, exp_ + vig);
    est := coalesce(public.seg_texto(r->>'estado'), 'ACTIVO');
    if est not in ('ACTIVO', 'NO ACTIVO', 'BLOQUEADO', 'VACACIONES') then est := 'ACTIVO'; end if;
    emp := public.seg_empresa_de(r->>'empresa', dep);
    if public.seg_texto(r->>'validador') is not null then
      insert into public.seg_validadores (nombre) values (trim(regexp_replace(r->>'validador', '\s+', ' ', 'g'))) on conflict (nombre) do nothing;
    end if;

    habia := exists (select 1 from public.seg_personas where cedula = ced);
    select max(expedicion) into ult from public.seg_validaciones where cedula = ced;

    if not habia then
      insert into public.seg_personas (cedula, nombre, empresa_id, departamento, estado, motivo)
      values (ced, trim(regexp_replace(r->>'nombre', '\s+', ' ', 'g')), emp, dep, est, nullif(trim(r->>'motivo'), ''));
      n_n := n_n + 1;
      insert into public.seg_eventos (cedula, tipo, detalle, por_nombre) values (ced, 'importe', 'Entró a la base con el Excel', quien);
    elsif ult is null or exp_ >= ult then
      -- El archivo trae la licencia más nueva (o la misma): manda en los datos de la persona.
      update public.seg_personas
         set nombre = trim(regexp_replace(r->>'nombre', '\s+', ' ', 'g')), empresa_id = coalesce(emp, empresa_id),
             departamento = dep, estado = est, motivo = nullif(trim(r->>'motivo'), ''), actualizado = now()
       where cedula = ced;
    end if;

    if ult is not null and exp_ > ult then
      n_r := n_r + 1;
      insert into public.seg_eventos (cedula, tipo, detalle, por_nombre)
      values (ced, 'renovacion', 'Renovó: expedida el ' || to_char(exp_, 'DD/MM/YYYY') || ' (antes ' || to_char(ult, 'DD/MM/YYYY') || ')', quien);
    elsif habia then
      n_a := n_a + 1;
    end if;

    insert into public.seg_validaciones (cedula, expedicion, vencimiento, permisos, nivel, validador, sop, origen)
    values (ced, exp_, ven,
            coalesce(array(select jsonb_array_elements_text(r->'permisos')), '{}'),
            initcap(nullif(trim(r->>'nivel'), '')), nullif(trim(regexp_replace(r->>'validador', '\s+', ' ', 'g')), ''),
            nullif(trim(r->>'sop'), ''), 'importe')
    on conflict (cedula, expedicion) do update
      set vencimiento = excluded.vencimiento, permisos = excluded.permisos, nivel = excluded.nivel,
          validador = excluded.validador, sop = excluded.sop;
  end loop;
  return query select n_n, n_r, n_a, n_f;
end $$;
grant execute on function public.seg_importar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- REGISTRAR UNA VALIDACIÓN DESDE LA APP (nueva o renovación)
-- p: cedula, nombre, empresa_id, departamento, estado, expedicion, permisos[], nivel, validador, sop, grupo_id
-- ---------------------------------------------------------------------
create or replace function public.seg_registrar(p jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare ced text := regexp_replace(coalesce(p->>'cedula', ''), '[^0-9A-Za-z]', '', 'g');
        exp_ date := nullif(p->>'expedicion', '')::date; vig int; ult date; habia boolean; quien text := public.seg_quien();
        est text := coalesce(public.seg_texto(p->>'estado'), 'ACTIVO');
begin
  if not public.seg_edita('/seguridad/certificaciones/personas') then
    raise exception 'Registrar requiere el permiso «Personas» de Certificaciones en editar (Admin › Roles).';
  end if;
  if ced = '' then raise exception 'Falta la cédula.'; end if;
  if coalesce(trim(p->>'nombre'), '') = '' then raise exception 'Falta el nombre.'; end if;
  if nullif(p->>'empresa_id', '') is null then raise exception 'Escoge la empresa.'; end if;
  if exp_ is null then raise exception 'Falta la fecha de expedición.'; end if;
  if exp_ > current_date + 1 then raise exception 'La fecha de expedición no puede ser futura.'; end if;
  if est not in ('ACTIVO', 'NO ACTIVO', 'BLOQUEADO', 'VACACIONES') then raise exception 'Estado no válido.'; end if;
  select vigencia into vig from public.seg_reglas where id = 1;
  habia := exists (select 1 from public.seg_personas where cedula = ced);
  select max(expedicion) into ult from public.seg_validaciones where cedula = ced;

  insert into public.seg_personas (cedula, nombre, empresa_id, departamento, estado, grupo_id)
  values (ced, upper(trim(regexp_replace(p->>'nombre', '\s+', ' ', 'g'))), (p->>'empresa_id')::uuid,
          coalesce(public.seg_texto(p->>'departamento'), 'LOGISTICA'), est, nullif(p->>'grupo_id', '')::uuid)
  on conflict (cedula) do update
    set nombre = excluded.nombre, empresa_id = excluded.empresa_id, departamento = excluded.departamento,
        estado = excluded.estado, grupo_id = excluded.grupo_id,
        motivo = case when excluded.estado = 'ACTIVO' then null else public.seg_personas.motivo end, actualizado = now();

  insert into public.seg_validaciones (cedula, expedicion, vencimiento, permisos, nivel, validador, sop, origen)
  values (ced, exp_, exp_ + vig, coalesce(array(select jsonb_array_elements_text(p->'permisos')), '{}'),
          nullif(trim(p->>'nivel'), ''), nullif(trim(p->>'validador'), ''), nullif(trim(p->>'sop'), ''), 'app')
  on conflict (cedula, expedicion) do update
    set permisos = excluded.permisos, nivel = excluded.nivel, validador = excluded.validador, sop = excluded.sop,
        vencimiento = excluded.vencimiento;

  if nullif(trim(p->>'validador'), '') is not null then
    insert into public.seg_validadores (nombre) values (trim(p->>'validador')) on conflict (nombre) do nothing;
  end if;

  insert into public.seg_eventos (cedula, tipo, detalle, por_nombre)
  values (ced, case when not habia then 'nueva' when ult is null or exp_ > ult then 'renovacion' else 'correccion' end,
          case when not habia then 'Validación nueva · expedida el ' || to_char(exp_, 'DD/MM/YYYY')
               when ult is null or exp_ > ult then 'Renovó · expedida el ' || to_char(exp_, 'DD/MM/YYYY')
               else 'Corrigió la validación del ' || to_char(exp_, 'DD/MM/YYYY') end, quien);
  return case when not habia then 'nueva' when ult is null or exp_ > ult then 'renovacion' else 'correccion' end;
end $$;
grant execute on function public.seg_registrar(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- CAMBIAR EL ESTADO (con motivo cuando no es ACTIVO)
-- ---------------------------------------------------------------------
create or replace function public.seg_estado(p_cedula text, p_estado text, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $$
declare est text := public.seg_texto(p_estado); antes text;
begin
  if not public.seg_edita('/seguridad/certificaciones/personas') then
    raise exception 'Cambiar el estado requiere el permiso «Personas» de Certificaciones en editar (Admin › Roles).';
  end if;
  if est not in ('ACTIVO', 'NO ACTIVO', 'BLOQUEADO', 'VACACIONES') then raise exception 'Estado no válido.'; end if;
  if est = 'BLOQUEADO' and coalesce(trim(p_motivo), '') = '' then raise exception 'Para bloquear escribe el motivo.'; end if;
  select estado into antes from public.seg_personas where cedula = p_cedula;
  if antes is null then raise exception 'Esa persona no está en la base.'; end if;
  update public.seg_personas set estado = est, motivo = case when est = 'ACTIVO' then null else nullif(trim(p_motivo), '') end, actualizado = now()
   where cedula = p_cedula;
  insert into public.seg_eventos (cedula, tipo, detalle, por_nombre)
  values (p_cedula, 'estado', initcap(antes) || ' → ' || initcap(est) || coalesce(' · ' || nullif(trim(p_motivo), ''), ''), public.seg_quien());
end $$;
grant execute on function public.seg_estado(text, text, text) to authenticated;

commit;
