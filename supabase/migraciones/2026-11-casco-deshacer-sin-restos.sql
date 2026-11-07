-- =====================================================================
-- CASCO · DESHACER UNA BAJA SIN DEJAR RESTOS
--
-- «Si subo un archivo de bajas, me equivoco y lo deshago, se deben borrar
--  todos esos movimientos en casco.»
--
-- Antes, al deshacer una baja la celda volvía a su número, pero si esa baja
-- había CREADO la celda (un material que ese día no estaba en Control), la
-- fila quedaba ahí con 0 y sin cuenta: un renglón fantasma en Control.
--
-- Ahora, al deshacer, si la celda queda vacía (inventario 0, baja 0/vacía,
-- sin cuenta), no existía en el último saldo anterior de ese sitio y ningún
-- movimiento ni ajuste de ese día la usa, se BORRA. Todo lo demás de
-- casco_quitar_baja queda igual (incluida «solo registro»).
--
-- Se puede correr varias veces. Correr DESPUÉS de 2026-10-casco-baja-solo-registro.sql.
-- =====================================================================
begin;

create or replace function public.casco_quitar_baja(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.casco_bajas%rowtype; v_reg public.casco_registros%rowtype;
  v_inv numeric; v_baja numeric; v_hl numeric; v_nuevo numeric; v_prev date;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para quitar bajas de casco de vidrio';
  end if;
  select * into b from public.casco_bajas where id = p_id;
  if not found then raise exception 'Esa baja ya no está'; end if;

  -- SOLO REGISTRO no movió ninguna celda: quitarla es solo sacarla del libro.
  if b.destino = 'registro' then
    delete from public.casco_bajas where id = p_id;
    return;
  end if;

  select * into v_reg from public.casco_registros
   where fecha = b.fecha and ubicacion = b.ubicacion and sku = b.sku;
  if found then
    v_inv := coalesce(v_reg.inventario, 0); v_baja := coalesce(v_reg.baja, 0);
    v_hl := coalesce(v_reg.hl_estiba, public.casco_hl_estiba(b.sku));
    if b.destino = 'inventario' then
      v_nuevo := v_inv - b.estibas;
      update public.casco_registros set
        inventario = v_nuevo, inv_expr = public.casco_quitar_termino(v_reg.inv_expr, b.estibas),
        hl = round((v_nuevo + v_baja) * coalesce(v_hl, 0), 4), actualizado_en = now()
       where id = v_reg.id
       returning * into v_reg;
    else
      -- Lo que esta baja aplicó en la columna: signo × estibas (-1 la resta; las viejas, +1, la sumaban).
      v_nuevo := v_baja - b.signo * b.estibas;
      update public.casco_registros set
        baja = v_nuevo, baja_expr = public.casco_quitar_termino(v_reg.baja_expr, b.signo * b.estibas),
        hl = round((v_inv + v_nuevo) * coalesce(v_hl, 0), 4), actualizado_en = now()
       where id = v_reg.id
       returning * into v_reg;
    end if;

    -- SIN RESTOS: si la baja había creado la celda y ya quedó vacía, se va.
    if coalesce(v_reg.inventario, 0) = 0 and coalesce(v_reg.baja, 0) = 0
       and coalesce(btrim(v_reg.inv_expr), '') = '' and coalesce(btrim(v_reg.baja_expr), '') = '' then
      select max(fecha) into v_prev from public.casco_registros
       where ubicacion = b.ubicacion and fecha < b.fecha;
      if not exists (select 1 from public.casco_registros
                      where ubicacion = b.ubicacion and sku = b.sku and fecha = v_prev)
         and not exists (select 1 from public.casco_movimientos m
                          where m.fecha = b.fecha and m.sku = b.sku
                            and (m.ubic_origen = b.ubicacion or m.ubic_destino = b.ubicacion)) then
        delete from public.casco_registros where id = v_reg.id;
      end if;
    end if;
  end if;

  delete from public.casco_bajas where id = p_id;
end $$;
grant execute on function public.casco_quitar_baja(uuid) to authenticated;

commit;
