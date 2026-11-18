-- =====================================================================
-- 5S · PASO 3 — PLAN DE ACCIÓN: QUE CADA HALLAZGO SE CIERRE
--
-- Va DESPUÉS de 2026-11-cinco-s.sql y 2026-11-cinco-s-2.sql.
--
-- Hasta ahora un «no cumple» quedaba escrito en el informe con las columnas
-- «acción / responsable / fecha» en blanco, y nadie vigilaba que se
-- arreglara. Aquí cada hallazgo:
--   · recibe su plan: qué se va a hacer, quién (de los responsables 5S) y
--     para cuándo (fecha compromiso);
--   · se CIERRA con lo que se hizo y AL MENOS UNA FOTO DEL DESPUÉS (la base
--     no deja cerrar sin foto);
--   · si se cerró por error, se reabre (y se quitan sus fotos del después).
--
--   s5_inspeccion_puntos   + accion, accion_resp_id, accion_resp,
--                            accion_fecha, cerrada_el, cerrada_por,
--                            cierre_nota
--   s5_fotos               + momento ('antes' = la de la inspección,
--                            'despues' = la del cierre)
--   v_s5_hallazgos         todos los «no cumple» con su estado calculado:
--                            sin_plan · abierta · vencida · cerrada
--   s5_plan(...)           asigna o cambia el plan de un hallazgo abierto.
--   s5_cerrar(...)         lo cierra (exige foto del después).
--   s5_reabrir(uuid)       lo reabre (devuelve las fotos que hay que quitar).
--
-- Y LAS FIRMAS DEL INFORME: se escoge quién firma como Supervisor OL y
-- quién como Warehouse Supervisor ABI: la de OL se escribe; la de ABI se
-- escoge de los responsables 5S.
--   s5_inspecciones        + firma_ol_id, firma_ol, firma_abi_id, firma_abi
--   s5_firmas(...)         las pone o las cambia.
--
-- PERMISOS (Admin › Roles): 5S › Plan de acción (/5s/plan). Con «Ver» se
-- consulta; con «Editar» se asigna, se cierra y se reabre.
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- Quien ve cualquiera de las pantallas de 5S, ve 5S (ahora con el plan).
create or replace function public.s5_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  -- 5S es solo del super administrador (2026-11-cinco-s-5.sql).
  select public.manda()
$$;

-- ---------------------------------------------------------------------
-- 1. EL PLAN VIVE EN EL HALLAZGO MISMO (el punto que no cumplió)
-- ---------------------------------------------------------------------
alter table public.s5_inspeccion_puntos add column if not exists accion         text;
alter table public.s5_inspeccion_puntos add column if not exists accion_resp_id uuid references public.s5_responsables(id) on delete set null;
alter table public.s5_inspeccion_puntos add column if not exists accion_resp    text;
alter table public.s5_inspeccion_puntos add column if not exists accion_fecha   date;
alter table public.s5_inspeccion_puntos add column if not exists cerrada_el     timestamptz;
alter table public.s5_inspeccion_puntos add column if not exists cerrada_por    text;
alter table public.s5_inspeccion_puntos add column if not exists cierre_nota    text;
create index if not exists s5_inspeccion_puntos_hallazgos on public.s5_inspeccion_puntos (inspeccion_id)
  where resultado = 'no_cumple';

alter table public.s5_fotos add column if not exists momento text not null default 'antes';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 's5_fotos_momento_check') then
    alter table public.s5_fotos add constraint s5_fotos_momento_check check (momento in ('antes', 'despues'));
  end if;
end $$;

-- Las firmas del informe (nombre copiado: si el responsable cambia de nombre, el informe firmado no).
alter table public.s5_inspecciones add column if not exists firma_ol_id  uuid references public.s5_responsables(id) on delete set null;
alter table public.s5_inspecciones add column if not exists firma_ol     text;
alter table public.s5_inspecciones add column if not exists firma_abi_id uuid references public.s5_responsables(id) on delete set null;
alter table public.s5_inspecciones add column if not exists firma_abi    text;

-- La inspección cuenta sus fotos (las de la auditoría, no las del cierre). Se rehace (no «replace»)
-- porque la tabla ganó columnas y la vista las trae con i.*.
drop view if exists public.v_s5_inspecciones;
create view public.v_s5_inspecciones with (security_invoker = true) as
select i.*,
       coalesce((
         select jsonb_object_agg(x.s, x.pct)
           from (select p.s,
                        round(100 * sum(p.peso) filter (where p.resultado = 'cumple')
                              / nullif(sum(p.peso) filter (where p.resultado <> 'na'), 0), 1) as pct
                   from public.s5_inspeccion_puntos p
                  where p.inspeccion_id = i.id
                  group by p.s) x
       ), '{}'::jsonb) as por_s,
       (select count(*) from public.s5_fotos f where f.inspeccion_id = i.id and f.momento = 'antes')::integer as fotos
  from public.s5_inspecciones i;
