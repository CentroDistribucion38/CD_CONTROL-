-- =====================================================================
-- TRASPASOS · PLANEAR VARIOS DÍAS DE UNA
--
-- Requiere: supabase/modulos/traspasos.sql
--           supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- El plan de un CD no cambia todos los días: la semana se parece a la
-- semana anterior. Pero la pantalla obligaba a armar la misma rejilla
-- de nueve tipos por tres turnos, un día a la vez. Planear un mes eran
-- treinta veces el mismo trabajo — así que nadie planea el mes, se
-- planea el día siguiente a las corridas, y el plan deja de ser un plan.
--
-- Ahora la rejilla que se está viendo se aplica a los días que se
-- escojan.
--
-- LOS DÍAS QUE YA TIENEN PLAN PUBLICADO NO SE TOCAN, y se devuelven
-- nombrados para que la pantalla pueda decir cuáles fueron. Reemplazar
-- en silencio un plan que el turno ya vio es la clase de cosa que se
-- descubre cuando alguien pregunta por qué su plan cambió solo. Quien
-- de verdad quiera rehacer uno de esos días entra a ese día.
--
-- SE ESCRIBE PUBLICADO Y NO COMO BORRADOR. Un borrador es para revisar
-- antes de soltar, y treinta borradores que habría que publicar uno por
-- uno no serían un atajo: serían el mismo trabajo con otro nombre. La
-- rejilla que se aplica es la que la persona acaba de mirar.
--
-- TODO EN UNA TRANSACCIÓN. Si un tipo está mal escrito, no quedan
-- quince días planeados y quince sin planear.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. QUÉ DÍAS DE UN RANGO YA TIENEN PLAN
--
-- La pantalla la usa ANTES de aplicar, para decir cuántos días van a
-- quedar planeados y cuáles se van a saltar. Avisar antes vale más que
-- explicar después.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_dias_con_plan(date, date);

create function public.traspaso_dias_con_plan(p_desde date, p_hasta date)
returns table (fecha date, lineas integer, viajes integer)
language sql
stable
set search_path = public
as $$
  select p.fecha, count(*)::int, coalesce(sum(p.planeado), 0)::int
    from public.traspasos_plan p
   where p.fecha between p_desde and p_hasta
     and p.publicado and p.estado = 'registrado' and p.planeado > 0
   group by p.fecha
   order by p.fecha
$$;

grant execute on function public.traspaso_dias_con_plan(date, date) to authenticated;


-- ---------------------------------------------------------------------
-- 2. APLICAR LA REJILLA A VARIOS DÍAS
--
-- Devuelve una fila por fecha pedida, diciendo qué pasó con cada una.
-- Devolver solo un número —"22 días planeados"— dejaría a quien lo lee
-- sin saber cuáles dos se saltaron, que es justo lo que necesita saber.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_plan_a_varios(date[], jsonb, jsonb);

create function public.traspaso_plan_a_varios(
  p_fechas  date[],
  p_lineas  jsonb,                       -- [{"turno":"A","tipo":"pet","planeado":6}, …]
  p_vacios  jsonb default '[]'::jsonb    -- [{"turno":"A","vacios":2}, …]
)
returns table (fecha date, resultado text, lineas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  f       date;
  r       jsonb;
  v_turno text;
  v_n     integer;
  v_total integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Armar el plan requiere rol de supervisor o administrador';
  end if;

  if coalesce(array_length(p_fechas, 1), 0) = 0 then
    raise exception 'No se escogió ningún día';
  end if;

  /* Un tope con una razón: un año. Más que eso no es una planeación,
     es un dedo que se resbaló en el calendario — y serían miles de
     filas escritas de un toque. */
  if array_length(p_fechas, 1) > 366 then
    raise exception 'Son % días. De una sola vez se pueden planear hasta 366',
      array_length(p_fechas, 1);
  end if;

  /* SE VALIDA TODO ANTES DE ESCRIBIR NADA. Si el turno o el tipo están
     mal, el error sale una vez y no una por cada día — y sobre todo,
     sale antes de haber escrito el primero. */
  for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_turno := upper(btrim(r->>'turno'));
    if v_turno not in ('A','B','C') then
      raise exception 'El turno % no existe: son A, B o C', r->>'turno';
    end if;
    if not exists (select 1 from public.traspasos_tipos
                    where clave = r->>'tipo' and activo) then
      raise exception 'El tipo % no existe o está desactivado', r->>'tipo';
    end if;
  end loop;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x
     where coalesce((x.value->>'planeado')::int, 0) > 0
  ) then
    raise exception 'La rejilla está vacía: no hay nada que aplicar';
  end if;

  foreach f in array p_fechas
  loop
    /* YA TENÍA PLAN: no se toca y se dice. */
    if exists (select 1 from public.traspasos_plan p
                where p.fecha = f and p.publicado
                  and p.estado = 'registrado' and p.planeado > 0) then
      fecha := f; resultado := 'ya_tenia'; lineas := 0;
      return next;
      continue;
    end if;

    /* El borrador de ese día, si lo hubiera, se va: la rejilla que se
       está aplicando es la que manda, y dejar un borrador viejo debajo
       de un plan publicado solo confunde al que vuelva a ese día.

       CON ALIAS, Y NO POR ADORNO: esta función DEVUELVE una columna que
       se llama `fecha`, así que un `where fecha = f` a secas es
       ambiguo —Postgres no sabe si es la columna de la tabla o la de
       salida— y revienta en tiempo de ejecución, no al crearla. */
    delete from public.traspasos_plan p
     where p.fecha = f and p.estado = 'registrado';

    v_n := 0;
    for r in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
    loop
      continue when coalesce((r->>'planeado')::int, 0) <= 0;
      insert into public.traspasos_plan
        (fecha, turno, tipo, planeado, publicado, publicado_en, publicado_por, creado_por)
      values
        (f, upper(btrim(r->>'turno')), r->>'tipo', (r->>'planeado')::int,
         true, now(), auth.uid(), auth.uid());
      v_n := v_n + 1;
    end loop;

    delete from public.traspasos_plan_vacios where traspasos_plan_vacios.fecha = f;
    for r in select * from jsonb_array_elements(coalesce(p_vacios, '[]'::jsonb))
    loop
      v_turno := upper(btrim(r->>'turno'));
      continue when v_turno not in ('A','B','C');
      continue when coalesce((r->>'vacios')::int, 0) <= 0;
      insert into public.traspasos_plan_vacios (fecha, turno, vacios, creado_por)
      values (f, v_turno, (r->>'vacios')::int, auth.uid());
    end loop;

    v_total := v_total + 1;
    fecha := f; resultado := 'planeado'; lineas := v_n;
    return next;
  end loop;

  if v_total = 0 then
    raise exception 'Los % días escogidos ya tenían plan publicado. Ninguno se cambió',
      array_length(p_fechas, 1);
  end if;
end $$;

revoke all on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) from public;
grant execute on function public.traspaso_plan_a_varios(date[], jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regprocedure('public.traspaso_plan_a_varios(date[], jsonb, jsonb)') is null then
    v_falta := v_falta || ' traspaso_plan_a_varios';
  end if;
  if to_regprocedure('public.traspaso_dias_con_plan(date, date)') is null then
    v_falta := v_falta || ' traspaso_dias_con_plan';
  end if;
  if v_falta <> '' then
    raise exception 'FALTÓ:%', v_falta;
  end if;
  raise notice 'Planear varios días: listo.';
end $$;
