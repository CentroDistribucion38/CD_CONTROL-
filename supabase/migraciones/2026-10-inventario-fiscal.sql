-- =====================================================================
-- INVENTARIO · INVENTARIO FISCAL (CONTEO POR PAREJAS)
--
-- «Un inventario fiscal: 16 personas bajan a contar, 8 del operador logístico
--  y 8 de Bavaria. A una persona del OL y a una de Bavaria se les asigna el
--  mismo inventario, y por pareja se hace el análisis para ver si coinciden.
--  Por ahora sin zonas ni familias: se arman las parejas y se enumeran las
--  hojas de conteo.»
--
-- QUÉ SE GUARDA
--   inv_fiscales          el inventario fiscal: nombre, fecha, bodega y estado.
--   inv_fiscal_hojas      las hojas de conteo, NUMERADAS (Hoja 1, Hoja 2…): una
--                         por pareja. `familia` queda lista para cuando se
--                         asigne por familia; hoy no se usa.
--   inv_fiscal_miembros   las dos personas de cada hoja: una del OL y una de
--                         Bavaria. Una persona va en UNA sola hoja del mismo
--                         inventario, y en una sola de las dos casillas.
--
-- UN INVENTARIO FISCAL ES UN DOCUMENTO: se guarda completo o no se guarda (una
-- llamada, una transacción). Se puede volver a guardar mientras esté abierto,
-- y solo lo borra quien administra la plataforma. Se arma con el permiso de
-- editar «/inventario/fiscal» (Roles).
--
-- Una hoja puede quedar a medias (sin la persona del OL o sin la de Bavaria):
-- la pantalla lo avisa, pero no se impide guardar, porque las parejas se
-- arman a lo largo del día y no todas de una vez.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.inv_fiscales (
  id         uuid primary key default gen_random_uuid(),
  bodega_id  uuid not null references public.bodegas(id) on delete restrict,
  nombre     text not null check (length(btrim(nombre)) > 0),
  fecha      date not null default current_date,
  estado     text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  creado_por uuid default auth.uid() references public.perfiles(id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index if not exists inv_fiscales_fecha_idx on public.inv_fiscales (bodega_id, fecha desc);

create table if not exists public.inv_fiscal_hojas (
  id        uuid primary key default gen_random_uuid(),
  fiscal_id uuid not null references public.inv_fiscales(id) on delete cascade,
  numero    integer not null check (numero > 0),
  familia   text,
  unique (fiscal_id, numero)
);
create index if not exists inv_fiscal_hojas_fiscal_idx on public.inv_fiscal_hojas (fiscal_id);

create table if not exists public.inv_fiscal_miembros (
  id        uuid primary key default gen_random_uuid(),
  hoja_id   uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  /* Se repite aquí para poder decir «una persona, una hoja» con un índice. */
  fiscal_id uuid not null references public.inv_fiscales(id) on delete cascade,
  equipo    text not null check (equipo in ('OL', 'BAVARIA')),
  user_id   uuid not null references public.perfiles(id) on delete restrict,
  unique (hoja_id, equipo),
  unique (fiscal_id, user_id)
);
create index if not exists inv_fiscal_miembros_user_idx on public.inv_fiscal_miembros (user_id);

-- ---------------------------------------------------------------------
-- QUIÉN LEE. Escribir solo se puede por inv_fiscal_guardar (security definer).
-- ---------------------------------------------------------------------
alter table public.inv_fiscales        enable row level security;
alter table public.inv_fiscal_hojas    enable row level security;
alter table public.inv_fiscal_miembros enable row level security;

drop policy if exists inv_fiscales_ver on public.inv_fiscales;
create policy inv_fiscales_ver on public.inv_fiscales
  for select to authenticated using (public.puede_ver('/inventario/fiscal'));
drop policy if exists inv_fiscal_hojas_ver on public.inv_fiscal_hojas;
create policy inv_fiscal_hojas_ver on public.inv_fiscal_hojas
  for select to authenticated using (public.puede_ver('/inventario/fiscal'));
drop policy if exists inv_fiscal_miembros_ver on public.inv_fiscal_miembros;
create policy inv_fiscal_miembros_ver on public.inv_fiscal_miembros
  for select to authenticated using (public.puede_ver('/inventario/fiscal'));

grant select on public.inv_fiscales, public.inv_fiscal_hojas, public.inv_fiscal_miembros to authenticated;

-- ---------------------------------------------------------------------
-- GUARDAR UN INVENTARIO FISCAL COMPLETO
--   p_id     null = uno nuevo; con id = se reemplazan sus hojas y parejas.
--   p_hojas: [{"numero":1,"ol":"<uuid|null>","bavaria":"<uuid|null>"}, …]
--   Devuelve el id del inventario fiscal.
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
    if v_estado <> 'abierto' then raise exception 'Ese inventario fiscal ya está cerrado'; end if;
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
-- ELIMINAR: solo quien administra la plataforma.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_eliminar(uuid);
create function public.inv_fiscal_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede eliminar un inventario fiscal.';
  end if;
  if not exists (select 1 from public.inv_fiscales where id = p_id) then
    raise exception 'Ese inventario fiscal ya no existe.';
  end if;
  delete from public.inv_fiscales where id = p_id;
end $$;

revoke all on function public.inv_fiscal_eliminar(uuid) from public, anon;
grant execute on function public.inv_fiscal_eliminar(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_guardar(uuid,uuid,text,date,jsonb)') is null then
    raise exception 'No quedó la función de guardar el inventario fiscal.';
  end if;
  raise notice 'Listo: el inventario fiscal quedó puesto.';
end $$;

commit;
