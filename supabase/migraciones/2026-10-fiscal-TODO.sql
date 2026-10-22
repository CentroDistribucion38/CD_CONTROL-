-- ##################### 2026-10-fiscal-cruce.sql #####################
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

-- ##################### 2026-10-fiscal-calle.sql #####################
-- =====================================================================
-- INVENTARIO FISCAL · LA CALLE DE CADA HOJA
-- Cada hoja se cuenta en una calle (A, B, C…). Las dos personas de la pareja la
-- cuentan en sentido contrario para cruzarse a mitad de camino: el operador
-- logístico de 01 hacia arriba y Bavaria desde el último hacia abajo.
--
-- Es opcional (una hoja puede quedar sin calle) y se puede correr de nuevo:
-- solo agrega la columna y vuelve a crear «inv_fiscal_guardar» con la calle.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists calle text;

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
    v_calle := nullif(upper(btrim(coalesce(v_h ->> 'calle', ''))), '');
    if v_calle is not null and length(v_calle) > 20 then
      raise exception 'La calle de la hoja % es demasiado larga', v_num;
    end if;
    insert into public.inv_fiscal_hojas (fiscal_id, numero, calle) values (v_id, v_num, v_calle)
      on conflict (fiscal_id, numero) do update set calle = excluded.calle
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

commit;

-- ##################### 2026-10-fiscal-validar.sql #####################
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

-- ##################### 2026-10-fiscal-siguiente-calle.sql #####################
-- =====================================================================
-- INVENTARIO FISCAL · SIGUIENTE CALLE
--
-- Cuando el fiscal aprobó todas las diferencias de la calle de una hoja, le da
-- «Pasar a la siguiente calle» a esa pareja:
--   · la MISMA hoja cambia de calle (lo contado en la calle anterior se conserva
--     y sus ubicaciones siguen aprobadas);
--   · las dos personas quedan con la hoja REABIERTA (se borra su «terminé»)
--     para contar la calle nueva, siempre a ciegas.
--
-- No se puede si queda alguna ubicación a validar (sin aprobar ni responder).
-- Se puede correr dos veces. Necesita 2026-10-fiscal-calle.sql y
-- 2026-10-fiscal-validar.sql.
-- =====================================================================
begin;

drop function if exists public.inv_fiscal_siguiente_calle(uuid, text);
create function public.inv_fiscal_siguiente_calle(p_hoja uuid, p_calle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; v_calle text := nullif(upper(btrim(coalesce(p_calle, ''))), '');
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Pasar a la siguiente calle requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if v_calle is null then raise exception 'Escoge la calle.'; end if;
  if length(v_calle) > 20 then raise exception 'La calle es demasiado larga.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if exists (select 1 from public.inv_fiscal_revisiones where hoja_id = p_hoja and estado = 'A_VALIDAR') then
    raise exception 'Todavía hay ubicaciones esperando validación: apruébalas antes de pasar a la siguiente calle.';
  end if;

  update public.inv_fiscal_hojas set calle = v_calle where id = p_hoja;
  delete from public.inv_fiscal_terminos where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_siguiente_calle(uuid, text) from public, anon;
grant execute on function public.inv_fiscal_siguiente_calle(uuid, text) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_siguiente_calle(uuid,text)') is null then
    raise exception 'Falta inv_fiscal_siguiente_calle: no se creó. Revisa que corrieron antes calle y validar.';
  end if;
end $$;

commit;
select 'OK · siguiente calle lista' as resultado;

-- ##################### 2026-10-fiscal-consolidar.sql #####################
-- =====================================================================
-- INVENTARIO FISCAL · CONSOLIDAR EN LA BASE (UN CONTEO POR HOJA)
--
-- «Cuando el fiscal aprueba lo de ambos, eso se envía a la base de datos de una:
--  el conteo debe corresponder y coincidir. Para mi análisis y todo lo que hago
--  sería por hoja y no por usuario.»
--
-- QUÉ HACE
--   · Cada HOJA del fiscal tiene UN solo conteo en La base (tipo FEFO, ya enviado),
--     con código FISCAL-AAAAMMDD-H01, firmado por quien aprueba. Balance, Análisis
--     de diferencia, Tablero y demás lo leen como cualquier recorrido, por hoja y no
--     por persona. Su fecha de análisis es la del inventario fiscal.
--   · Entra SOLO lo que el fiscal APROBÓ y donde el operador y Bavaria COINCIDEN.
--     Una ubicación aprobada que todavía difiere NO se consolida (se avisa cuántas):
--     primero tiene que coincidir.
--   · Los renglones que entran son los del operador logístico (idénticos en cajas a
--     los de Bavaria, que es lo que significa coincidir).
--   · Se puede repetir las veces que sea: cada vez deja en La base exactamente lo
--     aprobado y coincidente hoy (si una ubicación vuelve a validarse, sale hasta
--     que se apruebe de nuevo). Cada calle que se aprueba se suma al mismo conteo.
--   · NO toca los conteos de las personas (inv_fiscal_conteos): el fiscal sigue a ciegas.
--
-- Se puede correr dos veces. Necesita 2026-10-fiscal-validar.sql.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas
  add column if not exists conteo_id uuid references public.conteos(id) on delete set null;

-- El cruce de siempre, pero sin exigir que las dos personas hayan terminado
-- (esa regla es del botón «cruzar»). Solo lo usa la función de abajo.
drop function if exists public.inv_fiscal_cruce_filas(uuid);
create function public.inv_fiscal_cruce_filas(p_hoja uuid)
returns table (ubicacion_id uuid, estado text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo,
           sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA')
  select coalesce(o.ubicacion_id, b.ubicacion_id),
         case when o.cajas is null then 'SOLO_BAVARIA' when b.cajas is null then 'SOLO_OL'
              when o.cajas = b.cajas then 'COINCIDE' else 'DIFIERE' end
    from o full join b
      on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
     and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)
     and coalesce(o.venc_mes, 0) = coalesce(b.venc_mes, 0)
     and coalesce(o.venc_anio, 0) = coalesce(b.venc_anio, 0)
$$;
revoke all on function public.inv_fiscal_cruce_filas(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- CONSOLIDAR UNA HOJA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_consolidar(uuid);
create function public.inv_fiscal_consolidar(p_hoja uuid)
returns table (ubicaciones integer, renglones integer, sin_consolidar integer, conteo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_num integer; v_conteo uuid; v_fecha date; v_bodega uuid; v_codigo text;
  v_ok uuid[]; v_sin integer; v_ren integer;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- Lo aprobado Y coincidente (todos sus renglones iguales entre las dos personas).
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id)
       and not exists (select 1 from public.inv_fiscal_cruce_filas(p_hoja) x
                        where x.ubicacion_id = r.ubicacion_id and x.estado <> 'COINCIDE'));
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok));

  if v_conteo is null then
    if coalesce(array_length(v_ok, 1), 0) = 0 then
      raise exception 'Todavía no hay ubicaciones aprobadas que coincidan en esta hoja: no hay nada que consolidar.';
    end if;
    select u.bodega_id into v_bodega from public.ubicaciones u where u.id = v_ok[1];
    v_codigo := 'FISCAL-' || to_char(v_fecha, 'YYYYMMDD') || '-H' || lpad(v_num::text, 2, '0');
    if exists (select 1 from public.conteos where codigo = v_codigo) then
      v_codigo := v_codigo || '-' || substr(p_hoja::text, 1, 4);
    end if;
    insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
    values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
            ((v_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota'),
            'Inventario fiscal · Hoja ' || v_num || ' · lo aprobado por el fiscal y coincidente entre las dos personas')
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
     rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en)
  select v_conteo, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
         null, false, false, null, c.nota,
         coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0),
         v_yo, c.contado_en
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.equipo = 'OL' and c.ubicacion_id = any (v_ok);
  get diagnostics v_ren = row_count;

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LO CONSOLIDADO DE CADA HOJA (para mostrarlo en el panel del fiscal)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_consolidados(uuid);
create function public.inv_fiscal_consolidados(p_fiscal uuid)
returns table (hoja_id uuid, numero integer, conteo text, ubicaciones integer, renglones integer, cajas bigint, enviado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver lo consolidado del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
  select h.id, h.numero, c.codigo,
         count(distinct cl.ubicacion_id)::integer, count(cl.id)::integer,
         coalesce(sum(coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0) + coalesce(cl.cajas, 0) + coalesce(cl.saldo, 0)), 0)::bigint,
         c.enviado_en
    from public.inv_fiscal_hojas h
    join public.conteos c on c.id = h.conteo_id
    left join public.conteo_lineas cl on cl.conteo_id = c.id
    left join public.productos p on p.id = cl.producto_id
   where h.fiscal_id = p_fiscal
   group by h.id, h.numero, c.codigo, c.enviado_en
   order by h.numero;
