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
