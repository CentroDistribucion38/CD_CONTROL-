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
-- Se puede correr dos veces. Necesita 2026-10-fiscal-validar.sql, 2026-10-fiscal-consolidar.sql y 2026-10-fiscal-estado.sql (antes de este).
-- Vuelve a crear también «consolidar» (ya no cuenta como pendiente un lado donde nadie contó).
-- =====================================================================
begin;

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
          aprobado_por = null, aprobado_en = null;
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
create function public.inv_fiscal_aprobar(p_hoja uuid, p_ubicaciones uuid[], p_forzar boolean default false)
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
    delete from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo and ubicacion_id = any (v_lista);
    for x in select * from jsonb_array_elements(p_renglones) loop
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
          (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota, estado_envase)
        values (v_fiscal, p_hoja, v_equipo, v_yo, v_u, v_prod, v_est, v_sal, v_caj, v_d, v_m, v_a,
                nullif(btrim(coalesce(x->>'nota', '')), ''), nullif(btrim(coalesce(x->>'estado', '')), ''));
      exception
        when unique_violation then
          raise exception 'Hay dos renglones iguales (mismo material, vencimiento y lado) en ese módulo.';
        when foreign_key_violation then
          raise exception 'Ese material no existe.';
      end;
    end loop;
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
create function public.inv_fiscal_modulo_difiere(p_hoja uuid, p_ubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select regexp_replace(u.clave, '_(IZQ|DER)$', '') as modulo, c.producto_id,
           coalesce(c.venc_dia, 0) as vd, coalesce(c.venc_mes, 0) as vm, coalesce(c.venc_anio, 0) as va, c.estado_envase as ee, c.equipo,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g as (
    select modulo, producto_id, vd, vm, va, ee,
           sum(case when equipo = 'OL' then cajas end) as co, sum(case when equipo = 'BAVARIA' then cajas end) as cb
      from t
     where modulo = (select regexp_replace(u2.clave, '_(IZQ|DER)$', '') from public.ubicaciones u2 where u2.id = p_ubi)
     group by 1, 2, 3, 4, 5, 6
  )
  select exists (select 1 from g where co is null or cb is null or co <> cb)
$$;
revoke all on function public.inv_fiscal_modulo_difiere(uuid, uuid) from public, anon, authenticated;

-- El cruce también se puede pedir cuando terminó una sola persona (todo sale «solo …», sin cruce).
drop function if exists public.inv_fiscal_cruce(uuid);
create function public.inv_fiscal_cruce(p_hoja uuid)
returns table (
  ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  venc_dia smallint, venc_mes smallint, venc_anio smallint,
  cajas_ol bigint, cajas_bavaria bigint, diferencia bigint, estado text, estado_envase text
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
    select c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.estado_envase, m.equipo,
           sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint as cajas
      from public.inv_fiscal_conteos c
      join public.inv_fiscal_miembros m on m.hoja_id = c.hoja_id and m.user_id = c.contado_por
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
     group by c.ubicacion_id, c.producto_id, c.venc_dia, c.venc_mes, c.venc_anio, c.estado_envase, m.equipo
  ), o as (select * from t where equipo = 'OL'), b as (select * from t where equipo = 'BAVARIA'),
  j as (
    select coalesce(o.ubicacion_id, b.ubicacion_id) as ubi, coalesce(o.producto_id, b.producto_id) as prod,
           coalesce(o.venc_dia, b.venc_dia) as vd, coalesce(o.venc_mes, b.venc_mes) as vm, coalesce(o.venc_anio, b.venc_anio) as va,
           coalesce(o.estado_envase, b.estado_envase) as ee, o.cajas as co, b.cajas as cb
      from o full join b
        on o.ubicacion_id = b.ubicacion_id and o.producto_id = b.producto_id
       and coalesce(o.venc_dia, 0) = coalesce(b.venc_dia, 0)
       and coalesce(o.venc_mes, 0) = coalesce(b.venc_mes, 0)
       and coalesce(o.venc_anio, 0) = coalesce(b.venc_anio, 0)
       and o.estado_envase is not distinct from b.estado_envase
  )
  select j.ubi, u.clave, j.prod, pr.sku, pr.nombre, j.vd, j.vm, j.va, j.co, j.cb,
         (coalesce(j.co, 0) - coalesce(j.cb, 0))::bigint,
         case when j.co is null then 'SOLO_BAVARIA'
              when j.cb is null then 'SOLO_OL'
              when j.co = j.cb then 'COINCIDE'
              else 'DIFIERE' end,
         j.ee
    from j
    join public.ubicaciones u on u.id = j.ubi
    join public.productos pr on pr.id = j.prod
   order by (case when j.co is not null and j.cb is not null and j.co = j.cb then 1 else 0 end), u.clave, pr.sku, j.va, j.vm, j.vd;
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
       and (v_equipos = 1 or not public.inv_fiscal_modulo_difiere(p_hoja, r.ubicacion_id)));
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
            'Inventario fiscal · Hoja ' || v_num || case when v_equipos = 1 then ' · lo aprobado por el fiscal, contado por una sola persona (sin cruce)' else ' · lo aprobado por el fiscal y coincidente entre las dos personas' end)
    returning id into v_conteo;
    update public.inv_fiscal_hojas set conteo_id = v_conteo where id = p_hoja;
  end if;

  -- Lo que ya no está aprobado y coincidente sale; lo que sí, se vuelve a poner tal cual está hoy.
  delete from public.conteo_lineas where conteo_id = v_conteo;
  insert into public.conteo_lineas
    (conteo_id, producto_id, ubicacion_id, estibas, cajas, saldo, venc_dia, venc_mes, venc_anio,
     rotacion, averia, pnc, estado_envase, nota, cantidad_contada, contado_por, contado_en)
  select v_conteo, c.producto_id, c.ubicacion_id, c.estibas, c.cajas, c.saldo, c.venc_dia, c.venc_mes, c.venc_anio,
         null, false, false, c.estado_envase, c.nota,
         coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0),
         v_yo, c.contado_en
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.equipo = v_eq and c.ubicacion_id = any (v_ok);
  get diagnostics v_ren = row_count;

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- LO QUE VE CADA PERSONA AL REVISAR: SOLO SUS RENGLONES CON DIFERENCIA
-- Compara por módulo (sin lado), material y vencimiento. Devuelve solo los ids de los renglones
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
           coalesce(c.venc_dia, 0) as vd, coalesce(c.venc_mes, 0) as vm, coalesce(c.venc_anio, 0) as va, c.estado_envase as ee,
           coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0) as cajas
      from public.inv_fiscal_conteos c
      join public.ubicaciones u on u.id = c.ubicacion_id
      join public.productos p on p.id = c.producto_id
     where c.hoja_id = p_hoja
  ), g as (
    select modulo, producto_id, vd, vm, va, ee, equipo, sum(cajas) as cajas from t group by 1, 2, 3, 4, 5, 6, 7
  )
  select t.id
    from t
    join yo on yo.equipo = t.equipo
   where t.contado_por = auth.uid()
     and not exists (
       select 1 from g mi join g otro
         on otro.modulo = mi.modulo and otro.producto_id = mi.producto_id and otro.vd = mi.vd and otro.vm = mi.vm and otro.va = mi.va and otro.ee is not distinct from mi.ee
        and otro.equipo <> mi.equipo
       where mi.modulo = t.modulo and mi.producto_id = t.producto_id and mi.vd = t.vd and mi.vm = t.vm and mi.va = t.va and mi.ee is not distinct from t.ee
         and mi.equipo = t.equipo and otro.cajas = mi.cajas
     )
$$;
revoke all on function public.inv_fiscal_mis_diferencias(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_diferencias(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_mis_diferencias(uuid)') is null
     or to_regprocedure('public.inv_fiscal_revision_enviar_modulo(uuid,uuid[],jsonb)') is null
     or to_regprocedure('public.inv_fiscal_validar(uuid,uuid[],text)') is null
     or to_regprocedure('public.inv_fiscal_aprobar(uuid,uuid[],boolean)') is null
     or to_regprocedure('public.inv_fiscal_modulo_difiere(uuid,uuid)') is null
     or to_regprocedure('public.inv_fiscal_cruce(uuid)') is null
     or to_regprocedure('public.inv_fiscal_consolidar(uuid)') is null then
    raise exception 'No quedaron las funciones de validar por módulo. Revisa que corrieron antes validar y consolidar.';
  end if;
end $$;

commit;
select 'OK · validar por calle y módulo listo' as resultado;