end $$;
revoke all on function public.inv_fiscal_consolidados(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidados(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null
     or to_regprocedure('public.inv_fiscal_consolidados(uuid)') is null then
    raise exception 'No quedaron las funciones de consolidar. Revisa que corrió antes 2026-10-fiscal-validar.sql.';
  end if;
end $$;

commit;
select 'OK · consolidar listo' as resultado;

-- ##################### 2026-10-fiscal-estado.sql #####################
-- =====================================================================
-- INVENTARIO FISCAL · ESTADO DEL ENVASE, AVERÍA, PNC Y FOTOS EN EL CONTEO (el conteo fiscal es gemelo del normal)
--
-- En el conteo normal el envase se cuenta con su estado (RETORNO, LAVADO, NUEVO, BAJA, EXTRASUCIO,
-- OTROS, MAL ESTADO; el cilindro, LLENO o VACÍO). El fiscal ahora también lo pide:
--   · AVERÍA y PNC (con su política: rótulo y bloqueo mecánico) se anotan como en el normal;
--   · el mismo material, sitio y vencimiento se puede anotar varias veces (cada una es un renglón; no se suma);
--   · el cruce y la validación comparan también el estado, la avería y el PNC;
--   · al mandar a La base el estado va con el renglón.
--
-- Orden: correr DESPUÉS de 2026-10-fiscal-consolidar.sql y ANTES de 2026-10-fiscal-modulo.sql.
-- Se puede correr dos veces. No borra conteos.
-- =====================================================================
begin;

alter table public.inv_fiscal_conteos add column if not exists estado_envase text;
alter table public.inv_fiscal_conteos add column if not exists averia boolean not null default false;
alter table public.inv_fiscal_conteos add column if not exists pnc boolean not null default false;
alter table public.inv_fiscal_conteos add column if not exists pnc_rotulo boolean;
alter table public.inv_fiscal_conteos add column if not exists pnc_bloqueo_mecanico boolean;
alter table public.inv_fiscal_conteos drop constraint if exists inv_fiscal_conteos_averia_pnc;
alter table public.inv_fiscal_conteos add constraint inv_fiscal_conteos_averia_pnc check (not (averia and pnc));
-- El mismo material, sitio, vencimiento y estado se puede anotar VARIAS veces: cada una es su renglón y todos se ven.
-- El cruce y la validación los suman por módulo. Por eso ya no hay llave única.
drop index if exists public.inv_fiscal_conteos_unico;
create index if not exists inv_fiscal_conteos_clave_idx on public.inv_fiscal_conteos
  (hoja_id, contado_por, ubicacion_id, producto_id);

drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
create function public.inv_fiscal_contar_agregar(
  p_hoja uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null
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
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico)
    values
      (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, p_producto, p_estibas, p_saldo, p_cajas, p_dia, p_mes, p_anio,
       nullif(btrim(coalesce(p_nota, '')), ''), nullif(btrim(coalesce(p_estado, '')), ''),
       coalesce(p_averia, false), coalesce(p_pnc, false),
       case when coalesce(p_pnc, false) then p_pnc_rotulo end, case when coalesce(p_pnc, false) then p_pnc_bloqueo end)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'No se pudo anotar el renglón.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) to authenticated;

drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz, estado_envase text,
  averia boolean, pnc boolean, pnc_rotulo boolean, pnc_bloqueo_mecanico boolean, en_base boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en, c.estado_envase,
         c.averia, c.pnc, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
         -- Ya está en La base: el fiscal aprobó el módulo y se consolidó la hoja con él.
         exists (select 1 from public.inv_fiscal_hojas h
                   join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id
                  where h.id = c.hoja_id)
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CORREGIR UN RENGLÓN (igual que «Corregir» en el borrador del conteo normal)
-- Cambia el renglón en su sitio: conserva su foto y su hora de anotado. Mientras la hoja está
-- terminada no se puede (salvo en lo que el fiscal mandó a validar), igual que anotar y quitar.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
create function public.inv_fiscal_contar_corregir(
  p_id uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  c public.inv_fiscal_conteos%rowtype;
  v_estado text; v_pub timestamptz;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select * into c from public.inv_fiscal_conteos where id = p_id and contado_por = v_yo;
  if not found then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  select f.estado, f.publicado_en into v_estado, v_pub from public.inv_fiscales f where f.id = c.fiscal_id;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  -- Hoja terminada: solo se cambia lo que el fiscal mandó a validar y aún no respondiste (igual que anotar y quitar).
  if exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = c.hoja_id and t.user_id = v_yo) then
    if not exists (
      select 1 from public.inv_fiscal_revisiones r
       where r.hoja_id = c.hoja_id and r.ubicacion_id = c.ubicacion_id and r.estado = 'A_VALIDAR'
         and not exists (select 1 from public.inv_fiscal_revision_envios e
                          where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id
                            and e.user_id = v_yo and e.ronda = r.ronda)
    ) then
      raise exception 'Ya terminaste tu hoja. Reábrela para corregir.';
    end if;
    if p_ubicacion <> c.ubicacion_id then raise exception 'Con la hoja terminada no se puede cambiar el sitio del renglón.'; end if;
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    update public.inv_fiscal_conteos set
      ubicacion_id = p_ubicacion, producto_id = p_producto,
      estibas = p_estibas, saldo = p_saldo, cajas = p_cajas,
      venc_dia = p_dia, venc_mes = p_mes, venc_anio = p_anio,
      nota = nullif(btrim(coalesce(p_nota, '')), ''), estado_envase = nullif(btrim(coalesce(p_estado, '')), ''),
      averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
      pnc_rotulo = case when coalesce(p_pnc, false) then p_pnc_rotulo end,
      pnc_bloqueo_mecanico = case when coalesce(p_pnc, false) then p_pnc_bloqueo end
     where id = p_id;
  exception
    when unique_violation then raise exception 'No se pudo corregir el renglón.';
    when foreign_key_violation then raise exception 'Ese sitio o ese material no existe.';
  end;
end $$;
revoke all on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- LAS FOTOS DEL CONTEO FISCAL (igual que en el conteo normal)
--   · una foto por renglón (obligatoria si es avería), sellada con hora y lugar en el teléfono;
--   · el estado del MÓDULO: «mezclado» y «sin acceso», que piden foto de evidencia.
-- Cada persona ve solo lo suyo (el conteo es a ciegas): todo entra y sale por funciones.
-- Los archivos van al bucket «inventario», en la carpeta «fiscal/».
-- ---------------------------------------------------------------------
create table if not exists public.inv_fiscal_fotos (
  conteo_id   uuid primary key references public.inv_fiscal_conteos(id) on delete cascade,
  hoja_id     uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  ruta        text not null,
  bytes       integer,
  ancho       integer,
  alto        integer,
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  subida_en   timestamptz not null default now()
);
create index if not exists inv_fiscal_fotos_hoja_idx on public.inv_fiscal_fotos (hoja_id);
alter table public.inv_fiscal_fotos enable row level security;
revoke all on public.inv_fiscal_fotos from public, anon, authenticated;

create table if not exists public.inv_fiscal_modulos (
  hoja_id      uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  mezclado     boolean not null default false,
  sin_acceso   boolean not null default false,
  ruta         text,
  bytes        integer,
  ancho        integer,
  alto         integer,
  tomada_en    timestamptz,
  lat          numeric(10,7),
  lng          numeric(10,7),
  precision_m  numeric(8,2),
  marcado_en   timestamptz not null default now(),
  primary key (hoja_id, user_id, ubicacion_id)
);
alter table public.inv_fiscal_modulos enable row level security;
revoke all on public.inv_fiscal_modulos from public, anon, authenticated;

drop function if exists public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric);
create function public.inv_fiscal_foto_guardar(
  p_conteo uuid, p_ruta text, p_bytes integer, p_ancho integer, p_alto integer,
  p_tomada timestamptz, p_lat numeric, p_lng numeric, p_precision numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  select c.hoja_id into v_hoja from public.inv_fiscal_conteos c where c.id = p_conteo and c.contado_por = auth.uid();
  if v_hoja is null then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  if coalesce(btrim(p_ruta), '') = '' then raise exception 'Falta la ruta de la foto.'; end if;
  insert into public.inv_fiscal_fotos (conteo_id, hoja_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
  values (p_conteo, v_hoja, p_ruta, p_bytes, p_ancho, p_alto, p_tomada, p_lat, p_lng, p_precision, auth.uid(), now())
  on conflict (conteo_id) do update
    set ruta = excluded.ruta, bytes = excluded.bytes, ancho = excluded.ancho, alto = excluded.alto,
        tomada_en = excluded.tomada_en, lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m,
        subida_por = auth.uid(), subida_en = now();
end $$;
revoke all on function public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) from public, anon;
grant execute on function public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) to authenticated;

drop function if exists public.inv_fiscal_mis_fotos(uuid);
create function public.inv_fiscal_mis_fotos(p_hoja uuid)
returns table (conteo_id uuid, ruta text)
language sql
stable
security definer
set search_path = public
as $$
  select f.conteo_id, f.ruta from public.inv_fiscal_fotos f
   where f.hoja_id = p_hoja and f.subida_por = auth.uid()
$$;
revoke all on function public.inv_fiscal_mis_fotos(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_fotos(uuid) to authenticated;

drop function if exists public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric);
create function public.inv_fiscal_modulo_marcar(
  p_hoja uuid, p_ubicacion uuid, p_mezclado boolean, p_sin_acceso boolean,
  p_ruta text, p_bytes integer, p_ancho integer, p_alto integer, p_tomada timestamptz,
  p_lat numeric, p_lng numeric, p_precision numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_pub timestamptz;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  select f.estado, f.publicado_en into v_estado, v_pub
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = auth.uid();
  if v_estado is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if not coalesce(p_mezclado, false) and not coalesce(p_sin_acceso, false) then
    delete from public.inv_fiscal_modulos where hoja_id = p_hoja and user_id = auth.uid() and ubicacion_id = p_ubicacion;
    return;
  end if;
  insert into public.inv_fiscal_modulos (hoja_id, user_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_en)
  values (p_hoja, auth.uid(), p_ubicacion, coalesce(p_mezclado, false), coalesce(p_sin_acceso, false), p_ruta, p_bytes, p_ancho, p_alto, p_tomada, p_lat, p_lng, p_precision, now())
  on conflict (hoja_id, user_id, ubicacion_id) do update
    set mezclado = excluded.mezclado, sin_acceso = excluded.sin_acceso,
        ruta = coalesce(excluded.ruta, public.inv_fiscal_modulos.ruta),
        bytes = case when excluded.ruta is null then public.inv_fiscal_modulos.bytes else excluded.bytes end,
        ancho = case when excluded.ruta is null then public.inv_fiscal_modulos.ancho else excluded.ancho end,
        alto = case when excluded.ruta is null then public.inv_fiscal_modulos.alto else excluded.alto end,
        tomada_en = case when excluded.ruta is null then public.inv_fiscal_modulos.tomada_en else excluded.tomada_en end,
        lat = case when excluded.ruta is null then public.inv_fiscal_modulos.lat else excluded.lat end,
        lng = case when excluded.ruta is null then public.inv_fiscal_modulos.lng else excluded.lng end,
        precision_m = case when excluded.ruta is null then public.inv_fiscal_modulos.precision_m else excluded.precision_m end,
        marcado_en = now();
end $$;
revoke all on function public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) from public, anon;
grant execute on function public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) to authenticated;

