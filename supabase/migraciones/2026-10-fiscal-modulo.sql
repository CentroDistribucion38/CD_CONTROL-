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
-- CERRAR UNA HOJA: el fiscal la da por terminada. Lo aprobado queda en La base y nadie más anota ni cambia renglones en ella.
alter table public.inv_fiscal_hojas add column if not exists cerrada_en timestamptz;
alter table public.inv_fiscal_hojas add column if not exists cerrada_por uuid references public.perfiles(id) on delete set null;

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
         (h.cerrada_en is not null or exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = auth.uid())),
         (h.cerrada_en is not null or exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.id and t.user_id = o.user_id)),
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

-- ---------------------------------------------------------------------
-- CERRAR HOJAS
-- ---------------------------------------------------------------------
-- En una hoja cerrada no se anota, no se corrige y no se quita ningún renglón (lo pide el fiscal: ya está aprobada).
create or replace function public.inv_fiscal_conteos_hoja_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid := coalesce(new.hoja_id, old.hoja_id);
begin
  if exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja and h.cerrada_en is not null) then
    raise exception 'Esta hoja ya la cerró el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_conteos_cerrada on public.inv_fiscal_conteos;
create trigger inv_fiscal_conteos_cerrada before insert or update or delete on public.inv_fiscal_conteos
  for each row execute function public.inv_fiscal_conteos_hoja_cerrada();

-- ¿La hoja se puede cerrar? Nada en validación y todos los módulos con renglones, aprobados. Devuelve el motivo si no; null si sí.
drop function if exists public.inv_fiscal_hoja_motivo_no_cierra(uuid);
create function public.inv_fiscal_hoja_motivo_no_cierra(p_hoja uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not exists (select 1 from public.inv_fiscal_hojas where id = p_hoja) then return 'Esa hoja no existe.'; end if;
  if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja) then return 'La hoja no tiene renglones contados.'; end if;
  if exists (select 1 from public.inv_fiscal_revisiones where hoja_id = p_hoja and estado = 'A_VALIDAR') then
    return 'Todavía hay ubicaciones esperando validación.';
  end if;
  select count(distinct regexp_replace(u.clave, '_(IZQ|DER)$', '')) into v_n
    from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
   where c.hoja_id = p_hoja
     and not exists (select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
                      where r.hoja_id = p_hoja and r.estado = 'APROBADA'
                        and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = regexp_replace(u.clave, '_(IZQ|DER)$', ''));
  if v_n > 0 then return 'Quedan ' || v_n || ' módulos sin aprobar.'; end if;
  return null;
end $$;
revoke all on function public.inv_fiscal_hoja_motivo_no_cierra(uuid) from public, anon, authenticated;

drop function if exists public.inv_fiscal_cerrar_hoja(uuid);
create function public.inv_fiscal_cerrar_hoja(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_motivo text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Cerrar una hoja requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then return; end if;
  v_motivo := public.inv_fiscal_hoja_motivo_no_cierra(p_hoja);
  if v_motivo is not null then raise exception 'No se puede cerrar la hoja: %', v_motivo; end if;
  -- Lo aprobado pasa a La base (si ya estaba, se vuelve a poner igual).
  begin
    perform public.inv_fiscal_consolidar(p_hoja);
  exception when others then
    if sqlerrm not ilike '%nada que consolidar%' then raise; end if;
  end;
  update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_cerrar_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_hoja(uuid) to authenticated;

-- Cierra DE UNA todas las hojas del inventario que ya se pueden cerrar; las demás quedan como están.
drop function if exists public.inv_fiscal_cerrar_hojas(uuid);
create function public.inv_fiscal_cerrar_hojas(p_fiscal uuid)
returns table (cerradas integer, pendientes integer)
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_ok integer := 0; v_no integer := 0;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Cerrar hojas requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  for r in select h.id from public.inv_fiscal_hojas h where h.fiscal_id = p_fiscal and h.cerrada_en is null order by h.numero loop
    if public.inv_fiscal_hoja_motivo_no_cierra(r.id) is null then
      begin
        perform public.inv_fiscal_cerrar_hoja(r.id);
        v_ok := v_ok + 1;
      exception when others then
        v_no := v_no + 1;
      end;
    elsif exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = r.id) then
      v_no := v_no + 1;
    end if;
  end loop;
  return query select v_ok, v_no;
end $$;
revoke all on function public.inv_fiscal_cerrar_hojas(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_hojas(uuid) to authenticated;

drop function if exists public.inv_fiscal_reabrir_hoja(uuid);
create function public.inv_fiscal_reabrir_hoja(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Reabrir una hoja requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  update public.inv_fiscal_hojas set cerrada_en = null, cerrada_por = null where id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_reabrir_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_reabrir_hoja(uuid) to authenticated;

-- Qué hojas del inventario están cerradas (para mostrarlo en la pantalla del fiscal).
drop function if exists public.inv_fiscal_hojas_cerradas(uuid);
create function public.inv_fiscal_hojas_cerradas(p_fiscal uuid)
returns table (numero integer, cerrada_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.numero, h.cerrada_en from public.inv_fiscal_hojas h
   where h.fiscal_id = p_fiscal and h.cerrada_en is not null and public.puede_ver('/inventario/fiscal')
$$;
revoke all on function public.inv_fiscal_hojas_cerradas(uuid) from public, anon;
grant execute on function public.inv_fiscal_hojas_cerradas(uuid) to authenticated;

-- Pasar a la siguiente calle reabre la hoja si estaba cerrada.
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

  update public.inv_fiscal_hojas set calle = v_calle, cerrada_en = null, cerrada_por = null where id = p_hoja;
  delete from public.inv_fiscal_terminos where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_siguiente_calle(uuid, text) from public, anon;
grant execute on function public.inv_fiscal_siguiente_calle(uuid, text) to authenticated;

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
     or to_regprocedure('public.inv_fiscal_cerrar_hojas(uuid)') is null
     or to_regprocedure('public.inv_fiscal_cruce(uuid)') is null
     or to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null then
    raise exception 'No quedaron las funciones de validar por módulo. Revisa que corrieron antes validar y consolidar.';
  end if;
end $$;

commit;
select 'OK · validar por calle y módulo listo' as resultado;
