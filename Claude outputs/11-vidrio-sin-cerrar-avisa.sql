-- =====================================================================
-- FACTURACIÓN AVISA CUANDO EL VIDRIO DEL VH ESTÁ SIN CERRAR
-- ---------------------------------------------------------------------
-- «Creé un pesaje en salida y no lo veo en traspasos: generé un viaje y
--  me sale para colocar el documento, mas no para confirmar esas
--  tolvas.»
--
-- ---------------------------------------------------------------------
-- QUÉ PASABA, Y NO ERA UN ERROR — ERA UN SILENCIO
-- ---------------------------------------------------------------------
-- Una salida de vidrio nace ABIERTA y se va llenando tolva por tolva.
-- Solo se vuelve cédula cuando quien pesó la CIERRA con su firma: hasta
-- ese momento el número de tolvas todavía puede cambiar, así que
-- ofrecérsela a facturación sería despachar una carga a medio medir.
-- Eso está bien y no se toca.
--
-- LO QUE ESTABA MAL ERA EL SILENCIO. Facturación abría el viaje, veía
-- solo el campo del documento, y no tenía forma de saber que en la
-- báscula había un pesaje a medias de ESA MISMA PLACA. Dos finales, los
-- dos malos: o se piensa que la función no sirve —que es lo que pasó—,
-- o se le da salida al Vh y el vidrio se va con él mientras el registro
-- dice que sigue en el patio.
--
-- Un freno que no se ve no es un freno: es una trampa.
--
-- ---------------------------------------------------------------------
-- LO QUE HACE ESTA MIGRACIÓN
-- ---------------------------------------------------------------------
-- Una vista más, hermana de v_salidas_por_despachar, con las salidas de
-- vidrio que están ABIERTAS. La pantalla la usa para decir, en la misma
-- tarjeta del viaje y con el nombre de la salida:
--
--   «Este Vh tiene la salida SR-0042 en la báscula, sin cerrar, con 2
--    tolva(s) pesadas. Quien pesó tiene que cerrarla para que aparezca
--    aquí.»
--
-- NO FRENA. Se avisa, no se traba. Una salida abierta puede ser de un
-- viaje que todavía no existe, y trancar el patio por un pesaje que
-- alguien dejó a medias ayer sería cambiar un problema por otro. La que
-- SÍ frena es la cédula cerrada sin despachar, que ya está puesta.
--
-- Va DESPUÉS de 2026-09-vidrio-cedula-facturacion.sql.
-- SE PUEDE CORRER VARIAS VECES. No toca datos, ni permisos, ni ninguna
-- vista de las que ya hay: crea una nueva.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regclass('public.roturas_salidas') is null then
    raise exception 'Falta correr antes: supabase/modulos/roturas.sql';
  end if;
  if to_regclass('public.v_salidas_por_despachar') is null then
    raise exception 'Falta correr antes: 2026-09-vidrio-cedula-facturacion.sql (el SQL 8) — corre ese primero y vuelve a correr este.';
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- LAS SALIDAS QUE ESTÁN EN LA BÁSCULA
--
-- Hermana exacta de v_salidas_por_despachar: mismas columnas y mismos
-- nombres, para que la pantalla pinte las dos con el mismo código y no
-- haya dos formas de decir «una salida de vidrio».
--
-- ABIERTAS Y SIN DESPACHAR. La segunda condición sobra hoy —una salida
-- abierta no se ha podido despachar— pero se escribe igual: el día que
-- se pueda reabrir una salida ya despachada, esta vista no tiene por
-- qué empezar a mentir sola.
-- ---------------------------------------------------------------------
create or replace view public.v_salidas_en_bascula as
with tol as (
  select salida_id,
         count(*)                as tolvas,
         sum(bruto_kg - tara_kg) as neto_kg
    from public.roturas_salida_tolvas
   group by salida_id)
select
  s.id,
  s.codigo                                  as cedula,
  s.placa,
  coalesce(t.tolvas, 0)                     as tolvas,
  round(coalesce(t.neto_kg, 0)::numeric, 1) as neto_kg,
  s.observacion,
  s.creada_por,
  s.creada_en,
  /* CUÁNTAS HORAS LLEVA ABIERTA. Un pesaje de hace diez minutos es un
     camión en la báscula; uno de hace dos días es un pesaje que alguien
     dejó tirado, y en la pantalla tienen que verse distinto. */
  greatest(0, floor(extract(epoch from (now() - s.creada_en)) / 3600))::int as horas_abierta
from public.roturas_salidas s
left join tol t on t.salida_id = s.id
where s.estado = 'abierta'
  and s.despachada_en is null;

grant select on public.v_salidas_en_bascula to authenticated;


-- ---------------------------------------------------------------------
-- QUE QUEDE DICHO SI QUEDÓ
-- ---------------------------------------------------------------------
do $bloque$
declare n int;
begin
  if to_regclass('public.v_salidas_en_bascula') is null then
    raise exception 'NO QUEDÓ: falta la vista v_salidas_en_bascula.';
  end if;

  /* NINGUNA SALIDA PUEDE ESTAR EN LAS DOS VISTAS. Una está en la
     báscula o está lista para despachar; si estuviera en las dos, la
     tarjeta de facturación la ofrecería y la avisaría a la vez. */
  select count(*) into n
    from public.v_salidas_en_bascula a
    join public.v_salidas_por_despachar b on b.id = a.id;
  if n > 0 then
    raise exception 'NO QUEDÓ: % salida(s) salen a la vez como abiertas y como listas para despachar.', n;
  end if;

  select count(*) into n from public.v_salidas_en_bascula;
  raise notice 'LISTO: facturación ya avisa del vidrio sin cerrar. Ahora mismo hay % salida(s) en la báscula.', n;
end $bloque$;
commit;