drop function if exists public.inv_fiscal_mis_modulos(uuid);
create function public.inv_fiscal_mis_modulos(p_hoja uuid)
returns table (ubicacion_id uuid, mezclado boolean, sin_acceso boolean, ruta text)
language sql
stable
security definer
set search_path = public
as $$
  select m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta from public.inv_fiscal_modulos m
   where m.hoja_id = p_hoja and m.user_id = auth.uid()
$$;
revoke all on function public.inv_fiscal_mis_modulos(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_modulos(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_contar_agregar(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text,boolean,boolean,boolean,boolean)') is null
     or to_regprocedure('public.inv_fiscal_contar_mios(uuid)') is null
     or to_regprocedure('public.inv_fiscal_contar_corregir(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text,boolean,boolean,boolean,boolean)') is null
     or to_regprocedure('public.inv_fiscal_foto_guardar(uuid,text,integer,integer,integer,timestamptz,numeric,numeric,numeric)') is null
     or to_regprocedure('public.inv_fiscal_modulo_marcar(uuid,uuid,boolean,boolean,text,integer,integer,integer,timestamptz,numeric,numeric,numeric)') is null then
    raise exception 'No quedaron las funciones de contar con estado.';
  end if;
end $$;

commit;
select 'OK · estado del envase en el conteo fiscal' as resultado;
-- =====================================================================
-- INVENTARIO FISCAL · VALIDAR POR CALLE Y MÓDULO (SIN LADO)
--
-- «En la validación que sea calle y módulo, pero lado no, porque es muy perceptivo.»
--
-- Decirle a las personas «revisa A01_IZQ» les señala el lado donde está la diferencia.
-- Ahora se valida el MÓDULO completo (A01 = sus dos lados):
--   · Al mandar a validar una ubicación, entran en validación TODAS las de su módulo
--     (izquierdo y derecho, aunque en uno de los dos nadie haya contado).
--   · Al aprobar, se aprueba el módulo (las ubicaciones con conteo o ya en validación).
--   · La persona recuenta el módulo entero y dice en qué lado va cada renglón;
--     se envía todo junto, o todo o nada (inv_fiscal_revision_enviar_modulo).
--
-- Con fotos: al mandar a La base viajan las fotos de los renglones y las marcas «mezclado / sin acceso» (necesita las tablas de fotos de 2026-10-fiscal-estado.sql).
-- Se puede correr dos veces. Necesita 2026-10-fiscal-validar.sql, 2026-10-fiscal-consolidar.sql y 2026-10-fiscal-estado.sql (antes de este).
-- Vuelve a crear también «consolidar» (ya no cuenta como pendiente un lado donde nadie contó).
-- =====================================================================
begin;

-- Cuando un módulo sigue difiriendo, el fiscal puede dejar como definitivo lo contado por un equipo (OL o BAVARIA).
alter table public.inv_fiscal_revisiones add column if not exists adoptado text;
-- «Compensar»: el fiscal dio por compensadas las diferencias iguales y de signo contrario del módulo (+45 en un material, −45 en otro).
alter table public.inv_fiscal_revisiones add column if not exists compensado boolean not null default false;
alter table public.inv_fiscal_revisiones drop constraint if exists inv_fiscal_revisiones_adoptado_chk;
alter table public.inv_fiscal_revisiones add constraint inv_fiscal_revisiones_adoptado_chk check (adoptado is null or adoptado in ('OL', 'BAVARIA'));

-- Las ubicaciones del mismo módulo (calle + módulo) de las que se piden, incluidas las pedidas.
drop function if exists public.inv_fiscal_hermanas(uuid[]);
create function public.inv_fiscal_hermanas(p_ubicaciones uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}'::uuid[]) from (
    select unnest(p_ubicaciones) as x
    union
    select s.id
      from public.ubicaciones u
      join public.ubicaciones s on s.bodega_id = u.bodega_id and s.calle = u.calle and s.modulo = u.modulo and s.activa
     where u.id = any (p_ubicaciones)
  ) t
$$;
revoke all on function public.inv_fiscal_hermanas(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- MANDAR A VALIDAR: el módulo completo
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
  v_ubi uuid; v_n integer := 0; v_estado text; v_lista uuid[]; v_pedidas uuid[];
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Mandar a validar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Escoge al menos un módulo.'; end if;
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

  v_pedidas := (select array_agg(distinct u) from unnest(p_ubicaciones) u);
  foreach v_ubi in array v_pedidas loop
    if not exists (select 1 from public.inv_fiscal_conteos c
                    where c.hoja_id = p_hoja and c.ubicacion_id = any (public.inv_fiscal_hermanas(array[v_ubi]))) then
      raise exception 'Nadie contó en uno de esos módulos: no hay nada que validar.';
    end if;
  end loop;

  v_lista := public.inv_fiscal_hermanas(v_pedidas);
  foreach v_ubi in array v_lista loop
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, nota, pedido_por, pedido_en)
    values (p_hoja, v_ubi, 'A_VALIDAR', 1, nullif(btrim(coalesce(p_nota, '')), ''), v_yo, now())
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'A_VALIDAR', ronda = public.inv_fiscal_revisiones.ronda + 1,
          nota = nullif(btrim(coalesce(p_nota, '')), ''), pedido_por = v_yo, pedido_en = now(),
          aprobado_por = null, aprobado_en = null, adoptado = null, compensado = false;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_validar(uuid, uuid[], text) from public, anon;
grant execute on function public.inv_fiscal_validar(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- APROBAR: el módulo completo (sus ubicaciones con conteo o ya en validación)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean);
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean, text);
drop function if exists public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean);
create function public.inv_fiscal_aprobar(p_hoja uuid, p_ubicaciones uuid[], p_forzar boolean default false, p_adoptar text default null, p_compensar boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_ubi uuid; v_n integer := 0; v_estado text; v_rev text; v_ronda integer; v_envios integer; v_clave text; v_lista uuid[];
  v_equipos integer;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Aprobar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Escoge al menos un módulo.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  select count(distinct m.equipo) into v_equipos
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos < 1 then
    raise exception 'Se aprueba cuando al menos una persona de la hoja terminó.';
  end if;
  -- Con una sola persona no hay cruce: se aprueba solo si el fiscal lo confirma.
  if v_equipos < 2 and not coalesce(p_forzar, false) then
    raise exception 'Solo terminó una persona de la hoja: no hay cruce. Confirma para aprobar con una sola persona.';
  end if;
  if p_adoptar is not null and p_adoptar not in ('OL', 'BAVARIA') then raise exception 'Escoge qué conteo queda como definitivo: el del operador o el de Bavaria.'; end if;
  -- «Dejar lo de un equipo» solo tiene sentido cuando hay dos conteos que cruzar.
  if v_equipos < 2 then p_adoptar := null; p_compensar := false; end if;

  v_lista := array(
    select distinct h
      from unnest(public.inv_fiscal_hermanas((select array_agg(distinct u) from unnest(p_ubicaciones) u))) h
     where h = any (p_ubicaciones)
        or exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = h)
        or exists (select 1 from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = h));
  foreach v_ubi in array v_lista loop
    select r.estado, r.ronda into v_rev, v_ronda
      from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = v_ubi;
    if v_rev = 'A_VALIDAR' and not coalesce(p_forzar, false) then
      select count(*) into v_envios from public.inv_fiscal_revision_envios e
       where e.hoja_id = p_hoja and e.ubicacion_id = v_ubi and e.ronda = v_ronda;
      if v_envios < 2 then
        select clave into v_clave from public.ubicaciones where id = v_ubi;
        raise exception 'En % todavía falta que las dos personas envíen su validación.', coalesce(regexp_replace(v_clave, '_(IZQ|DER)$', ''), 'un módulo');
      end if;
    end if;
    insert into public.inv_fiscal_revisiones (hoja_id, ubicacion_id, estado, ronda, aprobado_por, aprobado_en, adoptado, compensado)
    values (p_hoja, v_ubi, 'APROBADA', 0, v_yo, now(), p_adoptar, coalesce(p_compensar, false))
    on conflict (hoja_id, ubicacion_id) do update
      set estado = 'APROBADA', aprobado_por = v_yo, aprobado_en = now(), adoptado = p_adoptar, compensado = coalesce(p_compensar, false);
    v_n := v_n + 1;
  end loop;
  -- Al aprobar, lo que coincide pasa solo a La base (y sale del borrador de cada persona). Si aún no hay nada que pasar, no pasa nada.
  begin
    perform public.inv_fiscal_consolidar(p_hoja);
  exception when others then
    null;
  end;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean) from public, anon;
