-- =====================================================================
-- INVENTARIO FISCAL · VALIDAR Y APROBAR UBICACIONES (paso 2 del fiscal)
--
-- «El fiscal manda a cada usuario a validar esas ubicaciones, a ambos; si está
--  bien le dan enviar y si no se sobreescribe con el envío; y el fiscal aprueba.»
--
-- CÓMO FUNCIONA
--   1. Las dos personas de una hoja terminan (ya existía) y el fiscal ve el cruce.
--   2. El fiscal escoge las UBICACIONES con diferencia y las MANDA A VALIDAR
--      (`inv_fiscal_validar`). Cada vez que lo hace, la ubicación entra en una
--      RONDA nueva: 1 la primera vez, 2 si hay reconteo, etc.
--   3. Cada persona ve SOLO «revisa esta ubicación» (`inv_fiscal_mis_revisiones`):
--      nunca el número de su pareja, el conteo sigue a ciegas.
--   4. Cada persona responde por esa ubicación (`inv_fiscal_revision_enviar`):
--        · sin renglones nuevos = «está bien, lo que conté es correcto»;
--        · con renglones = REEMPLAZA lo que había contado en esa ubicación.
--      Todo en un solo paso: o queda lo nuevo o no cambia nada.
--   5. Cuando las dos enviaron, el fiscal ve el cruce otra vez y APRUEBA la
--      ubicación (`inv_fiscal_aprobar`) o la manda a otra ronda (paso 2).
--      El fiscal aprueba siempre con un clic, también las que coincidieron desde
--      el principio. Si una persona aún no envió, solo se aprueba forzándola.
--
-- LO QUE NO CAMBIA
--   · Una hoja terminada sigue sin poder tocarse… salvo SOLO las ubicaciones que
--     el fiscal mandó a validar, y solo a quien todavía no respondió esa ronda.
--   · El cruce, el avance y el conteo a ciegas siguen igual.
--
-- Se puede correr dos veces. Necesita 2026-10-fiscal-cruce.sql.
-- Sin cambios visibles en pantalla hasta que se suba el código del paso 2.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- LAS REVISIONES: una fila por hoja + ubicación (su estado de hoy y su ronda)
-- LOS ENVÍOS: quién ya respondió en esa ronda
-- ---------------------------------------------------------------------
create table if not exists public.inv_fiscal_revisiones (
  hoja_id      uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete restrict,
  estado       text not null check (estado in ('A_VALIDAR', 'APROBADA')),
  ronda        integer not null default 0 check (ronda >= 0),
  nota         text,
  pedido_por   uuid references public.perfiles(id) on delete set null,
  pedido_en    timestamptz,
  aprobado_por uuid references public.perfiles(id) on delete set null,
  aprobado_en  timestamptz,
  primary key (hoja_id, ubicacion_id)
);
alter table public.inv_fiscal_revisiones enable row level security;
revoke all on public.inv_fiscal_revisiones from public, anon, authenticated;

create table if not exists public.inv_fiscal_revision_envios (
  hoja_id      uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete restrict,
  user_id      uuid not null references public.perfiles(id) on delete cascade,
  ronda        integer not null check (ronda >= 1),
  enviado_en   timestamptz not null default now(),
  primary key (hoja_id, ubicacion_id, user_id)
);
alter table public.inv_fiscal_revision_envios enable row level security;
revoke all on public.inv_fiscal_revision_envios from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- UNA HOJA TERMINADA NO SE TOCA… salvo una ubicación mandada a validar,
-- mientras esta persona no haya respondido la ronda en curso.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_conteo_terminado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_hoja uuid; v_user uuid; v_ubi uuid;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.inv_fiscal_hojas where id = old.hoja_id) then return old; end if;
    v_hoja := old.hoja_id; v_user := old.contado_por; v_ubi := old.ubicacion_id;
  else
    v_hoja := new.hoja_id; v_user := new.contado_por; v_ubi := new.ubicacion_id;
  end if;
  if exists (select 1 from public.inv_fiscal_terminos where hoja_id = v_hoja and user_id = v_user) then
    if not exists (
      select 1 from public.inv_fiscal_revisiones r
       where r.hoja_id = v_hoja and r.ubicacion_id = v_ubi and r.estado = 'A_VALIDAR'
         and not exists (select 1 from public.inv_fiscal_revision_envios e
                          where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id
                            and e.user_id = v_user and e.ronda = r.ronda)
    ) then
      raise exception 'Ya terminaste tu hoja. Solo se pueden cambiar las ubicaciones que el fiscal te mandó a validar.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists inv_fiscal_conteos_terminado on public.inv_fiscal_conteos;
