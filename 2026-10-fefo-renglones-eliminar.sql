-- =====================================================================
-- INVENTARIO · ELIMINAR RENGLONES SUELTOS DE UN FEFO
--
-- «No me deja eliminar registros»: en La base se ve un renglón que no
-- debería estar (por ejemplo uno de otro día, contado el sábado dentro de un
-- recorrido que se terminó hoy) y hace falta sacarlo SIN borrar el recorrido
-- entero.
--
-- Quien administra la plataforma (manda()) marca uno o varios renglones y se
-- van. Solo renglones de FEFO. Y un FEFO no se puede quedar sin ningún
-- renglón por esta vía: para quitarlo completo está «Eliminar FEFO».
-- Todo o nada: si algo no cuadra no se borra ninguno. Queda escrito en el
-- registro de borrados de Administración (admin_borrados), un renglón por
-- recorrido afectado.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

drop function if exists public.conteo_fefo_lineas_eliminar(uuid[]);
create function public.conteo_fefo_lineas_eliminar(p_lineas uuid[])
returns table (codigo text, eliminados bigint, quedan bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedidas uuid[];
  v_n int;
  r record;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede eliminar renglones de un FEFO.';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_pedidas from unnest(coalesce(p_lineas, '{}')) x;
  if cardinality(v_pedidas) = 0 then raise exception 'No marcaste ningún renglón.'; end if;

  /* Todos tienen que existir y ser de un FEFO. */
  select count(*) into v_n
    from public.conteo_lineas cl join public.conteos c on c.id = cl.conteo_id
   where cl.id = any (v_pedidas) and c.tipo = 'fefo';
  if v_n <> cardinality(v_pedidas) then
    raise exception 'Alguno de esos renglones ya no existe o no es de un FEFO. No se borró nada.';
  end if;

  /* Ningún FEFO se queda sin renglones. Se bloquean los recorridos mientras se cuenta. */
  perform 1 from public.conteos c
   where c.id in (select cl.conteo_id from public.conteo_lineas cl where cl.id = any (v_pedidas)) for update;
  for r in
    select c.id, c.codigo as cod, count(*) filter (where cl.id = any (v_pedidas)) as van, count(*) as hay
      from public.conteos c join public.conteo_lineas cl on cl.conteo_id = c.id
     where c.id in (select x.conteo_id from public.conteo_lineas x where x.id = any (v_pedidas))
     group by c.id, c.codigo
  loop
    if r.van >= r.hay then
      raise exception 'Con eso el FEFO % se quedaría sin renglones. Para quitarlo completo usa «Eliminar FEFO». No se borró nada.', r.cod;
    end if;
  end loop;

  for r in
    select c.id, c.codigo as cod, count(*) filter (where cl.id = any (v_pedidas)) as van, count(*) as hay
      from public.conteos c join public.conteo_lineas cl on cl.conteo_id = c.id
     where c.id in (select x.conteo_id from public.conteo_lineas x where x.id = any (v_pedidas))
     group by c.id, c.codigo order by c.codigo
  loop
    delete from public.conteo_lineas where conteo_id = r.id and id = any (v_pedidas);
    if to_regclass('public.admin_borrados') is not null then
      insert into public.admin_borrados (clave, nombre, filas, archivos)
      values ('inventario_fefo_renglones', 'Inventario · renglones de FEFO ' || r.cod, r.van, 0);
    end if;
    codigo := r.cod; eliminados := r.van; quedan := r.hay - r.van;
    return next;
  end loop;
end $$;

revoke all on function public.conteo_fefo_lineas_eliminar(uuid[]) from public, anon;
grant execute on function public.conteo_fefo_lineas_eliminar(uuid[]) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_lineas_eliminar(uuid[])') is null then
    raise exception 'No quedó la función de eliminar renglones de un FEFO.';
  end if;
  raise notice 'Listo: el administrador puede eliminar renglones sueltos de un FEFO.';
end $$;

commit;
