-- =====================================================================
-- INVENTARIO · PRODUCTO · CÍCLICO SIN APROBAR NI «TERMINAR»
--
-- «No quiero que alguien lo apruebe: la idea es que no culmine hasta que se vaya cruzando.»
--
-- En el cíclico la hoja NO se termina con un botón ni la aprueba nadie: la pareja sigue contando y cruzando,
-- y la hoja queda CUADRADA sola cuando el cruce sale todo igual (lo de uno coincide con lo del otro).
--
--   · inv_fiscal_terminar: en un cíclico ya no deja «terminar» (sí deja reabrir, para soltar lo de antes).
--   · Se borran los «terminé» que ya tuvieran las hojas del cíclico: así nadie queda bloqueado para corregir.
--   · inv_ciclico_resumen(): por hoja de cada cíclico abierto, cuántos renglones cruza y cuántos no coinciden
--     (lo usa la pantalla Cíclico para decir «todo coincide» o «N por cruzar»).
--
-- Necesita 2026-11-producto-ciclico.sql. Se puede correr varias veces.
-- =====================================================================
begin;

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

-- Los «terminé» que ya tenían las hojas del cíclico: fuera (nadie queda bloqueado para corregir).
delete from public.inv_fiscal_terminos t
 using public.inv_fiscal_hojas h, public.inv_fiscales f
 where t.hoja_id = h.id and h.fiscal_id = f.id and f.tipo = 'CICLICO';

-- Por hoja de cada cíclico abierto: cuántos renglones cruza y cuántos NO coinciden.
drop function if exists public.inv_ciclico_resumen();
create function public.inv_ciclico_resumen()
returns table (fiscal_id uuid, hoja_id uuid, numero integer, total bigint, con_diferencia bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.inv_ciclico_ve() then
    raise exception 'Ver el cruce del cíclico requiere el permiso «Cíclico» de Producto (Roles)';
  end if;
  return query
  select h.fiscal_id, h.id, h.numero, x.total, x.dif
    from public.inv_fiscal_hojas h
    join public.inv_fiscales f on f.id = h.fiscal_id
    cross join lateral (
      select count(*)::bigint as total, count(*) filter (where c.estado <> 'COINCIDE')::bigint as dif
        from public.inv_ciclico_cruce(h.id) c
    ) x
   where f.tipo = 'CICLICO' and f.estado = 'abierto'
   order by h.fiscal_id, h.numero;
end $$;
revoke all on function public.inv_ciclico_resumen() from public, anon;
grant execute on function public.inv_ciclico_resumen() to authenticated;

commit;
select 'OK · cíclico sin aprobar: la hoja queda cuadrada cuando el cruce coincide' as resultado;