create trigger inv_fiscal_conteos_terminado before insert or delete on public.inv_fiscal_conteos
  for each row execute function public.inv_fiscal_conteo_terminado();

-- ---------------------------------------------------------------------
-- EL FISCAL MANDA A VALIDAR (o a reconteo) UNAS UBICACIONES DE UNA HOJA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_validar(uuid, uuid[], text);
create function public.inv_fiscal_validar(p_hoja uuid, p_ubicaciones uuid[], p_nota text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_ubi uuid; v_n integer := 0; v_estado text; v_lista uuid[];
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Mandar a validar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Escoge al menos una ubicación.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 2 then
    raise exception 'Se manda a validar cuando las dos personas de la hoja terminaron.';
  end if;

  v_lista := (select array_agg(distinct u) from unnest(p_ubicaciones) u);
  foreach v_ubi in array v_lista loop
    if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and ubicacion_id = v_ubi) then
      raise exception 'Nadie contó en una de esas ubicaciones: no hay nada que validar.';
    end if;
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, nota, pedido_por, pedido_en)
    values (p_hoja, v_ubi, 'A_VALIDAR', 1, nullif(btrim(coalesce(p_nota, '')), ''), v_yo, now())
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'A_VALIDAR', ronda = public.inv_fiscal_revisiones.ronda + 1,
          nota = nullif(btrim(coalesce(p_nota, '')), ''), pedido_por = v_yo, pedido_en = now(),
          aprobado_por = null, aprobado_en = null;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_validar(uuid, uuid[], text) from public, anon;
