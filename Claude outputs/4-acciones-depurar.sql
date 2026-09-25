-- =====================================================================
-- ACCIONES · CORREGIR Y ELIMINAR (solo quien administra)
-- ---------------------------------------------------------------------
-- «Que el súper admin pueda eliminar alguna que generó, editar, y así.»
--
-- Dos puertas nuevas, las dos solo para manda():
--
--   accion_editar     corrige lo que se escribió mal al reportar —el
--                     título, la descripción, el área, la prioridad y el
--                     punto—. No toca el estado, ni quién la cerró, ni
--                     las fotos: eso no es corregir, es reescribir la
--                     historia. Cada corrección queda escrita en el hilo
--                     de la acción, con quién la hizo.
--
--   accion_eliminar   la borra de verdad, con sus fotos y su hilo (las
--                     dos cuelgan con «on delete cascade»). Queda el
--                     rastro en admin_borrados: quién, cuándo, cuántas y
--                     por qué, con el código de cada una.
--
-- ANULAR YA EXISTÍA (accion_anular) y sigue siendo el camino normal:
-- deja la acción a la vista, marcada y con su motivo. Eliminar es para
-- lo que nunca debió existir —una prueba, una repetida—, no para lo que
-- salió mal.
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. CORREGIR
-- ---------------------------------------------------------------------
create or replace function public.accion_editar(
  p_id         uuid,
  p_titulo     text,
  p_descripcion text default null,
  p_area       text default null,
  p_prioridad  text default null,
  p_ubicacion  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a public.acciones; v_cambios text[] := '{}';
begin
  if not public.manda() then
    raise exception 'Corregir una acción es de quien administra la plataforma';
  end if;
  select * into a from public.acciones where id = p_id;
  if not found then raise exception 'Esa acción no existe'; end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'El título no puede quedar vacío';
  end if;
  if p_area is not null and not exists (select 1 from public.acciones_areas where clave = p_area) then
    raise exception 'Esa área no está en el maestro';
  end if;

  /* QUÉ CAMBIÓ, EN PALABRAS. Se arma antes de guardar: después ya no
     hay con qué comparar, y un hilo que dice «se corrigió» sin decir
     qué no sirve para nada. */
  if btrim(p_titulo) is distinct from a.titulo then
    v_cambios := v_cambios || ('título: «' || a.titulo || '» → «' || btrim(p_titulo) || '»');
  end if;
  if p_descripcion is not null and btrim(p_descripcion) is distinct from coalesce(a.descripcion, '') then
    v_cambios := v_cambios || 'descripción'::text;
  end if;
  if p_area is not null and p_area is distinct from a.area then
    v_cambios := v_cambios || ('área: ' || a.area || ' → ' || p_area);
  end if;
  if p_prioridad is not null and p_prioridad::public.accion_prioridad is distinct from a.prioridad then
    v_cambios := v_cambios || ('prioridad: ' || a.prioridad::text || ' → ' || p_prioridad);
  end if;
  if p_ubicacion is not null and nullif(btrim(p_ubicacion), '') is distinct from a.ubicacion then
    v_cambios := v_cambios || 'dónde'::text;
  end if;

  if array_length(v_cambios, 1) is null then return; end if;

  update public.acciones
     set titulo      = btrim(p_titulo),
         descripcion = coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), descripcion),
         area        = coalesce(p_area, area),
         prioridad   = coalesce(p_prioridad::public.accion_prioridad, prioridad),
         ubicacion   = case when p_ubicacion is null then ubicacion
                            else nullif(btrim(p_ubicacion), '') end
   where id = p_id;

  /* LA CORRECCIÓN QUEDA EN EL HILO. Si mañana alguien lee la acción y
     el título no es el que recordaba, ahí está por qué. */
  insert into public.acciones_hilo (accion_id, texto, escrito_por)
  values (p_id, 'Corregido desde administración · ' || array_to_string(v_cambios, ' · '), auth.uid());
end $$;

revoke all on function public.accion_editar(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.accion_editar(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. ELIMINAR
-- ---------------------------------------------------------------------
create or replace function public.accion_eliminar(p_ids uuid[], p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int; v_cods text;
begin
  if not public.manda() then
    raise exception 'Eliminar acciones es de quien administra la plataforma';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No escogiste ninguna acción';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué. Borrar sin motivo es borrar a ciegas';
  end if;

  select string_agg(codigo, ', ' order by codigo) into v_cods
    from public.acciones where id = any(p_ids);

  delete from public.acciones where id = any(p_ids);
  get diagnostics n = row_count;

  /* El motivo va en el nombre: así sale tal cual en Administración ›
     Inicio, sin tocar la tabla ni su vista. */
  insert into public.admin_borrados (clave, nombre, filas)
  values ('acciones_eliminar',
          'Acciones · ' || btrim(p_motivo) || coalesce(' · ' || v_cods, ''), n);
  return n;
end $$;

revoke all on function public.accion_eliminar(uuid[], text) from public, anon;
grant execute on function public.accion_eliminar(uuid[], text) to authenticated;

do $$ begin raise notice 'LISTO: corregir y eliminar acciones, solo para quien administra.'; end $$;
commit;
