-- =====================================================================
-- INVENTARIO FISCAL · RENOMBRAR LAS HOJAS
--
-- «Quiero cambiarle el nombre a las hojas»: cada hoja puede llevar un nombre propio
-- (p. ej. «Exportación» en vez de «Hoja 2»). El número no cambia: sigue siendo la llave
-- de la hoja; el nombre es solo lo que se ve en las pantallas del fiscal.
--
--   · inv_fiscal_hojas.nombre            texto opcional (null = se ve «Hoja N»), hasta 40 letras.
--   · inv_fiscal_hoja_renombrar(hoja, nombre)   lo cambia (vacío = vuelve a «Hoja N»).
--                                        Requiere el permiso «Inventario fiscal» (editar);
--                                        en un inventario cerrado, solo quien administra.
--                                        No deja repetir un nombre dentro del mismo inventario.
--   · inv_fiscal_hojas_nombres(fiscal)   número y nombre de las hojas (para las pantallas).
--
-- Guardar el plan (parejas y calles) NO borra los nombres: las hojas que quedan se actualizan, no se rehacen.
-- Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_fiscal_hojas add column if not exists nombre text;
alter table public.inv_fiscal_hojas drop constraint if exists inv_fiscal_hojas_nombre_chk;
alter table public.inv_fiscal_hojas add constraint inv_fiscal_hojas_nombre_chk
  check (nombre is null or (length(btrim(nombre)) between 1 and 40));

drop function if exists public.inv_fiscal_hoja_renombrar(uuid, text);
create function public.inv_fiscal_hoja_renombrar(p_hoja uuid, p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fiscal uuid; v_estado text; v_nom text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not public.puede_editar('/inventario/fiscal') then
    raise exception 'Renombrar una hoja requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  select h.fiscal_id, f.estado into v_fiscal, v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_fiscal is null then raise exception 'Esa hoja no existe.'; end if;
  if v_estado <> 'abierto' and not public.manda() then raise exception 'Ese inventario fiscal ya está cerrado.'; end if;
  if v_nom is not null and length(v_nom) > 40 then raise exception 'El nombre de la hoja puede tener hasta 40 letras.'; end if;
  if v_nom is not null and exists (
       select 1 from public.inv_fiscal_hojas x
        where x.fiscal_id = v_fiscal and x.id <> p_hoja and lower(btrim(coalesce(x.nombre, ''))) = lower(v_nom)) then
    raise exception 'Ya hay otra hoja que se llama «%» en este inventario.', v_nom;
  end if;
  update public.inv_fiscal_hojas set nombre = v_nom where id = p_hoja;
  return v_nom;
end $$;
revoke all on function public.inv_fiscal_hoja_renombrar(uuid, text) from public, anon;
grant execute on function public.inv_fiscal_hoja_renombrar(uuid, text) to authenticated;

drop function if exists public.inv_fiscal_hojas_nombres(uuid);
create function public.inv_fiscal_hojas_nombres(p_fiscal uuid)
returns table (hoja_id uuid, numero integer, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.puede_ver('/inventario/fiscal') then
    raise exception 'Ver las hojas del inventario fiscal requiere el permiso «Inventario fiscal» (Roles)';
  end if;
  return query select h.id, h.numero, h.nombre from public.inv_fiscal_hojas h where h.fiscal_id = p_fiscal order by h.numero;
end $$;
revoke all on function public.inv_fiscal_hojas_nombres(uuid) from public, anon;
grant execute on function public.inv_fiscal_hojas_nombres(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_hoja_renombrar(uuid,text)') is null or to_regprocedure('public.inv_fiscal_hojas_nombres(uuid)') is null then
    raise exception 'No quedaron las funciones de renombrar hojas.';
  end if;
  raise notice 'Listo: las hojas del inventario fiscal se pueden renombrar.';
end $$;

commit;
select 'OK · renombrar hojas listo' as resultado;
