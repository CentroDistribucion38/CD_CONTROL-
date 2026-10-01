-- =====================================================================
-- INVENTARIO FISCAL · CONTAR LA HOJA
--
-- «Debería aparecer la opción de fiscal y de una un toolbox para contar.»
--
-- Quien tiene una hoja asignada (y el plan ya se mostró en Contar) anota
-- aquí lo que ve en ESA hoja: dónde, qué, vencimiento y cuánto. Es un conteo
-- APARTE del FEFO diario: no entra en La base ni en el Tablero.
--
-- A CIEGAS. Cada persona de la pareja cuenta la misma hoja por su lado y
-- solo ve LO SUYO: la tabla no se puede leer directamente (solo quien
-- administra) y las funciones devuelven únicamente los renglones de quien
-- pregunta. El cruce entre los dos es un paso aparte.
--
-- QUIÉN Y CUÁNDO. Solo una persona asignada a esa hoja, con el plan mostrado en
-- Contar, abierto, y desde el día del inventario (día de Colombia).
--
-- LO QUE SE CUENTA. Estibas (con su saldo de cajas sueltas) o cajas, y
-- el vencimiento si lo hay, como en el conteo diario. El mismo material en el
-- mismo sitio con el mismo vencimiento no se anota dos veces: se quita y se
-- vuelve a anotar.
--
-- Además: una hoja que ya tiene conteos no se puede quitar de un plan al
-- editarlo (se perderían); y «mis hojas» ahora trae el id de la hoja, si ya
-- se puede contar y cuántos renglones lleva la persona.
--
-- Se puede correr dos veces. Necesita 2026-10-fiscal-publicar.sql.
-- =====================================================================
begin;

create table if not exists public.inv_fiscal_conteos (
  id           uuid primary key default gen_random_uuid(),
  fiscal_id    uuid not null references public.inv_fiscales(id) on delete cascade,
  hoja_id      uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  equipo       text not null check (equipo in ('OL', 'BAVARIA')),
  contado_por  uuid not null references public.perfiles(id) on delete restrict,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete restrict,
  producto_id  uuid not null references public.productos(id) on delete restrict,
  estibas      integer check (estibas >= 0),
  saldo        integer check (saldo >= 0),
  cajas        integer check (cajas >= 0),
  venc_dia     smallint,
  venc_mes     smallint,
  venc_anio    smallint,
  nota         text,
  contado_en   timestamptz not null default now(),
  constraint inv_fiscal_conteos_algo check (num_nonnulls(estibas, saldo, cajas) >= 1),
  constraint inv_fiscal_conteos_cajas_sola check (cajas is null or (estibas is null and saldo is null)),
  constraint inv_fiscal_conteos_fecha_completa check (
    (venc_dia is null and venc_mes is null and venc_anio is null)
    or (venc_dia between 1 and 31 and venc_mes between 1 and 12 and venc_anio between 0 and 99))
);
create unique index if not exists inv_fiscal_conteos_unico on public.inv_fiscal_conteos
  (hoja_id, contado_por, ubicacion_id, producto_id, venc_dia, venc_mes, venc_anio) nulls not distinct;
create index if not exists inv_fiscal_conteos_hoja_idx on public.inv_fiscal_conteos (hoja_id);

/* Nadie lee esta tabla por su cuenta: solo quien administra. Todos los demás, por las funciones de abajo. */
alter table public.inv_fiscal_conteos enable row level security;
drop policy if exists inv_fiscal_conteos_admin on public.inv_fiscal_conteos;
create policy inv_fiscal_conteos_admin on public.inv_fiscal_conteos
  for select to authenticated using (public.manda());
revoke all on public.inv_fiscal_conteos from public, anon, authenticated;
grant select on public.inv_fiscal_conteos to authenticated;

-- ---------------------------------------------------------------------
-- UNA HOJA CON CONTEOS NO SE QUITA DE UN PLAN (se perderían en cascada).
-- Borrar el plan entero sí: ahí el plan ya no existe.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_hoja_con_conteos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.inv_fiscales where id = old.fiscal_id)
     and exists (select 1 from public.inv_fiscal_conteos where hoja_id = old.id) then
    raise exception 'La hoja % ya tiene conteos: no se puede quitar. Para borrar todo elimina el inventario fiscal.', old.numero;
  end if;
  return old;
end $$;
drop trigger if exists inv_fiscal_hojas_con_conteos on public.inv_fiscal_hojas;
create trigger inv_fiscal_hojas_con_conteos before delete on public.inv_fiscal_hojas
  for each row execute function public.inv_fiscal_hoja_con_conteos();

-- ---------------------------------------------------------------------
-- LO QUE VE CADA PERSONA EN CONTAR: SUS HOJAS (ahora con el id de la hoja)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text,
  hoja_id uuid, puede_contar boolean, mis_renglones bigint
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
         (select count(*) from public.inv_fiscal_conteos c where c.hoja_id = h.id and c.contado_por = auth.uid())
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
-- ANOTAR UN RENGLÓN EN MI HOJA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text);
create function public.inv_fiscal_contar_agregar(
  p_hoja uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz; v_fecha date;
  v_id uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;

  select m.equipo, m.fiscal_id, f.estado, f.publicado_en, f.fecha
    into v_equipo, v_fiscal, v_estado, v_pub, v_fecha
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota)
    values
      (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, p_producto, p_estibas, p_saldo, p_cajas, p_dia, p_mes, p_anio,
       nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ya anotaste ese material en ese sitio con ese vencimiento. Quita el renglón anterior y vuelve a anotarlo.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text) to authenticated;

-- ---------------------------------------------------------------------
-- QUITAR UN RENGLÓN MÍO (mientras el inventario siga abierto)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_contar_quitar(uuid);
create function public.inv_fiscal_contar_quitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_conteos c join public.inv_fiscales f on f.id = c.fiscal_id
   where c.id = p_id and c.contado_por = auth.uid();
  if v_estado is null then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  delete from public.inv_fiscal_conteos where id = p_id and contado_por = auth.uid();
end $$;
revoke all on function public.inv_fiscal_contar_quitar(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_quitar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- MIS RENGLONES DE UNA HOJA (solo los míos: la pareja cuenta a ciegas)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_contar_agregar(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text)') is null
     or to_regprocedure('public.inv_fiscal_contar_quitar(uuid)') is null
     or to_regprocedure('public.inv_fiscal_contar_mios(uuid)') is null then
    raise exception 'No quedaron las funciones de contar el inventario fiscal.';
  end if;
  raise notice 'Listo: cada persona puede contar su hoja del inventario fiscal.';
end $$;

commit;
