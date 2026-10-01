-- =====================================================================
-- INVENTARIO FISCAL · «TERMINÉ MI HOJA» Y EL CRUCE DE LA PAREJA
--
-- «Hoy se anota a ciegas, pero nada compara ni cierra.»
--
-- QUÉ HACE
--   1. «Terminé mi hoja»: cada persona avisa que ya contó lo suyo. Mientras
--      su hoja está terminada no puede anotar ni quitar renglones (se puede
--      REABRIR, y entonces el cruce deja de estar disponible hasta que
--      vuelva a terminar). No se puede terminar una hoja sin ningún renglón:
--      el cero cuenta como renglón, el vacío no.
--   2. «Mis hojas» (lo que ve cada quien en Contar) dice si ya terminé y si mi
--      pareja ya terminó. Solo eso: NUNCA lo que contó. Sigue siendo a ciegas.
--   3. El AVANCE de cada hoja, para quien ve la pantalla del inventario fiscal:
--      cuántos renglones lleva cada equipo y si ya terminó. Solo cifras de
--      avance, no el contenido.
--   4. El CRUCE de una hoja: solo para quien edita «Inventario fiscal», y
--      solo cuando LAS DOS personas terminaron. Compara, por sitio + material +
--      vencimiento, las cajas totales de cada equipo (solo de las personas que
--      hoy están en la hoja: si cambian a alguien, lo suyo no se mezcla) (estibas × factor +
--      saldo, o las cajas): COINCIDE si son iguales, DIFIERE si no, y SOLO_OL /
--      SOLO_BAVARIA si lo anotó una sola de las dos personas.
--
-- QUIÉN TERMINÓ SE GUARDA APARTE (`inv_fiscal_terminos`), y no en la tabla
-- de las parejas, porque editar el plan repone las parejas y se llevaría por
-- delante lo que ya se terminó.
--
-- Se puede correr dos veces. Necesita 2026-10-fiscal-contar.sql.
-- =====================================================================
begin;

create table if not exists public.inv_fiscal_terminos (
  hoja_id    uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  user_id    uuid not null references public.perfiles(id) on delete cascade,
  termino_en timestamptz not null default now(),
  primary key (hoja_id, user_id)
);
/* Nadie la lee por su cuenta: todo pasa por las funciones de abajo. */
alter table public.inv_fiscal_terminos enable row level security;
revoke all on public.inv_fiscal_terminos from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- UNA HOJA TERMINADA NO SE TOCA: ni se anota ni se quita en ella.
-- (Borrar el plan o la hoja entera sí: ahí ya no hay hoja que proteger.)
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_conteo_terminado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_hoja uuid; v_user uuid;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.inv_fiscal_hojas where id = old.hoja_id) then return old; end if;
    v_hoja := old.hoja_id; v_user := old.contado_por;
  else
    v_hoja := new.hoja_id; v_user := new.contado_por;
  end if;
  if exists (select 1 from public.inv_fiscal_terminos where hoja_id = v_hoja and user_id = v_user) then
    raise exception 'Ya terminaste tu hoja. Reábrela si necesitas cambiar algo.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists inv_fiscal_conteos_terminado on public.inv_fiscal_conteos;
create trigger inv_fiscal_conteos_terminado before insert or delete on public.inv_fiscal_conteos
  for each row execute function public.inv_fiscal_conteo_terminado();

-- ---------------------------------------------------------------------
-- TERMINAR MI HOJA / REABRIRLA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_terminar(uuid, boolean);
create function public.inv_fiscal_terminar(p_hoja uuid, p_terminado boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_estado text; v_pub timestamptz; v_fecha date;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, f.estado, f.publicado_en, f.fecha
    into v_equipo, v_estado, v_pub, v_fecha
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if coalesce(p_terminado, true) then
    if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo) then
      raise exception 'Anota al menos un renglón antes de terminar tu hoja.';
    end if;
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (p_hoja, v_yo)
      on conflict (hoja_id, user_id) do nothing;
  else
    delete from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo;
  end if;
end $$;
revoke all on function public.inv_fiscal_terminar(uuid, boolean) from public, anon;
grant execute on function public.inv_fiscal_terminar(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- MIS HOJAS (lo que ve cada persona en Contar), ahora con «terminé» y «mi pareja terminó»
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text,
  hoja_id uuid, puede_contar boolean, mis_renglones bigint,
  termine boolean, pareja_termino boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.nombre, f.fecha, h.numero, m.equipo,
         p.nombre, o.equipo,
         h.id,
         (f.fecha <= (now() at time zone 'America/Bogota')::date),
         (select count(*) from public.inv_fiscal_conteos c where c.hoja_id = h.id and c.contado_por = auth.uid()),
         exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = auth.uid()),
         exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = o.user_id)
    from public.inv_fiscal_miembros m
    join public.inv_fiscales f on f.id = m.fiscal_id
    join public.inv_fiscal_hojas h on h.id = m.hoja_id
    left join public.inv_fiscal_miembros o on o.hoja_id = m.hoja_id and o.user_id <> m.user_id
    left join public.perfiles p on p.id = o.user_id
   where m.user_id = auth.uid()
     and f.publicado_en is not null
     and f.estado = 'abierto'
     and f.fecha >= (now() at time zone 'America/Bogota')::date
   order by f.fecha, h.numero
