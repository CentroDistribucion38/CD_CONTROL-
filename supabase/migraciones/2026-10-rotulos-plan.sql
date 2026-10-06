-- =====================================================================
-- INVENTARIO · RÓTULOS DEL PLAN DE ENVASE — control de lo impreso
--
-- Del plan de envase salen los rótulos de producción SIN llenar nada:
-- SKU, cantidad, fechas, línea y turno ya los trae el plan y el Maestro.
-- Esto es lo que lleva la cuenta de lo que se imprime:
--
--   rotulos_plan   una fila por rótulo impreso: folio, semana, día, turno,
--                  tren, SKU, número, cajas, quién y cuándo, y si es del
--                  plan o ADICIONAL (más de lo planeado), y si fue
--                  REIMPRESO (con motivo).
--
-- NO cuelga de plan_envase_semanas: si se vuelve a subir el Excel de una
-- semana, el registro de lo ya impreso NO se pierde (va por año + semana).
--
-- Imprimir exige poder editar «Recepción» (Roles); verlo, poder verlo.
-- Las tablas solo se escriben por las funciones de abajo.
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.rotulos_plan (
  id            bigint generated always as identity primary key,
  folio         text not null unique,
  anio          integer not null,
  semana        integer not null,
  fecha         date not null,
  turno         smallint not null check (turno between 1 and 3),
  tren          text not null,
  sap           text not null,
  numero        integer not null check (numero >= 1),
  cajas         integer,
  planeadas     integer not null default 0,
  tipo          text not null default 'plan' check (tipo in ('plan', 'adicional')),
  estado        text not null default 'impreso' check (estado in ('impreso', 'reemplazado')),
  reimpresion_de text,
  motivo        text,
  lote          uuid not null,
  impreso_por   uuid references public.perfiles(id) on delete set null,
  impreso_en    timestamptz not null default now()
);
/* Un número vigente por bloque: dos rótulos activos con el mismo número no pueden existir. */
create unique index if not exists rotulos_plan_vigente_uq
  on public.rotulos_plan (anio, semana, fecha, turno, tren, sap, numero) where estado = 'impreso';
create index if not exists rotulos_plan_semana_idx on public.rotulos_plan (anio, semana, fecha, tren);
create index if not exists rotulos_plan_lote_idx on public.rotulos_plan (lote);

alter table public.rotulos_plan enable row level security;
drop policy if exists rotulos_plan_ver on public.rotulos_plan;
create policy rotulos_plan_ver on public.rotulos_plan for select to authenticated using (public.puede_ver('/inventario/recibir'));
revoke insert, update, delete on public.rotulos_plan from authenticated, anon;
grant select on public.rotulos_plan to authenticated;

