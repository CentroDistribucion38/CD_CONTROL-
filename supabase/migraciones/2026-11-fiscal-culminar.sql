-- =====================================================================
-- INVENTARIO FISCAL · CULMINAR SIN HUECOS
--
-- «Apenas ellos le dan enviar y el fiscal aprueba, ya ellos no pueden hacer nada. No quiero que pase a otra calle y se les
--  quede abierta la anterior con posibilidades de que registren, cambien o editen. Para culminar, que me muestre qué quedó
--  pendiente; y que también se pueda culminar por hoja, por pareja.»
--
-- QUÉ CAMBIA (corre DESPUÉS de 2026-10-fiscal-TODO.sql y de 2026-10-fiscal-conciliar-ol.sql; se puede correr dos veces)
--
--  1. UN MÓDULO APROBADO SE BLOQUEA. Nadie anota, corrige ni quita renglones (ni fotos ni marcas) en un módulo que el fiscal
--     aprobó. Para tocarlo, el fiscal lo manda a validar otra vez. Una hoja CULMINADA tampoco se toca.
--  2. CADA HOJA SE CUENTA EN SU CALLE. Si la hoja tiene calle, solo se anota en ubicaciones de esa calle.
--  3. «SIGUIENTE CALLE» NO DEJA NADA ABIERTO: antes de pasar, todo lo contado en la calle de turno tiene que estar aprobado
--     (si no, dice qué módulos faltan). Además se acaba cualquier OK de reabrir que quedara pendiente.
--  4. EL OK DE REABRIR SE ACABA AL VOLVER A ENVIAR (terminar), no solo al reabrir.
--  5. LAS COMPENSACIONES Y EL CONTEO DEFINITIVO NO SE PIERDEN. Al pasar a La base, cada módulo toma su conteo definitivo
--     (el que el fiscal dejó, o el del operador) sin importar quién tocó «Terminé» en la calle de turno. Antes, si en la
--     última calle solo una persona de la pareja enviaba, TODA la hoja se tomaba solo de esa persona.
--  6. CULMINAR (la versión estricta, «B»):
--       · inv_fiscal_pendientes(fiscal, hoja?)   qué quedó pendiente (hoja, calle, módulo, motivo, personas).
--       · inv_fiscal_cerrar_hoja(hoja)           culmina UNA pareja si todo lo contado está aprobado.
--       · inv_fiscal_cerrar_todo(fiscal)         culmina TODO el fiscal, pero SOLO si no queda nada pendiente. No aprueba por su cuenta.
--       Al culminar cada hoja se pasa lo aprobado a La base y se COMPRUEBA que La base quedó igual a lo aprobado; si no, no se cierra.
--  7. «FINALIZADA» para quien cuenta: inv_fiscal_mis_hojas trae `finalizada` y la pantalla de Contar deja de mostrar el conteo.
-- =====================================================================
begin;


-- ---------------------------------------------------------------------
-- AYUDAS
-- ---------------------------------------------------------------------
-- ¿El módulo de esa ubicación (los dos lados) ya lo aprobó el fiscal?
create or replace function public.inv_fiscal_modulo_aprobado(p_hoja uuid, p_ubi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = (select regexp_replace(u.clave, '_(IZQ|DER)$', '') from public.ubicaciones u where u.id = p_ubi))
$$;
revoke all on function public.inv_fiscal_modulo_aprobado(uuid, uuid) from public, anon, authenticated;

-- Los módulos de una hoja con renglones (o en validación) que el fiscal todavía NO aprobó.
create or replace function public.inv_fiscal_modulos_pendientes(p_hoja uuid)
returns table (modulo text, motivo text)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select regexp_replace(u.clave, '_(IZQ|DER)$', '') as k
      from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
     where c.hoja_id = p_hoja
    union
    select regexp_replace(ur.clave, '_(IZQ|DER)$', '')
      from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
     where r.hoja_id = p_hoja and r.estado = 'A_VALIDAR')
  select m.k,
         case when exists (select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
                            where r.hoja_id = p_hoja and r.estado = 'A_VALIDAR'
                              and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = m.k)
              then 'En validación' else 'Sin aprobar' end
    from m
   where not exists (select 1 from public.inv_fiscal_revisiones r join public.ubicaciones ur on ur.id = r.ubicacion_id
                      where r.hoja_id = p_hoja and r.estado = 'APROBADA'
                        and regexp_replace(ur.clave, '_(IZQ|DER)$', '') = m.k)
   order by m.k