$$;
revoke all on function public.inv_fiscal_mis_hojas() from public, anon;
grant execute on function public.inv_fiscal_mis_hojas() to authenticated;

-- ---------------------------------------------------------------------
-- EL AVANCE DE CADA HOJA (para la pantalla del inventario fiscal): solo cifras.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_avance();
create function public.inv_fiscal_avance()
returns table (
  fiscal_id uuid, hoja_id uuid, numero integer,
  ol_renglones bigint, ol_termino timestamptz,
  bavaria_renglones bigint, bavaria_termino timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver el avance del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
  select h.fiscal_id, h.id, h.numero,
         (select count(*) from public.inv_fiscal_conteos c
            join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
           where c.hoja_id = h.id and m.equipo = 'OL'),
         (select t.termino_en from public.inv_fiscal_miembros m
            join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
           where m.hoja_id = h.id and m.equipo = 'OL'),
         (select count(*) from public.inv_fiscal_conteos c
            join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
           where c.hoja_id = h.id and m.equipo = 'BAVARIA'),
         (select t.termino_en from public.inv_fiscal_miembros m
            join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
           where m.hoja_id = h.id and m.equipo = 'BAVARIA')
    from public.inv_fiscal_hojas h
   order by h.fiscal_id, h.numero;
end $$;
revoke all on function public.inv_fiscal_avance() from public, anon;
grant execute on function public.inv_fiscal_avance() to authenticated;

-- ---------------------------------------------------------------------
-- EL CRUCE DE UNA HOJA: lo de un equipo contra lo del otro.
-- Una fila por sitio + material + vencimiento. Las que no coinciden, primero.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_cruce(uuid);
create function public.inv_fiscal_cruce(p_hoja uuid)
returns table (
  ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  venc_dia smallint, venc_mes smallint, venc_anio smallint,
  cajas_ol bigint, cajas_bavaria bigint, diferencia bigint, estado text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Cruzar el inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscal_hojas where id = p_hoja) then
    raise exception 'Esa hoja no existe.';
  end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 2 then
    raise exception 'El cruce se hace cuando las dos personas de la hoja terminan de contar.';
  end if;

  return query
  with t as (
    select c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, m.equipo,
           sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, m.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA'),
  j as (
    select coalesce(o.ubicacion_id, b.ubicacion_id) as ubi, coalesce(o.producto_id, b.producto_id) as prod,
           coalesce(o.venc_dia, b.venc_dia) as vd, coalesce(o.venc_mes, b.venc_mes) as vm, coalesce(o.venc_anio, b.venc_anio) as va,
           o.cajas as co, b.cajas as cb
      from o full join b
        on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
       and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)
       and coalesce(o.venc_mes, 0) = coalesce(b.venc_mes, 0)
       and coalesce(o.venc_anio, 0) = coalesce(b.venc_anio, 0)
  )
  select j.ubi, u.clave, j.prod, pr.sku, pr.nombre, j.vd, j.vm, j.va, j.co, j.cb,
         (coalesce(j.co, 0) - coalesce(j.cb, 0))::bigint,
         case when j.co is null then 'SOLO_BAVARIA'
              when j.cb is null then 'SOLO_OL'
              when j.co = j.cb then 'COINCIDE'
              else 'DIFIERE' end
    from j
    join public.ubicaciones u on u.id = j.ubi
    join public.productos pr on pr.id = j.prod
   order by (case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end), u.clave, pr.sku, j.va, j.vm, j.vd;
end $$;
revoke all on function public.inv_fiscal_cruce(uuid) from public, anon;
grant execute on function public.inv_fiscal_cruce(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_terminar(uuid,boolean)') is null
     or to_regprocedure('public.inv_fiscal_avance()') is null
     or to_regprocedure('public.inv_fiscal_cruce(uuid)') is null then
    raise exception 'No quedaron las funciones de terminar y cruzar el inventario fiscal.';
  end if;
  raise notice 'Listo: cada persona puede terminar su hoja y quien arma el plan puede cruzar la pareja.';
end $$;

commit;
