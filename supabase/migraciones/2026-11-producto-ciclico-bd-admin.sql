-- =====================================================================
-- INVENTARIO · PRODUCTO · CONTROL CÍCLICO · LA BD PARA EL SUPER ADMINISTRADOR
--
-- «Que el super admin pueda eliminar, editar o agregar algún renglón.»
--
--   · Quien MANDA (super administrador) corrige, quita o AGREGA renglones aunque la hoja ya haya enviado su
--     conteo o el cíclico esté cerrado: la hoja sigue enviada (no hay que reabrirla).
--   · Quien solo tiene edición en «Control cíclico» corrige y quita en hojas abiertas (como antes).
--   · inv_ciclico_agregar(hoja, equipo, sitio, código, cajas, unidades): el renglón queda a nombre de la persona de
--     esa pareja y con la nota «Agregado por <quien>», para que se sepa que no lo anotó ella.
--
-- Necesita 2026-11-producto-ciclico-bd.sql. Se puede correr varias veces.
-- =====================================================================
begin;

drop function if exists public.inv_ciclico_corregir(uuid, integer, integer);
drop function if exists public.inv_ciclico_quitar(uuid);
drop function if exists public.inv_ciclico_bd_puede(uuid);

/* Abre la hoja para tocar su BD y devuelve cuándo se había enviado (para dejarla enviada otra vez al terminar). */
create or replace function public.inv_ciclico_bd_abrir(p_hoja uuid) returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_tipo text; v_cerrada timestamptz; v_estado text; v_manda boolean := public.manda();
begin
  if not v_manda
     and public.mi_nivel_pantalla('/inventario/producto/ciclico') <> 'editar'
     and public.mi_nivel_pantalla('/inventario/producto/control') <> 'editar' then
    raise exception 'Corregir la BD del cíclico requiere permiso de edición en «Control cíclico» de Producto (Roles)';
  end if;
  select f.tipo, h.cerrada_en, f.estado into v_tipo, v_cerrada, v_estado
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_tipo is null then raise exception 'Esa hoja ya no existe: actualiza la pantalla.'; end if;
  if v_tipo <> 'CICLICO' then raise exception 'Esa hoja es de un inventario fiscal: se corrige en el Control fiscal.'; end if;
  if not v_manda and v_estado <> 'abierto' then raise exception 'Este cíclico ya está cerrado.'; end if;
  if v_cerrada is not null then
    if not v_manda then raise exception 'Esa hoja ya envió su conteo: reábrela primero (botón «Reabrir») y después corrige.'; end if;
    update public.inv_fiscal_hojas set cerrada_en = null where id = p_hoja;
  end if;
  return v_cerrada;
end $$;
revoke all on function public.inv_ciclico_bd_abrir(uuid) from public, anon;

create or replace function public.inv_ciclico_bd_cerrar(p_hoja uuid, p_cerrada timestamptz) returns void
language sql security definer set search_path = public
as $$ update public.inv_fiscal_hojas set cerrada_en = p_cerrada where id = p_hoja and p_cerrada is not null $$;
revoke all on function public.inv_ciclico_bd_cerrar(uuid, timestamptz) from public, anon;

