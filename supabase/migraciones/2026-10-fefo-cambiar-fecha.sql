-- =====================================================================
-- INVENTARIO · CAMBIAR LA FECHA DE UN FEFO
--
-- «Que me quede guardado con el día de hoy, no con la fecha del sábado.»
--
-- La fecha de un FEFO sale del día en que se EMPEZÓ a contar. Si se empieza
-- un sábado y se envía el jueves, la base lo muestra del sábado. Quien
-- administra la plataforma puede ponerle otra fecha SIN borrar nada: sus
-- renglones, quién contó y quién envió quedan igual. El código del FEFO
-- (FEFO-AAAAMMDD-NN) se renumera para que diga la fecha nueva, y el
-- siguiente número libre de ese día.
--
-- Solo manda(); tiene que decir el código que está viendo (si alguien lo
-- cambió, no se toca otro); la fecha no puede ser del futuro (hora de
-- Colombia).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

drop function if exists public.conteo_fefo_cambiar_fecha(uuid, text, date);
create function public.conteo_fefo_cambiar_fecha(p_conteo uuid, p_codigo text, p_fecha date)
returns table (codigo_anterior text, codigo_nuevo text, fecha date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text; v_tipo text; v_hoy date; v_n int; v_nuevo text;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede cambiar la fecha de un FEFO.';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  v_hoy := (now() at time zone 'America/Bogota')::date;
  if p_fecha > v_hoy then raise exception 'La fecha no puede ser del futuro.'; end if;

  select c.codigo, c.tipo into v_codigo, v_tipo from public.conteos c where c.id = p_conteo for update;
  if v_codigo is null then raise exception 'Ese FEFO ya no existe.'; end if;
  if v_tipo <> 'fefo' then raise exception 'Eso no es un FEFO.'; end if;
  if v_codigo is distinct from btrim(coalesce(p_codigo, '')) then
    raise exception 'El código no coincide: pediste cambiar «%» y ese FEFO es «%». No se cambió nada.', coalesce(p_codigo, ''), v_codigo;
  end if;

  /* Mediodía de Colombia: así el día es el mismo en UTC y en Bogotá. */
  update public.conteos set creado_en = (to_char(p_fecha, 'YYYY-MM-DD') || ' 12:00:00-05')::timestamptz
   where id = p_conteo;

  /* Código nuevo: el siguiente número libre de ese día (solo si el código seguía el patrón de la fecha). */
  if v_codigo ~ '^FEFO-[0-9]{8}-[0-9]+$' then
    select count(*) into v_n from public.conteos c
     where c.tipo = 'fefo' and c.id <> p_conteo and c.codigo like 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-%';
    v_n := v_n + 1;
    loop
      v_nuevo := 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-' || lpad(v_n::text, 2, '0');
      exit when not exists (select 1 from public.conteos c where c.codigo = v_nuevo);
      v_n := v_n + 1;
    end loop;
    if v_codigo not like 'FEFO-' || to_char(p_fecha, 'YYYYMMDD') || '-%' then
      update public.conteos set codigo = v_nuevo where id = p_conteo;
    else
      v_nuevo := v_codigo;   -- ya decía ese día: no se renumera
    end if;
  else
    v_nuevo := v_codigo;
  end if;

  codigo_anterior := v_codigo; codigo_nuevo := v_nuevo; fecha := p_fecha;
  return next;
end $$;

revoke all on function public.conteo_fefo_cambiar_fecha(uuid, text, date) from public, anon;
grant execute on function public.conteo_fefo_cambiar_fecha(uuid, text, date) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_cambiar_fecha(uuid,text,date)') is null then
    raise exception 'No quedó la función de cambiar la fecha de un FEFO.';
  end if;
  raise notice 'Listo: el administrador puede cambiarle la fecha a un FEFO.';
end $$;

commit;
