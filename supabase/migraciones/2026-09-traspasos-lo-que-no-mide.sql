-- =====================================================================
-- TRASPASOS · LO QUE SE MOVIÓ Y NO MIDE, A LA VISTA
-- ---------------------------------------------------------------------
-- «Nosotros dejamos que los viajes de tolvas y estibas que no eran para
--  Arenosa no contaran en el %. Pero necesitamos dejar la tarjeta para
--  visualizar cuántos viajes hicieron: que no entre en el %, pero
--  puedan ver cuántos viajes hicieron de eso.»   — Santiago L, Bavaria
--
-- ---------------------------------------------------------------------
-- QUÉ PASABA
-- ---------------------------------------------------------------------
-- Los tipos que no miden salían de la vista ENTERA, y con razón: si
-- quedaban dentro con «planeado 3, cumplido 0», el tablero pintaba un
-- 0 % que no era verdad, y eso es peor que no mostrarlos.
--
-- Pero irse de la vista entera es irse también de la pantalla. Un
-- turno que movió nueve tolvas de vidrio veía un tablero que no
-- mencionaba ni una: el trabajo se hizo, costó horas y montacargas, y
-- en la reunión de la mañana no existía. Nadie discute un porcentaje
-- que no le cuenta lo que hizo.
--
-- ---------------------------------------------------------------------
-- LA REGLA, EN UNA LÍNEA
-- ---------------------------------------------------------------------
-- No entra en el %. Sí entra en la pantalla.
--
-- Son dos preguntas distintas y por eso son dos vistas distintas, no
-- una columna más en la de siempre: mezclarlas es exactamente cómo
-- alguien termina sumando tolvas al cumplido «porque estaban ahí».
--
--   v_traspasos_control          lo que MIDE el plan.
--   v_traspasos_fuera_del_plan   lo que se movió y NO mide.
--
-- ---------------------------------------------------------------------
-- LOS DOS MOTIVOS, SEPARADOS Y DICHOS POR SU NOMBRE
-- ---------------------------------------------------------------------
--   no_mide       el tipo no cuenta en el plan (las tolvas de vidrio).
--   no_arenosa    el tipo solo cuenta cuando el viaje es de Arenosa, y
--                 este no lo era (las estibas).
--
-- No se juntan en un «otros»: son dos decisiones distintas del negocio
-- y el día que una cambie hay que poder ver cuántos viajes toca.
--
-- ---------------------------------------------------------------------
-- Y SE PARTE EN SALIDOS Y POR SALIR, igual que el cumplido
-- ---------------------------------------------------------------------
-- Si esta tarjeta contara los registrados mientras la de al lado cuenta
-- los salidos, las dos cifras del mismo tablero estarían hablando de
-- cosas distintas sin avisar. Aquí se cuenta lo mismo y se dice lo
-- mismo: lo que salió, y lo que está esperando a facturación.
--
-- Va DESPUÉS de 2026-09-traspasos-cuenta-lo-que-salio.sql.
-- SE PUEDE CORRER VARIAS VECES. No toca datos ni permisos: crea una
-- vista nueva y no cambia ninguna de las que ya hay.
-- El delimitador de bloque de dos signos no se escribe en ningún
-- comentario: el editor de Supabase lo cuenta para trocear.
-- =====================================================================
begin;

do $bloque$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_viajes') is null then
    v_falta := v_falta || ' supabase/modulos/traspasos.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_tipos'
                    and column_name = 'cuenta_plan') then
    v_falta := v_falta || ' 2026-09-traspasos-cumplimiento.sql'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'salida_en') then
    v_falta := v_falta || ' 2026-09-traspasos-facturacion.sql'; end if;

  /* Y LA QUE DE VERDAD IMPORTA, QUE SE ME PASÓ: la comprobación del
     final suma `por_salir` de v_traspasos_control, y esa columna la
     crea la migración de «cuenta lo que salió». Sin ella esto no falla
     aquí arriba —donde el mensaje dice qué correr— sino ciento treinta
     renglones más abajo, con un «column por_salir does not exist» que
     no menciona ningún archivo y deja a quien lo corre adivinando.

     UNA GUARDIA QUE NO CUBRE TODO LO QUE EL ARCHIVO USA no sirve de
     nada: da la falsa seguridad de que si pasa, el resto corre. */
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_traspasos_control'
                    and column_name = 'por_salir') then
    v_falta := v_falta || ' 2026-09-traspasos-cuenta-lo-que-salio.sql'; end if;

  if v_falta <> '' then
    raise exception 'Falta correr antes:% — corre ese o esos archivos primero, en ese orden, y vuelve a correr este.', v_falta;
  end if;
