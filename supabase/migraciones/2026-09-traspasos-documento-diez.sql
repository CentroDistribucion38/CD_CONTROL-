-- =====================================================================
-- EL DOCUMENTO DEL VIAJE: NÚMEROS, Y DIEZ COMO MÁXIMO
--
-- «En el documento son máximo 10 números.»
--
-- ---------------------------------------------------------------------
-- QUÉ CAMBIA
-- ---------------------------------------------------------------------
-- La columna `documento` se creó sin forma: aceptaba cualquier texto de
-- cualquier largo. La pantalla ya no deja teclear otra cosa —solo
-- cifras, y se corta en diez—, pero la pantalla no es la puerta: la
-- función es callable desde cualquier cliente con la llave anon, y un
-- documento de veinte cifras entraría sin que nada chille.
--
-- LO QUE DE VERDAD EVITA ESTA REGLA es el pegado doble. Un documento se
-- copia del papel o de otro sistema, y pegar dos seguidos —«12345678901234567890»—
-- produce un número que NO choca con el índice único, porque no es
-- igual a ninguno de los dos. Queda registrado, parece bueno, y no se
-- vuelve a encontrar buscando por ninguno de los dos documentos reales.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA REGLA DE TABLA Y NO UN `if` EN LA FUNCIÓN
-- ---------------------------------------------------------------------
-- Meterlo en la función obligaría a reescribir `traspaso_registrar` y
-- `traspaso_editar_viaje` enteras —`create or replace` no parchea un
-- pedazo— y esas dos funciones ya se me han perdido cosas al
-- reescribirlas de memoria: tres mensajes de error distintos, una
-- comprobación de ubicación activa y un aviso amable, en un solo
-- descuido.
--
-- La regla de tabla es UNA línea, no toca las funciones, y además cubre
-- más: vale para cualquier cosa que escriba en esa tabla, no solo para
-- las dos funciones de hoy.
--
-- VA SOBRE `documento_clave` Y NO SOBRE `documento`. `documento_clave`
-- es la columna generada que ya guarda la versión normalizada —sin
-- guiones ni espacios, en mayúscula—, así que «12 345» y «12-345» se
-- juzgan por lo que son. Sobre `documento` a secas, un documento con un
-- espacio de más contaría el espacio como cifra.
--
-- ---------------------------------------------------------------------
-- LOS QUE YA ESTÁN
-- ---------------------------------------------------------------------
-- Si algún viaje ya registrado tiene un documento con letras o con más
-- de diez cifras, esta regla no puede entrar. NO SE BORRAN NI SE
-- RECORTAN: se dicen, con su placa y su fecha, para que alguien los
-- arregle mirando el papel. Recortar un documento a diez cifras por
-- nuestra cuenta sería inventarse cuál era el bueno.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA EN UN SOLO BLOQUE
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción: un `begin;` arriba no lo agrupa como uno espera. Un
-- bloque anónimo es UNA sentencia: o pasa entero o no pasa nada.
--
-- Y por eso el delimitador del bloque no se escribe en ningún comentario
-- de este archivo: el editor cuenta esos signos para saber dónde acaba
-- cada sentencia, y uno suelto en un comentario parte el bloque por la
-- mitad. Ya pasó en otro lote.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-documento.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $$
declare
  v_malos int; v_ejemplo text; v_cond text;
begin
  if to_regclass('public.traspasos_viajes') is null then
    raise exception 'Falta supabase/modulos/traspasos.sql. Ese va primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'traspasos_viajes'
                    and column_name = 'documento_clave') then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-documento.sql. Ese va primero.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. LOS QUE YA ESTÁN Y NO CUMPLEN
  --
  -- Se miran ANTES de tocar nada y se nombran uno a uno. Un
  -- «violates check constraint» a secas manda a buscar la fila mala a
  -- mano entre todos los viajes.
  -- -------------------------------------------------------------------
  select count(*), min(placa || ' del ' || to_char(fecha, 'DD/MM/YYYY') || ' → ' || documento)
    into v_malos, v_ejemplo
    from public.traspasos_viajes
   where documento_clave is not null
     and documento_clave !~ '^[0-9]{1,10}$';

  if v_malos > 0 then
    raise exception 'Hay % viaje(s) con un documento que no son números o que pasa de diez cifras, por ejemplo: %. No se tocan desde aquí —recortarlo sería inventarse cuál era el bueno—: corrígelos en la pantalla de Traspasos y vuelve a correr esto.',
      v_malos, v_ejemplo;
  end if;

  -- -------------------------------------------------------------------
  -- 2. LA REGLA
  --
  -- Se suelta y se vuelve a poner para que, si ya estaba con otra
  -- forma, quede con la de hoy. `add constraint` revalida la tabla
  -- entera, que es justo lo que se quiere: la comprobación de arriba
  -- dice QUÉ está mal, y esta se asegura de que no quede nada.
  -- -------------------------------------------------------------------
  alter table public.traspasos_viajes
    drop constraint if exists traspasos_viajes_documento_diez;

  /* EL `is null or` ES PARA QUIEN LEE, NO PARA POSTGRES. Un CHECK da por
     buena la fila cuando la condición sale NULL, así que el viaje vacío
     —que no lleva papel— pasaría igual sin escribirlo. Se deja escrito
     porque la regla dice una decisión: el vacío NO tiene documento a
     propósito, no por un hueco. Quien venga a cambiar esta línea tiene
     que ver esa decisión en la línea, no deducirla.

     Y si alguien alguna vez la reescribe con `coalesce(documento_clave,
     '')`, la condición deja de dar NULL y el viaje vacío deja de poder
     registrarse. El arnés lo caza; el ojo, no. */
  alter table public.traspasos_viajes
    add constraint traspasos_viajes_documento_diez
    check (documento_clave is null or documento_clave ~ '^[0-9]{1,10}$');

  -- -------------------------------------------------------------------
  -- 3. QUEDÓ ASÍ
  -- -------------------------------------------------------------------
  select pg_get_constraintdef(oid) into v_cond
    from pg_constraint
   where conrelid = 'public.traspasos_viajes'::regclass
     and conname = 'traspasos_viajes_documento_diez';

  if v_cond is null then
    raise exception 'La regla no quedó puesta.';
  end if;
  if v_cond not like '%documento_clave%' then
    raise exception 'La regla no habla de documento_clave: %', v_cond;
  end if;
  if v_cond not like '%10%' then
    raise exception 'La regla no dice diez: %', v_cond;
  end if;

  raise notice 'Listo. El documento del viaje va en números y con diez cifras como máximo.';
  raise notice 'Se juzga sobre documento_clave, así que «12 345» y «12-345» cuentan cinco cifras, no seis ni siete.';
end $$;