grant select on public.v_s5_inspecciones to authenticated;

-- ---------------------------------------------------------------------
-- 2. LOS HALLAZGOS CON SU ESTADO (se calcula, no se escribe)
-- ---------------------------------------------------------------------
create or replace view public.v_s5_hallazgos with (security_invoker = true) as
select p.id, p.inspeccion_id, i.fecha, i.area_id, i.area, i.responsable as area_responsable,
       p.orden, p.s, p.pregunta, p.severidad, p.observacion, p.zona,
       p.accion, p.accion_resp_id, p.accion_resp, p.accion_fecha,
       p.cerrada_el, p.cerrada_por, p.cierre_nota,
       case
         when p.cerrada_el is not null then 'cerrada'
         when p.accion is null then 'sin_plan'
         when p.accion_fecha < (now() at time zone 'America/Bogota')::date then 'vencida'
         else 'abierta'
       end as estado,
       ((coalesce((p.cerrada_el at time zone 'America/Bogota')::date, (now() at time zone 'America/Bogota')::date)) - i.fecha) as dias,
       (select count(*) from public.s5_fotos f where f.item_id = p.id and f.momento = 'antes')::integer   as fotos_antes,
       (select count(*) from public.s5_fotos f where f.item_id = p.id and f.momento = 'despues')::integer as fotos_despues
  from public.s5_inspeccion_puntos p
  join public.s5_inspecciones i on i.id = p.inspeccion_id
 where p.resultado = 'no_cumple';
grant select on public.v_s5_hallazgos to authenticated;

