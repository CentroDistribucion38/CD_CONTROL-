-- =====================================================================
-- FISCAL · «PASAR A VALIDAR»: hacer como si las personas hubieran enviado la hoja.
--
-- Al reabrir una hoja (o pasarla a otra calle) las dos personas quedan como «contando» y el cruce no se
-- puede pedir: la base solo cruza lo de quien terminó. Esta función marca como TERMINADA la hoja de cada
-- persona que ya anotó algo, igual que si hubiera tocado «Terminé». Después el fiscal ve el cruce,
-- manda a validar y aprueba como siempre. Si la hoja estaba cerrada, la reabre.
--
-- No borra ni cambia nada de lo contado. Se puede correr las veces que haga falta.
-- =====================================================================
begin;

drop function if exists public.inv_fiscal_pasar_a_validar(uuid);
create function public.inv_fiscal_pasar_a_validar(p_hoja uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text; v_n integer := 0;
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Pasar una hoja a validar requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select f.estado into v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_estado is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  insert into public.inv_fiscal_terminos (hoja_id, user_id)
  select m.hoja_id, m.user_id
    from public.inv_fiscal_miembros m
   where m.hoja_id = p_hoja
     and exists (select 1 from public.inv_fiscal_conteos c where c.hoja_id = m.hoja_id and c.contado_por = m.user_id)
  on conflict (hoja_id, user_id) do nothing;
  get diagnostics v_n = row_count;

  update public.inv_fiscal_hojas set cerrada_en = null, cerrada_por = null where id = p_hoja;
  return v_n;
end $$;
revoke all on function public.inv_fiscal_pasar_a_validar(uuid) from public, anon;
grant execute on function public.inv_fiscal_pasar_a_validar(uuid) to authenticated;

commit;
