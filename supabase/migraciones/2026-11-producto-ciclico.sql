-- =====================================================================
-- INVENTARIO · PRODUCTO — EL INVENTARIO CÍCLICO Y SU ANÁLISIS DE DIFERENCIA
--
-- «Dentro de Producto un módulo, no fiscal sino que se llame CÍCLICO: se elige lo mismo del fiscal (la
--  familia, las parejas), luego habilitar el Contar; en Contar solo se habilita el cíclico y cualquiera de
--  los dos da clic para ir cruzando: solo SKU y cantidad. Luego otro módulo, el ANÁLISIS DE DIFERENCIA,
--  donde se toma el conteo de Bavaria y se compara con la existencia.»
--
-- EL CÍCLICO ES UN INVENTARIO FISCAL CON OTRO TIPO. Mismas tablas (inv_fiscales, hojas, parejas, conteos),
-- mismo Contar y mismo cruce; lo que cambia es quién lo arma (permiso de Producto, no el del fiscal), que
-- cualquiera de la pareja puede cruzar en cualquier momento y que no pasa a La base: su conteo de Bavaria va
-- al análisis de diferencia de Producto.
--
--   inv_fiscales.tipo     'FISCAL' (todo lo de antes) o 'CICLICO'.
--   inv_ciclico_guardar   arma o edita un cíclico (hojas, familias, parejas).
--   inv_ciclico_publicar  lo muestra (o lo quita) en Contar de Producto.
--   inv_fiscal_tipos      el tipo de unos inventarios: Contar separa el fiscal del cíclico.
--   inv_ciclico_cruce     el cruce de una hoja: lo pide cualquiera de la pareja (o quien ve Producto).
--   inv_ciclico_conteo    lo contado de un cíclico, por equipo, sitio y código, en unidades.
--   prod_dif_*            el análisis de diferencia de Producto: novedades (plantilla), lo guardado y las
--                         observaciones / ajustes hechos en SAP, por inventario cíclico.
--
-- Permisos (Admin → Roles): «Cíclico» (/inventario/producto/ciclico), «Contar» (/inventario/producto/contar)
-- y «Análisis de diferencia» (/inventario/producto/analisis).
--
-- Se puede correr varias veces. Necesita lo del fiscal ya corrido (hasta 2026-11-fiscal-familias.sql y
-- 2026-11-fiscal-unidades.sql).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. EL TIPO
-- ---------------------------------------------------------------------
alter table public.inv_fiscales add column if not exists tipo text not null default 'FISCAL';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inv_fiscales_tipo_ok') then
    alter table public.inv_fiscales add constraint inv_fiscales_tipo_ok check (tipo in ('FISCAL', 'CICLICO'));
  end if;
end $$;
create index if not exists inv_fiscales_tipo_idx on public.inv_fiscales (tipo, fecha desc);

-- ¿Ve el cíclico? (Cíclico o el análisis de Producto.)
create or replace function public.inv_ciclico_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/producto/analisis') <> 'ninguno'
$$;
grant execute on function public.inv_ciclico_ve() to authenticated;

-- ---------------------------------------------------------------------
-- 2. QUIÉN LEE: el fiscal como siempre; el cíclico también quien tiene Producto.
-- ---------------------------------------------------------------------
drop policy if exists inv_fiscales_ver on public.inv_fiscales;
create policy inv_fiscales_ver on public.inv_fiscales
  for select to authenticated
  using (public.puede_ver('/inventario/fiscal') or (tipo = 'CICLICO' and public.inv_ciclico_ve()));

drop policy if exists inv_fiscal_hojas_ver on public.inv_fiscal_hojas;
create policy inv_fiscal_hojas_ver on public.inv_fiscal_hojas
  for select to authenticated
  using (public.puede_ver('/inventario/fiscal')
         or (public.inv_ciclico_ve() and exists (select 1 from public.inv_fiscales f where f.id = fiscal_id and f.tipo = 'CICLICO')));

