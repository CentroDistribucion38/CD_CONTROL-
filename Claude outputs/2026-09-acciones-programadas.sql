-- =====================================================================
-- ACCIONES · PREVENTIVAS PROGRAMADAS + META «A TIEMPO»
-- ---------------------------------------------------------------------
-- «Revisar extintores cada mes»: se programa una vez y el sistema crea
-- la acción preventiva sola cuando le toca, con su plazo, su dueño y su
-- zona. Nadie tiene que acordarse.
--
--   1. acciones_programadas: qué, dónde, cada cuánto y la próxima fecha.
--   2. acciones.programada: de qué programación salió cada acción.
--   3. acciones_programadas_generar(): crea las que ya tocan (hora de
--      Colombia) y corre la próxima fecha. Se puede llamar las veces que
--      sea: una programación que ya generó su acción de hoy no genera
--      otra. La app la llama al abrir Acciones; si la base tiene pg_cron
--      se programa también a las 5 a. m.
--   4. guardar / borrar programaciones: solo supervisor o administrador.
--   5. El parámetro meta_a_tiempo (95 %) para los indicadores.
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.acciones_programadas (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (length(btrim(titulo)) >= 3),
  motivo      text not null references public.acciones_motivos(clave),
  zona        text references public.acciones_zonas(codigo),
  ubicacion   text,
  prioridad   accion_prioridad not null default 'media',
  equipo      text references public.acciones_equipos(clave),
  responsable uuid references public.perfiles(id) on delete set null,
  cada        text not null check (cada in ('dia', 'semana', 'quincena', 'mes', 'trimestre')),
  proxima     date not null,
  activo      boolean not null default true,
  ultima      date,
  creada_por  uuid default auth.uid(),
  creada_en   timestamptz not null default now(),
  check (zona is not null or btrim(coalesce(ubicacion, '')) <> '')
);
alter table public.acciones_programadas enable row level security;
drop policy if exists acciones_programadas_ver on public.acciones_programadas;
create policy acciones_programadas_ver on public.acciones_programadas for select to authenticated using (true);
revoke insert, update, delete on public.acciones_programadas from authenticated, anon;
grant select on public.acciones_programadas to authenticated;

alter table public.acciones add column if not exists programada uuid
  references public.acciones_programadas(id) on delete set null;

insert into public.acciones_parametros (clave, valor, nota) values
  ('meta_a_tiempo', 95, 'Meta del % de acciones cerradas dentro de su plazo.')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- LA SIGUIENTE FECHA
-- ---------------------------------------------------------------------
create or replace function public.acciones_programada_siguiente(p_fecha date, p_cada text)
returns date language sql immutable as $$
  select case p_cada
    when 'dia'       then p_fecha + 1
    when 'semana'    then p_fecha + 7
    when 'quincena'  then p_fecha + 14
    when 'mes'       then (p_fecha + interval '1 month')::date
    when 'trimestre' then (p_fecha + interval '3 months')::date
  end
$$;

-- ---------------------------------------------------------------------
-- GENERAR LAS QUE TOCAN
-- ---------------------------------------------------------------------
create or replace function public.acciones_programadas_generar()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  hoy   date := (now() at time zone 'America/Bogota')::date;
  r     public.acciones_programadas%rowtype;
  n     integer := 0;
  v_area text; v_horas integer; v_cod text; v_prox date;
begin
  for r in
    select * from public.acciones_programadas
     where activo and proxima <= hoy and (ultima is null or ultima < hoy)
     for update skip locked
  loop
    select coalesce(z.area, m.area, 'seguridad') into v_area
      from public.acciones_motivos m
      left join public.acciones_zonas z on z.codigo = r.zona
     where m.clave = r.motivo;
    select horas into v_horas from public.acciones_plazos where prioridad = r.prioridad;
    v_cod := 'AC-' || lpad(nextval('public.acciones_codigo_seq')::text, 4, '0');

    insert into public.acciones
      (codigo, tipo, titulo, motivo, area, zona, ubicacion, prioridad, vence_en, estado,
       causa_raiz, responsable_proceso, responsable, equipo, asignada_en, reportada_por, programada)
    values
      (v_cod, 'preventiva', r.titulo, r.motivo, coalesce(v_area, 'seguridad'), r.zona, r.ubicacion,
       r.prioridad, now() + make_interval(hours => coalesce(v_horas, 72)), 'abierta',
       'Preventiva programada (' || r.cada || ')', r.responsable, r.responsable, r.equipo,
       case when r.responsable is not null or r.equipo is not null then now() end,
       r.creada_por, r.id);

    /* La próxima fecha salta los periodos que se perdieron: si nadie
       abrió la app en diez días, sale UNA acción, no diez. */
    v_prox := r.proxima;
    while v_prox <= hoy loop v_prox := public.acciones_programada_siguiente(v_prox, r.cada); end loop;
    update public.acciones_programadas set proxima = v_prox, ultima = hoy where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.acciones_programadas_generar() from public, anon;
grant execute on function public.acciones_programadas_generar() to authenticated;

-- ---------------------------------------------------------------------
-- GUARDAR Y BORRAR (solo quien edita)
-- ---------------------------------------------------------------------
create or replace function public.acciones_programada_guardar(
  p_id uuid, p_titulo text, p_motivo text, p_zona text, p_ubicacion text, p_prioridad text,
  p_equipo text, p_responsable uuid, p_cada text, p_proxima date, p_activo boolean default true)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.es_editor() then
    raise exception 'Programar preventivas requiere rol de supervisor o administrador';
  end if;
  if p_id is null then
    insert into public.acciones_programadas
      (titulo, motivo, zona, ubicacion, prioridad, equipo, responsable, cada, proxima, activo)
    values (btrim(p_titulo), p_motivo, nullif(upper(btrim(coalesce(p_zona, ''))), ''),
            nullif(btrim(coalesce(p_ubicacion, '')), ''), p_prioridad::accion_prioridad,
            nullif(p_equipo, ''), p_responsable, p_cada, p_proxima, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.acciones_programadas set
      titulo = btrim(p_titulo), motivo = p_motivo, zona = nullif(upper(btrim(coalesce(p_zona, ''))), ''),
      ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''), prioridad = p_prioridad::accion_prioridad,
      equipo = nullif(p_equipo, ''), responsable = p_responsable, cada = p_cada,
      proxima = p_proxima, activo = coalesce(p_activo, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa programación ya no existe'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.acciones_programada_borrar(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.es_editor() then
    raise exception 'Borrar programaciones requiere rol de supervisor o administrador';
  end if;
  delete from public.acciones_programadas where id = p_id;
end $$;

revoke all on function public.acciones_programada_guardar(uuid, text, text, text, text, text, text, uuid, text, date, boolean) from public, anon;
revoke all on function public.acciones_programada_borrar(uuid) from public, anon;
grant execute on function public.acciones_programada_guardar(uuid, text, text, text, text, text, text, uuid, text, date, boolean) to authenticated;
grant execute on function public.acciones_programada_borrar(uuid) to authenticated;

-- A las 5 a. m. de Colombia (10:00 UTC), si la base tiene pg_cron.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'acciones-programadas';
    perform cron.schedule('acciones-programadas', '0 10 * * *', 'select public.acciones_programadas_generar()');
  end if;
exception when others then null;
end $$;

do $$ begin raise notice 'LISTO: preventivas programadas y meta a tiempo.'; end $$;
commit;
