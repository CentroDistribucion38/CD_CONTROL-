-- =====================================================================
-- INVENTARIO FISCAL · FAMILIAS POR HOJA
--
-- «Cuando estoy creando las parejas del fiscal quiero poder asignarles las
--  familias: a una pareja le toca Lata y Barril. Y en la hoja del conteo, un
--  ícono pequeño que abra un toolbox con esas familias y sus códigos: SKU,
--  descripción y factor de estibado.»
--
-- LAS FAMILIAS NO SE CARGAN DE NUEVO. Ya están en el maestro (productos.familia)
-- y coinciden con la hoja «Codigos» de la Plantilla de Frescura (6-nov-2026):
--     Lata · Tw · Ret · Pet · Barril      (462 materiales, todos iguales)
-- Esto solo agrega lo que falta para guardar cuáles le tocan a cada hoja.
--
-- QUÉ HACE
--   1. inv_fiscal_hojas.familias      las familias de la hoja (0, 1 o 2).
--   2. productos.familia              corrige el único «TW» (código 23224) a «Tw».
--   3. inv_fiscal_familias_validas    revisa las familias que llegan: que existan en
--                                     el maestro (sin importar mayúsculas), sin repetir, máximo 2.
--   4. inv_fiscal_guardar             la misma de siempre (calle incluida) + las familias.
--   5. inv_fiscal_hoja_familias       las familias de UNA hoja, para quien la cuenta
--                                     (la pareja de la hoja o quien ve el plan fiscal).
--
-- Las familias son de CONSULTA: no limitan lo que se puede anotar.
-- Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists familias text[] not null default '{}';

update public.productos set familia = 'Tw' where familia = 'TW';

-- ---------------------------------------------------------------------
-- Las familias de una hoja, ya revisadas y con la escritura del maestro («lata» → «Lata»).
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_familias_validas(p_json jsonb, p_hoja integer)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_fams  text[] := '{}';
  v_x     text;
  v_canon text;
begin
  if p_json is null or jsonb_typeof(p_json) <> 'array' then
    return v_fams;
  end if;
  for v_x in select btrim(e) from jsonb_array_elements_text(p_json) as e loop
    if v_x = '' then continue; end if;
    select familia into v_canon from public.productos where lower(familia) = lower(v_x) limit 1;
    if v_canon is null then
      raise exception 'La familia «%» de la hoja % no existe en el maestro', v_x, p_hoja;
    end if;
    if not (v_canon = any (v_fams)) then v_fams := v_fams || v_canon; end if;
  end loop;
  if coalesce(array_length(v_fams, 1), 0) > 2 then
    raise exception 'La hoja % puede llevar como máximo 2 familias', p_hoja;
  end if;
  return v_fams;
end $$;

-- ---------------------------------------------------------------------
-- GUARDAR UN INVENTARIO FISCAL COMPLETO (igual que antes, con calle, + familias)
--   p_hojas: [{"numero":1,"ol":"<uuid|null>","bavaria":"<uuid|null>","calle":"A","familias":["Lata","Barril"]}, …]
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
      if v_p = any (v_gente) then
        raise exception 'Una persona solo puede estar en una hoja del mismo inventario (hoja %)', v_num;
      end if;
      if not exists (select 1 from public.perfiles where id = v_p and activo) then
        raise exception 'Una de las personas de la hoja % no existe o está desactivada', v_num;
      end if;
      v_gente := v_gente || v_p;
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

-- ---------------------------------------------------------------------
-- LAS FAMILIAS DE UNA HOJA, para el toolbox de Contar.
-- La ven las dos personas de la hoja y quien tiene permiso de ver el plan fiscal;
-- para cualquier otra devuelve null (la pantalla no muestra nada).
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_hoja_familias(p_hoja uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select h.familias
    from public.inv_fiscal_hojas h
   where h.id = p_hoja
     and (
       public.puede_ver('/inventario/fiscal')
       or exists (select 1 from public.inv_fiscal_miembros m where m.hoja_id = h.id and m.user_id = auth.uid())
     );
$$;
revoke all on function public.inv_fiscal_hoja_familias(uuid) from public, anon;
grant execute on function public.inv_fiscal_hoja_familias(uuid) to authenticated;

commit;