end $bloque$;


-- ---------------------------------------------------------------------
-- LO QUE SE MOVIÓ Y NO MIDE
--
-- El espejo exacto de `lineas` en v_traspasos_control: mismas uniones,
-- mismos filtros de estado y de vacío, y la condición del plan AL
-- REVÉS. Escrito así a propósito — si un día se agrega un filtro allá y
-- no acá, un viaje podría no aparecer en ninguna de las dos vistas y
-- desaparecer del tablero sin que nadie lo note.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_fuera_del_plan as
with lineas as (
  select v.id, v.fecha, v.turno, v.placa, v.viajes, v.salida_en,
         coalesce(vt.tipo, v.tipo)          as tipo,
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga,
         case when not t.cuenta_plan then 'no_mide' else 'no_arenosa' end  as motivo
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
    join public.traspasos_tipos t on t.clave = coalesce(vt.tipo, v.tipo)
   where v.estado = 'registrado' and not v.vacio
     and (not t.cuenta_plan
          or (t.pregunta_arenosa and not coalesce(v.arenosa, false)))
)
select
  l.fecha,
  l.turno,
  public.traspaso_orden_turno(l.turno)                as turno_orden,
  l.tipo,
  t.nombre                                            as tipo_nombre,
  t.orden                                             as tipo_orden,
  l.motivo,
  /* EL MOTIVO EN CRISTIANO, para que la pantalla no tenga que traducir
     una clave y el día que se agregue un motivo nuevo no haya que
     tocar el navegador para que se lea. */
  case l.motivo
    when 'no_mide'    then 'No cuenta en el plan'
    else                   'No era de Arenosa'
  end                                                 as motivo_nombre,
  sum(l.viajes)::int                                  as viajes,
  count(*)::int                                       as registros,
  coalesce(sum(l.carga), 0)::int                      as carga,
  count(distinct l.placa)::int                        as placas,
  /* SALIDOS Y ESPERANDO, igual que en el cumplido: dos cifras del mismo
     tablero no pueden estar contando cosas distintas sin decirlo. */
  sum(l.viajes) filter (where l.salida_en is not null)::int as salidos,
  coalesce(sum(l.viajes) filter (where l.salida_en is null), 0)::int as por_salir
from lineas l
join public.traspasos_tipos t on t.clave = l.tipo
group by l.fecha, l.turno, l.tipo, t.nombre, t.orden, l.motivo;

grant select on public.v_traspasos_fuera_del_plan to authenticated;


-- ---------------------------------------------------------------------
-- QUE QUEDE DICHO SI QUEDÓ
--
-- Y una comprobación que vale por todas: NINGÚN VIAJE PUEDE ESTAR EN
-- LAS DOS VISTAS, y entre las dos tienen que estar TODOS. Si un día
-- alguien toca un filtro en una sola, esto lo canta aquí en vez de
-- dejarlo salir como un viaje que no aparece en ninguna parte.
-- ---------------------------------------------------------------------
do $bloque$
declare v_dentro int; v_fuera int; v_todos int;
begin
  if to_regclass('public.v_traspasos_fuera_del_plan') is null then
    raise exception 'NO QUEDÓ: falta la vista v_traspasos_fuera_del_plan.';
  end if;

  select coalesce(sum(cumplido + por_salir), 0) into v_dentro
    from public.v_traspasos_control;
  select coalesce(sum(viajes), 0) into v_fuera
    from public.v_traspasos_fuera_del_plan;

  /* UNA FILA POR LÍNEA, igual que en las dos vistas: un camión que
     lleva casco Y estibas cuenta dos veces aquí porque cuenta dos veces
     allá. Contar viajes en vez de líneas haría que la suma nunca
     cuadrara y la comprobación se volvería ruido que alguien apaga. */
  select coalesce(sum(v.viajes), 0) into v_todos
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
   where v.estado = 'registrado' and not v.vacio;

  if v_dentro + v_fuera <> v_todos then
    raise exception 'NO CUADRA: adentro % + afuera % y en total hay %. Algún viaje quedó en las dos vistas o en ninguna.',
      v_dentro, v_fuera, v_todos;
  end if;

  raise notice 'LISTO: lo que no mide ya se puede ver. % viaje(s) fuera del plan, % adentro.', v_fuera, v_dentro;
end $bloque$;
commit;