grant execute on function public.inv_fiscal_validar(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE VE CADA PERSONA: LAS UBICACIONES QUE LE MANDARON A REVISAR (sin números de la pareja)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_revisiones();
create function public.inv_fiscal_mis_revisiones()
returns table (
  fiscal_id uuid, hoja_id uuid, hoja integer, ubicacion_id uuid, ubicacion text,
  ronda integer, nota text, pedido_en timestamptz, ya_envie boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, h.id, h.numero, r.ubicacion_id, u.clave, r.ronda, r.nota, r.pedido_en,
         exists (select 1 from public.inv_fiscal_revision_envios e
                  where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id
                    and e.user_id = auth.uid() and e.ronda = r.ronda)
    from public.inv_fiscal_revisiones r
    join public.inv_fiscal_hojas h on h.id = r.hoja_id
    join public.inv_fiscales f on f.id = h.fiscal_id
    join public.inv_fiscal_miembros m on m.hoja_id = h.id and m.user_id = auth.uid()
    join public.ubicaciones u on u.id = r.ubicacion_id
   where r.estado = 'A_VALIDAR'
     and f.publicado_en is not null
     and f.estado = 'abierto'
   order by h.numero, u.clave
$$;
revoke all on function public.inv_fiscal_mis_revisiones() from public, anon;
grant execute on function public.inv_fiscal_mis_revisiones() to authenticated;

-- ---------------------------------------------------------------------
-- RESPONDER UNA UBICACIÓN: «está bien» (sin renglones) o REEMPLAZAR lo contado allí.
-- p_renglones: [{producto_id, estibas, saldo, cajas, dia, mes, anio, nota}, …]
--   · null  → «está bien»: lo contado se queda igual y solo se marca como enviado.
--   · lista → borra lo que esta persona contó en esa ubicación y pone estos renglones
--             (una lista vacía = «aquí no hay nada»). Todo o nada.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_revision_enviar(uuid, uuid, jsonb);
create function public.inv_fiscal_revision_enviar(p_hoja uuid, p_ubicacion uuid, p_renglones jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz;
  v_ronda integer; v_rev text;
  x jsonb; v_est integer; v_sal integer; v_caj integer; v_d smallint; v_m smallint; v_a smallint; v_prod uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, m.fiscal_id, f.estado, f.publicado_en
    into v_equipo, v_fiscal, v_estado, v_pub
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  select r.estado, r.ronda into v_rev, v_ronda
    from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = p_ubicacion;
  if v_rev is distinct from 'A_VALIDAR' then raise exception 'El fiscal no te pidió validar esa ubicación.'; end if;
  if exists (select 1 from public.inv_fiscal_revision_envios e
              where e.hoja_id = p_hoja and e.ubicacion_id = p_ubicacion and e.user_id = v_yo and e.ronda = v_ronda) then
    raise exception 'Ya enviaste esa ubicación. Espera a que el fiscal la apruebe o la mande otra vez.';
  end if;

  if p_renglones is not null then
    if jsonb_typeof(p_renglones) <> 'array' then raise exception 'Los renglones deben ir en una lista.'; end if;
    delete from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo and ubicacion_id = p_ubicacion;
    for x in select * from jsonb_array_elements(p_renglones) loop
      v_prod := nullif(x->>'producto_id', '')::uuid;
      v_est := nullif(x->>'estibas', '')::integer; v_sal := nullif(x->>'saldo', '')::integer; v_caj := nullif(x->>'cajas', '')::integer;
      v_d := nullif(x->>'dia', '')::smallint; v_m := nullif(x->>'mes', '')::smallint; v_a := nullif(x->>'anio', '')::smallint;
      if v_prod is null then raise exception 'A un renglón le falta el material.'; end if;
      if num_nonnulls(v_est, v_sal, v_caj) = 0 then raise exception 'A un renglón le falta la cantidad.'; end if;
      if v_caj is not null and (v_est is not null or v_sal is not null) then
        raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
      end if;
      if coalesce(v_est, 0) < 0 or coalesce(v_sal, 0) < 0 or coalesce(v_caj, 0) < 0 then
        raise exception 'Las cantidades no pueden ser negativas.';
      end if;
      if num_nonnulls(v_d, v_m, v_a) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
      if v_d is not null and not (v_d between 1 and 31 and v_m between 1 and 12 and v_a between 0 and 99) then
        raise exception 'La fecha de vencimiento no es válida.';
      end if;
      begin
        insert into public.inv_fiscal_conteos
          (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota)
        values (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, v_prod, v_est, v_sal, v_caj, v_d, v_m, v_a,
                nullif(btrim(coalesce(x->>'nota', '')), ''));
      exception
        when unique_violation then
          raise exception 'Hay dos renglones iguales (mismo material y vencimiento) en esa ubicación.';
        when foreign_key_violation then
          raise exception 'Ese material no existe.';
      end;
    end loop;
  end if;

  insert into public.inv_fiscal_revision_envios (hoja_id, ubicacion_id, user_id, ronda, enviado_en)
  values (p_hoja, p_ubicacion, v_yo, v_ronda, now())
  on conflict (hoja_id, ubicacion_id, user_id) do update set ronda = excluded.ronda, enviado_en = now();
end $$;
revoke all on function public.inv_fiscal_revision_enviar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.inv_fiscal_revision_enviar(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- EL FISCAL APRUEBA UNAS UBICACIONES (siempre con su clic)
-- Si estaban a validar, las dos personas tienen que haber enviado; con p_forzar se aprueba igual.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean);
create function public.inv_fiscal_aprobar(p_hoja uuid, p_ubicaciones uuid[], p_forzar boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_ubi uuid; v_n integer := 0; v_estado text; v_rev text; v_ronda integer; v_envios integer; v_clave text; v_lista uuid[];
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Aprobar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Escoge al menos una ubicación.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if (select count(distinct m.equipo)
        from public.inv_fiscal_miembros m
        join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
       where m.hoja_id = p_hoja) < 2 then
    raise exception 'Se aprueba cuando las dos personas de la hoja terminaron.';
  end if;

  v_lista := (select array_agg(distinct u) from unnest(p_ubicaciones) u);
  foreach v_ubi in array v_lista loop
    select r.estado, r.ronda into v_rev, v_ronda
      from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = v_ubi;
    if v_rev = 'A_VALIDAR' and not coalesce(p_forzar, false) then
      select count(*) into v_envios from public.inv_fiscal_revision_envios e
       where e.hoja_id = p_hoja and e.ubicacion_id = v_ubi and e.ronda = v_ronda;
      if v_envios < 2 then
        select clave into v_clave from public.ubicaciones where id = v_ubi;
        raise exception 'En % todavía falta que las dos personas envíen su validación.', coalesce(v_clave, 'una ubicación');
      end if;
    end if;
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, aprobado_por, aprobado_en)
    values (p_hoja, v_ubi, 'APROBADA', 0, v_yo, now())
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'APROBADA', aprobado_por = v_yo, aprobado_en = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_aprobar(uuid, uuid[], boolean) from public, anon;
grant execute on function public.inv_fiscal_aprobar(uuid, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------
-- EL ESTADO DE LAS UBICACIONES DE UN INVENTARIO (para el panel del fiscal): solo estados, no cantidades.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_revisiones(uuid);
create function public.inv_fiscal_revisiones(p_fiscal uuid)
returns table (
  hoja_id uuid, numero integer, ubicacion_id uuid, ubicacion text, estado text, ronda integer, nota text,
  ol_envio boolean, bavaria_envio boolean, pedido_en timestamptz, aprobado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver las revisiones del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
  select r.hoja_id, h.numero, r.ubicacion_id, u.clave, r.estado, r.ronda, r.nota,
         exists (select 1 from public.inv_fiscal_revision_envios e
                   join public.inv_fiscal_miembros m on m.hoja_id = e.hoja_id and m.user_id = e.user_id
                  where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id and e.ronda = r.ronda and m.equipo = 'OL'),
         exists (select 1 from public.inv_fiscal_revision_envios e
                   join public.inv_fiscal_miembros m on m.hoja_id = e.hoja_id and m.user_id = e.user_id
                  where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id and e.ronda = r.ronda and m.equipo = 'BAVARIA'),
         r.pedido_en, r.aprobado_en
    from public.inv_fiscal_revisiones r
    join public.inv_fiscal_hojas h on h.id = r.hoja_id
    join public.ubicaciones u on u.id = r.ubicacion_id
   where h.fiscal_id = p_fiscal
   order by h.numero, u.clave;
end $$;
revoke all on function public.inv_fiscal_revisiones(uuid) from public, anon;
grant execute on function public.inv_fiscal_revisiones(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_validar(uuid,uuid[],text)') is null
     or to_regprocedure('public.inv_fiscal_mis_revisiones()') is null
     or to_regprocedure('public.inv_fiscal_revision_enviar(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.inv_fiscal_aprobar(uuid,uuid[],boolean)') is null
     or to_regprocedure('public.inv_fiscal_revisiones(uuid)') is null then
    raise exception 'No quedaron las funciones de validar y aprobar el inventario fiscal.';
  end if;
  raise notice 'Listo: el fiscal puede mandar a validar y aprobar ubicaciones; cada persona responde las suyas.';
end $$;

commit;