$$;
revoke all on function public.inv_fiscal_modulos_pendientes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1 y 2. NADIE TOCA UN MÓDULO APROBADO, UNA HOJA CULMINADA NI OTRA CALLE
-- ---------------------------------------------------------------------
create or replace function public.inv_fiscal_conteos_hoja_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoja uuid := coalesce(new.hoja_id, old.hoja_id);
  v_calle text; v_cerrada boolean;
begin
  select nullif(upper(btrim(coalesce(h.calle, ''))), ''), (h.cerrada_en is not null)
    into v_calle, v_cerrada
    from public.inv_fiscal_hojas h where h.id = v_hoja;
  if not found then return coalesce(new, old); end if;   -- se está borrando la hoja entera (el plan)
  if v_cerrada then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and public.inv_fiscal_modulo_aprobado(v_hoja, old.ubicacion_id) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede anotar ni cambiar nada en él. Si hay que cambiarlo, el fiscal lo manda a validar otra vez.';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if public.inv_fiscal_modulo_aprobado(v_hoja, new.ubicacion_id) then
      raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede anotar ni cambiar nada en él. Si hay que cambiarlo, el fiscal lo manda a validar otra vez.';
    end if;
    -- Cada hoja se cuenta en su calle (solo si esa calle existe en las ubicaciones: no se bloquea por un nombre mal escrito).
    if v_calle is not null
       and exists (select 1 from public.ubicaciones x where upper(btrim(x.calle)) = v_calle)
       and not exists (select 1 from public.ubicaciones x where x.id = new.ubicacion_id and upper(btrim(x.calle)) = v_calle) then
      raise exception 'Esa ubicación no es de la calle de tu hoja (calle %).', v_calle;
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_conteos_cerrada on public.inv_fiscal_conteos;
create trigger inv_fiscal_conteos_cerrada before insert or update or delete on public.inv_fiscal_conteos
  for each row execute function public.inv_fiscal_conteos_hoja_cerrada();

-- Las fotos de los renglones y las marcas de módulo (mezclado / sin acceso) siguen la misma regla.
create or replace function public.inv_fiscal_fotos_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid := coalesce(new.hoja_id, old.hoja_id); v_ubi uuid;
begin
  if not exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja) then return coalesce(new, old); end if;
  if exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja and h.cerrada_en is not null) then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  select c.ubicacion_id into v_ubi from public.inv_fiscal_conteos c where c.id = coalesce(new.conteo_id, old.conteo_id);
  if v_ubi is not null and public.inv_fiscal_modulo_aprobado(v_hoja, v_ubi) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede cambiar nada en él.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_fotos_bloqueo on public.inv_fiscal_fotos;
create trigger inv_fiscal_fotos_bloqueo before insert or update or delete on public.inv_fiscal_fotos
  for each row execute function public.inv_fiscal_fotos_bloqueo();

create or replace function public.inv_fiscal_modulos_bloqueo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid := coalesce(new.hoja_id, old.hoja_id); v_ubi uuid := coalesce(new.ubicacion_id, old.ubicacion_id);
begin
  if not exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja) then return coalesce(new, old); end if;
  if exists (select 1 from public.inv_fiscal_hojas h where h.id = v_hoja and h.cerrada_en is not null) then
    raise exception 'Esta hoja ya la culminó el fiscal: no se puede anotar ni cambiar nada en ella.';
  end if;
  if public.inv_fiscal_modulo_aprobado(v_hoja, v_ubi) then
    raise exception 'Ese módulo ya lo aprobó el fiscal: no se puede cambiar nada en él.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inv_fiscal_modulos_bloqueo on public.inv_fiscal_modulos;
create trigger inv_fiscal_modulos_bloqueo before insert or update or delete on public.inv_fiscal_modulos
  for each row execute function public.inv_fiscal_modulos_bloqueo();