-- ---------------------------------------------------------------------
-- 3. ASIGNAR O CAMBIAR EL PLAN
-- ---------------------------------------------------------------------
create or replace function public.s5_plan(p_item uuid, p_accion text, p_resp uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_p     public.s5_inspeccion_puntos%rowtype;
  v_insp  date;
  v_nom   text;
begin
  if not public.s5_edita('/5s/plan') then
    raise exception 'No tienes permiso para asignar planes de acción 5S.';
  end if;
  select * into v_p from public.s5_inspeccion_puntos where id = p_item for update;
  if not found or v_p.resultado <> 'no_cumple' then raise exception 'Ese hallazgo ya no existe.'; end if;
  if v_p.cerrada_el is not null then raise exception 'Ese hallazgo ya está cerrado. Reábrelo para cambiar su plan.'; end if;
  if nullif(trim(p_accion), '') is null then raise exception 'Escribe qué se va a hacer.'; end if;
  if p_fecha is null then raise exception 'Escoge la fecha compromiso.'; end if;
  select fecha into v_insp from public.s5_inspecciones where id = v_p.inspeccion_id;
  if p_fecha < v_insp then raise exception 'La fecha compromiso no puede ser antes de la inspección (%).', to_char(v_insp, 'DD/MM/YYYY'); end if;
  select nombre into v_nom from public.s5_responsables where id = p_resp and activo;
  if v_nom is null then raise exception 'Escoge un responsable activo.'; end if;

  update public.s5_inspeccion_puntos
     set accion = trim(p_accion), accion_resp_id = p_resp, accion_resp = v_nom, accion_fecha = p_fecha
   where id = p_item;
end $$;
revoke all on function public.s5_plan(uuid, text, uuid, date) from public, anon;
grant execute on function public.s5_plan(uuid, text, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CERRAR: lo que se hizo + al menos una foto del después.
--    p_fotos = [{ ruta, bytes }]; las fotos ya subieron al bucket con la
--    ruta «<inspección>/cierre-<hallazgo>-…».
-- ---------------------------------------------------------------------
create or replace function public.s5_cerrar(p_item uuid, p_nota text, p_fotos jsonb) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_p    public.s5_inspeccion_puntos%rowtype;
  v_nom  text;
  f      jsonb;
begin
  if not public.s5_edita('/5s/plan') then
    raise exception 'No tienes permiso para cerrar hallazgos 5S.';
  end if;
  select * into v_p from public.s5_inspeccion_puntos where id = p_item for update;
  if not found or v_p.resultado <> 'no_cumple' then raise exception 'Ese hallazgo ya no existe.'; end if;
  if v_p.cerrada_el is not null then raise exception 'Ese hallazgo ya estaba cerrado.'; end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Escribe qué se hizo para cerrarlo.'; end if;
  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) = 0 then
    raise exception 'Para cerrar un hallazgo hace falta la foto del después.';
  end if;

  for f in select * from jsonb_array_elements(p_fotos) loop
    if coalesce(f->>'ruta', '') not like v_p.inspeccion_id::text || '/cierre-' || p_item::text || '-%' then
      raise exception 'Ruta de foto no válida.';
    end if;
    insert into public.s5_fotos (inspeccion_id, item_id, ruta, bytes, momento)
    values (v_p.inspeccion_id, p_item, f->>'ruta', nullif(f->>'bytes', '')::integer, 'despues');
  end loop;

  select coalesce(nullif(trim(nombre), ''), usuario) into v_nom from public.perfiles where id = auth.uid();
  update public.s5_inspeccion_puntos
     set cerrada_el = now(), cerrada_por = v_nom, cierre_nota = trim(p_nota)
   where id = p_item;
end $$;
revoke all on function public.s5_cerrar(uuid, text, jsonb) from public, anon;
grant execute on function public.s5_cerrar(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. REABRIR (si se cerró por error): vuelve a abierto y devuelve las
--    rutas de las fotos del después, para quitarlas del bucket.
-- ---------------------------------------------------------------------
create or replace function public.s5_reabrir(p_item uuid) returns text[]
language plpgsql security definer set search_path = public
as $$
declare v_rutas text[];
begin
  if not public.s5_edita('/5s/plan') then
    raise exception 'No tienes permiso para reabrir hallazgos 5S.';
  end if;
  update public.s5_inspeccion_puntos set cerrada_el = null, cerrada_por = null, cierre_nota = null
   where id = p_item and resultado = 'no_cumple' and cerrada_el is not null;
  if not found then raise exception 'Ese hallazgo no está cerrado.'; end if;
  select coalesce(array_agg(ruta), '{}') into v_rutas from public.s5_fotos where item_id = p_item and momento = 'despues';
  delete from public.s5_fotos where item_id = p_item and momento = 'despues';
  return v_rutas;
end $$;
revoke all on function public.s5_reabrir(uuid) from public, anon;
grant execute on function public.s5_reabrir(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. LAS FIRMAS: Supervisor OL se escribe (nombre libre, es del operador
--    logístico); Warehouse Supervisor ABI se escoge de los responsables
--    (arranca en el responsable del área). null = la línea en blanco.
-- ---------------------------------------------------------------------
drop function if exists public.s5_firmas(uuid, uuid, uuid);
create or replace function public.s5_firmas(p_insp uuid, p_ol text, p_abi uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_abi text;
begin
  if not (public.s5_edita('/5s') or public.s5_edita('/5s/historial')) then
    raise exception 'No tienes permiso para cambiar las firmas del informe.';
  end if;
  if p_abi is not null then
    select nombre into v_abi from public.s5_responsables where id = p_abi;
    if v_abi is null then raise exception 'Ese responsable ya no existe.'; end if;
  end if;
  update public.s5_inspecciones
     set firma_ol_id = null, firma_ol = nullif(left(trim(p_ol), 80), ''), firma_abi_id = p_abi, firma_abi = v_abi
   where id = p_insp;
  if not found then raise exception 'Esa inspección ya no existe.'; end if;
end $$;
revoke all on function public.s5_firmas(uuid, text, uuid) from public, anon;
grant execute on function public.s5_firmas(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. LAS FOTOS DEL CIERRE: las sube y las quita quien edita el plan
--    (solo las «…/cierre-…»); lo demás sigue igual.
-- ---------------------------------------------------------------------
drop policy if exists cinco_s_subir on storage.objects;
create policy cinco_s_subir on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cinco-s' and (
      public.s5_edita('/5s')
      or (public.s5_edita('/5s/plan') and name like '%/cierre-%')
    ));
drop policy if exists cinco_s_borrar on storage.objects;
create policy cinco_s_borrar on storage.objects
  for delete to authenticated using (
    bucket_id = 'cinco-s' and (
      public.s5_edita('/5s/historial')
      or (public.s5_edita('/5s/plan') and name like '%/cierre-%')
    ));

notify pgrst, 'reload schema';
commit;

do $$
declare v_c int; v_h int;
begin
  select count(*) into v_c from information_schema.columns
   where table_schema = 'public' and table_name = 's5_inspeccion_puntos'
     and column_name in ('accion', 'accion_resp_id', 'accion_resp', 'accion_fecha', 'cerrada_el', 'cerrada_por', 'cierre_nota');
  select count(*) into v_h from public.v_s5_hallazgos where estado <> 'cerrada';
  raise notice '----------------------------------------------------------';
  raise notice 'columnas del plan ....... %', case when v_c = 7 then 'ok' else 'MAL (' || v_c || ')' end;
  raise notice 'hallazgos sin cerrar .... %', v_h;
  raise notice 'Siguiente: Admin › Roles → dar 5S › Plan de acción (Editar a quien cierra).';
  raise notice '----------------------------------------------------------';
end $$;
