-- =====================================================================
-- TRASPASOS · DEJAR UN DÍA SIN PLAN
--
-- Requiere: supabase/modulos/traspasos.sql
--           supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- Un plan se podía cambiar —se abre el día, se corrigen los números y se
-- vuelve a publicar— pero NO SE PODÍA BORRAR. Poner las veintisiete
-- celdas en cero y darle publicar no dejaba el día limpio: publicar
-- exige que haya algo sin publicar, y con la rejilla vacía no hay nada,
-- así que salía «No hay nada sin publicar en ese día» y el plan viejo
-- seguía ahí. Quien planeó un domingo por equivocación se quedaba con un
-- domingo planeado para siempre.
--
-- LOS VIAJES NO SE TOCAN. Borrar el plan de un día no borra un solo
-- viaje: los que ya se registraron siguen registrados, con su placa, su
-- ruta y su hora. Lo único que cambia es que dejan de tener contra qué
-- compararse — pasan a contar todos como adicionales, que es
-- exactamente lo que son cuando no hay plan.
--
-- SE BORRA DE VERDAD, no se marca anulado. Es lo mismo que ya hacen
-- guardar y publicar con las líneas que reemplazan: el plan de un día
-- es una foto del día, no un histórico. Tener dos formas de que una
-- línea "no cuente" —borrada y anulada— obliga a todas las consultas a
-- acordarse de las dos.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

drop function if exists public.traspaso_borrar_plan(date);

create function public.traspaso_borrar_plan(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.es_editor() then
    raise exception 'Borrar el plan requiere rol de supervisor o administrador';
  end if;

  if p_fecha is null then
    raise exception 'Hay que decir de qué día';
  end if;

  /* SE VA TODO LO DEL DÍA: lo publicado y el borrador. Borrar solo lo
     publicado dejaría un borrador huérfano que reaparecería en la
     rejilla la próxima vez que alguien abriera ese día, y parecería que
     el borrado no sirvió. */
  delete from public.traspasos_plan where fecha = p_fecha;
  get diagnostics v_n = row_count;

  /* Los vacíos previstos son parte del plan del día, no un dato aparte.
     Si se quedaran, el día seguiría diciendo "se esperaban 3 vacíos" sin
     un plan que los explique. */
  delete from public.traspasos_plan_vacios where fecha = p_fecha;

  return v_n;
end $$;

revoke all on function public.traspaso_borrar_plan(date) from public;
grant execute on function public.traspaso_borrar_plan(date) to authenticated;


-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.traspaso_borrar_plan(date)') is null then
    raise exception 'FALTÓ: traspaso_borrar_plan';
  end if;
  raise notice 'Listo: ya se puede dejar un día sin plan.';
end $$;