-- ---------------------------------------------------------------------
-- 5. EL CONTEO DEFINITIVO DE CADA MÓDULO Y LO QUE PASA A LA BASE
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_equipo_definitivo(uuid, uuid);
create function public.inv_fiscal_equipo_definitivo(p_hoja uuid, p_ubi uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with m as (select regexp_replace(u.clave, '_(IZQ|DER)$', '') as k from public.ubicaciones u where u.id = p_ubi),
       a as (select r.adoptado from public.inv_fiscal_revisiones r where r.hoja_id = p_hoja and r.ubicacion_id = p_ubi)
  select case
    when (select adoptado from a) is not null
         and exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                      where c.hoja_id = p_hoja and c.equipo = (select adoptado from a)
                        and regexp_replace(u.clave, '_(IZQ|DER)$', '') = (select k from m))
      then (select adoptado from a)
    when exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                  where c.hoja_id = p_hoja and c.equipo = 'OL'
                    and regexp_replace(u.clave, '_(IZQ|DER)$', '') = (select k from m))
      then 'OL'
    else 'BAVARIA' end
$$;
revoke all on function public.inv_fiscal_equipo_definitivo(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_equipo_definitivo(uuid, uuid) to authenticated;


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

  -- AHORA CADA MÓDULO SE TOMA POR SÍ SOLO (no por lo que terminó cada persona en la calle de turno): el conteo que el fiscal dejó
  -- como definitivo; si no escogió, el del operador; si el operador no contó ese módulo, el de Bavaria.
  -- Todo módulo APROBADO por el fiscal (coincida o no): ahí el fiscal ya concilió a las dos personas.
  v_ok := array(
    select r.ubicacion_id from public.inv_fiscal_revisiones r
     where r.hoja_id = p_hoja and r.estado = 'APROBADA'
       and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = r.ubicacion_id)
       );
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
       and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id)
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
     and mi.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, m.ubicacion_id)
     and (m.ubicacion_id = any (v_ok)
          or not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = p_hoja and c.ubicacion_id = m.ubicacion_id));

  return query select coalesce(array_length(v_ok, 1), 0), v_ren, v_sin,
                      (select cn.codigo from public.conteos cn where cn.id = v_conteo);
end $$;
revoke all on function public.inv_fiscal_consolidar(uuid) from public, anon;
grant execute on function public.inv_fiscal_consolidar(uuid) to authenticated;


-- Aprobar: con una sola persona terminada, el módulo queda con lo de esa persona.
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
  -- Con una sola persona terminada, el módulo queda con lo de esa persona (se anota, para que al pasar a La base no se pierda).
  if v_equipos < 2 then
    p_adoptar := (select m.equipo from public.inv_fiscal_miembros m
                    join public.inv_fiscal_terminos t on t.hoja_id = m.hoja_id and t.user_id = m.user_id
                   where m.hoja_id = p_hoja limit 1);
    p_compensar := false;
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
-- 4. EL OK DE REABRIR SE ACABA AL VOLVER A ENVIAR; UNA HOJA CULMINADA NO SE REABRE DESDE AFUERA
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
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then
    raise exception 'El fiscal ya culminó tu hoja: no hay nada más que hacer en ella.';
  end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if coalesce(p_terminado, true) then
    if not exists (select 1 from public.inv_fiscal_conteos where hoja_id = p_hoja and contado_por = v_yo) then
      raise exception 'Anota al menos un renglón antes de terminar tu hoja.';
    end if;
    insert into public.inv_fiscal_terminos (hoja_id, user_id) values (p_hoja, v_yo)
      on conflict (hoja_id, user_id) do nothing;
    -- Al volver a enviar, el OK de reabrir que tenía se acaba: la próxima vez hace falta otro.
    delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja and user_id = v_yo;
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
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then
    raise exception 'El fiscal ya culminó tu hoja: no hay nada más que hacer en ella.';
  end if;
  insert into public.inv_fiscal_reaperturas (hoja_id, user_id, pedido_en) values (p_hoja, v_yo, now())
    on conflict (hoja_id, user_id) do update set pedido_en = coalesce(public.inv_fiscal_reaperturas.pedido_en, now());
