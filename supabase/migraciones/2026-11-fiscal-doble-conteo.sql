-- =====================================================================
-- INVENTARIO FISCAL · UNA PERSONA PUEDE CONTAR EN VARIAS HOJAS (DOBLE CONTEO)
--
-- «Que pueda agregar a una persona en doble conteo.»
--
--   · Se quita la regla «una persona, una hoja» de la base: el índice único (inventario, persona)
--     de inv_fiscal_miembros y el chequeo dentro de inv_fiscal_guardar.
--   · Sigue prohibido que la MISMA persona sea el OL y Bavaria de una misma hoja (una pareja son dos).
--   · Contar, terminar, aprobar y el cruce ya van por hoja (hoja + persona): nada más cambia.
--     «Mis hojas» ya devuelve todas las hojas de la persona.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.inv_fiscal_miembros'::regclass and con.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname::text)
              from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k)
           = array['fiscal_id', 'user_id']
  loop
    execute format('alter table public.inv_fiscal_miembros drop constraint %I', c.conname);
  end loop;
  /* Por si fue un índice suelto y no una restricción. */
  for c in
    select i.indexname from pg_indexes i
     where i.schemaname = 'public' and i.tablename = 'inv_fiscal_miembros'
       and i.indexdef ilike '%unique%' and i.indexdef ilike '%(fiscal_id, user_id)%'
  loop
    execute format('drop index if exists public.%I', c.indexname);
  end loop;
end $$;

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
  v_calle   text;
  v_fams    text[];
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
      if not exists (select 1 from public.perfiles where id = v_p and activo) then
        raise exception 'Una de las personas de la hoja % no existe o está desactivada', v_num;
      end if;
    end loop;
    perform public.inv_fiscal_familias_validas(v_h -> 'familias', v_num);
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
    v_calle := nullif(upper(btrim(coalesce(v_h ->> 'calle', ''))), '');
    if v_calle is not null and length(v_calle) > 20 then
      raise exception 'La calle de la hoja % es demasiado larga', v_num;
    end if;
    v_fams := public.inv_fiscal_familias_validas(v_h -> 'familias', v_num);
    insert into public.inv_fiscal_hojas (fiscal_id, numero, calle, familias) values (v_id, v_num, v_calle, v_fams)
      on conflict (fiscal_id, numero) do update set calle = excluded.calle, familias = excluded.familias
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

do $$
begin
  if exists (select 1 from pg_constraint con where con.conrelid = 'public.inv_fiscal_miembros'::regclass and con.contype = 'u'
              and (select array_agg(a.attname::text order by a.attname::text) from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k) = array['fiscal_id', 'user_id']) then
    raise exception 'No pude quitar la regla de una persona por inventario.';
  end if;
  raise notice 'Listo: una persona puede contar en varias hojas del mismo inventario fiscal.';
end $$;

commit;
select 'OK · doble conteo permitido en el plan fiscal' as resultado;