create function public.inv_ciclico_corregir(p_conteo uuid, p_cajas integer, p_unidades integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid; v_c timestamptz;
begin
  select hoja_id into v_hoja from public.inv_fiscal_conteos where id = p_conteo;
  if v_hoja is null then raise exception 'Ese renglón ya no existe: actualiza la pantalla.'; end if;
  if coalesce(p_cajas, 0) < 0 or coalesce(p_unidades, 0) < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if coalesce(p_cajas, 0) = 0 and coalesce(p_unidades, 0) = 0 then raise exception 'Para dejarlo en cero, mejor quita el renglón.'; end if;
  v_c := public.inv_ciclico_bd_abrir(v_hoja);
  update public.inv_fiscal_conteos
     set estibas = null, saldo = null, cajas = coalesce(p_cajas, 0), unidades = nullif(coalesce(p_unidades, 0), 0)
   where id = p_conteo;
  perform public.inv_ciclico_bd_cerrar(v_hoja, v_c);
end $$;
revoke all on function public.inv_ciclico_corregir(uuid, integer, integer) from public, anon;
grant execute on function public.inv_ciclico_corregir(uuid, integer, integer) to authenticated;

create function public.inv_ciclico_quitar(p_conteo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid; v_c timestamptz;
begin
  select hoja_id into v_hoja from public.inv_fiscal_conteos where id = p_conteo;
  if v_hoja is null then raise exception 'Ese renglón ya no existe: actualiza la pantalla.'; end if;
  v_c := public.inv_ciclico_bd_abrir(v_hoja);
  delete from public.inv_fiscal_conteos where id = p_conteo;
  perform public.inv_ciclico_bd_cerrar(v_hoja, v_c);
end $$;
revoke all on function public.inv_ciclico_quitar(uuid) from public, anon;
grant execute on function public.inv_ciclico_quitar(uuid) to authenticated;

drop function if exists public.inv_ciclico_agregar(uuid, text, text, text, integer, integer);
create function public.inv_ciclico_agregar(p_hoja uuid, p_equipo text, p_sitio text, p_sku text, p_cajas integer, p_unidades integer default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_fiscal uuid; v_bodega uuid; v_user uuid; v_ubi uuid; v_prod uuid; v_c timestamptz; v_id uuid; v_yo text;
begin
  if upper(coalesce(p_equipo, '')) not in ('OL', 'BAVARIA') then raise exception 'Escoge de quién es el renglón: operador o Bavaria.'; end if;
  if coalesce(p_cajas, 0) < 0 or coalesce(p_unidades, 0) < 0 then raise exception 'La cantidad no puede ser negativa.'; end if;
  if coalesce(p_cajas, 0) = 0 and coalesce(p_unidades, 0) = 0 then raise exception 'Falta la cantidad.'; end if;
  select h.fiscal_id, f.bodega_id into v_fiscal, v_bodega
    from public.inv_fiscal_hojas h join public.inv_fiscales f on f.id = h.fiscal_id where h.id = p_hoja;
  if v_fiscal is null then raise exception 'Esa hoja ya no existe: actualiza la pantalla.'; end if;
  select m.user_id into v_user from public.inv_fiscal_miembros m where m.hoja_id = p_hoja and m.equipo = upper(p_equipo) limit 1;
  if v_user is null then raise exception 'Esa hoja no tiene a nadie de ese lado: asígnalo en el Plan cíclico.'; end if;
  select u.id into v_ubi from public.ubicaciones u
   where u.bodega_id = v_bodega and upper(btrim(u.clave)) = upper(btrim(p_sitio)) limit 1;
  if v_ubi is null then raise exception 'El sitio «%» no está en las ubicaciones de la bodega.', btrim(p_sitio); end if;
  select p.id into v_prod from public.productos p where btrim(p.sku) = btrim(p_sku) limit 1;
  if v_prod is null then raise exception 'El código «%» no está en el maestro.', btrim(p_sku); end if;
  v_c := public.inv_ciclico_bd_abrir(p_hoja);
  select coalesce(nullif(btrim(pe.nombre), ''), 'el administrador') into v_yo from public.perfiles pe where pe.id = auth.uid();
  insert into public.inv_fiscal_conteos (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, cajas, unidades, nota)
  values (v_fiscal, p_hoja, upper(p_equipo), v_user, v_ubi, v_prod, coalesce(p_cajas, 0), nullif(coalesce(p_unidades, 0), 0),
          'Agregado por ' || coalesce(v_yo, 'el administrador'))
  returning id into v_id;
  perform public.inv_ciclico_bd_cerrar(p_hoja, v_c);
  return v_id;
end $$;
revoke all on function public.inv_ciclico_agregar(uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.inv_ciclico_agregar(uuid, text, text, text, integer, integer) to authenticated;

commit;
select 'OK · el super administrador corrige, quita y agrega renglones del cíclico' as resultado;
