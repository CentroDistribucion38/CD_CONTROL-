-- =====================================================================
-- TRASPASOS · QUÉ TIPO LLEVA VIDRIO EN TOLVAS, COMO DATO Y NO ADIVINADO
-- ---------------------------------------------------------------------
-- «Que esas tolvas solo le aparezcan a TOLVAS, no a CASCO DE VIDRIO.»
--
-- EL BLOQUE DE «VIDRIO PESADO ESPERANDO CAMIÓN» —el que al registrar
-- ofrece las cédulas y llena la placa y la cantidad— se estaba decidiendo
-- LEYENDO EL NOMBRE DEL TIPO: si el nombre contenía la palabra «tolva»,
-- salía.
--
-- ESO ESTUVO MAL DESDE EL PRIMER DÍA, y no por un descuido: adivinar una
-- regla leyendo texto libre falla siempre, tarde o temprano. El nombre
-- de un tipo se edita desde el Maestro —nadie tiene por qué saber que
-- esa palabra decide algo—, mañana puede haber «Casco vidrio (tolvas)» o
-- «Tolvas de PET», y la pantalla cambiaría de comportamiento sin que
-- nadie tocara una línea de código ni entendiera por qué.
--
-- Desde hoy es una CASILLA del maestro, al lado de las otras dos que ya
-- existen por tipo (`cuenta_plan`, `pregunta_arenosa`). Se prende y se
-- apaga desde Traspasos → Maestro y no hace falta desplegar nada.
--
-- ---------------------------------------------------------------------
-- LA SEMILLA ES UNA SUGERENCIA, NO LA VERDAD
-- ---------------------------------------------------------------------
-- Se prende en los tipos cuyo nombre dice «tolva» Y NO dice «casco»,
-- que es justo la distinción que se pidió. Es el mismo texto libre de
-- antes, y por eso se hace UNA sola vez y se IMPRIME lo que quedó
-- prendido: para que se mire y se corrija en el Maestro si no cuadra.
-- Lo que cambia de fondo es que a partir de aquí manda la casilla.
--
-- Se puede correr dos veces: la semilla solo toca las filas que todavía
-- no tienen la casilla decidida.
-- =====================================================================
begin;

alter table public.traspasos_tipos
  add column if not exists lleva_vidrio boolean;

/* LA SEMILLA. `is null` y no `= false`: si alguien ya la apagó a mano,
   volver a correr esto no se la vuelve a prender. */
update public.traspasos_tipos
   set lleva_vidrio = (nombre ilike '%tolva%' and nombre not ilike '%casco%')
 where lleva_vidrio is null;

alter table public.traspasos_tipos
  alter column lleva_vidrio set default false;
alter table public.traspasos_tipos
  alter column lleva_vidrio set not null;

do $$
declare v_si text; v_no text;
begin
  select string_agg(nombre, ', ' order by nombre) into v_si
    from public.traspasos_tipos where lleva_vidrio;
  select string_agg(nombre, ', ' order by nombre) into v_no
    from public.traspasos_tipos where not lleva_vidrio and activo;

  raise notice '--------------------------------------------------------';
  raise notice 'LLEVAN VIDRIO EN TOLVAS (les sale el bloque al registrar):';
  raise notice '   %', coalesce(v_si, '(ninguno)');
  raise notice 'NO LLEVAN:';
  raise notice '   %', coalesce(v_no, '(ninguno)');
  raise notice '--------------------------------------------------------';
  raise notice 'MIRA ESA LISTA. Si un tipo quedo del lado que no es, se';
  raise notice 'corrige en Traspasos -> Maestro -> Tipos, en el menu de';
  raise notice 'la fila. Ya no depende de como se llame.';
end $$;

commit;
