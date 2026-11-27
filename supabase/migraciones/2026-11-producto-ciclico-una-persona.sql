-- =====================================================================
-- INVENTARIO · PRODUCTO · CÍCLICO CON UNA SOLA PERSONA
--
-- «Habilita que pueda colocar a una sola persona a contar.»
--
-- Una hoja del cíclico puede tener a UNA sola persona (del operador logístico o de Bavaria). Esa persona cuenta
-- sola y, como no hay con quién cruzar, envía su conteo directamente cuando termina:
--   · inv_ciclico_enviar: si la hoja tiene una sola persona, basta con que haya algo contado (sin cruce).
--     Con dos personas sigue igual: solo se envía cuando todo coincide.
--   · inv_ciclico_resumen(): una hoja de una sola persona no sale con «N por cruzar» (no hay pareja).
--
-- Necesita 2026-11-producto-ciclico-control.sql. Se puede correr varias veces.
-- =====================================================================
begin;

create or replace function public.inv_ciclico_enviar(p_hoja uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_tipo text; v_estado text; v_total bigint; v_dif bigint; v_personas integer;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para enviar el conteo.'; end if;
  select f.tipo, f.estado into v_tipo, v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_tipo is null then raise exception 'Esa hoja no existe.'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Esa hoja es de un inventario fiscal.'; end if;
  if not exists (select 1 from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.user_id = auth.uid()) then
    raise exception 'Solo quien cuenta la hoja puede enviar el conteo.';
  end if;
  if v_estado <> 'abierto' then raise exception 'Este cíclico ya está cerrado.'; end if;
  if exists (select 1 from public.inv_fiscal_hojas where id = p_hoja and cerrada_en is not null) then return; end if;
  select count(*) into v_personas from public.inv_fiscal_miembros where hoja_id = p_hoja;
  select count(*), count(*) filter (where c.estado <> 'COINCIDE') into v_total, v_dif from public.inv_ciclico_cruce(p_hoja) c;
  if v_total = 0 then raise exception 'Todavía no hay nada contado en esta hoja.'; end if;
  /* UNA SOLA PERSONA: no hay con quién cruzar; lo que contó es el conteo. */
  if v_personas >= 2 and v_dif > 0 then
    raise exception 'Todavía % que no %: sigan contando y vuelvan a cruzar.',
      case when v_dif = 1 then 'hay 1 renglón' else 'hay ' || v_dif || ' renglones' end,
      case when v_dif = 1 then 'coincide' else 'coinciden' end;
  end if;
  update public.inv_fiscal_hojas set cerrada_en = now(), cerrada_por = auth.uid() where id = p_hoja;
end $$;
revoke all on function public.inv_ciclico_enviar(uuid) from public, anon;
grant execute on function public.inv_ciclico_enviar(uuid) to authenticated;

-- Se rehace (no «replace»): si la base tiene la versión vieja sin «enviada_en», replace fallaría por el tipo de retorno.
drop function if exists public.inv_ciclico_resumen();
create function public.inv_ciclico_resumen()
returns table (fiscal_id uuid, hoja_id uuid, numero integer, total bigint, con_diferencia bigint, enviada_en timestamptz)
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
  select h.fiscal_id, h.id, h.numero, x.total,
         /* Con una sola persona no hay nada «por cruzar». */
         case when (select count(*) from public.inv_fiscal_miembros m where m.hoja_id = h.id) < 2 then 0::bigint else x.dif end,
         h.cerrada_en
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

notify pgrst, 'reload schema';
commit;
