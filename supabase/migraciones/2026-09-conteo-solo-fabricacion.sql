-- =====================================================================
-- CONTEO · SOLO SE TECLEA LA FECHA DE FABRICACIÓN
--
-- «Te dije: se anota fecha de fabricación y se calcula sola la fecha de
--  vencimiento.»
--
-- ---------------------------------------------------------------------
-- QUÉ HICE MAL
-- ---------------------------------------------------------------------
-- Ayer le quité el interruptor «Vence | Se fabricó» a la pantalla, pero
-- le DEJÉ la posición «Vence» adentro «por si acaso»: para los renglones
-- anotados antes del cambio, que sí traen un vencimiento tecleado.
--
-- Dos consecuencias, y las dos me las encontró él en diez minutos:
--
--   1. EL BORRADOR GUARDADO EN EL TELÉFONO se quedaba pegado. La
--      pantalla recuerda el renglón a medio llenar en localStorage, y
--      los guardados de antes del cambio traían la marca «vence». Al
--      restaurarse, el formulario abría en «Vence»… y como ya no hay
--      interruptor, NO HABÍA MANERA DE SALIR DE AHÍ. Un estado sin
--      salida que yo mismo dejé al quitar el único control que lo
--      cambiaba.
--
--   2. Y aunque hubiera funcionado, seguía estando mal: la pantalla
--      mostraba «VENCE» cuando lo que él pidió es que esa palabra no
--      aparezca.
--
-- ---------------------------------------------------------------------
-- LO QUE DICE LA HOJA (FEFO 002.xlsx, columna S)
-- ---------------------------------------------------------------------
--     S = IFERROR(DATE(K+2000, J, I), "")
--
-- Es decir: lo que se teclea en D/M/A ES el vencimiento, sin sumarle
-- nada. La cuenta de la vida útil se venía haciendo DE CABEZA antes de
-- escribir el número. Eso es justo lo que la app viene a quitar — y por
-- eso «Vence» no tiene por qué existir como opción.
--
-- ---------------------------------------------------------------------
-- LA SALIDA: CONVERTIR LO VIEJO, NO ARRASTRARLO
-- ---------------------------------------------------------------------
-- Un renglón con vencimiento tecleado y sin fabricación se puede
-- completar hacia atrás, con la misma fórmula al revés:
--
--     fabricación = vencimiento − vida útil
--
-- EL VENCIMIENTO NO SE TOCA. Es lo que manda —de él salen «días para
-- vencer» y «días para salir»— y sigue siendo exactamente el mismo
-- número. Lo único que cambia es que ahora el renglón también dice de
-- qué día es la estiba, que es lo que hacía falta para que la pantalla
-- pueda abrirlo sin preguntar por una fecha que ya no se teclea.
--
-- POR QUÉ SE PUEDE HACER SIN MENTIR: la cuenta es exacta y reversible.
-- Si vencimiento = fabricación + vida útil, entonces fabricación =
-- vencimiento − vida útil da el mismo día que estaba impreso en la
-- estiba. No se inventa un dato: se despeja el que ya estaba ahí.
--
-- DÓNDE NO SE PUEDE, NO SE HACE:
--   · Renglones SIN ninguna fecha —los envases retornables, que no
--     traen fecha impresa— se quedan sin las dos. Correcto: no les
--     falta nada.
--   · Materiales sin vida útil en el maestro. No hay con qué despejar,
--     así que se dejan como están y la migración DICE CUÁNTOS SON al
--     final, en vez de dejarlos en silencio.
--
-- TAMBIÉN TOCA LOS CONTEOS YA ENVIADOS, y a propósito: no cambia
-- ninguna cifra que algún informe mire —el vencimiento es el mismo—,
-- solo rellena de dónde salía. Dejar fuera lo enviado partiría los datos
-- en dos épocas sin ganar nada.
--
-- ORDEN: después de supabase/migraciones/2026-09-conteo-fabricacion.sql
-- SE PUEDE CORRER VARIAS VECES. La segunda vuelta no encuentra nada que
-- convertir, que es lo que tiene que pasar.
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas'
                    and column_name = 'fab_anio') then
    raise exception
      'Falta supabase/migraciones/2026-09-conteo-fabricacion.sql. Ese va primero.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. ANTES DE TOCAR NADA, DECIR QUÉ SE VA A TOCAR
-- ---------------------------------------------------------------------
do $$
declare v_convertibles int; v_sin_vida int; v_sin_fecha int; v_ya int;
begin
  select count(*) into v_ya
    from public.conteo_lineas where fab_anio is not null;

  select count(*) into v_convertibles
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is null and l.venc_anio is not null
     and coalesce(p.vida_util, 0) > 0;

  select count(*) into v_sin_vida
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is null and l.venc_anio is not null
     and coalesce(p.vida_util, 0) <= 0;

  select count(*) into v_sin_fecha
    from public.conteo_lineas
   where fab_anio is null and venc_anio is null;

  raise notice 'Renglones que ya tienen fabricación: %', v_ya;
  raise notice 'Se les va a despejar la fabricación (vencimiento − vida útil): %', v_convertibles;
  raise notice 'Con vencimiento pero SIN vida útil en el maestro (se quedan como están): %', v_sin_vida;
  raise notice 'Sin ninguna fecha —envases y demás—: % (así se quedan, no les falta)', v_sin_fecha;
end $$;


