-- =====================================================================
-- TRASPASOS · DEPURAR VIAJES DESDE FACTURACIÓN (solo quien administra)
-- ---------------------------------------------------------------------
-- «Que el super administrador pueda anular, eliminar y demás cosas con
-- esos viajes por si le toca depurar; la persona con su usuario normal,
-- no.»
--
--   1. traspaso_depurar(ids, accion, motivo)
--        · 'anular'   → queda a la vista como anulado, con su motivo.
--                       Sale de la bandeja y del cumplido.
--        · 'eliminar' → se borra de verdad (se lleva sus tipos y su
--                       rastro de ediciones). Queda escrito en
--                       admin_borrados: quién, cuándo, cuántos y el motivo.
--        · 'sin_factura' → no se factura (p. ej. un viaje interno que no
--                       lleva documento): se anula con el motivo
--                       «No se factura: …», que es lo que queda a la vista.
--      Solo manda(). Varios a la vez. Motivo obligatorio.
--   2. Un viaje que YA SALIÓ no se anula ni se elimina aquí: primero se
--      reabre la salida (con motivo), que es la puerta que ya existe.
-- Se puede correr dos veces.
-- =====================================================================
begin;

create or replace function public.traspaso_depurar(p_ids uuid[], p_accion text, p_motivo text)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n int; v_salidos int; v_codigos text;
begin
  if not public.manda() then
    raise exception 'Depurar viajes es solo de quien administra la plataforma';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No escogiste ningún viaje'; end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué. Depurar sin motivo es borrar a ciegas';
  end if;
  if p_accion not in ('anular', 'eliminar', 'sin_factura') then
    raise exception 'Acción desconocida: %', p_accion;
  end if;

  select count(*), string_agg(coalesce(codigo, placa, id::text), ', ')
    into v_salidos, v_codigos
    from public.traspasos_viajes where id = any(p_ids) and salida_en is not null;
  if v_salidos > 0 then
    raise exception 'Ya salieron con documento: %. Primero reabre la salida y después lo depuras', v_codigos;
  end if;

  if p_accion = 'eliminar' then
    delete from public.traspasos_viajes where id = any(p_ids);
    get diagnostics n = row_count;
    /* El motivo va en el nombre: así sale tal cual en Administración ›
       Inicio sin tocar la tabla ni su vista. */
    insert into public.admin_borrados (clave, nombre, filas)
    values ('traspasos_depurar', 'Viajes de traspasos (Facturación) · ' || btrim(p_motivo), n);
  else
    update public.traspasos_viajes
       set estado = 'anulado',
           motivo_anulacion = case when p_accion = 'sin_factura' then 'No se factura: ' || btrim(p_motivo) else btrim(p_motivo) end,
           anulado_en = now(), anulado_por = auth.uid()
     where id = any(p_ids) and estado <> 'anulado';
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke all on function public.traspaso_depurar(uuid[], text, text) from public, anon;
grant execute on function public.traspaso_depurar(uuid[], text, text) to authenticated;

do $$ begin raise notice 'LISTO: depurar viajes desde Facturación (solo quien administra).'; end $$;
commit;
