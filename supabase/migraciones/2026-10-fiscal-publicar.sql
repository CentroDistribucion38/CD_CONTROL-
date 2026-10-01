-- =====================================================================
-- INVENTARIO FISCAL · DEL PLAN A «CONTAR»
--
-- «Yo armo el plan, pero que cuando le dé a un botón se visualice en el
--  módulo de Contar y a cada quien le aparezca su hoja asignada, desde su
--  rol.»  Y: «una vez planeado, que el super admin pueda editar, borrar,
--  eliminar el plan.»
--
-- QUÉ HACE
--   1. `inv_fiscales.publicado_en`: el botón «Mostrar en Contar». Mientras
--      no se oprima, el plan es un borrador de quien lo arma y nadie
--      más lo ve. Se puede quitar de Contar cuando se quiera.
--   2. `inv_fiscal_publicar(id, publicar)`: lo pone o lo quita. Exige que
--      quien lo haga pueda editar «Inventario fiscal», y que el plan esté
--      abierto y tenga al menos una persona (publicar un plan vacío no le
--      aparece a nadie y parece que no funcionó).
--   3. `inv_fiscal_mis_hojas()`: lo que ve CADA PERSONA en Contar: sus
--      hojas, de los planes publicados y abiertos que son de hoy o están por
--      venir, con quién es su pareja. Va por una función y no por la tabla
--      porque quien cuenta no tiene —ni debe tener— permiso sobre la pantalla
--      de armar el inventario: solo ve lo suyo.
--   4. Editar: un inventario ya CERRADO solo lo edita quien administra.
--      Eliminar ya era solo de quien administra (no cambia).
--
-- El día es el de Colombia (UTC-5): a las 8 p. m. del jueves «hoy» sigue
-- siendo jueves, no viernes.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscales
  add column if not exists publicado_en  timestamptz,
  add column if not exists publicado_por uuid references public.perfiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- GUARDAR: igual que antes, salvo que quien administra puede editar uno cerrado.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb);
