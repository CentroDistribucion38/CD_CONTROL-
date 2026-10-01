-- =====================================================================
-- INVENTARIO · ELIMINAR UN FEFO ESPECÍFICO
--
-- «Que el super admin pueda eliminar algunos FEFO específicos.»
--
-- Un recorrido FEFO (enviado, abierto o anulado) se elimina COMPLETO, con
-- todos sus renglones: la base ya los borra en cascada. Solo lo hace quien
-- administra la plataforma (manda()), y tiene que decir el código del FEFO
-- que está viendo: si alguien lo cambió o lo borró mientras tanto, no se
-- borra otra cosa. Queda escrito en el registro de borrados de
-- Administración (admin_borrados) —quién, cuándo, cuál y cuántas filas—.
--
-- Los movimientos de inventario que hubiera enviado ese conteo NO se borran:
-- se quedan, sin el vínculo (la llave los deja en null).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

drop function if exists public.conteo_fefo_eliminar(uuid, text);
create function public.conteo_fefo_eliminar(p_conteo uuid, p_codigo text)
returns table (codigo text, renglones bigint)
language plpgsql
security definer
set search_path = public
as $$
declare v_codigo text; v_tipo text; v_n bigint;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede eliminar un FEFO.';
  end if;
  select c.codigo, c.tipo into v_codigo, v_tipo from public.conteos c where c.id = p_conteo for update;
  if v_codigo is null then raise exception 'Ese FEFO ya no existe.'; end if;
  if v_tipo <> 'fefo' then raise exception 'Eso no es un FEFO.'; end if;
  if v_codigo is distinct from btrim(coalesce(p_codigo, '')) then
    raise exception 'El código no coincide: pediste borrar «%» y ese FEFO es «%». No se borró nada.', coalesce(p_codigo, ''), v_codigo;
  end if;

  select count(*) into v_n from public.conteo_lineas where conteo_id = p_conteo;
  delete from public.conteos where id = p_conteo;

  /* El registro de Administración, si esa parte está puesta. */
  if to_regclass('public.admin_borrados') is not null then
    insert into public.admin_borrados (clave, nombre, filas, archivos)
    values ('inventario_fefo', 'Inventario · FEFO ' || v_codigo, v_n + 1, 0);
  end if;

  codigo := v_codigo; renglones := v_n;
  return next;
end $$;

revoke all on function public.conteo_fefo_eliminar(uuid, text) from public, anon;
grant execute on function public.conteo_fefo_eliminar(uuid, text) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_eliminar(uuid,text)') is null then
    raise exception 'No quedó la función de eliminar un FEFO.';
  end if;
  raise notice 'Listo: el administrador puede eliminar FEFOs específicos.';
end $$;

commit;