-- ---------------------------------------------------------------------
-- 2. DESPEJAR LA FABRICACIÓN
--
-- La fecha vive en tres pedazos —día, mes, año de dos cifras— porque así
-- está impresa en la estiba y así se teclea. Aquí se arma, se le resta
-- la vida útil y se vuelve a partir en tres.
-- ---------------------------------------------------------------------
create temp table _convertidas on commit drop as
with u as (
update public.conteo_lineas l
   set fab_dia  = extract(day   from (
         make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util))::smallint,
       fab_mes  = extract(month from (
         make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util))::smallint,
       fab_anio = (extract(year from (
         make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia) - p.vida_util))::integer - 2000)::smallint
  from public.productos p
 where p.id = l.producto_id
   and l.fab_anio is null
   and l.venc_anio is not null
   and l.venc_mes is not null
   and l.venc_dia is not null
   and coalesce(p.vida_util, 0) > 0
returning l.id)
select id from u;


-- ---------------------------------------------------------------------
-- 3. QUEDÓ ASÍ
--
-- No se comprueba «¿corrió?», se comprueba LA CUENTA: que en cada
-- renglón CONVERTIDO, fabricación + vida útil dé exactamente el
-- vencimiento que ya estaba guardado. Es la única forma de saber que la
-- conversión no corrió un día por un redondeo o por un año de dos
-- cifras mal armado.
--
-- SOLO LOS CONVERTIDOS, Y NO TODOS. La primera versión de este archivo
-- comprobaba la cuenta en TODOS los renglones que tuvieran las dos
-- fechas, y eso habría hecho que la migración se negara a correr por un
-- renglón que ella no tocó: basta con que alguien le cambie la vida útil
-- a un material en el maestro para que un renglón viejo —tecleado con su
-- fabricación, y correcto el día que se tecleó— deje de cuadrar contra
-- la vida útil de hoy. Un conteo es una foto de su día; la migración no
-- tiene por qué reescribirlo ni por qué reventar por él. Se cuenta y se
-- avisa, que es otra cosa.
-- ---------------------------------------------------------------------
do $$
declare v_malos int; v_quedan int; v_ejemplo text;
begin
  select count(*) into v_malos
    from public.conteo_lineas l
    join _convertidas c on c.id = l.id
    join public.productos p on p.id = l.producto_id
   where make_date(2000 + l.fab_anio, l.fab_mes, l.fab_dia) + p.vida_util
       <> make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia);

  if v_malos > 0 then
    select 'sku ' || p.sku || ': fab ' ||
           to_char(make_date(2000 + l.fab_anio, l.fab_mes, l.fab_dia), 'DD/MM/YYYY') ||
           ' + ' || p.vida_util || ' días no da ' ||
           to_char(make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia), 'DD/MM/YYYY')
      into v_ejemplo
      from public.conteo_lineas l
      join _convertidas c on c.id = l.id
      join public.productos p on p.id = l.producto_id
     where make_date(2000 + l.fab_anio, l.fab_mes, l.fab_dia) + p.vida_util
         <> make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia)
     limit 1;
    raise exception 'La cuenta no cuadra en % renglón(es). Ejemplo: %', v_malos, v_ejemplo;
  end if;

  select count(*) into v_quedan
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is null and l.venc_anio is not null
     and coalesce(p.vida_util, 0) > 0;

  if v_quedan > 0 then
    raise exception 'Quedaron % renglones convertibles sin convertir', v_quedan;
  end if;

  raise notice 'Listo. En los % renglones convertidos, fabricación + vida útil da el vencimiento que ya estaba guardado.',
    (select count(*) from _convertidas);

  /* LOS QUE NO CUADRAN Y NO SON COSA DE ESTA MIGRACIÓN. Se tecleó su
     fabricación en su día, se guardó el vencimiento que salía con la
     vida útil de entonces, y después alguien cambió esa vida útil en el
     maestro. El renglón no está mal: es de otro día. Se dice cuántos
     son y no se toca ninguno — reescribirlos sería cambiar lo que se
     contó, y el vencimiento guardado es el que los informes ya usaron. */
  select count(*) into v_quedan
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is not null and l.venc_anio is not null
     and coalesce(p.vida_util, 0) > 0
     and l.id not in (select id from _convertidas)
     and make_date(2000 + l.fab_anio, l.fab_mes, l.fab_dia) + p.vida_util
       <> make_date(2000 + l.venc_anio, l.venc_mes, l.venc_dia);
  if v_quedan > 0 then
    raise notice 'Nota: % renglón(es) de antes no cuadran contra la vida útil de HOY —le cambió después de contarse—. Se dejan como están: un conteo es la foto de su día.', v_quedan;
  end if;

  /* LO QUE NO SE PUDO, DICHO EN VOZ ALTA. Si hay renglones con
     vencimiento y sin vida útil en el maestro, la pantalla los va a
     abrir con las casillas vacías: no hay con qué despejar la
     fabricación, y adivinarla sería inventarse el dato. Se arregla
     poniéndole la vida útil a ese material en el maestro y volviendo a
     correr este archivo. */
  select count(*) into v_quedan
    from public.conteo_lineas l join public.productos p on p.id = l.producto_id
   where l.fab_anio is null and l.venc_anio is not null
     and coalesce(p.vida_util, 0) <= 0;
  if v_quedan > 0 then
    raise notice 'OJO: % renglón(es) tienen vencimiento y su material no tiene vida útil en el maestro.', v_quedan;
    raise notice 'Esos se abren con las casillas de fecha vacías. Ponle la vida útil al material y vuelve a correr este archivo.';
  end if;
end $$;

commit;