create function public.inv_fiscal_guardar(
  p_id     uuid,
  p_bodega uuid,
  p_nombre text,
  p_fecha  date,
  p_hojas  jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid := p_id;
  v_estado  text;
  v_h       jsonb;
  v_num     integer;
  v_nums    integer[] := '{}';
  v_gente   uuid[] := '{}';
  v_hoja    uuid;
  v_p       uuid;
  v_ol      uuid;
  v_ba      uuid;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Armar el inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'El inventario fiscal necesita un nombre';
  end if;
  if p_fecha is null then
    raise exception 'El inventario fiscal necesita una fecha';
  end if;
  if p_hojas is null or jsonb_typeof(p_hojas) <> 'array' or jsonb_array_length(p_hojas) = 0 then
    raise exception 'El inventario fiscal necesita al menos una hoja';
  end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then
    raise exception 'Esa bodega no existe';
  end if;

  /* Se revisa todo ANTES de escribir: o queda completo o no queda nada. */
  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := nullif(v_h ->> 'numero', '')::integer;
    if v_num is null or v_num < 1 then
      raise exception 'Cada hoja lleva un número desde el 1';
    end if;
    if v_num = any (v_nums) then
      raise exception 'La hoja % está repetida', v_num;
    end if;
    v_nums := v_nums || v_num;
    v_ol := nullif(v_h ->> 'ol', '')::uuid;
    v_ba := nullif(v_h ->> 'bavaria', '')::uuid;
    if v_ol is not null and v_ol = v_ba then
      raise exception 'En la hoja % la misma persona no puede ser del OL y de Bavaria', v_num;
    end if;
    foreach v_p in array array_remove(array[v_ol, v_ba], null) loop
      if v_p = any (v_gente) then
        raise exception 'Una persona solo puede estar en una hoja del mismo inventario (hoja %)', v_num;
      end if;
      if not exists (select 1 from public.perfiles where id = v_p and activo) then
        raise exception 'Una de las personas de la hoja % no existe o está desactivada', v_num;
      end if;
      v_gente := v_gente || v_p;
    end loop;
  end loop;

  if v_id is null then
    insert into public.inv_fiscales (bodega_id, nombre, fecha)
         values (p_bodega, btrim(p_nombre), p_fecha)
      returning id into v_id;
  else
    select estado into v_estado from public.inv_fiscales where id = v_id for update;
    if v_estado is null then raise exception 'Ese inventario fiscal ya no existe'; end if;
    /* UN CERRADO SOLO LO TOCA QUIEN ADMINISTRA: «que el super admin pueda
       editar, borrar y eliminar el plan». El resto lo ve cerrado y ya. */
    if v_estado <> 'abierto' and not public.manda() then raise exception 'Ese inventario fiscal ya está cerrado'; end if;
    update public.inv_fiscales set nombre = btrim(p_nombre), fecha = p_fecha, bodega_id = p_bodega
     where id = v_id;
    /* Las hojas que ya no están. Las parejas de las que quedan se reponen abajo. */
    delete from public.inv_fiscal_hojas where fiscal_id = v_id and numero <> all (v_nums);
    delete from public.inv_fiscal_miembros where fiscal_id = v_id;
  end if;

  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := (v_h ->> 'numero')::integer;
    insert into public.inv_fiscal_hojas (fiscal_id, numero) values (v_id, v_num)
      on conflict (fiscal_id, numero) do update set numero = excluded.numero
      returning id into v_hoja;
    v_ol := nullif(v_h ->> 'ol', '')::uuid;
    v_ba := nullif(v_h ->> 'bavaria', '')::uuid;
    if v_ol is not null then
      insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values (v_hoja, v_id, 'OL', v_ol);
    end if;
    if v_ba is not null then
      insert into public.inv_fiscal_miembros (hoja_id, fiscal_id, equipo, user_id) values (v_hoja, v_id, 'BAVARIA', v_ba);
    end if;
  end loop;

  return v_id;
end $$;

revoke all on function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) from public, anon;
grant execute on function public.inv_fiscal_guardar(uuid, uuid, text, date, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- MOSTRAR EN CONTAR / QUITAR DE CONTAR
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_publicar(uuid, boolean);
create function public.inv_fiscal_publicar(p_id uuid, p_publicar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Mostrar el inventario fiscal en Contar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select estado into v_estado from public.inv_fiscales where id = p_id for update;
  if v_estado is null then raise exception 'Ese inventario fiscal ya no existe'; end if;
  if coalesce(p_publicar, true) then
    if v_estado <> 'abierto' then raise exception 'Ese inventario fiscal ya está cerrado: no se puede mostrar en Contar'; end if;
    if not exists (select 1 from public.inv_fiscal_miembros where fiscal_id = p_id) then
      raise exception 'Ese inventario no tiene a nadie asignado todavía: no le aparecería a ninguna persona en Contar';
    end if;
    update public.inv_fiscales set publicado_en = now(), publicado_por = auth.uid() where id = p_id;
  else
    update public.inv_fiscales set publicado_en = null, publicado_por = null where id = p_id;
  end if;
end $$;
revoke all on function public.inv_fiscal_publicar(uuid, boolean) from public, anon;
grant execute on function public.inv_fiscal_publicar(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE VE CADA PERSONA EN CONTAR: SUS HOJAS
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.nombre, f.fecha, h.numero, m.equipo,
         p.nombre, o.equipo
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

do $$
begin
  if to_regprocedure('public.inv_fiscal_publicar(uuid,boolean)') is null
     or to_regprocedure('public.inv_fiscal_mis_hojas()') is null then
    raise exception 'No quedaron las funciones de mostrar el inventario fiscal en Contar.';
  end if;
  raise notice 'Listo: el plan del inventario fiscal se puede mostrar en Contar.';
end $$;

commit;