-- ---------------------------------------------------------------------
-- IMPRIMIR: da los folios y los deja anotados. Hasta `p_planeadas` son
-- del plan; los que pasen de ahí quedan como ADICIONALES.
-- ---------------------------------------------------------------------
create or replace function public.rotulos_plan_imprimir(
  p_anio int, p_semana int, p_fecha date, p_turno int, p_tren text, p_sap text,
  p_cantidad int, p_planeadas int, p_cajas int
)
returns table (folio text, numero int, tipo text, lote uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ult int; v_lote uuid := gen_random_uuid(); i int; v_n int; v_tipo text; v_folio text; v_tren text;
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Imprimir los rótulos del plan requiere el permiso «Recepción» (Roles)';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 400 then
    raise exception 'Se imprimen entre 1 y 400 rótulos por vez';
  end if;
  if p_turno not between 1 and 3 or p_fecha is null or coalesce(p_sap, '') = '' or coalesce(p_tren, '') = '' then
    raise exception 'Falta el día, el turno, la línea o el SKU';
  end if;
  /* Dos personas imprimiendo el mismo bloque a la vez no pueden sacar los mismos números. */
  perform pg_advisory_xact_lock(hashtext(p_anio || '|' || p_semana || '|' || p_fecha || '|' || p_turno || '|' || p_tren || '|' || p_sap));
  select coalesce(max(r.numero), 0) into v_ult from public.rotulos_plan r
   where r.anio = p_anio and r.semana = p_semana and r.fecha = p_fecha and r.turno = p_turno and r.tren = p_tren and r.sap = p_sap;
  v_tren := regexp_replace(upper(p_tren), '^TREN-?', '');
  for i in 1..p_cantidad loop
    v_n := v_ult + i;
    v_tipo := case when v_n <= greatest(coalesce(p_planeadas, 0), 0) then 'plan' else 'adicional' end;
    v_folio := p_sap || '-' || to_char(p_fecha, 'YYYYMMDD') || '-L' || v_tren || '-T' || p_turno || '-' || lpad(v_n::text, 3, '0');
    insert into public.rotulos_plan (folio, anio, semana, fecha, turno, tren, sap, numero, cajas, planeadas, tipo, lote, impreso_por)
    values (v_folio, p_anio, p_semana, p_fecha, p_turno, p_tren, p_sap, v_n, p_cajas, coalesce(p_planeadas, 0), v_tipo, v_lote, auth.uid());
    folio := v_folio; numero := v_n; tipo := v_tipo; lote := v_lote; return next;
  end loop;
end $$;
revoke all on function public.rotulos_plan_imprimir(int, int, date, int, text, text, int, int, int) from public, anon;
grant execute on function public.rotulos_plan_imprimir(int, int, date, int, text, text, int, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- REIMPRIMIR: el rótulo viejo queda «reemplazado» y sale uno nuevo con
-- el mismo número y folio + «R1», «R2»… Pide el motivo.
-- ---------------------------------------------------------------------
create or replace function public.rotulos_plan_reimprimir(p_folios text[], p_motivo text)
returns table (folio text, anio int, semana int, fecha date, turno int, tren text, sap text, numero int, cajas int, planeadas int, tipo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote uuid := gen_random_uuid(); o public.rotulos_plan%rowtype; v_base text; v_k int; v_nuevo text;
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Reimprimir rótulos requiere el permiso «Recepción» (Roles)';
  end if;
  if p_motivo is null or p_motivo not in ('Dañado', 'Perdido', 'Dato equivocado', 'Otro') then
    raise exception 'Falta el motivo de la reimpresión';
  end if;
  if p_folios is null or coalesce(array_length(p_folios, 1), 0) not between 1 and 400 then
    raise exception 'Se reimprimen entre 1 y 400 rótulos por vez';
  end if;
  for o in select * from public.rotulos_plan r where r.folio = any (p_folios) and r.estado = 'impreso' order by r.fecha, r.turno, r.tren, r.sap, r.numero for update loop
    v_base := regexp_replace(o.folio, 'R[0-9]+$', '');
    select count(*) + 1 into v_k from public.rotulos_plan r where r.folio ~ ('^' || v_base || 'R[0-9]+$');
    v_nuevo := v_base || 'R' || v_k;
    update public.rotulos_plan set estado = 'reemplazado', motivo = p_motivo where id = o.id;
    insert into public.rotulos_plan (folio, anio, semana, fecha, turno, tren, sap, numero, cajas, planeadas, tipo, reimpresion_de, motivo, lote, impreso_por)
    values (v_nuevo, o.anio, o.semana, o.fecha, o.turno, o.tren, o.sap, o.numero, o.cajas, o.planeadas, o.tipo, o.folio, p_motivo, v_lote, auth.uid());
    folio := v_nuevo; anio := o.anio; semana := o.semana; fecha := o.fecha; turno := o.turno; tren := o.tren; sap := o.sap;
    numero := o.numero; cajas := o.cajas; planeadas := o.planeadas; tipo := o.tipo; return next;
  end loop;
  if not found then raise exception 'Ninguno de esos folios está vigente'; end if;
end $$;
revoke all on function public.rotulos_plan_reimprimir(text[], text) from public, anon;
grant execute on function public.rotulos_plan_reimprimir(text[], text) to authenticated;

-- Lo mismo, por RANGO de números de un bloque (lo que usa la pantalla):
-- toma los que estén vigentes entre `desde` y `hasta`, aunque ya hayan sido reimpresos.
create or replace function public.rotulos_plan_reimprimir_rango(
  p_anio int, p_semana int, p_fecha date, p_turno int, p_tren text, p_sap text, p_desde int, p_hasta int, p_motivo text
)
returns table (folio text, anio int, semana int, fecha date, turno int, tren text, sap text, numero int, cajas int, planeadas int, tipo text)
language plpgsql
security definer
set search_path = public
as $$
declare v_folios text[];
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Reimprimir rótulos requiere el permiso «Recepción» (Roles)';
  end if;
  select array_agg(r.folio order by r.numero) into v_folios from public.rotulos_plan r
   where r.anio = p_anio and r.semana = p_semana and r.fecha = p_fecha and r.turno = p_turno and r.tren = p_tren and r.sap = p_sap
     and r.numero between p_desde and p_hasta and r.estado = 'impreso';
  if v_folios is null then raise exception 'No hay rótulos vigentes entre el % y el %', p_desde, p_hasta; end if;
  return query select * from public.rotulos_plan_reimprimir(v_folios, p_motivo);
end $$;
revoke all on function public.rotulos_plan_reimprimir_rango(int, int, date, int, text, text, int, int, text) from public, anon;
grant execute on function public.rotulos_plan_reimprimir_rango(int, int, date, int, text, text, int, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- RESUMEN POR BLOQUE (día · turno · línea · SKU): lo impreso vigente.
-- ---------------------------------------------------------------------
create or replace function public.rotulos_plan_resumen(p_anio int, p_semana int)
returns table (fecha date, turno int, tren text, sap text, impresos int, adicionales int, reimpresos int, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/recibir') then
    raise exception 'Sin permiso para ver los rótulos del plan';
  end if;
  return query
    select r.fecha, r.turno::int, r.tren, r.sap,
           (count(*) filter (where r.tipo = 'plan' and r.estado = 'impreso'))::int,
           (count(*) filter (where r.tipo = 'adicional' and r.estado = 'impreso'))::int,
           (count(*) filter (where r.reimpresion_de is not null))::int,
           max(r.impreso_en)
      from public.rotulos_plan r
     where r.anio = p_anio and r.semana = p_semana
     group by r.fecha, r.turno, r.tren, r.sap;
end $$;
revoke all on function public.rotulos_plan_resumen(int, int) from public, anon;
grant execute on function public.rotulos_plan_resumen(int, int) to authenticated;

-- ---------------------------------------------------------------------
-- LOTES DE IMPRESIÓN: cada vez que alguien mandó imprimir.
-- ---------------------------------------------------------------------
create or replace function public.rotulos_plan_lotes(p_anio int, p_semana int)
returns table (lote uuid, impreso_en timestamptz, quien text, fecha date, turno int, tren text, sap text,
               cantidad int, desde int, hasta int, reimpresion boolean, motivo text, vigentes int, primero text, ultimo text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/recibir') then
    raise exception 'Sin permiso para ver los rótulos del plan';
  end if;
  return query
    select r.lote, min(r.impreso_en), coalesce(max(p.nombre), '—'), r.fecha, r.turno::int, r.tren, r.sap,
           count(*)::int, min(r.numero), max(r.numero), bool_or(r.reimpresion_de is not null), max(r.motivo),
           (count(*) filter (where r.estado = 'impreso'))::int,
           (array_agg(r.folio order by r.numero))[1], (array_agg(r.folio order by r.numero desc))[1]
      from public.rotulos_plan r
      left join public.perfiles p on p.id = r.impreso_por
     where r.anio = p_anio and r.semana = p_semana
     group by r.lote, r.fecha, r.turno, r.tren, r.sap
     order by min(r.impreso_en) desc
     limit 400;
end $$;
revoke all on function public.rotulos_plan_lotes(int, int) from public, anon;
grant execute on function public.rotulos_plan_lotes(int, int) to authenticated;

-- ---------------------------------------------------------------------
-- CIERRE POR BLOQUE: lo único que se escribe es CUÁNTOS SOBRARON.
-- Usados = rótulos vigentes (plan + adicionales) − sobrantes; la variación
-- contra el plan y los adicionales se calculan solos en pantalla.
-- Una fila por día + turno + tren + SKU. Vacío = se borra el cierre.
-- ---------------------------------------------------------------------
create table if not exists public.rotulos_plan_cierre (
  anio        integer not null,
  semana      integer not null,
  fecha       date not null,
  turno       smallint not null check (turno between 1 and 3),
  tren        text not null,
  sap         text not null,
  sobrantes   integer not null check (sobrantes >= 0),
  cerrado_por uuid references public.perfiles(id) on delete set null,
  cerrado_en  timestamptz not null default now(),
  primary key (anio, semana, fecha, turno, tren, sap)
);
alter table public.rotulos_plan_cierre enable row level security;
drop policy if exists rotulos_plan_cierre_ver on public.rotulos_plan_cierre;
create policy rotulos_plan_cierre_ver on public.rotulos_plan_cierre for select to authenticated using (public.puede_ver('/inventario/recibir'));
revoke insert, update, delete on public.rotulos_plan_cierre from authenticated, anon;
grant select on public.rotulos_plan_cierre to authenticated;

create or replace function public.rotulos_plan_cierre_guardar(
  p_anio int, p_semana int, p_fecha date, p_turno int, p_tren text, p_sap text, p_sobrantes int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_vig int;
begin
  if not public.puede_editar('/inventario/recibir') then
    raise exception 'Cerrar lo entregado requiere el permiso «Recepción» (Roles)';
  end if;
  if p_turno not between 1 and 3 or p_fecha is null or coalesce(p_sap, '') = '' or coalesce(p_tren, '') = '' then
    raise exception 'Falta el día, el turno, la línea o el SKU';
  end if;
  if p_sobrantes is null then
    delete from public.rotulos_plan_cierre
     where anio = p_anio and semana = p_semana and fecha = p_fecha and turno = p_turno and tren = p_tren and sap = p_sap;
    return;
  end if;
  select count(*) into v_vig from public.rotulos_plan r
   where r.anio = p_anio and r.semana = p_semana and r.fecha = p_fecha and r.turno = p_turno and r.tren = p_tren and r.sap = p_sap
     and r.estado = 'impreso';
  if p_sobrantes < 0 or p_sobrantes > v_vig then
    raise exception 'Sobraron % pero solo hay % rótulos impresos en este bloque', p_sobrantes, v_vig;
  end if;
  insert into public.rotulos_plan_cierre (anio, semana, fecha, turno, tren, sap, sobrantes, cerrado_por)
  values (p_anio, p_semana, p_fecha, p_turno, p_tren, p_sap, p_sobrantes, auth.uid())
  on conflict (anio, semana, fecha, turno, tren, sap)
  do update set sobrantes = excluded.sobrantes, cerrado_por = auth.uid(), cerrado_en = now();
end $$;
revoke all on function public.rotulos_plan_cierre_guardar(int, int, date, int, text, text, int) from public, anon;
grant execute on function public.rotulos_plan_cierre_guardar(int, int, date, int, text, text, int) to authenticated;

create or replace function public.rotulos_plan_cierres(p_anio int, p_semana int)
returns table (fecha date, turno int, tren text, sap text, sobrantes int, cerrado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/recibir') then
    raise exception 'Sin permiso para ver los rótulos del plan';
  end if;
  return query
    select c.fecha, c.turno::int, c.tren, c.sap, c.sobrantes, c.cerrado_en
      from public.rotulos_plan_cierre c
     where c.anio = p_anio and c.semana = p_semana;
end $$;
revoke all on function public.rotulos_plan_cierres(int, int) from public, anon;
grant execute on function public.rotulos_plan_cierres(int, int) to authenticated;

commit;
-- LISTO · rótulos del plan