grant execute on function public.inv_fiscal_aprobar(uuid, uuid[], boolean, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- RESPONDER UN MÓDULO: «está bien» (sin renglones) o REEMPLAZAR lo contado en él.
-- p_ubicaciones: las ubicaciones del módulo (con una basta: se completan los dos lados).
-- p_renglones: [{ubicacion_id, producto_id, estibas, saldo, cajas, dia, mes, anio, nota}, …]
--   · null  → «está bien»: no cambia nada, solo se marca como enviado.
--   · lista → borra lo que esta persona contó en el módulo y pone estos renglones (vacía = «aquí no hay nada»).
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_revision_enviar_modulo(uuid, uuid[], jsonb);
create function public.inv_fiscal_revision_enviar_modulo(p_hoja uuid, p_ubicaciones uuid[], p_renglones jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz;
  v_lista uuid[]; v_ubi uuid; v_ronda integer; v_rev text; v_rondas integer[] := '{}'; v_i integer := 0;
  x jsonb; v_u uuid; v_est integer; v_sal integer; v_caj integer; v_d smallint; v_m smallint; v_a smallint; v_prod uuid;
  v_keep uuid[] := '{}'; v_nuevos uuid[] := '{}'; v_nuevo uuid; v_desde uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, m.fiscal_id, f.estado, f.publicado_en
    into v_equipo, v_fiscal, v_estado, v_pub
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if coalesce(array_length(p_ubicaciones, 1), 0) = 0 then raise exception 'Falta el módulo.'; end if;

  -- Solo las ubicaciones del módulo que el fiscal mandó a validar y que esta persona todavía no respondió.
  v_lista := array(select h from unnest(public.inv_fiscal_hermanas(p_ubicaciones)) h
                    where exists (select 1 from public.inv_fiscal_revisiones r
                                   where r.hoja_id = p_hoja and r.ubicacion_id = h and r.estado = 'A_VALIDAR'));
  if coalesce(array_length(v_lista, 1), 0) = 0 then raise exception 'El fiscal no te pidió validar ese módulo.'; end if;
  foreach v_ubi in array v_lista loop
    select r.ronda into v_ronda from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = v_ubi;
    if exists (select 1 from public.inv_fiscal_revision_envios e
                where e.hoja_id = p_hoja and e.ubicacion_id = v_ubi and e.user_id = v_yo and e.ronda = v_ronda) then
      raise exception 'Ya enviaste ese módulo. Espera a que el fiscal lo apruebe o lo mande otra vez.';
    end if;
    v_rondas := v_rondas || v_ronda;
  end loop;

  if p_renglones is not null then
    if jsonb_typeof(p_renglones) <> 'array' then raise exception 'Los renglones deben ir en una lista.'; end if;
    -- Los renglones que se conservan tal cual (con su foto) llegan solo con su «id»: no se tocan.
    v_keep := array(select (e->>'id')::uuid from jsonb_array_elements(p_renglones) e where nullif(e->>'id', '') is not null);
    for x in select * from jsonb_array_elements(p_renglones) loop
      if nullif(x->>'id', '') is not null then continue; end if;
      v_u := nullif(x->>'ubicacion_id', '')::uuid;
      if v_u is null or not (v_u = any (v_lista)) then raise exception 'A un renglón le falta el lado (izquierdo o derecho) de ese módulo.'; end if;
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
          (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico)
        values (v_fiscal, p_hoja, v_equipo, v_yo, v_u, v_prod, v_est, v_sal, v_caj, v_d, v_m, v_a,
                nullif(btrim(coalesce(x->>'nota', '')), ''), nullif(btrim(coalesce(x->>'estado', '')), ''),
                coalesce((x->>'averia')::boolean, false), coalesce((x->>'pnc')::boolean, false),
                case when coalesce((x->>'pnc')::boolean, false) then (x->>'pnc_rotulo')::boolean end,
                case when coalesce((x->>'pnc')::boolean, false) then (x->>'pnc_bloqueo')::boolean end)
        returning id into v_nuevo;
        v_nuevos := v_nuevos || v_nuevo;
        -- Un renglón corregido conserva la foto del que reemplaza.
        v_desde := nullif(x->>'desde', '')::uuid;
        if v_desde is not null then
          update public.inv_fiscal_fotos set conteo_id = v_nuevo where conteo_id = v_desde and subida_por = v_yo;
        end if;
        -- Foto nueva tomada en el editor: reemplaza la que traía (o la pone si no tenía).
        if jsonb_typeof(x->'foto') = 'object' and nullif(btrim(coalesce(x->'foto'->>'ruta', '')), '') is not null then
          insert into public.inv_fiscal_fotos (conteo_id, hoja_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
          values (v_nuevo, p_hoja, x->'foto'->>'ruta', nullif(x->'foto'->>'bytes', '')::integer, nullif(x->'foto'->>'ancho', '')::integer,
                  nullif(x->'foto'->>'alto', '')::integer, nullif(x->'foto'->>'tomada', '')::timestamptz,
                  nullif(x->'foto'->>'lat', '')::numeric, nullif(x->'foto'->>'lng', '')::numeric, nullif(x->'foto'->>'precision', '')::numeric,
                  v_yo, now())
          on conflict (conteo_id) do update
            set ruta = excluded.ruta, bytes = excluded.bytes, ancho = excluded.ancho, alto = excluded.alto, tomada_en = excluded.tomada_en,
                lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m, subida_por = v_yo, subida_en = now();
        end if;
      exception
        when unique_violation then
          raise exception 'No se pudo guardar un renglón.';
        when foreign_key_violation then
          raise exception 'Ese material no existe.';
      end;
    end loop;
    -- Lo anterior que no se conservó ni se reemplazó se quita (su foto se va con él).
    delete from public.inv_fiscal_conteos
     where hoja_id = p_hoja and contado_por = v_yo and ubicacion_id = any (v_lista)
       and not (id = any (v_keep)) and not (id = any (v_nuevos));
  end if;

  foreach v_ubi in array v_lista loop
    v_i := v_i + 1;
    insert into public.inv_fiscal_revision_envios (hoja_id, ubicacion_id, user_id, ronda, enviado_en)
    values (p_hoja, v_ubi, v_yo, v_rondas[v_i], now())
    on conflict (hoja_id, ubicacion_id, user_id) do update set ronda = excluded.ronda, enviado_en = now();
  end loop;
end $$;
revoke all on function public.inv_fiscal_revision_enviar_modulo(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.inv_fiscal_revision_enviar_modulo(uuid, uuid[], jsonb) to authenticated;

-- ¿El módulo de esta ubicación NO cuadra entre las dos personas? (por módulo, material y vencimiento; sin lado)
drop function if exists public.inv_fiscal_modulo_difiere(uuid, uuid);
drop function if exists public.inv_fiscal_modulo_difiere(uuid, uuid, boolean);
create function public.inv_fiscal_modulo_difiere(p_hoja uuid, p_ubi uuid, p_compensar boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo, c.producto_id,
           c.estado_envase as ee, c.averia as av, c.pnc as pn, c.equipo,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g as (
    -- Sin fecha de vencimiento: se compara módulo, código y estado. Se calcula para TODA la hoja (la compensación mira otros módulos).
    select modulo, producto_id, ee, av, pn,
           sum(case when equipo = 'OL' then cajas end) as co, sum(case when equipo = 'BAVARIA' then cajas end) as cb,
           coalesce(sum(case when equipo = 'OL' then cajas end), 0) - coalesce(sum(case when equipo = 'BAVARIA' then cajas end), 0) as dif
      from t
     group by 1, 2, 3, 4, 5
  )
  -- Con «compensar», una diferencia no cuenta si (a) hay otra igual y de signo contrario en el mismo módulo, o (b) el MISMO
  -- material (mismo código y misma cantidad, sin mirar avería ni estado) tiene la diferencia contraria en otro módulo de la hoja (uno lo contó en un sitio y el otro en el de al lado).
  select exists (
    select 1 from g
     where g.modulo = (select regexp_replace(u2.clave, '_(IZQ|DER)$', '') from public.ubicaciones u2 where u2.id = p_ubi)
       and (g.co is null or g.cb is null or g.co <> g.cb)
       and not (coalesce(p_compensar, false)
                and ((select count(*) from g g2 where g2.modulo = g.modulo and g2.dif = g.dif)
                       = (select count(*) from g g3 where g3.modulo = g.modulo and g3.dif = -g.dif)
                     or exists (select 1 from g g4
                                 where g4.modulo <> g.modulo and g4.producto_id = g.producto_id and g4.dif = -g.dif)
                     -- (c) el mismo código que en TOTAL cuadra en toda la hoja (la suma de sus diferencias es 0)
                     or (select count(*) from g g5 where g5.producto_id = g.producto_id and (g5.co is null or g5.cb is null or g5.co <> g5.cb)) > 1
                        and (select sum(g6.dif) from g g6 where g6.producto_id = g.producto_id) = 0))
  )
$$;
revoke all on function public.inv_fiscal_modulo_difiere(uuid, uuid, boolean) from public, anon, authenticated;

-- El cruce también se puede pedir cuando terminó una sola persona (todo sale «solo …», sin cruce).
drop function if exists public.inv_fiscal_cruce(uuid);
create function public.inv_fiscal_cruce(p_hoja uuid)
returns table (
  ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  venc_dia smallint, venc_mes smallint, venc_anio smallint,
  cajas_ol bigint, cajas_bavaria bigint, diferencia bigint, estado text, estado_envase text, averia boolean, pnc boolean
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
       where m.hoja_id = p_hoja) < 1 then
    raise exception 'El cruce se hace cuando al menos una persona de la hoja terminó de contar.';
  end if;

  return query
  with t as (
    -- La fecha de vencimiento NO es parte de lo que se compara (daría diferencias de más): se compara sitio, código y estado.
    -- Se muestra la fecha más próxima de las anotadas.
    select c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo,
           min(case when c.venc_dia is not null then c.venc_anio * 10000 + c.venc_mes * 100 + c.venc_dia end) as venc,
           sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA'),
  j as (
    select coalesce(o.ubicacion_id, b.ubicacion_id) as ubi, coalesce(o.producto_id, b.producto_id) as prod,
           least(o.venc, b.venc) as vc,
           coalesce(o.estado_envase, b.estado_envase) as ee, coalesce(o.averia, b.averia) as av, coalesce(o.pnc, b.pnc) as pn, o.cajas as co, b.cajas as cb
      from o full join b
        on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
       and o.estado_envase is not distinct from b.estado_envase
       and o.averia = b.averia and o.pnc = b.pnc
  )
  select j.ubi, u.clave, j.prod, pr.sku, pr.nombre,
         (j.vc % 100)::smallint, ((j.vc / 100) % 100)::smallint, (j.vc / 10000)::smallint, j.co, j.cb,
         (coalesce(j.co, 0) - coalesce(j.cb, 0))::bigint,
         case when j.co is null then 'SOLO_BAVARIA'
              when j.cb is null then 'SOLO_OL'
              when j.co = j.cb then 'COINCIDE'
              else 'DIFIERE' end,
         j.ee, j.av, j.pn
    from j
    join public.ubicaciones u on u.id = j.ubi
    join public.productos pr on pr.id = j.prod
   order by (case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end), u.clave, pr.sku, j.vc;
end $$;
revoke all on function public.inv_fiscal_cruce(uuid) from public, anon;
grant execute on function public.inv_fiscal_cruce(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CONSOLIDAR (igual que antes; un lado donde nadie contó ya no cuenta como pendiente)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_consolidar(uuid);
create function public.inv_fiscal_consolidar(p_hoja uuid)
returns table (ubicaciones integer, renglones integer, sin_consolidar integer, conteo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_num integer; v_conteo uuid; v_fecha date; v_bodega uuid; v_codigo text;
  v_ok uuid[]; v_sin integer; v_ren integer; v_equipos integer; v_eq text := 'OL';
  rg record; v_lid uuid;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Consolidar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.numero, h.conteo_id, f.fecha into v_num, v_conteo, v_fecha
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_num is null then raise exception 'Esa hoja no existe.'; end if;

  -- ¿Terminó una sola persona? Entonces no hay cruce: lo aprobado se toma de la persona que terminó.
  select count(distinct m.equipo), coalesce(min(m.equipo), 'OL') into v_equipos, v_eq
    from public.inv_fiscal_miembros m
    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
   where m.hoja_id = p_hoja;
  if v_equipos <> 1 then v_eq := 'OL'; end if;

  -- Lo aprobado Y coincidente por módulo (sin lado). Con una sola persona: todo lo aprobado que ella contó.
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id
                    and (v_equipos <> 1 or c.equipo = v_eq))
       and (v_equipos = 1 or r.adoptado is not null
            or not public.inv_fiscal_modulo_difiere(p_hoja, r.ubicacion_id, r.compensado)));
  select count(*) into v_sin from public.inv_fiscal_revisiones r
   where r.hoja_id = p_hoja and r.estado = 'APROBADA' and not (r.ubicacion_id = any (v_ok))
     and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id);

  if v_conteo is null then
    if coalesce(array_length(v_ok, 1), 0) = 0 then
      raise exception 'Todavía no hay ubicaciones aprobadas que coincidan en esta hoja: no hay nada que consolidar.';
    end if;
    select u.bodega_id into v_bodega from public.ubicaciones u where u.id = v_ok[1];
    v_codigo := 'FISCAL-' || to_char(v_fecha, 'YYYYMMDD') || '-H' || lpad(v_num::text, 2, '0');
    if exists (select 1 from public.conteos where codigo = v_codigo) then
      v_codigo := v_codigo || '-' || substr(p_hoja::text, 1, 4);
    end if;
    insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en, cerrado_en, enviado_por, enviado_en, nota)
    values (v_codigo, v_bodega, 'fefo', 'cerrado', v_yo, now(), now(), v_yo,
            ((v_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota'),
            'Inventario fiscal · Hoja ' || v_num || case when v_equipos = 1 then ' · lo aprobado por el fiscal, contado por una sola persona (sin cruce)' else ' · lo aprobado por el fiscal (coincidente entre las dos personas, o el conteo que el fiscal dejó como definitivo)' end)
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  delete from public.conteo_modulos where conteo_id = v_conteo;
  v_ren := 0;
  for rg in
    select c.id as cid, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
           c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en, c.contado_por, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0) as total
      from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja and c.ubicacion_id = any (v_ok)
       -- De cada módulo se toma el conteo del equipo que el fiscal dejó como definitivo; si no escogió, el de la persona que terminó (o el del operador).
       and c.equipo = coalesce((select r2.adoptado from public.inv_fiscal_revisiones r2 where r2.hoja_id = p_hoja and r2.ubicacion_id = c.ubicacion_id), v_eq)
     order by c.contado_en
  loop
    insert into public.conteo_lineas
      (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
       rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en, pnc_rotulo, pnc_bloqueo_mecanico)
    values (v_conteo, rg.producto_id, rg.ubicacion_id, rg.estibas, rg.cajas, rg.saldo, rg.venc_dia, rg.venc_mes, rg.venc_anio,
            null, rg.averia, rg.pnc, rg.estado_envase, rg.nota, rg.total, coalesce(rg.contado_por, v_yo), rg.contado_en, rg.pnc_rotulo, rg.pnc_bloqueo_mecanico)
    returning id into v_lid;
    -- La foto del renglón (si la hay) viaja con él a La base.
    insert into public.conteo_fotos (linea_id, conteo_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
    select v_lid, v_conteo, f.ruta, f.bytes, f.ancho, f.alto, f.tomada_en, f.lat, f.lng, f.precision_m, f.subida_por, f.subida_en
      from public.inv_fiscal_fotos f where f.conteo_id = rg.cid;
    v_ren := v_ren + 1;
  end loop;
  -- La hora real del conteo: del primer al último renglón que pasó (no la de quien aprueba).
  update public.conteos cn
     set iniciado_en = coalesce((select min(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.iniciado_en),
         cerrado_en  = coalesce((select max(l.contado_en) from public.conteo_lineas l where l.conteo_id = v_conteo), cn.cerrado_en)
   where cn.id = v_conteo;
  -- Mezclado / sin acceso de quien contó: de lo que pasó a La base y de los módulos donde nadie anotó renglones.
  insert into public.conteo_modulos (conteo_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_por, marcado_en)
  select v_conteo, m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta, m.bytes, m.ancho, m.alto, m.tomada_en, m.lat, m.lng, m.precision_m, m.user_id, m.marcado_en
    from public.inv_fiscal_modulos m
    join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
   where m.hoja_id = p_hoja
     and mi.equipo = coalesce((select r2.adoptado from public.inv_fiscal_revisiones r2 where r2.hoja_id = p_hoja and r2.ubicacion_id = m.ubicacion_id), v_eq)
     and (m.ubicacion_id = any (v_ok)
          or not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = m.ubicacion_id));

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE VE CADA PERSONA AL REVISAR: SOLO SUS RENGLONES CON DIFERENCIA
-- Compara por módulo (sin lado), material y estado (sin la fecha de vencimiento). Devuelve solo los ids de los renglones
-- de quien pregunta que no cuadran con su pareja (o que la pareja no anotó). Nunca devuelve la
-- cantidad de la pareja, y lo que solo anotó la pareja no se le muestra: lo resuelve el fiscal.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_diferencias(uuid);
create function public.inv_fiscal_mis_diferencias(p_hoja uuid)
returns table (conteo_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select m.equipo from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.user_id = auth.uid()
  ), t as (
    select c.id, c.contado_por, c.equipo, c.producto_id,
           regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo,
           c.estado_envase as ee, c.averia as av, c.pnc as pn,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g as (
    -- Se compara módulo, código y estado (sin la fecha de vencimiento).
    select modulo, producto_id, ee, av, pn, equipo, sum(cajas) as cajas from t group by 1, 2, 3, 4, 5, 6
  )
  select t.id
    from t
    join yo on yo.equipo = t.equipo
   where t.contado_por = auth.uid()
     and not exists (
       select 1 from g mi join g otro
         on otro.modulo = mi.modulo and otro.producto_id = mi.producto_id and otro.ee is not distinct from mi.ee and otro.av = mi.av and otro.pn = mi.pn
        and otro.equipo <> mi.equipo
       where mi.modulo = t.modulo and mi.producto_id = t.producto_id and mi.ee is not distinct from t.ee and mi.av = t.av and mi.pn = t.pn
         and mi.equipo = t.equipo and otro.cajas = mi.cajas
     )
$$;
revoke all on function public.inv_fiscal_mis_diferencias(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_diferencias(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE LA GENTE MARCÓ DE CADA MÓDULO (para el fiscal que valida)
-- «Mezclado» y «sin acceso», con la foto de evidencia y quién lo marcó. Solo lo ve quien edita «Inventario fiscal».
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_modulos_hoja(uuid);
create function public.inv_fiscal_modulos_hoja(p_hoja uuid)
returns table (ubicacion_id uuid, ubicacion text, equipo text, mezclado boolean, sin_acceso boolean, ruta text, tomada_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Esto requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
    select m.ubicacion_id, u.clave, mi.equipo, m.mezclado, m.sin_acceso, m.ruta, m.tomada_en
      from public.inv_fiscal_modulos m
      join public.ubicaciones u on u.id = m.ubicacion_id
      join public.inv_fiscal_miembros mi on mi.hoja_id = m.hoja_id and mi.user_id = m.user_id
     where m.hoja_id = p_hoja and (m.mezclado or m.sin_acceso)
     order by u.clave, mi.equipo;
end $$;
revoke all on function public.inv_fiscal_modulos_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_modulos_hoja(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LAS FOTOS DE LOS RENGLONES (para el fiscal que valida): avería, PNC o cualquier renglón con foto
-- Solo lo ve quien edita «Inventario fiscal». El cruce no dice quién anotó cada renglón, pero la foto sí lleva su equipo.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_fotos_hoja(uuid);
create function public.inv_fiscal_fotos_hoja(p_hoja uuid)
returns table (conteo_id uuid, ubicacion_id uuid, ubicacion text, equipo text, sku text, averia boolean, pnc boolean, ruta text, tomada_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Esto requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
    select c.id, c.ubicacion_id, u.clave, c.equipo, p.sku, c.averia, c.pnc, f.ruta, f.tomada_en
      from public.inv_fiscal_fotos f
      join public.inv_fiscal_conteos c on c.id = f.conteo_id
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     order by u.clave, p.sku, c.equipo;
end $$;
revoke all on function public.inv_fiscal_fotos_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_fotos_hoja(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LAS REVISIONES DE UN INVENTARIO (ahora con el conteo que el fiscal dejó como definitivo, si lo hizo)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_revisiones(uuid);
create function public.inv_fiscal_revisiones(p_fiscal uuid)
returns table (
  hoja_id uuid, numero integer, ubicacion_id uuid, ubicacion text, estado text, ronda integer, nota text,
  ol_envio boolean, bavaria_envio boolean, pedido_en timestamptz, aprobado_en timestamptz, adoptado text, compensado boolean
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
         r.pedido_en, r.aprobado_en, r.adoptado, r.compensado
    from public.inv_fiscal_revisiones r
    join public.inv_fiscal_hojas h on h.id = r.hoja_id
    join public.ubicaciones u on u.id = r.ubicacion_id
   where h.fiscal_id = p_fiscal
   order by h.numero, u.clave;
end $$;
revoke all on function public.inv_fiscal_revisiones(uuid) from public, anon;
grant execute on function public.inv_fiscal_revisiones(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- REABRIR UNA HOJA TERMINADA: SOLO CON EL OK DEL FISCAL
-- La persona pide que se la reabran; el fiscal (permiso «Inventario fiscal») da el OK; solo entonces la hoja se puede reabrir.
-- ---------------------------------------------------------------------
create table if not exists public.inv_fiscal_reaperturas (
  hoja_id        uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  user_id        uuid not null references public.perfiles(id) on delete cascade,
  pedido_en      timestamptz,
  autorizado_por uuid references public.perfiles(id) on delete set null,
  autorizado_en  timestamptz,
  primary key (hoja_id, user_id)
);
alter table public.inv_fiscal_reaperturas enable row level security;
revoke all on public.inv_fiscal_reaperturas from public, anon, authenticated;

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
    -- Reabrir pide el OK del fiscal.
    if exists (select 1 from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo)
       and not exists (select 1 from public.inv_fiscal_reaperturas r
                        where r.hoja_id = p_hoja and r.user_id = v_yo and r.autorizado_en is not null) then
      raise exception 'Para reabrir tu hoja hace falta el OK del fiscal. Pídeselo con «Pedir que me reabran la hoja».';
    end if;
    delete from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo;
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
  end if;
end $$;
revoke all on function public.inv_fiscal_terminar(uuid, boolean) from public, anon;
grant execute on function public.inv_fiscal_terminar(uuid, boolean) to authenticated;

drop function if exists public.inv_fiscal_reabrir_pedir(uuid);
create function public.inv_fiscal_reabrir_pedir(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_yo uuid := auth.uid(); v_estado text;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select f.estado into v_estado
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_estado is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if not exists (select 1 from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo) then
    raise exception 'Tu hoja no está terminada: ya puedes anotar.';
  end if;
  insert into public.inv_fiscal_reaperturas (hoja_id, user_id, pedido_en) values (p_hoja, v_yo, now())
    on conflict (hoja_id, user_id) do update set pedido_en = coalesce(public.inv_fiscal_reaperturas.pedido_en, now());
end $$;
revoke all on function public.inv_fiscal_reabrir_pedir(uuid) from public, anon;
grant execute on function public.inv_fiscal_reabrir_pedir(uuid) to authenticated;

drop function if exists public.inv_fiscal_mi_reapertura(uuid);
create function public.inv_fiscal_mi_reapertura(p_hoja uuid)
returns table (pedido_en timestamptz, autorizado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.pedido_en, r.autorizado_en from public.inv_fiscal_reaperturas r where r.hoja_id = p_hoja and r.user_id = auth.uid()
$$;
revoke all on function public.inv_fiscal_mi_reapertura(uuid) from public, anon;
grant execute on function public.inv_fiscal_mi_reapertura(uuid) to authenticated;

-- El fiscal da el OK (o lo quita) para que UNA de las dos personas de la hoja pueda reabrirla.
drop function if exists public.inv_fiscal_reabrir_autorizar(uuid, text, boolean);
create function public.inv_fiscal_reabrir_autorizar(p_hoja uuid, p_equipo text, p_si boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_estado text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Autorizar la reapertura requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if p_equipo not in ('OL', 'BAVARIA') then raise exception 'Escoge el operador o Bavaria.'; end if;
  select m.user_id, f.estado into v_user, v_estado
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.equipo = p_equipo;
  if v_user is null then raise exception 'Esa hoja no tiene a esa persona.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if coalesce(p_si, true) then
    if not exists (select 1 from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_user) then
      raise exception 'Esa persona no ha terminado su hoja: ya puede anotar.';
    end if;
    insert into public.inv_fiscal_reaperturas (hoja_id, user_id, pedido_en, autorizado_por, autorizado_en)
    values (p_hoja, v_user, now(), auth.uid(), now())
    on conflict (hoja_id, user_id) do update set autorizado_por = auth.uid(), autorizado_en = now();
  else
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_user;
  end if;
end $$;
revoke all on function public.inv_fiscal_reabrir_autorizar(uuid, text, boolean) from public, anon;
grant execute on function public.inv_fiscal_reabrir_autorizar(uuid, text, boolean) to authenticated;

-- Para el fiscal: quién pidió reabrir y a quién ya le dio el OK, por hoja.
drop function if exists public.inv_fiscal_reaperturas(uuid);
create function public.inv_fiscal_reaperturas(p_fiscal uuid)
returns table (hoja_id uuid, numero integer, equipo text, pedido_en timestamptz, autorizado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Esto requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query
    select r.hoja_id, h.numero, m.equipo, r.pedido_en, r.autorizado_en
      from public.inv_fiscal_reaperturas r
      join public.inv_fiscal_hojas h on h.id = r.hoja_id
      join public.inv_fiscal_miembros m on m.hoja_id = r.hoja_id and m.user_id = r.user_id
     where h.fiscal_id = p_fiscal
     order by h.numero, m.equipo;
end $$;
revoke all on function public.inv_fiscal_reaperturas(uuid) from public, anon;
grant execute on function public.inv_fiscal_reaperturas(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- MIS HOJAS, ahora con la calle que puso el fiscal (las dos personas cuentan esa)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text,
  hoja_id uuid, puede_contar boolean, mis_renglones bigint,
  termine boolean, pareja_termino boolean, calle text
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
         exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = o.user_id),
         h.calle
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
-- LOS BORRADORES DE TODOS EN «LA BASE» (solo para mirar)
-- Lo que las personas llevan contado en el inventario fiscal y todavía no pasó a La base, de TODAS las personas, con el
-- mismo formato de renglón que usa La base. Solo lo ve quien tiene el permiso del inventario fiscal (el conteo es a
-- ciegas entre la pareja: ellas no se ven entre sí).
-- ---------------------------------------------------------------------
-- ¿El módulo de esta ubicación ya lo aprobó el fiscal y ya está resuelto (va a La base con el conteo definitivo)?
-- Sirve para que lo que anotó la OTRA persona de la pareja en ese módulo deje de verse como borrador y le quede en cero.
drop function if exists public.inv_fiscal_modulo_resuelto(uuid, uuid);
create function public.inv_fiscal_modulo_resuelto(p_hoja uuid, p_ubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inv_fiscal_revisiones r
      join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = (select regexp_replace(u.clave, '_(IZQ|DER)$', '') from public.ubicaciones u where u.id = p_ubi)
       and (r.adoptado is not null or not public.inv_fiscal_modulo_difiere(p_hoja, r.ubicacion_id, r.compensado))
  )
$$;
revoke all on function public.inv_fiscal_modulo_resuelto(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_modulo_resuelto(uuid, uuid) to authenticated;

-- Lo mío en esta hoja: lo que ya está en La base (o cuyo módulo ya resolvió el fiscal) se marca «en_base» y a mi pantalla le queda en cero.
drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz, estado_envase text,
  averia boolean, pnc boolean, pnc_rotulo boolean, pnc_bloqueo_mecanico boolean, en_base boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en, c.estado_envase,
         c.averia, c.pnc, c.pnc_rotulo, c.pnc_bloqueo_mecanico,
         (exists (select 1 from public.inv_fiscal_hojas h
                    join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id
                   where h.id = c.hoja_id)
          or public.inv_fiscal_modulo_resuelto(c.hoja_id, c.ubicacion_id))
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

drop function if exists public.inv_fiscal_borradores_base();
create function public.inv_fiscal_borradores_base()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_filas jsonb; v_conteos jsonb;
begin
  if not public.puede_ver('/inventario/fiscal') then
    return jsonb_build_object('filas', '[]'::jsonb, 'conteos', '[]'::jsonb);
  end if;
  with b as (
    select c.id, h.id as hoja_id, h.numero, f.fecha, c.ubicacion_id, c.producto_id, c.estibas, c.saldo, c.cajas,
           c.venc_dia, c.venc_mes, c.venc_anio, c.averia, c.pnc, c.estado_envase, c.nota, c.contado_en,
           u.clave, u.calle, u.modulo, u.lado, p.sku, p.nombre as material, p.tipo_material, p.cajas_por_estiba,
           pe.nombre as conto,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as total
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_hojas h on h.id = c.hoja_id
      join public.inv_fiscales f on f.id = h.fiscal_id
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
      left join public.perfiles pe on pe.id = c.contado_por
     where f.estado = 'abierto'
       and not exists (select 1 from public.conteo_lineas cl where cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id)
        -- Ni lo de la otra persona de la pareja en un módulo que el fiscal ya aprobó: eso ya está en La base con el conteo definitivo.
        and not public.inv_fiscal_modulo_resuelto(h.id, c.ubicacion_id)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'conteo_id', b.hoja_id,
      'conteo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
      'estado', 'en_proceso', 'codigo', b.sku, 'material', b.material, 'tipo_material', b.tipo_material,
      'familia', null, 'factor_estibado', b.cajas_por_estiba,
      'ubicacion', b.clave, 'calle', b.calle, 'modulo', b.modulo, 'lado', b.lado,
      'estibas', b.estibas, 'cajas', b.cajas, 'saldo', b.saldo, 'total_cajas', b.total,
      'total_estibas', case when coalesce(b.cajas_por_estiba, 0) > 0 then round(b.total::numeric / b.cajas_por_estiba, 2) else 0 end,
      'capacidad', null, 'venc_dia', b.venc_dia, 'venc_mes', b.venc_mes, 'venc_anio', b.venc_anio,
      'fab_dia', null, 'fab_mes', null, 'fab_anio', null, 'fabricacion', null, 'vencimiento', null,
      'dias_para_vencer', null, 'dias_para_salir', null, 'rotacion', null,
      'averia', coalesce(b.averia, false), 'pnc', coalesce(b.pnc, false), 'estado_envase', b.estado_envase, 'nota', b.nota,
      'ubicacion_combinada', regexp_replace(b.clave, '_(IZQ|DER)$', ''), 'conto', b.conto, 'contado_en', b.contado_en,
      'producto_id', b.producto_id, 'ubicacion_id', b.ubicacion_id) order by b.contado_en desc) from b), '[]'::jsonb),
    coalesce((select jsonb_agg(x) from (
      select jsonb_build_object(
        'id', b.hoja_id,
        'codigo', 'FISCAL-' || to_char(b.fecha, 'YYYYMMDD') || '-H' || lpad(b.numero::text, 2, '0') || ' · en conteo',
        'estado', 'en_proceso', 'bodega', '', 'responsable', 'Inventario fiscal · Hoja ' || b.numero,
        'fecha_analisis', b.fecha, 'enviado_en', null, 'envio_nombre', null,
        'renglones', count(*), 'ubicaciones', count(distinct b.ubicacion_id), 'total_cajas', sum(b.total)) as x
        from b group by b.hoja_id, b.numero, b.fecha) q), '[]'::jsonb)
  into v_filas, v_conteos;
  return jsonb_build_object('filas', v_filas, 'conteos', v_conteos);
end $$;
revoke all on function public.inv_fiscal_borradores_base() from public, anon;
grant execute on function public.inv_fiscal_borradores_base() to authenticated;

-- ---------------------------------------------------------------------
-- LA BD DEL FISCAL: todo lo que contó cada persona de una hoja, renglón por renglón, con quién, la hora real y la foto.
-- Solo para quien tiene el permiso «Inventario fiscal» (ver). Es lo que se lee lado a lado en la pestaña BD del fiscal.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_bd_hoja(uuid);
create function public.inv_fiscal_bd_hoja(p_hoja uuid)
returns table (
  id uuid, equipo text, persona text, contado_en timestamptz, ubicacion_id uuid, ubicacion text, modulo text,
  sku text, material text, venc_dia integer, venc_mes integer, venc_anio integer,
  estibas integer, saldo integer, cajas integer, cajas_por_estiba integer, total_cajas bigint,
  estado_envase text, averia boolean, pnc boolean, nota text, ruta text, en_base boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'La BD del fiscal requiere el permiso «Inventario fiscal»';
  end if;
  return query
  select c.id, c.equipo::text, pe.nombre::text, c.contado_en, c.ubicacion_id, u.clave::text,
         regexp_replace(u.clave, '_(IZQ|DER)$', '')::text,
         p.sku::text, p.nombre::text, c.venc_dia::integer, c.venc_mes::integer, c.venc_anio::integer,
         coalesce(c.estibas, 0)::integer, coalesce(c.saldo, 0)::integer, coalesce(c.cajas, 0)::integer, coalesce(p.cajas_por_estiba, 0)::integer,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.estado_envase::text, coalesce(c.averia, false), coalesce(c.pnc, false), c.nota::text,
         (select f.ruta::text from public.inv_fiscal_fotos f where f.conteo_id = c.id limit 1),
         (exists (select 1 from public.inv_fiscal_hojas h
                    join public.conteo_lineas cl on cl.conteo_id = h.conteo_id and cl.ubicacion_id = c.ubicacion_id
                   where h.id = c.hoja_id)
          or public.inv_fiscal_modulo_resuelto(c.hoja_id, c.ubicacion_id))
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
    left join public.perfiles pe on pe.id = c.contado_por
   where c.hoja_id = p_hoja
   order by u.clave, p.sku, c.equipo, c.contado_en;
end $$;
revoke all on function public.inv_fiscal_bd_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_bd_hoja(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_mis_diferencias(uuid)') is null
     or to_regprocedure('public.inv_fiscal_revision_enviar_modulo(uuid,uuid[],jsonb)') is null
     or to_regprocedure('public.inv_fiscal_validar(uuid,uuid[],text)') is null
     or to_regprocedure('public.inv_fiscal_aprobar(uuid,uuid[],boolean,text,boolean)') is null
     or to_regprocedure('public.inv_fiscal_modulo_difiere(uuid,uuid,boolean)') is null
     or to_regprocedure('public.inv_fiscal_modulos_hoja(uuid)') is null
     or to_regprocedure('public.inv_fiscal_fotos_hoja(uuid)') is null
     or to_regprocedure('public.inv_fiscal_reabrir_autorizar(uuid,text,boolean)') is null
     or to_regprocedure('public.inv_fiscal_reaperturas(uuid)') is null
     or to_regprocedure('public.inv_fiscal_borradores_base()') is null
     or to_regprocedure('public.inv_fiscal_bd_hoja(uuid)') is null
     or to_regprocedure('public.inv_fiscal_cruce(uuid)') is null
     or to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null then
    raise exception 'No quedaron las funciones de validar por módulo. Revisa que corrieron antes validar y consolidar.';
  end if;
end $$;

commit;
select 'OK · validar por calle y módulo listo' as resultado;