end $$;
revoke all on function public.inv_fiscal_reabrir_pedir(uuid) from public, anon;
grant execute on function public.inv_fiscal_reabrir_pedir(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. SIGUIENTE CALLE: NADA SE QUEDA ABIERTO EN LA ANTERIOR
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_siguiente_calle(uuid, text);
create function public.inv_fiscal_siguiente_calle(p_hoja uuid, p_calle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; v_calle text := nullif(upper(btrim(coalesce(p_calle, ''))), ''); v_pend text;
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
  -- Todo lo contado en la calle de turno tiene que estar aprobado: así la calle anterior queda cerrada de verdad.
  select string_agg(m.modulo || ' (' || lower(m.motivo) || ')', ', ' order by m.modulo) into v_pend
    from public.inv_fiscal_modulos_pendientes(p_hoja) m;
  if v_pend is not null then
    raise exception 'Antes de pasar a la siguiente calle hay que dejar aprobado todo lo de esta. Falta: %.', v_pend;
  end if;

  update public.inv_fiscal_hojas set calle = v_calle, cerrada_en = null, cerrada_por = null where id = p_hoja;
  delete from public.inv_fiscal_terminos where hoja_id = p_hoja;
  -- Ningún OK de reabrir de la calle anterior sirve en la nueva.
  delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_siguiente_calle(uuid, text) from public, anon;
grant execute on function public.inv_fiscal_siguiente_calle(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CULMINAR
-- ---------------------------------------------------------------------
-- ¿Lo que bajó a La base es igual a lo aprobado? Devuelve null si cuadra; si no, dice qué no cuadra.
drop function if exists public.inv_fiscal_hoja_cuadra(uuid);
create function public.inv_fiscal_hoja_cuadra(p_hoja uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_num integer; v_conteo uuid; v_esp numeric; v_base numeric;
begin
  select h.numero, h.conteo_id into v_num, v_conteo from public.inv_fiscal_hojas h where h.id = p_hoja;
  if v_num is null then return 'Esa hoja no existe.'; end if;
  select coalesce(sum(coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.cajas, 0) + coalesce(c.saldo, 0)), 0)
    into v_esp
    from public.inv_fiscal_conteos c join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja
     and public.inv_fiscal_modulo_aprobado(p_hoja, c.ubicacion_id)
     and c.equipo = public.inv_fiscal_equipo_definitivo(p_hoja, c.ubicacion_id);
  select coalesce(sum(l.cantidad_contada), 0) into v_base from public.conteo_lineas l where l.conteo_id = v_conteo;
  if v_esp <> v_base then
    return 'en la hoja ' || v_num || ' lo que bajó a La base (' || v_base || ' cajas) no es lo aprobado (' || v_esp || ' cajas)';
  end if;
  return null;
end $$;
revoke all on function public.inv_fiscal_hoja_cuadra(uuid) from public, anon, authenticated;

-- Culminar UNA hoja (una pareja): solo si todo lo contado en ella está aprobado. Pasa lo aprobado a La base y comprueba que cuadre.
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
    raise exception 'Culminar una hoja requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then return; end if;
  v_motivo := public.inv_fiscal_hoja_motivo_no_cierra(p_hoja);
  if v_motivo is not null then raise exception 'No se puede culminar la hoja: %', v_motivo; end if;
  begin
    perform public.inv_fiscal_consolidar(p_hoja);
  exception when others then
    if sqlerrm not ilike '%nada que consolidar%' then raise; end if;
  end;
  v_motivo := public.inv_fiscal_hoja_cuadra(p_hoja);
  if v_motivo is not null then raise exception 'No se puede culminar la hoja: %.', v_motivo; end if;
  update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = p_hoja;
  delete from public.inv_fiscal_reaperturas where hoja_id = p_hoja;
end $$;
revoke all on function public.inv_fiscal_cerrar_hoja(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_hoja(uuid) to authenticated;

-- Qué quedó pendiente (para mostrarlo antes de culminar). Una fila por módulo sin aprobar; las hojas sin ningún renglón salen
-- como aviso (bloquea = false): culminar las cierra, pero conviene saberlo.
drop function if exists public.inv_fiscal_pendientes(uuid, uuid);
create function public.inv_fiscal_pendientes(p_fiscal uuid, p_hoja uuid default null)
returns table (hoja integer, calle text, modulo text, motivo text, personas text, bloquea boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare h record; r record; v_n integer;
begin
  if not public.puede_ver('/inventario/fiscal') then return; end if;
  for h in
    select x.id as hid, x.numero as num, x.calle as cll from public.inv_fiscal_hojas x
     where x.fiscal_id = p_fiscal and x.cerrada_en is null and (p_hoja is null or x.id = p_hoja)
     order by x.numero
  loop
    v_n := 0;
    for r in select mp.modulo as mdl, mp.motivo as mtv from public.inv_fiscal_modulos_pendientes(h.hid) mp loop
      v_n := v_n + 1;
      hoja := h.num; calle := h.cll; modulo := r.mdl; motivo := r.mtv; bloquea := true;
      personas := (
        select string_agg(p.nombre || case when exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = h.hid and t.user_id = mi.user_id)
                                           then ' (envió)' else ' (contando)' end, ', ' order by mi.equipo)
          from public.inv_fiscal_miembros mi join public.perfiles p on p.id = mi.user_id
         where mi.hoja_id = h.hid
           and exists (select 1 from public.inv_fiscal_conteos c join public.ubicaciones u on u.id = c.ubicacion_id
                        where c.hoja_id = h.hid and c.contado_por = mi.user_id
                          and regexp_replace(u.clave, '_(IZQ|DER)$', '') = r.mdl));
      return next;
    end loop;
    if v_n = 0
       and not exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = h.hid)
       and not exists (select 1 from public.inv_fiscal_revisiones rv where rv.hoja_id = h.hid) then
      hoja := h.num; calle := h.cll; modulo := null; motivo := 'Sin renglones contados'; bloquea := false;
      personas := (select string_agg(p.nombre, ', ' order by mi.equipo)
                     from public.inv_fiscal_miembros mi join public.perfiles p on p.id = mi.user_id where mi.hoja_id = h.hid);
      return next;
    end if;
  end loop;
end $$;
revoke all on function public.inv_fiscal_pendientes(uuid, uuid) from public, anon;
grant execute on function public.inv_fiscal_pendientes(uuid, uuid) to authenticated;

-- Culminar TODO el fiscal: solo si no queda NINGÚN módulo sin aprobar. No aprueba nada por su cuenta.
drop function if exists public.inv_fiscal_cerrar_todo(uuid);
create function public.inv_fiscal_cerrar_todo(p_fiscal uuid)
returns table (cerradas integer, modulos_forzados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; h record; v_cerr integer := 0; v_n integer; v_lista text; v_dif text;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Culminar el fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select f.estado into v_estado from public.inv_fiscales f where f.id = p_fiscal;
  if v_estado is null then raise exception 'Ese inventario fiscal no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  select count(*), string_agg('hoja ' || p.hoja || ' · ' || p.modulo, ', ' order by p.hoja, p.modulo)
    into v_n, v_lista
    from public.inv_fiscal_pendientes(p_fiscal) p where p.bloquea;
  if v_n > 0 then
    raise exception 'No se puede culminar: % % sin aprobar (%).', v_n, case when v_n = 1 then 'módulo' else 'módulos' end, v_lista;
  end if;

  for h in select x.id as hid, x.numero as num from public.inv_fiscal_hojas x
            where x.fiscal_id = p_fiscal and x.cerrada_en is null order by x.numero loop
    begin
      perform public.inv_fiscal_consolidar(h.hid);
    exception when others then
      if sqlerrm not ilike '%nada que consolidar%' then raise; end if;
    end;
    v_dif := public.inv_fiscal_hoja_cuadra(h.hid);
    if v_dif is not null then raise exception 'No se puede culminar: %.', v_dif; end if;
    update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = h.hid;
    delete from public.inv_fiscal_reaperturas where hoja_id = h.hid;
    v_cerr := v_cerr + 1;
  end loop;
  return query select v_cerr, 0;
end $$;
revoke all on function public.inv_fiscal_cerrar_todo(uuid) from public, anon;
grant execute on function public.inv_fiscal_cerrar_todo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. «FINALIZADA» PARA QUIEN CUENTA
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_mis_hojas();
create function public.inv_fiscal_mis_hojas()
returns table (
  fiscal_id uuid, nombre text, fecha date, hoja integer, equipo text,
  pareja text, pareja_equipo text,
  hoja_id uuid, puede_contar boolean, mis_renglones bigint,
  termine boolean, pareja_termino boolean, calle text, finalizada boolean
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
         h.calle,
         (h.cerrada_en is not null)
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
  if to_regprocedure('public.inv_fiscal_pendientes(uuid,uuid)') is null
     or to_regprocedure('public.inv_fiscal_cerrar_todo(uuid)') is null
     or to_regprocedure('public.inv_fiscal_cerrar_hoja(uuid)') is null
     or to_regprocedure('public.inv_fiscal_siguiente_calle(uuid,text)') is null
     or to_regprocedure('public.inv_fiscal_mis_hojas()') is null then
    raise exception 'Faltó crear alguna función de culminar: revisa este archivo.';
  end if;
end $$;

commit;