drop policy if exists inv_fiscal_miembros_ver on public.inv_fiscal_miembros;
create policy inv_fiscal_miembros_ver on public.inv_fiscal_miembros
  for select to authenticated
  using (public.puede_ver('/inventario/fiscal')
         or (public.inv_ciclico_ve() and exists (select 1 from public.inv_fiscales f where f.id = fiscal_id and f.tipo = 'CICLICO')));

-- ---------------------------------------------------------------------
-- 3. EL TIPO DE UNOS INVENTARIOS (para que Contar separe el fiscal del cíclico)
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_tipos(uuid[]);
create function public.inv_fiscal_tipos(p_ids uuid[])
returns table (id uuid, tipo text)
language sql stable security definer set search_path = public
as $$ select f.id, f.tipo from public.inv_fiscales f where f.id = any (p_ids) $$;
revoke all on function public.inv_fiscal_tipos(uuid[]) from public, anon;
grant execute on function public.inv_fiscal_tipos(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 4. EL AVANCE (lo usa el plan): también para quien tiene Producto, pero solo de los cíclicos.
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_avance()
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
declare v_fiscal boolean := public.puede_ver('/inventario/fiscal');
begin
  if not v_fiscal and not public.inv_ciclico_ve() then
    raise exception 'Ver el avance del inventario requiere el permiso «Inventario fiscal» o «Cíclico» (Roles)';
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
    join public.inv_fiscales f on f.id = h.fiscal_id
   where v_fiscal or f.tipo = 'CICLICO'
   order by h.fiscal_id, h.numero;
end $$;
revoke all on function public.inv_fiscal_avance() from public, anon;
grant execute on function public.inv_fiscal_avance() to authenticated;

-- ---------------------------------------------------------------------
-- 5. ARMAR / EDITAR UN CÍCLICO (el mismo armado del fiscal: hojas, calle, familias y parejas)
-- ---------------------------------------------------------------------
drop function if exists public.inv_ciclico_guardar(uuid, uuid, text, date, jsonb);
create function public.inv_ciclico_guardar(
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
  v_tipo    text;
  v_h       jsonb;
  v_num     integer;
  v_nums    integer[] := '{}';
  v_hoja    uuid;
  v_p       uuid;
  v_ol      uuid;
  v_ba      uuid;
  v_calle   text;
  v_fams    text[];
begin
  if public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'editar' then
    raise exception 'Armar el inventario cíclico requiere el permiso «Cíclico» de Producto (Roles)';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'El inventario cíclico necesita un nombre'; end if;
  if p_fecha is null then raise exception 'El inventario cíclico necesita una fecha'; end if;
  if p_hojas is null or jsonb_typeof(p_hojas) <> 'array' or jsonb_array_length(p_hojas) = 0 then
    raise exception 'El inventario cíclico necesita al menos una hoja';
  end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then raise exception 'Esa bodega no existe'; end if;

  /* Se revisa todo ANTES de escribir: o queda completo o no queda nada. */
  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := nullif(v_h ->> 'numero', '')::integer;
    if v_num is null or v_num < 1 then raise exception 'Cada hoja lleva un número desde el 1'; end if;
    if v_num = any (v_nums) then raise exception 'La hoja % está repetida', v_num; end if;
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
    insert into public.inv_fiscales (bodega_id, nombre, fecha, tipo)
         values (p_bodega, btrim(p_nombre), p_fecha, 'CICLICO')
      returning id into v_id;
  else
    select estado, tipo into v_estado, v_tipo from public.inv_fiscales where id = v_id for update;
    if v_estado is null then raise exception 'Ese inventario cíclico ya no existe'; end if;
    if v_tipo <> 'CICLICO' then raise exception 'Ese inventario es fiscal: se edita en el Plan fiscal'; end if;
    if v_estado <> 'abierto' and not public.manda() then raise exception 'Ese inventario cíclico ya está cerrado'; end if;
    update public.inv_fiscales set nombre = btrim(p_nombre), fecha = p_fecha, bodega_id = p_bodega where id = v_id;
    delete from public.inv_fiscal_hojas where fiscal_id = v_id and numero <> all (v_nums);
    delete from public.inv_fiscal_miembros where fiscal_id = v_id;
  end if;

  for v_h in select * from jsonb_array_elements(p_hojas) loop
    v_num := (v_h ->> 'numero')::integer;
    v_calle := nullif(upper(btrim(coalesce(v_h ->> 'calle', ''))), '');
    if v_calle is not null and length(v_calle) > 20 then raise exception 'La calle de la hoja % es demasiado larga', v_num; end if;
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
revoke all on function public.inv_ciclico_guardar(uuid, uuid, text, date, jsonb) from public, anon;
grant execute on function public.inv_ciclico_guardar(uuid, uuid, text, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. HABILITAR EL CONTAR (mostrarlo / quitarlo en Contar de Producto)
-- ---------------------------------------------------------------------
drop function if exists public.inv_ciclico_publicar(uuid, boolean);
create function public.inv_ciclico_publicar(p_id uuid, p_publicar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_tipo text;
begin
  if public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'editar' then
    raise exception 'Habilitar el Contar del cíclico requiere el permiso «Cíclico» de Producto (Roles)';
  end if;
  select estado, tipo into v_estado, v_tipo from public.inv_fiscales where id = p_id for update;
  if v_estado is null then raise exception 'Ese inventario cíclico ya no existe'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Ese inventario es fiscal: se muestra desde el Plan fiscal'; end if;
  if coalesce(p_publicar, true) then
    if v_estado <> 'abierto' then raise exception 'Ese inventario cíclico ya está cerrado: no se puede mostrar en Contar'; end if;
    if not exists (select 1 from public.inv_fiscal_miembros where fiscal_id = p_id) then
      raise exception 'Ese inventario no tiene a nadie asignado todavía: no le aparecería a ninguna persona en Contar';
    end if;
    update public.inv_fiscales set publicado_en = now(), publicado_por = auth.uid() where id = p_id;
  else
    update public.inv_fiscales set publicado_en = null, publicado_por = null where id = p_id;
  end if;
end $$;
revoke all on function public.inv_ciclico_publicar(uuid, boolean) from public, anon;
grant execute on function public.inv_ciclico_publicar(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 7. EL CRUCE DE UNA HOJA DEL CÍCLICO: lo pide cualquiera de la pareja, cuando quiera («ir cruzando»).
--    Mismo criterio del fiscal: sitio + código + estado, en unidades exactas, sin la fecha de vencimiento.
-- ---------------------------------------------------------------------
drop function if exists public.inv_ciclico_cruce(uuid);
create function public.inv_ciclico_cruce(p_hoja uuid)
returns table (
  ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  venc_dia smallint, venc_mes smallint, venc_anio smallint,
  cajas_ol bigint, cajas_bavaria bigint, diferencia bigint, estado text, estado_envase text, averia boolean, pnc boolean,
  unidades_ol bigint, unidades_bavaria bigint, dif_unidades bigint, unidades_por_caja integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_tipo text;
begin
  select f.tipo into v_tipo from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_tipo is null then raise exception 'Esa hoja no existe.'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Esa hoja es de un inventario fiscal: el cruce lo hace el fiscal.'; end if;
  if not exists (select 1 from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.user_id = auth.uid())
     and not public.inv_ciclico_ve() then
    raise exception 'Solo la pareja de la hoja (o quien ve Producto) puede cruzarla.';
  end if;

  return query
  with t as (
    select c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo,
           min(case when c.venc_dia is not null then c.venc_anio * 10000 + c.venc_mes * 100 + c.venc_dia end) as venc,
           sum(public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja))::bigint as cajas,
           max(public.inv_fiscal_upc(p.unidades_por_caja)) as upc
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.estado_envase, c.averia, c.pnc, m.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA'),
  j as (
    select coalesce(o.ubicacion_id, b.ubicacion_id) as ubi, coalesce(o.producto_id, b.producto_id) as prod,
           least(o.venc, b.venc) as vc,
           coalesce(o.estado_envase, b.estado_envase) as ee, coalesce(o.averia, b.averia) as av, coalesce(o.pnc, b.pnc) as pn,
           o.cajas as co, b.cajas as cb, coalesce(o.upc, b.upc) as upc
      from o full join b
        on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
       and o.estado_envase is not distinct from b.estado_envase
       and o.averia = b.averia and o.pnc = b.pnc
  )
  select j.ubi, u.clave, j.prod, pr.sku, pr.nombre,
         (j.vc % 100)::smallint, ((j.vc / 100) % 100)::smallint, (j.vc / 10000)::smallint, j.co / j.upc, j.cb / j.upc,
         ((coalesce(j.co, 0) - coalesce(j.cb, 0)) / j.upc)::bigint,
         case when j.co is null then 'SOLO_BAVARIA'
              when j.cb is null then 'SOLO_OL'
              when j.co = j.cb then 'COINCIDE'
              else 'DIFIERE' end,
         j.ee, j.av, j.pn,
         j.co % j.upc, j.cb % j.upc, (coalesce(j.co, 0) - coalesce(j.cb, 0))::bigint, j.upc
    from j
    join public.ubicaciones u on u.id = j.ubi
    join public.productos pr on pr.id = j.prod
   order by (case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end), u.clave, pr.sku, j.vc;
end $$;
revoke all on function public.inv_ciclico_cruce(uuid) from public, anon;
grant execute on function public.inv_ciclico_cruce(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7b. TERMINAR / REABRIR LA HOJA: igual que en el fiscal, pero el CÍCLICO no se termina ni lo aprueba nadie:
--     la pareja cruza hasta que todo coincida (ver 2026-11-producto-ciclico-sin-aprobar.sql).
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_terminar(p_hoja uuid, p_terminado boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_estado text; v_pub timestamptz; v_fecha date; v_tipo text;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select m.equipo, f.estado, f.publicado_en, f.fecha, f.tipo
    into v_equipo, v_estado, v_pub, v_fecha, v_tipo
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;

  /* EL CÍCLICO NO SE TERMINA: se cruza hasta que todo coincida. Reabrir sí (suelta un «terminé» viejo). */
  if v_tipo = 'CICLICO' then
    if coalesce(p_terminado, true) then
      raise exception 'En el cíclico la hoja no se termina ni la aprueba nadie: sigan cruzando hasta que todo coincida.';
    end if;
    delete from public.inv_fiscal_terminos where hoja_id = p_hoja and user_id = v_yo;
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
    return;
  end if;

  if v_pub is null then raise exception 'Este inventario no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario ya está cerrado.'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then
    raise exception 'El fiscal ya culminó tu hoja: no hay nada más que hacer en ella.';
  end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if coalesce(p_terminado, true) then
    if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo) then
      raise exception 'Anota al menos un renglón antes de terminar tu hoja.';
    end if;
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (p_hoja, v_yo)
      on conflict (hoja_id, user_id) do nothing;
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
  else
    -- En el fiscal, reabrir pide el OK del fiscal.
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

-- ---------------------------------------------------------------------
-- 8. LO CONTADO DE UN CÍCLICO (para el análisis de diferencia): por equipo, sitio y código, en UNIDADES.
-- ---------------------------------------------------------------------
drop function if exists public.inv_ciclico_conteo(uuid);
create function public.inv_ciclico_conteo(p_fiscal uuid)
returns table (equipo text, hoja integer, ubicacion text, sku text, material text, familia text, unidades bigint, unidades_por_caja integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.inv_ciclico_ve() then
    raise exception 'Ver lo contado del cíclico requiere el permiso «Análisis de diferencia» o «Cíclico» de Producto (Roles)';
  end if;
  if not exists (select 1 from public.inv_fiscales where id = p_fiscal and tipo = 'CICLICO') then
    raise exception 'Ese inventario cíclico no existe.';
  end if;
  return query
  select m.equipo, h.numero, u.clave, p.sku, p.nombre, p.familia,
         sum(public.inv_fiscal_tu(c.estibas, c.saldo, c.cajas, c.unidades, p.cajas_por_estiba, p.unidades_por_caja))::bigint,
         max(public.inv_fiscal_upc(p.unidades_por_caja))
    from public.inv_fiscal_conteos c
    join public.inv_fiscal_hojas h on h.id = c.hoja_id
    join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
    join public.productos p on p.id = c.producto_id
    join public.ubicaciones u on u.id = c.ubicacion_id
   where h.fiscal_id = p_fiscal
   group by m.equipo, h.numero, u.clave, p.sku, p.nombre, p.familia
   order by p.sku, u.clave;
end $$;
revoke all on function public.inv_ciclico_conteo(uuid) from public, anon;
grant execute on function public.inv_ciclico_conteo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. EL ANÁLISIS DE DIFERENCIA DE PRODUCTO (por inventario cíclico)
--   prod_dif_novedades  la plantilla subida: la ZEXI PRODUCTO (existencia) y las demás novedades.
--   prod_dif_guardado   la foto del análisis al darle «Guardar» (de ahí salen los ajustes) y el final.
--   prod_dif_obs        la observación de cada código y el ajuste hecho en SAP.
-- ---------------------------------------------------------------------
create table if not exists public.prod_dif_novedades (
  id         bigserial primary key,
  fiscal_id  uuid not null references public.inv_fiscales(id) on delete cascade,
  tipo       text not null,
  lado       text not null check (lado in ('CONTEO', 'SAP', 'NO SUMA')),
  documento  text,
  codigo     text not null,
  unidades   numeric(16,2) not null,
  archivo    text,
  subido_por uuid default auth.uid(),
  subido_en  timestamptz not null default now()
);
create index if not exists prod_dif_novedades_fiscal_idx on public.prod_dif_novedades (fiscal_id);

create table if not exists public.prod_dif_guardado (
  fiscal_id    uuid primary key references public.inv_fiscales(id) on delete cascade,
  fecha        date not null,
  filas        jsonb not null,
  sap          numeric(16,2) not null default 0,
  conteo       numeric(16,2) not null default 0,
  guardado_por uuid default auth.uid(),
  guardado_en  timestamptz not null default now(),
  final        jsonb,
  final_en     timestamptz,
  final_por    uuid
);

create table if not exists public.prod_dif_obs (
  fiscal_id       uuid not null references public.inv_fiscales(id) on delete cascade,
  codigo          text not null,
  observacion     text not null default '',
  ajuste_hecho    numeric(16,2),
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  primary key (fiscal_id, codigo)
);

do $$
declare t text;
begin
  foreach t in array array['prod_dif_novedades', 'prod_dif_guardado', 'prod_dif_obs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select using (public.mi_nivel_pantalla(''/inventario/producto/analisis'') <> ''ninguno'')', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('create policy %I on public.%I for insert with check (public.mi_nivel_pantalla(''/inventario/producto/analisis'') = ''editar'')', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('create policy %I on public.%I for update using (public.mi_nivel_pantalla(''/inventario/producto/analisis'') = ''editar'')', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for delete using (public.mi_nivel_pantalla(''/inventario/producto/analisis'') = ''editar'')', t || '_del', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage, select on sequence public.prod_dif_novedades_id_seq to authenticated;

do $$
begin
  if to_regprocedure('public.inv_ciclico_guardar(uuid,uuid,text,date,jsonb)') is null
     or to_regprocedure('public.inv_ciclico_cruce(uuid)') is null
     or to_regprocedure('public.inv_ciclico_conteo(uuid)') is null then
    raise exception 'No quedaron las funciones del inventario cíclico.';
  end if;
  raise notice 'Listo: Producto · Cíclico, Contar y Análisis de diferencia.';
end $$;

commit;
select 'OK · Producto: cíclico y análisis de diferencia' as resultado;
