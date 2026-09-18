-- =====================================================================
-- CONTROL · TODO LO QUE FALTA CORRER, EN UN SOLO ARCHIVO
--
-- Se pega entero en el SQL Editor de Supabase y se le da Run UNA vez.
-- Las 6 migraciones van en el orden de sus dependencias, y todas se
-- pueden correr varias veces sin romper nada: si alguna ya estaba
-- puesta, simplemente no cambia nada.
--
-- AL FINAL SALE UN RESUMEN con lo que quedó. Si algo falla a mitad de
-- camino, el editor SIGUE con lo que viene detrás —no es una sola
-- transacción—, así que ese resumen es lo que dice de verdad qué hay.
-- =====================================================================

-- =====================================================================
-- 1 de 6 · La base del conteo: permiso de /inventario/base
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-inventario-base.sql

-- =====================================================================
-- LA BASE DEL CONTEO — pantalla nueva, permiso nuevo
--
-- «Quiero mi base de datos con toda la información.»
--
-- ---------------------------------------------------------------------
-- QUÉ HACE ESTE ARCHIVO
-- ---------------------------------------------------------------------
-- NADA CON LOS DATOS. No crea tablas, no crea vistas y no toca un solo
-- renglón de conteo: la pantalla lee `v_conteo_fefo` y `v_conteos_fefo`,
-- que ya existen y ya están abiertas a cualquier autenticado.
--
-- Lo único que hace es DAR LA LLAVE de la pantalla nueva. Los permisos
-- de este proyecto se guardan como el TEXTO de la dirección —en
-- rol_permisos.seccion y en perfiles.permisos_extra— y una dirección
-- que no está en ninguna de las dos tablas vale 'ninguno' para todo el
-- mundo. Sin este archivo, /inventario/base quedaría invisible para
-- todos menos para quien administra la plataforma: no daría error, la
-- sección simplemente no saldría en el menú y nadie sabría por qué.
--
-- ---------------------------------------------------------------------
-- A QUIÉN SE LE DA, Y POR QUÉ A ESOS
-- ---------------------------------------------------------------------
-- A QUIEN YA VE EL TABLERO (/inventario). No es una elección cómoda: el
-- tablero SALE de la base. Son la misma lectura —lo enviado— una entera
-- y la otra recortada a una sola pregunta. Quien puede decidir qué se
-- despacha primero ya está viendo esos números; negarle el detalle del
-- que salen sería dejarlo decidir sin poder comprobar.
--
-- Y SE DA EN 'ver', NUNCA EN 'editar', aunque en el tablero tenga
-- 'editar'. Esta pantalla no escribe nada: no corrige, no borra y no
-- envía. Copiar un 'editar' dejaría a /admin/roles ofreciendo un nivel
-- que no existe, y eso se lee como que desde aquí se puede arreglar un
-- renglón — que es justo lo que no se puede, y a propósito: los
-- borradores son de quien los está caminando.
--
-- ---------------------------------------------------------------------
-- EL 'ninguno' A MANO SE RESPETA
-- ---------------------------------------------------------------------
-- A una persona se le puede haber CERRADO /inventario en particular, por
-- encima de lo que da su rol. Si aquí se le copiara un 'ver' a secas,
-- recuperaría por la puerta de atrás —con más detalle todavía— lo que
-- alguien le cerró a propósito. Un 'ninguno' entra como 'ninguno'.
--
-- ---------------------------------------------------------------------
-- NO SE PISA LO QUE YA ESTÉ PUESTO
-- ---------------------------------------------------------------------
-- Si alguien ya le dio un nivel a /inventario/base —corriendo esto
-- antes, o a mano en /admin/roles—, ese manda. Una migración que se
-- puede correr varias veces no puede deshacer en la segunda vuelta lo
-- que una persona decidió entre las dos.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA EN UN SOLO BLOQUE
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción: un `begin;` arriba no lo agrupa como uno espera. Ya me
-- costó una migración que funcionaba con psql y reventaba allá. Un
-- bloque anónimo es UNA sentencia: o pasa entero o no pasa nada, lo
-- corra quien lo corra.
--
-- Y por eso mismo el delimitador del bloque no se escribe en ningún
-- comentario de este archivo: el editor cuenta esos signos para saber
-- dónde acaba cada sentencia, y uno suelto en un comentario le invierte
-- la cuenta y parte el bloque por la mitad. Pasó en otro lote.
--
-- ORDEN: después de supabase/02-roles.sql y supabase/03-usuarios.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $$
declare
  /* QUIÉNES SE VAN A TOCAR, APUNTADOS ANTES DE TOCARLOS.

     Hace falta para comprobar después SOLO lo que esta migración hizo.
     Sin esta lista, la comprobación juzgaría también al rol que ya
     tenía /inventario/base puesto a mano con otro nivel —y ese no se
     pisa a propósito—, así que la migración se negaría a correr por una
     fila que ella misma decidió respetar. Comprobar de más es tan error
     como comprobar de menos, y se ve igual de bien escrito. */
  v_roles_nuevos text[];
  v_personas_nuevas uuid[];
  v_roles int; v_personas int; v_malos int; v_ejemplo text;
begin
  if to_regclass('public.rol_permisos') is null then
    raise exception 'Falta supabase/02-roles.sql. Ese va primero.';
  end if;
  if to_regclass('public.perfiles') is null then
    raise exception 'Falta supabase/01-perfil.sql. Ese va primero.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. ANTES DE TOCAR NADA, DECIR QUÉ SE VA A TOCAR
  -- -------------------------------------------------------------------
  v_roles_nuevos := array(
    select p.rol from public.rol_permisos p
     where p.seccion = '/inventario'
       and not exists (select 1 from public.rol_permisos q
                        where q.rol = p.rol and q.seccion = '/inventario/base'));

  v_personas_nuevas := array(
    select id from public.perfiles
     where permisos_extra ? '/inventario'
       and not (permisos_extra ? '/inventario/base'));

  v_roles := coalesce(array_length(v_roles_nuevos, 1), 0);
  v_personas := coalesce(array_length(v_personas_nuevas, 1), 0);

  raise notice 'Roles que reciben la base del conteo: %', v_roles;
  raise notice 'Personas con permiso propio sobre el tablero que también se copia: %', v_personas;

  -- -------------------------------------------------------------------
  -- 2. LOS ROLES
  --
  -- 'ver' y no el nivel del tablero: la pantalla no escribe nada.
  -- -------------------------------------------------------------------
  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/inventario/base', 'ver'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel <> 'ninguno'
  on conflict (rol, seccion) do nothing;

  -- Al rol que tenga el tablero CERRADO se le deja cerrada la base
  -- también, escrito y no por omisión: así se ve en /admin/roles que la
  -- decisión está tomada, en vez de parecer una fila que falta.
  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/inventario/base', 'ninguno'
    from public.rol_permisos p
   where p.seccion = '/inventario'
     and p.nivel = 'ninguno'
  on conflict (rol, seccion) do nothing;

  -- -------------------------------------------------------------------
  -- 3. LOS PERMISOS PROPIOS DE CADA PERSONA
  --
  -- Existen para la excepción y MANDAN sobre el rol, hacia arriba y
  -- hacia abajo. Por eso hay que copiarlos también: a quien le quitaron
  -- /inventario a mano se le tiene que quedar quitada la base; y a quien
  -- se lo dieron por encima de su rol, dado.
  -- -------------------------------------------------------------------
  update public.perfiles
     set permisos_extra = permisos_extra || jsonb_build_object(
           '/inventario/base',
           case when permisos_extra ->> '/inventario' = 'ninguno' then 'ninguno' else 'ver' end)
   where permisos_extra ? '/inventario'
     and not (permisos_extra ? '/inventario/base');

  -- -------------------------------------------------------------------
  -- 4. QUEDÓ ASÍ — y solo se juzga lo que este archivo tocó
  -- -------------------------------------------------------------------
  select count(*), min(rol) into v_malos, v_ejemplo
    from public.rol_permisos
   where seccion = '/inventario/base'
     and rol = any(v_roles_nuevos)
     and nivel not in ('ver', 'ninguno');
  if v_malos > 0 then
    raise exception 'A % rol(es) les quedó un nivel que esta pantalla no tiene, por ejemplo %. Solo lee.',
      v_malos, v_ejemplo;
  end if;

  select count(*) into v_malos
    from public.rol_permisos p
   where p.rol = any(v_roles_nuevos)
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/inventario/base');
  if v_malos > 0 then
    raise exception 'A % rol(es) de los que iban a recibir la base no les llegó.', v_malos;
  end if;

  select count(*) into v_malos
    from public.perfiles
   where id = any(v_personas_nuevas)
     and not (permisos_extra ? '/inventario/base');
  if v_malos > 0 then
    raise exception 'A % persona(s) con permiso propio no se les copió la base.', v_malos;
  end if;

  -- Y EL 'ninguno' A MANO SIGUE SIENDO 'ninguno'. Es la comprobación que
  -- de verdad importa: si esto falla, alguien a quien le cerraron el
  -- tablero está viendo el detalle completo del que sale.
  select count(*) into v_malos
    from public.perfiles
   where id = any(v_personas_nuevas)
     and permisos_extra ->> '/inventario' = 'ninguno'
     and permisos_extra ->> '/inventario/base' <> 'ninguno';
  if v_malos > 0 then
    raise exception 'A % persona(s) con el tablero cerrado a mano se les abrió la base. Eso es justo lo que no puede pasar.',
      v_malos;
  end if;

  raise notice 'Listo. /inventario/base queda en «ver» para quien ya ve el tablero.';
  raise notice 'La pantalla no escribe nada: ni corrige, ni borra, ni envía.';
  raise notice 'Quien no lo quiera así, lo cambia en Administración → Roles.';
end $$;


-- =====================================================================
-- 2 de 6 · El documento del viaje: máximo 10 dígitos
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-traspasos-documento-diez.sql

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


-- =====================================================================
-- 3 de 6 · El día cerrado: registrar y anular atrasado solo el admin
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-traspasos-dia-cerrado.sql

-- =====================================================================
-- TRASPASOS · EL DÍA SE CIERRA
--
-- «Solo el super administrador puede editar o modificar algún registro
--  de días anteriores al de la fecha. Porque empiezan a manipular eso y
--  no puede ser así. Solo pueden anular y hacer otro dentro de la fecha
--  del día; después o antes, no.»
--
-- ---------------------------------------------------------------------
-- LO QUE CAMBIA
-- ---------------------------------------------------------------------
-- Hasta hoy, cualquiera con permiso podía registrar un viaje con fecha
-- de la semana pasada, o anular y rehacer uno de hace un mes. Quedaba
-- MARCADO —la vista trae `atrasado` y `dias_atras`— pero nada lo
-- impedía, y una marca que nadie mira no impide nada.
--
-- A partir de aquí, quien no administra la plataforma solo puede tocar
-- viajes del DÍA OPERATIVO ABIERTO. Lo de antes queda cerrado: ni
-- registrar con fecha vieja, ni anular, ni corregir.
--
-- Quien administra —`manda()`— no tiene tope, ni hacia atrás ni para
-- corregir. Es literalmente lo que se pidió.
--
-- ---------------------------------------------------------------------
-- QUÉ ES «EL DÍA OPERATIVO ABIERTO», Y POR QUÉ NO ES `fecha = hoy`
-- ---------------------------------------------------------------------
-- ESTO ES LO ÚNICO DELICADO DE TODO EL ARCHIVO.
--
-- El turno C entra a las 22:00 y sale a las 6:00 de la mañana
-- SIGUIENTE, y digita buena parte de sus viajes ya pasada la
-- medianoche. Para el reloj es otro día; para la bodega es el mismo
-- turno. Con la regla escrita como `fecha = hoy`, a las 00:01 el turno
-- C perdería de golpe todo lo que lleva de noche: no podría corregir un
-- documento mal tecleado a las 23:50, ni anular un viaje que no salió.
-- Le partiría el turno en dos, todas las noches.
--
-- Eso ya se había pensado al escribir 2026-09-traspasos-registro-atrasado.sql,
-- y por eso aquel archivo dejó el día pasado abierto para todos. Hoy se
-- cierra —porque se está manipulando— pero se cierra por el DÍA
-- OPERATIVO, no por el calendario:
--
--   El día operativo de una fecha D termina cuando termina el turno C
--   de D, es decir a las 06:00 de D+1.
--
-- De ahí sale una sola expresión, sin números inventados ni «horas de
-- gracia» a ojo:
--
--   abierto(D)  ⇔  ahora < arranque_turno(D, 'C') + 8 horas
--
--   · Viaje de HOY, cualquier turno → el tope es mañana a las 06:00:
--     abierto todo el día. El turno B puede arreglar el error del turno
--     A sin llamar a nadie, que es lo que se escogió.
--   · Viaje de AYER → el tope es hoy a las 06:00: abierto solo mientras
--     el turno C sigue digitando. A las 06:01 se cerró.
--   · Más viejo → cerrado.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UN DISPARADOR Y NO UN `if` EN CADA FUNCIÓN
-- ---------------------------------------------------------------------
-- Son TRES puertas —registrar, editar y anular— y mañana puede haber
-- una cuarta. Metiendo el `if` en cada una habría que reescribir
-- `traspaso_registrar` y `traspaso_editar_viaje` enteras, que son largas
-- y donde ya se me han perdido cosas al reescribirlas de memoria; y la
-- puerta nueva de dentro de seis meses nacería sin candado y nadie se
-- daría cuenta.
--
-- El disparador vive en la TABLA: vale para todo lo que escriba en ella,
-- hoy y mañana, venga de donde venga.
--
-- ---------------------------------------------------------------------
-- LO QUE NO SE TOCA
-- ---------------------------------------------------------------------
-- · LOS VIAJES QUE YA ESTÁN. No se anula nada, no se borra nada y no se
--   cambia ni una fila: esto solo decide lo que se puede hacer de aquí
--   en adelante.
-- · EL PLAN. Planear es otra cosa —es hacia adelante— y tiene sus
--   propias reglas. Este candado es solo para los viajes registrados.
-- · QUIÉN PUEDE ANULAR. Sigue siendo quien lo registró o un
--   administrador, como antes. Esto agrega el CUÁNDO, no cambia el
--   QUIÉN.
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
-- mitad.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-registro-atrasado.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ¿ESTÁ ABIERTO EL DÍA DE ESTA FECHA?
--
-- Una sola función, para que la pantalla y la base contesten LO MISMO.
-- Si la pantalla tuviera su propia cuenta, bastaría con que una redondee
-- distinto para que el botón se vea habilitado y el guardado reviente.
-- ---------------------------------------------------------------------
/* EL RELOJ ES UN PARÁMETRO, con `now()` por defecto.

   No es un adorno para pruebas: es lo único que permite comprobar la
   parte delicada. Escrita con `now()` por dentro, la regla del turno C
   —que el día cierra a las 06:00 del día siguiente y no a la
   medianoche— solo se puede comprobar corriendo el arnés a las tres de
   la mañana. Lo escribí así primero, y el arnés medía la fórmula copiada
   a mano en vez de la función: romper la función lo dejaba verde.

   Con el reloj afuera, la prueba pone las 00:01, las 03:00 y las 07:00 y
   pregunta a LA FUNCIÓN. Quien la llama de verdad no pasa nada y se
   queda con `now()`. */
create or replace function public.traspaso_dia_abierto(
  p_fecha date,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
as $$
  select p_fecha is not null
     and p_ahora < public.traspaso_arranque_turno(p_fecha, 'C') + interval '8 hours'
$$;

comment on function public.traspaso_dia_abierto(date, timestamptz) is
  'Si el día operativo de esa fecha sigue abierto. Termina cuando termina el turno C —06:00 del día siguiente—, no a la medianoche: el turno C digita pasada la medianoche y con el corte en el calendario perdería media noche de trabajo.';

grant execute on function public.traspaso_dia_abierto(date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. EL CANDADO
-- ---------------------------------------------------------------------
create or replace function public.traspaso_candado_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_cuando text;
begin
  -- QUIEN ADMINISTRA NO TIENE TOPE. Es lo que se pidió, y además es la
  -- única forma de poder arreglar un error de la semana pasada: si el
  -- candado fuera para todos, un viaje mal registrado quedaría mal para
  -- siempre y la única salida sería tocar la tabla a mano.
  if public.manda() then return coalesce(new, old); end if;

  -- LA FECHA QUE MANDA ES LA MÁS VIEJA DE LAS DOS.
  -- En un UPDATE hay dos: la que tenía la fila y la que va a quedar.
  -- Mirando solo la nueva, mover un viaje de hace un mes a la fecha de
  -- hoy pasaría el candado —y eso es exactamente la manipulación que se
  -- viene a impedir—. Mirando solo la vieja, se podría empujar un viaje
  -- de hoy hacia atrás y dejarlo cerrado con datos cambiados.
  v_fecha := least(coalesce(new.fecha, old.fecha), coalesce(old.fecha, new.fecha));

  if public.traspaso_dia_abierto(v_fecha) then
    return new;
  end if;

  v_cuando := to_char(v_fecha, 'DD/MM/YYYY');
  if tg_op = 'INSERT' then
    raise exception 'El día % ya está cerrado: no se pueden registrar viajes de días anteriores. Si de verdad falta ese viaje, lo registra un administrador.', v_cuando;
  else
    raise exception 'El viaje del % ya no se puede tocar: ese día está cerrado. Dentro del día se anula y se vuelve a registrar; después, lo corrige un administrador.', v_cuando;
  end if;
end $$;

do $$
begin
  if to_regclass('public.traspasos_viajes') is null then
    raise exception 'Falta supabase/modulos/traspasos.sql. Ese va primero.';
  end if;
  if to_regprocedure('public.traspaso_arranque_turno(date, text)') is null then
    raise exception 'Falta supabase/migraciones/2026-09-traspasos-registro-atrasado.sql. Ese va primero.';
  end if;

  drop trigger if exists traspasos_viajes_candado_dia on public.traspasos_viajes;
  create trigger traspasos_viajes_candado_dia
    before insert or update on public.traspasos_viajes
    for each row execute function public.traspaso_candado_dia();

  -- -------------------------------------------------------------------
  -- 3. QUEDÓ ASÍ
  -- -------------------------------------------------------------------
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.traspasos_viajes'::regclass
                    and tgname = 'traspasos_viajes_candado_dia'
                    and not tgisinternal) then
    raise exception 'El candado no quedó puesto.';
  end if;

  -- Y QUE LA CUENTA DEL DÍA ABIERTO SEA LA QUE SE ESCRIBIÓ. Tres casos,
  -- comprobados contra la función y no contra lo que dice el comentario.
  if not public.traspaso_dia_abierto(public.traspaso_hoy()) then
    raise exception 'El día de hoy sale cerrado. La cuenta del día operativo está mal.';
  end if;
  if public.traspaso_dia_abierto(public.traspaso_hoy() - 7) then
    raise exception 'Un día de hace una semana sale abierto. La cuenta del día operativo está mal.';
  end if;

  raise notice 'Listo. Los viajes de días cerrados solo los toca quien administra.';
  raise notice 'El día de una fecha se cierra cuando termina su turno C —06:00 del día siguiente—, no a la medianoche: el turno C digita pasada la medianoche.';
  raise notice 'Dentro del día abierto todo sigue igual: se anula y se vuelve a registrar, sea el turno que sea.';
end $$;


-- =====================================================================
-- 4 de 6 · El permiso de /traspasos/cruce (la pantalla Importar)
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-traspasos-cruce-permiso.sql

-- =====================================================================
-- LA LLAVE DE «EL CRUCE»
--
-- La pantalla nueva —/traspasos/cruce— nace CERRADA para todos menos
-- para quien administra: los permisos se guardan como el TEXTO de la
-- dirección, y una dirección que no está en rol_permisos ni en los
-- permisos propios de nadie vale 'ninguno'. Sin este archivo la pantalla
-- existe y no sale en el menú, y nadie sabe por qué.
--
-- SE COPIA EL NIVEL TAL CUAL, a diferencia de la base del conteo. Ahí la
-- pantalla solo lee y por eso se daba en 'ver' aunque el origen tuviera
-- 'editar'; aquí NO: subir el corte de SAP es escribir. Quien edita
-- Traspasos puede importar; quien solo mira, solo mira.
--
-- Y EL 'ninguno' A MANO SE RESPETA. A quien le cerraron Traspasos en
-- particular no se le abre el cruce por la puerta de atrás.
--
-- NO SE PISA LO QUE YA ESTÉ PUESTO: si alguien le dio un nivel a mano en
-- /admin/roles, ese manda.
--
-- El delimitador del bloque no se escribe en ningún comentario de este
-- archivo: el editor de Supabase cuenta esos signos para trocear, y uno
-- suelto en un comentario parte el bloque por la mitad.
--
-- ORDEN: después de supabase/02-roles.sql y supabase/03-usuarios.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $$
declare
  /* QUIÉNES SE VAN A TOCAR, APUNTADOS ANTES DE TOCARLOS: la
     comprobación de abajo solo puede juzgar lo que ESTE archivo hizo.
     Sin la lista juzgaría también al rol que ya tenía el cruce puesto a
     mano con otro nivel —y ese no se pisa a propósito—, así que la
     migración se negaría a correr por una fila que ella misma decidió
     respetar. */
  v_roles_nuevos text[];
  v_personas_nuevas uuid[];
  v_roles int; v_personas int; v_malos int;
begin
  if to_regclass('public.rol_permisos') is null then
    raise exception 'Falta supabase/02-roles.sql. Ese va primero.';
  end if;

  v_roles_nuevos := array(
    select p.rol from public.rol_permisos p
     where p.seccion = '/traspasos'
       and not exists (select 1 from public.rol_permisos q
                        where q.rol = p.rol and q.seccion = '/traspasos/cruce'));

  v_personas_nuevas := array(
    select id from public.perfiles
     where permisos_extra ? '/traspasos'
       and not (permisos_extra ? '/traspasos/cruce'));

  v_roles := coalesce(array_length(v_roles_nuevos, 1), 0);
  v_personas := coalesce(array_length(v_personas_nuevas, 1), 0);
  raise notice 'Roles que reciben el cruce: %', v_roles;
  raise notice 'Personas con permiso propio sobre Traspasos que también se copia: %', v_personas;

  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/traspasos/cruce', p.nivel
    from public.rol_permisos p
   where p.seccion = '/traspasos'
  on conflict (rol, seccion) do nothing;

  update public.perfiles
     set permisos_extra = permisos_extra
         || jsonb_build_object('/traspasos/cruce', permisos_extra -> '/traspasos')
   where permisos_extra ? '/traspasos'
     and not (permisos_extra ? '/traspasos/cruce');

  -- -------------------------------------------------------------------
  -- QUEDÓ ASÍ — y solo se juzga lo que este archivo tocó
  -- -------------------------------------------------------------------
  select count(*) into v_malos
    from public.rol_permisos p
   where p.rol = any(v_roles_nuevos)
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/traspasos/cruce');
  if v_malos > 0 then
    raise exception 'A % rol(es) de los que iban a recibir el cruce no les llegó.', v_malos;
  end if;

  select count(*) into v_malos
    from public.rol_permisos a
    join public.rol_permisos b on b.rol = a.rol and b.seccion = '/traspasos/cruce'
   where a.seccion = '/traspasos'
     and a.rol = any(v_roles_nuevos)
     and a.nivel <> b.nivel;
  if v_malos > 0 then
    raise exception 'A % rol(es) les quedó un nivel distinto del que tienen en Traspasos.', v_malos;
  end if;

  select count(*) into v_malos
    from public.perfiles
   where id = any(v_personas_nuevas)
     and permisos_extra ->> '/traspasos' is distinct from permisos_extra ->> '/traspasos/cruce';
  if v_malos > 0 then
    raise exception 'A % persona(s) con permiso propio no se les copió igual. Si a alguien le cerraron Traspasos a mano, el cruce tiene que quedarle cerrado también.', v_malos;
  end if;

  raise notice 'Listo. El cruce queda con el mismo nivel que Traspasos.';
  raise notice 'Quien edita Traspasos puede subir el corte de SAP; quien solo mira, solo mira.';
end $$;


-- =====================================================================
-- 5 de 6 · Varios tipos por viaje (reescribe la vista de control)
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-traspasos-varios-tipos.sql

-- =====================================================================
-- TRASPASOS · UN VIAJE PUEDE LLEVAR VARIOS TIPOS
--
-- «Cuántos viajes: que siempre sea 1, así que bloquéalo. Que pueda
--  seleccionar varios a la vez y se despliegue la cantidad por tipo.»
--
-- ---------------------------------------------------------------------
-- QUÉ CAMBIA Y POR QUÉ NO ES UN CAMPO MÁS
-- ---------------------------------------------------------------------
-- Hasta hoy un registro era: un tipo, y un número de viajes. Un camión
-- que salía con casco y estibas había que registrarlo dos veces, con dos
-- documentos — y el documento es uno solo, el del papel que va con el
-- vehículo. Así que no se registraba dos veces: se escogía uno de los
-- dos tipos y el otro desaparecía del plan.
--
-- Ahora: UN registro es UN vehículo con SU documento, y lleva los tipos
-- que lleve. El contador de viajes queda en 1 para el viaje con carga
-- —un vehículo, un viaje— y lo que se escoge es cuántos tipos van
-- encima. Los vacíos conservan su contador: un vacío no es un vehículo
-- con papel, es un número de viajes del turno.
--
-- ---------------------------------------------------------------------
-- CÓMO CUENTA EN EL PLAN: UNO DE CADA TIPO
-- ---------------------------------------------------------------------
-- Se escogió esto sobre repartir el viaje en fracciones. El plan de
-- casco pide cuatro viajes de casco; si un camión llevó casco, el plan
-- de casco avanzó uno. Que en el mismo camión viniera PET no le quita
-- nada a eso — el PET también avanzó uno.
--
-- El total del turno dirá tres viajes donde salió un camión, y eso es
-- correcto EN LA UNIDAD EN QUE ESTÁ ESCRITO EL PLAN, que son viajes por
-- tipo. La alternativa —un tercio para cada uno— deja el cumplido en
-- «2,33 de 4», que no se reporta.
--
-- ---------------------------------------------------------------------
-- POR QUÉ UNA TABLA HIJA Y NO VARIAS FILAS DE VIAJE
-- ---------------------------------------------------------------------
-- Lo obvio sería meter una fila de viaje por tipo. No se puede, y por
-- una razón que ya está escrita en la base: `documento_clave` tiene un
-- índice ÚNICO sobre lo registrado. Tres filas con el mismo documento
-- —que es lo correcto: es un solo papel— chocarían contra él.
--
-- Relajar ese índice para dejarlas pasar sería deshacer justo lo que se
-- pidió hace dos días: que ningún documento se repita. Así que el viaje
-- sigue siendo UNA fila con UN documento, y los tipos cuelgan de él.
--
-- ---------------------------------------------------------------------
-- LO VIEJO SIGUE FUNCIONANDO SIN TOCARLO
-- ---------------------------------------------------------------------
-- Los viajes de antes no tienen filas hijas, y no se les inventan: la
-- vista los lee por su columna `tipo` de siempre, con un LEFT JOIN. Un
-- viaje con hijos cuenta por sus hijos; uno sin hijos, por su tipo. No
-- hay migración de datos, no hay fila que reescribir, y el cumplido de
-- ayer sale exactamente igual que ayer.
--
-- ---------------------------------------------------------------------
-- Y `traspaso_registrar` NO SE REESCRIBE
-- ---------------------------------------------------------------------
-- Es larga y ya se me han perdido cosas dentro al rehacerla de memoria.
-- La nueva función la LLAMA y después cuelga los tipos: una sola
-- llamada desde la pantalla, una sola transacción, y la función de
-- siempre intacta.
--
-- El editor de Supabase no ejecuta un archivo como una sola
-- transacción, así que cada pieza va en su sentencia; y el delimitador
-- del bloque no se escribe en ningún comentario, porque el editor cuenta
-- esos signos para trocear.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-documento.sql
-- y de 2026-09-traspasos-plan-rejilla.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

create table if not exists public.traspasos_viaje_tipos (
  viaje_id uuid not null references public.traspasos_viajes(id) on delete cascade,
  tipo     text not null references public.traspasos_tipos(clave) on delete restrict,
  /* LA CANTIDAD DE ESE TIPO —canastas, estibas, lo que sea—. Opcional,
     como la carga de siempre: nadie la llena todas las veces, y
     volverla obligatoria traba el registro con un camión esperando. */
  cantidad integer check (cantidad is null or cantidad >= 0),
  primary key (viaje_id, tipo)
);

create index if not exists traspasos_viaje_tipos_tipo_idx
  on public.traspasos_viaje_tipos (tipo);

alter table public.traspasos_viaje_tipos enable row level security;

/* EL GRANT Y LA POLÍTICA SON DOS COSAS Y HACEN FALTA LAS DOS: sin el
   GRANT la política no llega a evaluarse y el error es «permission
   denied for table», que no menciona ninguna política y manda a buscar
   el problema donde no está. */
grant select on public.traspasos_viaje_tipos to authenticated;
grant insert, update, delete on public.traspasos_viaje_tipos to authenticated;

do $$
begin
  drop policy if exists traspasos_viaje_tipos_select on public.traspasos_viaje_tipos;
  create policy traspasos_viaje_tipos_select on public.traspasos_viaje_tipos
    for select to authenticated using (true);
  drop policy if exists traspasos_viaje_tipos_write on public.traspasos_viaje_tipos;
  create policy traspasos_viaje_tipos_write on public.traspasos_viaje_tipos
    for all to authenticated using (true) with check (true);
end $$;

-- ---------------------------------------------------------------------
-- REGISTRAR UN VIAJE CON VARIOS TIPOS
--
-- `p_tipos` llega como [{"tipo":"casco","cantidad":120}, …]. El PRIMERO
-- se guarda también en la columna `tipo` del viaje: así el viaje sigue
-- teniendo un tipo propio y todo lo que ya lee esa columna —la lista de
-- viajes, el cruce, los informes viejos— sigue funcionando sin
-- enterarse de nada.
-- ---------------------------------------------------------------------
create or replace function public.traspaso_registrar_varios(
  p_fecha     date,
  p_turno     text,
  p_tipos     jsonb,
  p_placa     text,
  p_origen    text,
  p_destino   text,
  p_documento text,
  p_nota      text default null
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_primero text; v_carga integer; v_n int;
begin
  if p_tipos is null or jsonb_typeof(p_tipos) <> 'array' or jsonb_array_length(p_tipos) = 0 then
    raise exception 'Hay que escoger al menos un tipo de viaje.';
  end if;

  /* NINGÚN TIPO REPETIDO. Dos veces el mismo tipo en el mismo viaje
     haría que el plan de ese tipo avanzara dos con un solo camión, que
     es exactamente el número que nadie podría explicar después. */
  select count(*) into v_n from (
    select distinct lower(btrim(e->>'tipo')) as t
      from jsonb_array_elements(p_tipos) e
     where nullif(btrim(coalesce(e->>'tipo', '')), '') is not null
  ) x;
  if v_n <> jsonb_array_length(p_tipos) then
    raise exception 'Hay un tipo repetido o vacío en la lista. Cada tipo va una sola vez.';
  end if;

  v_primero := btrim(p_tipos->0->>'tipo');
  v_carga   := nullif(p_tipos->0->>'cantidad', '')::integer;

  /* SE LLAMA A LA FUNCIÓN DE SIEMPRE, no se copia lo que hace. Ahí
     viven el código del viaje, la hora del turno cuando es de otro día,
     la validación del documento y la de la placa; reescribirlas aquí
     sería tener dos versiones esperando a separarse.

     Y LOS VIAJES VAN EN 1: un vehículo es un viaje. Lo que multiplica
     ahora son los tipos, no el contador. */
  select r.id, r.codigo into v_id, v_cod
    from public.traspaso_registrar(
      p_fecha, p_turno, v_primero, p_placa, p_origen, p_destino,
      1, false, v_carga, null, p_nota, p_documento) r;

  insert into public.traspasos_viaje_tipos (viaje_id, tipo, cantidad)
  select v_id, btrim(e->>'tipo'), nullif(e->>'cantidad', '')::integer
    from jsonb_array_elements(p_tipos) e
  on conflict (viaje_id, tipo) do update set cantidad = excluded.cantidad;

  return query select v_id, v_cod;
end $$;

revoke all on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text) from public;
grant execute on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- EL CONTROL, LEYENDO LOS TIPOS DE CADA VIAJE
--
-- El LEFT JOIN es todo el truco: un viaje CON hijos produce una línea
-- por tipo; uno SIN hijos —todos los de antes de hoy— produce una sola
-- línea con su propio tipo. No hay dato que migrar y el cumplido de
-- ayer sale igual que ayer.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
lineas as (
  select v.id, v.fecha, v.turno, v.placa, v.viajes,
         coalesce(vt.tipo, v.tipo)          as tipo,
         /* LA CARGA DEL TIPO cuando el viaje tiene tipos; la del viaje
            cuando no. Sumar las dos contaría dos veces lo mismo: el
            primer tipo guarda su cantidad TAMBIÉN en `carga`, para que
            lo viejo siga leyéndola. */
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
   where v.estado = 'registrado' and not v.vacio
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from lineas
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha)   as fecha,
  coalesce(p.turno, r.turno)   as turno,
  public.traspaso_orden_turno(coalesce(p.turno, r.turno)) as turno_orden,
  coalesce(p.tipo,  r.tipo)    as tipo,
  t.nombre                     as tipo_nombre,
  t.orden                      as tipo_orden,
  p.plan_id,
  coalesce(p.planeado, 0)      as planeado,
  coalesce(pv.vacios, 0)       as vacios_planeados,
  p.nota,
  coalesce(r.cumplido, 0)      as cumplido,
  coalesce(r.registros, 0)     as registros,
  coalesce(r.carga, 0)         as carga,
  coalesce(r.placas, 0)        as placas,
  least(coalesce(r.cumplido, 0), coalesce(p.planeado, 0))          as adheridos,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0)   as adicionales,
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0)   as faltan,
  (p.plan_id is null)          as sin_planear,
  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * least(coalesce(r.cumplido, 0), p.planeado) / p.planeado)::int, 100)
  end                          as adherencia,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int
  end                          as cumplimiento
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo)
left join public.traspasos_plan_vacios pv
  on pv.fecha = coalesce(p.fecha, r.fecha) and pv.turno = coalesce(p.turno, r.turno);

grant select on public.v_traspasos_control to authenticated;

-- ---------------------------------------------------------------------
-- LOS TIPOS DE CADA VIAJE, PARA LA LISTA
--
-- La lista de viajes muestra el tipo, y con varios mostrar solo el
-- primero sería una media verdad. Va como vista aparte y no metiendo
-- una columna en v_traspasos_viajes: esa vista la recrean cuatro
-- archivos distintos y añadirle algo aquí obliga a acordarse de
-- repetirlo en el siguiente que la toque.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_viaje_tipos as
select vt.viaje_id, vt.tipo, vt.cantidad, t.nombre as tipo_nombre, t.orden as tipo_orden
  from public.traspasos_viaje_tipos vt
  join public.traspasos_tipos t on t.clave = vt.tipo;

grant select on public.v_traspasos_viaje_tipos to authenticated;

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.traspasos_viaje_tipos') is null then
    raise exception 'La tabla de tipos por viaje no quedó.';
  end if;
  if to_regprocedure('public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text)') is null then
    raise exception 'La función de registrar con varios tipos no quedó.';
  end if;

  /* AQUÍ HUBO UN GUARDIÁN Y LO QUITÉ, QUE ES LO HONESTO.
     Comprobaba que el nombre `traspasos_viaje_tipos` APARECIERA en la
     definición de v_traspasos_control. La mutación lo desnudó: cambiar
     el join a `on false` deja la vista sin leer nada y el nombre sigue
     apareciendo igual, así que el guardián pasaba tan tranquilo. Un
     guardián que no distingue «lo lee» de «lo nombra» no protege nada y
     además da confianza de que sí.

     Lo que de verdad lo comprueba es el arnés, que registra un camión
     con tres tipos y mira si los tres planes avanzaron —y esa prueba se
     pone roja con la mutación, que es lo que se le pide—. Lo que no se
     puede comprobar desde aquí no se finge que se comprueba. */

  raise notice 'Listo. Un viaje puede llevar varios tipos, y cada tipo avanza su propio plan.';
  raise notice 'El viaje con carga va en 1: un vehículo es un viaje. Lo que multiplica son los tipos.';
  raise notice 'Los viajes de antes no se tocaron: sin tipos colgados, cuentan por su columna «tipo» de siempre.';
end $$;


-- =====================================================================
-- 6 de 6 · El corte de SAP, movimiento por movimiento
-- =====================================================================
-- archivo: supabase/migraciones/2026-09-traspasos-sap-movimientos.sql

-- =====================================================================
-- EL CORTE DE SAP SE GUARDA MOVIMIENTO POR MOVIMIENTO
--
-- QUÉ ESTABA MAL
--
-- La tabla guardaba el documento YA AGRUPADO: una fila por referencia,
-- con el neto y cuántos movimientos lo formaban. El agrupado se hacía
-- DENTRO DE CADA IMPORTACIÓN, y ahí estaba el hueco:
--
--   lunes   se importa el 17 → el documento 7687019429 trae -36
--   martes  se importa el 18 → ese mismo documento trae +36 (lo anularon)
--
-- La segunda importación no SUMA sobre la primera: la reemplaza. El
-- documento queda en +36 en vez de en cero, no da error, no avisa, y se
-- queda en «faltan» para siempre. Alguien va a ir a buscar un viaje que
-- sí se hizo.
--
-- Y no es un caso raro: el turno C cruza la medianoche. Anulan a las
-- 23:50 y rehacen a las 00:10, y eso cae en dos cortes distintos cada
-- vez que alguien importa día por día.
--
-- QUÉ SE HACE
--
-- La tabla pasa a guardar los MOVIMIENTOS, uno por uno, como vienen en
-- el Excel. El agrupado —sumar por referencia y contar el que no dé
-- cero— se mueve a una VISTA, que lo hace sobre TODO lo importado, no
-- sobre un archivo. Los dos movimientos del ejemplo se suman aunque
-- hayan entrado con una semana de diferencia.
--
-- CADA IMPORTACIÓN REEMPLAZA LOS DÍAS QUE TRAE, ENTEROS
--
-- No se acumulan filas encima de las que ya estaban: para cada fecha que
-- aparece en el archivo se borra lo que hubiera de ese día y se mete lo
-- del archivo. Es lo que hace que subir dos veces el mismo corte no
-- duplique nada sin necesitar una llave inventada por movimiento —el
-- Excel no trae ningún identificador de fila, y dos movimientos
-- idénticos del mismo documento SON dos movimientos, no uno repetido.
--
-- LA CONTRAPARTIDA, DICHA: el archivo manda sobre los días que cubre.
-- Si alguien sube un corte FILTRADO —un solo material, un solo
-- almacén—, ese día se queda con lo filtrado. Por eso la función
-- devuelve cuántos movimientos borró y cuántos metió: si borró más de
-- los que metió, la pantalla lo avisa.
--
-- LO QUE YA ESTABA IMPORTADO NO SE PIERDE. Cada documento de la tabla
-- vieja entra como UN movimiento con su neto, así que el cruce da hoy
-- exactamente lo mismo que daba ayer. La próxima vez que se importe ese
-- día, se reemplaza por sus movimientos de verdad y se arregla solo. La
-- tabla vieja no se borra: se le cambia el nombre a `traspasos_sap_viejo`
-- y queda ahí por si hay que mirarla.
--
-- POR QUÉ EL DELIMITADOR DE BLOQUE NO APARECE EN NINGÚN COMENTARIO
--
-- El editor de Supabase no ejecuta el archivo como una sola
-- transacción, y cuenta esos signos para saber dónde acaba cada
-- sentencia. Uno suelto dentro de un comentario parte una función por la
-- mitad y el error no señala el comentario.
--
-- ORDEN: después de supabase/migraciones/2026-09-traspasos-cruce-sap.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · LA TABLA DE MOVIMIENTOS
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_sap_mov (
  /* UNA LLAVE PROPIA Y NO UNA COMPUESTA. El Excel no trae ningún
     identificador de fila, y dos movimientos exactamente iguales del
     mismo documento son DOS movimientos. Una llave compuesta por sus
     columnas los colapsaría en uno y el documento dejaría de dar cero.
     Lo que impide duplicar al reimportar no es una llave: es que cada
     importación reemplaza los días que trae. */
  id               bigint generated always as identity primary key,
  /* La referencia YA NORMALIZADA —la misma regla que `documento_clave`
     en los viajes— y también como venía, porque el día que algo no
     cruce lo primero que se quiere ver es qué decía el Excel. */
  referencia       text not null,
  referencia_cruda text,
  fecha            date not null,
  hora             time,
  material         text,
  descripcion      text,
  /* LA CANTIDAD DE ESTE MOVIMIENTO, con su signo. Negativa es salida,
     positiva es la anulación que la devuelve. */
  cantidad         integer not null,
  centro           text,
  almacen          text,
  importado_por    uuid references public.perfiles(id) on delete set null,
  importado_en     timestamptz not null default now()
);

/* POR FECHA, porque es por donde se borra en cada importación y por
   donde filtra el tablero; y por REFERENCIA, porque es por donde se
   agrupa y por donde cruza contra los viajes. */
create index if not exists traspasos_sap_mov_fecha_idx on public.traspasos_sap_mov (fecha);
create index if not exists traspasos_sap_mov_ref_idx   on public.traspasos_sap_mov (referencia);

alter table public.traspasos_sap_mov enable row level security;

/* EL GRANT Y LA POLÍTICA SON DOS COSAS DISTINTAS y hacen falta las dos:
   el GRANT dice si el rol puede tocar la tabla, la política dice qué
   filas. Sin el GRANT la política no llega a evaluarse y el error es
   «permission denied for table», que no menciona ninguna política y
   manda a buscar el problema donde no está. */
grant select on public.traspasos_sap_mov to authenticated;
grant insert, update, delete on public.traspasos_sap_mov to authenticated;

do $$
begin
  drop policy if exists traspasos_sap_mov_select on public.traspasos_sap_mov;
  create policy traspasos_sap_mov_select on public.traspasos_sap_mov
    for select to authenticated using (true);
  /* ESCRIBIR ES DE QUIEN EDITA. La función lo comprueba igual —es
     `security definer`— pero la política cierra la puerta de al lado:
     escribir directo en la tabla saltándose la función. */
  drop policy if exists traspasos_sap_mov_write on public.traspasos_sap_mov;
  create policy traspasos_sap_mov_write on public.traspasos_sap_mov
    for all to authenticated using (public.es_editor()) with check (public.es_editor());
end $$;

-- ---------------------------------------------------------------------
-- 2 · LO QUE YA ESTABA IMPORTADO SE TRAE
--
-- Cada documento de la tabla vieja entra como UN movimiento con su
-- neto. El cruce da hoy exactamente lo mismo que daba ayer; lo único
-- que cambia es que ese documento dice «1 movimiento» aunque hubiera
-- tenido tres. Se arregla solo la próxima vez que se importe ese día.
--
-- SOLO SI LA NUEVA ESTÁ VACÍA. Si no, correr esto dos veces duplicaría
-- todo lo importado, que es justamente el error que esta migración
-- viene a quitar.
-- ---------------------------------------------------------------------
do $$
declare v_traidos int := 0;
begin
  if to_regclass('public.traspasos_sap') is not null
     and not exists (select 1 from public.traspasos_sap_mov) then

    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           neto, centro, almacen, importado_por, importado_en
      from public.traspasos_sap;

    get diagnostics v_traidos = row_count;
    raise notice 'Se trajeron % documentos de la tabla vieja, uno por movimiento.', v_traidos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3 · EL AGRUPADO, AHORA EN UNA VISTA
--
-- Aquí vive la regla entera, y AHORA SE APLICA SOBRE TODO LO IMPORTADO
-- y no sobre un archivo:
--
--     -36  +36  -28   del mismo número  =  UN documento
--     +36  -36        del mismo número  =  NINGUNO
--
-- Da igual si esos movimientos entraron el mismo día o con una semana
-- de diferencia: se suman.
-- ---------------------------------------------------------------------
drop view if exists public.v_traspasos_cruce;
drop view if exists public.v_traspasos_sap_importaciones;
drop view if exists public.v_traspasos_sap;

create view public.v_traspasos_sap as
select
  m.referencia,
  min(m.referencia_cruda)                                     as referencia_cruda,
  /* LA FECHA Y LA HORA DEL PRIMER MOVIMIENTO, que es cuando el
     documento existió. Con la del último, un documento anulado y
     rehecho se movería de día y dejaría de cuadrar con el turno en que
     de verdad salió. */
  min(m.fecha)                                                as fecha,
  (array_agg(m.hora order by m.fecha, m.hora nulls last))[1]  as hora,
  min(m.material)                                             as material,
  min(m.descripcion)                                          as descripcion,
  sum(m.cantidad)::integer                                    as neto,
  count(*)::integer                                           as movimientos,
  /* CUENTA SI LA SUMA NO DA CERO. Es la regla entera, en una línea. */
  sum(m.cantidad) <> 0                                        as cuenta,
  min(m.centro)                                               as centro,
  min(m.almacen)                                              as almacen,
  max(m.importado_en)                                         as importado_en
from public.traspasos_sap_mov m
group by m.referencia;

grant select on public.v_traspasos_sap to authenticated;

comment on view public.v_traspasos_sap is
  'Los documentos de SAP, agrupados desde los movimientos: -36 +36 -28 del mismo número es UN documento; +36 -36 no es ninguno. Se agrupa sobre todo lo importado, no sobre un archivo.';

-- ---------------------------------------------------------------------
-- 4 · EL CRUCE, SOBRE LA VISTA
--
-- Igual que antes; lo único que cambia es de dónde salen los documentos
-- de SAP. Y el rango que lo encierra sale ahora de los MOVIMIENTOS: sin
-- eso, todo viaje registrado antes del primer día importado saldría
-- como «sobra» — cientos de renglones que no son un problema, solo son
-- de otra semana.
-- ---------------------------------------------------------------------
create view public.v_traspasos_cruce as
with rango as (
  select min(fecha) as desde, max(fecha) as hasta from public.traspasos_sap_mov
),
sap as (
  select * from public.v_traspasos_sap where cuenta
),
sis as (
  select v.id, v.fecha, v.turno, v.placa, v.documento, v.documento_clave,
         v.registrado_por, v.registrado_en, v.codigo
    from public.traspasos_viajes v, rango r
   where v.estado = 'registrado'
     and v.documento_clave is not null
     and r.desde is not null
     and v.fecha between r.desde and r.hasta
)
select
  coalesce(sap.referencia, sis.documento_clave)          as documento,
  case when sap.referencia is null then 'sobra'
       when sis.documento_clave is null then 'falta'
       else 'cuadra' end                                 as estado,
  sap.fecha        as sap_fecha,
  sap.hora         as sap_hora,
  sap.neto         as sap_neto,
  sap.movimientos  as sap_movimientos,
  sap.descripcion  as sap_descripcion,
  sis.id           as viaje_id,
  sis.codigo       as viaje,
  sis.fecha        as sis_fecha,
  sis.turno        as sis_turno,
  sis.placa        as sis_placa,
  sis.registrado_por,
  /* MISMO DOCUMENTO, DÍA DISTINTO. Cuadra —está en los dos— pero el
     sistema lo puso en otro día que SAP, y eso descuadra el cumplido de
     los dos días a la vez sin que ninguna de las dos listas lo diga. */
  (sap.fecha is not null and sis.fecha is not null and sap.fecha <> sis.fecha) as dia_distinto
from sap
full outer join sis on sis.documento_clave = sap.referencia;

grant select on public.v_traspasos_cruce to authenticated;

comment on view public.v_traspasos_cruce is
  'Los documentos de SAP contra los viajes registrados, en las fechas que cubren los movimientos importados. falta = SAP lo tiene y nadie lo registró; sobra = está registrado y SAP no lo tiene (casi siempre un dedazo en el número); cuadra = los dos.';

-- ---------------------------------------------------------------------
-- 5 · LAS IMPORTACIONES ANTERIORES
--
-- «Se subió el corte a tal hora, trajo tantos documentos, tantos siguen
-- sin registrar.» Sale de agrupar por el momento en que se importó: no
-- hace falta una tabla de bitácora, `importado_en` ya lo guarda cada
-- movimiento, y un dato que se guarda y nadie mira es un dato que no
-- existe.
--
-- SE AGRUPA AL SEGUNDO. Todos los movimientos de una misma llamada
-- comparten el `now()` de esa transacción, así que un `date_trunc` al
-- segundo los junta exactamente por tanda y no por día: subir el corte
-- dos veces la misma mañana son dos renglones, que es lo que pasó.
--
-- `sin_registrar` SE CALCULA CONTRA LO DE AHORA y contra el documento
-- COMPLETO —no contra los movimientos de esa tanda—: si el resto del
-- documento llegó en otra importación y lo dejó en cero, este renglón
-- tiene que bajar solo.
-- ---------------------------------------------------------------------
create view public.v_traspasos_sap_importaciones as
select
  date_trunc('second', m.importado_en)                  as cuando,
  count(distinct m.referencia)::int                     as documentos,
  count(*)::int                                         as movimientos,
  count(distinct m.referencia) filter (where not s.cuenta)::int as anulados,
  min(m.fecha)                                          as desde,
  max(m.fecha)                                          as hasta,
  max(p.nombre)                                         as quien,
  count(distinct m.referencia) filter (
    where s.cuenta and not exists (
      select 1 from public.traspasos_viajes v
       where v.estado = 'registrado' and v.documento_clave = m.referencia))::int
                                                        as sin_registrar
from public.traspasos_sap_mov m
join public.v_traspasos_sap s on s.referencia = m.referencia
left join public.perfiles p on p.id = m.importado_por
group by date_trunc('second', m.importado_en);

grant select on public.v_traspasos_sap_importaciones to authenticated;

-- ---------------------------------------------------------------------
-- 6 · IMPORTAR
--
-- Recibe los movimientos tal como salen del Excel y los guarda tal
-- cual. No agrupa: de eso se encarga la vista, sobre todo lo importado.
--
-- CADA DÍA QUE TRAE EL ARCHIVO SE REEMPLAZA ENTERO. Es lo que hace que
-- subir dos veces el mismo corte deje lo mismo y no el doble, y lo que
-- permite importar rangos que se solapan sin pensarlo.
--
-- BORRAR Y METER VAN EN UNA SOLA SENTENCIA, con CTE que modifican. No
-- es un adorno: el editor de Supabase no envuelve el archivo en una
-- transacción, así que un `delete` y un `insert` sueltos dejarían una
-- ventana —corta, pero real— en la que el día está borrado y todavía no
-- reescrito. Y sin tabla temporal a propósito: una temporal no
-- sobrevive a volver a llamar la función en la misma transacción, y
-- este proyecto ya perdió una migración por eso.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_sap_importar(jsonb);

create function public.traspaso_sap_importar(p_filas jsonb)
returns table (documentos integer, movimientos_leidos integer,
               movimientos_guardados integer, reemplazados integer,
               dias integer, anulados integer, desde date, hasta date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leidas int; v_bor int; v_met int; v_dias int;
  v_doc int; v_anu int; v_desde date; v_hasta date;
begin
  if not public.es_editor() then
    raise exception 'Importar el corte de SAP requiere rol de supervisor o administrador';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no trae ningún movimiento. Revisa que sea el corte de SAP y que la hoja tenga la columna Referencia.';
  end if;

  /* CUÁNTAS FILAS DEL ARCHIVO SIRVEN, ANTES DE TOCAR NADA. Se mira aquí
     y no después de meter: lo que puede estar mal es que el archivo no
     sea el corte de SAP, y eso se sabe leyéndolo, no contando lo que
     entró. Si no se mirara antes, un archivo equivocado BORRARÍA los
     días que creyera ver y no metería nada. */
  select count(*) into v_leidas
    from jsonb_array_elements(p_filas) f
   where nullif(btrim(coalesce(f->>'referencia', '')), '') is not null
     and nullif(btrim(coalesce(f->>'fecha', '')), '') is not null;

  if v_leidas = 0 then
    raise exception 'Ninguna fila del archivo trae referencia y fecha. Revisa que sean las columnas «Referencia» y «Fecha de entrada».';
  end if;

  with crudo as (
    select
      /* LA MISMA NORMALIZACIÓN QUE `documento_clave` EN LOS VIAJES.
         Tiene que ser la misma o el cruce falla por un guion: SAP
         escribe «7687019429» y quien registró pudo teclear
         «7687-019429». Si las dos reglas se separan, el cruce dice que
         falta un documento que está registrado justo al lado. */
      nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '') as referencia,
      btrim(coalesce(f->>'referencia', ''))                as referencia_cruda,
      nullif(f->>'fecha', '')::date                        as fecha,
      nullif(f->>'hora', '')::time                         as hora,
      nullif(btrim(coalesce(f->>'material', '')), '')      as material,
      nullif(btrim(coalesce(f->>'descripcion', '')), '')   as descripcion,
      coalesce(nullif(f->>'cantidad', ''), '0')::numeric::integer as cantidad,
      nullif(btrim(coalesce(f->>'centro', '')), '')        as centro,
      nullif(btrim(coalesce(f->>'almacen', '')), '')       as almacen
    from jsonb_array_elements(p_filas) f
  ),
  buenas as (
    select * from crudo where referencia is not null and fecha is not null
  ),
  fechas as (
    select distinct fecha from buenas
  ),
  borradas as (
    delete from public.traspasos_sap_mov m
     using fechas d
     where m.fecha = d.fecha
    returning 1
  ),
  metidas as (
    insert into public.traspasos_sap_mov
      (referencia, referencia_cruda, fecha, hora, material, descripcion,
       cantidad, centro, almacen, importado_por, importado_en)
    select referencia, referencia_cruda, fecha, hora, material, descripcion,
           cantidad, centro, almacen, auth.uid(), now()
      from buenas
    returning 1
  )
  select (select count(*) from borradas)::int,
         (select count(*) from metidas)::int,
         (select count(*) from fechas)::int,
         (select min(fecha) from buenas),
         (select max(fecha) from buenas)
    into v_bor, v_met, v_dias, v_desde, v_hasta;

  /* Y AHORA LOS DOCUMENTOS, LEÍDOS DE LA VISTA. Son los del archivo,
     pero contados CON TODO lo que ya había: un documento cuyo otro
     movimiento llegó la semana pasada cuenta aquí como anulado, que es
     justamente lo que esta migración viene a arreglar. */
  select count(*)::int, count(*) filter (where not s.cuenta)::int
    into v_doc, v_anu
    from public.v_traspasos_sap s
   where s.referencia in (
     select nullif(upper(regexp_replace(coalesce(f->>'referencia', ''), '[^A-Za-z0-9]', '', 'g')), '')
       from jsonb_array_elements(p_filas) f);

  return query select v_doc, v_leidas, v_met, v_bor, v_dias, v_anu, v_desde, v_hasta;
end $$;

revoke all on function public.traspaso_sap_importar(jsonb) from public;
grant execute on function public.traspaso_sap_importar(jsonb) to authenticated;

comment on function public.traspaso_sap_importar(jsonb) is
  'Guarda los movimientos del corte de SAP tal cual. Cada fecha que trae el archivo se reemplaza entera, así que reimportar un rango solapado no duplica. El agrupado en documentos lo hace v_traspasos_sap, sobre todo lo importado.';

-- ---------------------------------------------------------------------
-- 7 · LA TABLA VIEJA SE JUBILA, NO SE BORRA
--
-- Cambiarle el nombre y no borrarla: si el traspaso de arriba dejó algo
-- fuera, los datos siguen ahí para mirarlos. Y el nombre nuevo dice lo
-- que es, para que nadie vuelva a leerla creyendo que está viva.
--
-- SOLO DESPUÉS DE REHACER LAS VISTAS. Una vista sigue a la tabla cuando
-- se renombra —Postgres la apunta por su identificador, no por su
-- nombre—, así que renombrar antes habría dejado el cruce leyendo en
-- silencio de la tabla jubilada.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.traspasos_sap') is not null then
    if not exists (select 1 from public.traspasos_sap_mov)
       and exists (select 1 from public.traspasos_sap) then
      raise exception 'La tabla vieja tiene documentos y la nueva quedó vacía: no se jubila nada hasta que eso se aclare.';
    end if;
    alter table public.traspasos_sap rename to traspasos_sap_viejo;
    raise notice 'La tabla vieja quedó como traspasos_sap_viejo. No se borró nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regclass('public.traspasos_sap_mov') is null then
    v_falta := v_falta || ' · la tabla de movimientos'; end if;
  if to_regclass('public.v_traspasos_sap') is null then
    v_falta := v_falta || ' · la vista que agrupa los documentos'; end if;
  if to_regclass('public.v_traspasos_cruce') is null then
    v_falta := v_falta || ' · la vista del cruce'; end if;
  if to_regclass('public.v_traspasos_sap_importaciones') is null then
    v_falta := v_falta || ' · la vista de importaciones anteriores'; end if;
  if to_regprocedure('public.traspaso_sap_importar(jsonb)') is null then
    v_falta := v_falta || ' · la función de importar'; end if;

  /* QUE EL CRUCE LEA DE LA VISTA Y NO DE LA TABLA JUBILADA. Es el error
     que no daría ningún síntoma: seguiría funcionando, leyendo datos
     que ya nadie actualiza. */
  if exists (
    select 1 from pg_depend d
      join pg_rewrite r on r.oid = d.objid
      join pg_class v on v.oid = r.ev_class
     where v.relname = 'v_traspasos_cruce'
       and d.refobjid = to_regclass('public.traspasos_sap_viejo')) then
    v_falta := v_falta || ' · EL CRUCE SIGUE LEYENDO DE LA TABLA JUBILADA';
  end if;

  if v_falta <> '' then
    raise exception 'No quedó todo. Falta:%', v_falta;
  end if;

  raise notice 'Listo. El corte de SAP se guarda ahora movimiento por movimiento.';
  raise notice 'Un documento se agrupa sobre TODO lo importado: -36 el lunes y +36 el martes ya dan cero.';
  raise notice 'Cada importación reemplaza enteros los días que trae, así que los rangos se pueden solapar.';
end $$;


-- =====================================================================
-- 7 de 7 · QUÉ QUEDÓ PUESTO
-- =====================================================================
do $$
declare
  v_falta text := '';
begin
  /* LA TABLA traspasos_sap YA NO SE COMPRUEBA: el paso 7 la jubila
     como traspasos_sap_viejo y el corte vive ahora en
     traspasos_sap_mov. Buscarla aquí hacía que el resumen se quejara
     de que falta justo lo que acaba de cambiar de nombre a propósito —
     y lo cazó él solo. */
  if to_regclass('public.v_traspasos_cruce') is null then
    v_falta := v_falta || ' · la vista del cruce'; end if;
  if to_regclass('public.v_traspasos_sap_importaciones') is null then
    v_falta := v_falta || ' · la vista de importaciones anteriores'; end if;
  if to_regclass('public.traspasos_sap_mov') is null then
    v_falta := v_falta || ' · la tabla de movimientos del corte'; end if;
  if to_regclass('public.v_traspasos_sap') is null then
    v_falta := v_falta || ' · la vista que agrupa los movimientos en documentos'; end if;
  if to_regprocedure('public.traspaso_sap_importar(jsonb)') is null then
    v_falta := v_falta || ' · la función de importar el corte'; end if;
  if to_regprocedure('public.traspaso_dia_abierto(date, timestamptz)') is null then
    v_falta := v_falta || ' · el candado del día'; end if;
  if to_regclass('public.traspasos_viaje_tipos') is null then
    v_falta := v_falta || ' · los tipos por viaje'; end if;
  if to_regprocedure('public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text)') is null then
    v_falta := v_falta || ' · la función de registrar con varios tipos'; end if;
  if not exists (select 1 from public.rol_permisos where seccion = '/traspasos/cruce') then
    v_falta := v_falta || ' · el permiso de /traspasos/cruce (nadie vería Importar)'; end if;
  if not exists (select 1 from public.rol_permisos where seccion = '/inventario/base') then
    v_falta := v_falta || ' · el permiso de /inventario/base'; end if;

  if v_falta <> '' then
    raise exception 'NO QUEDÓ TODO. Falta:%  — vuelve a correr el archivo y mira el primer ERROR de arriba.', v_falta;
  end if;

  raise notice ' ';
  raise notice 'LISTO. Quedaron puestas las 6 migraciones.';
  raise notice '  · La base del conteo y su permiso.';
  raise notice '  · El documento del viaje a 10 dígitos.';
  raise notice '  · El día cerrado: registrar o anular de días anteriores solo el super administrador.';
  raise notice '  · El corte de SAP, el cruce y las importaciones anteriores.';
  raise notice '  · El permiso de la pantalla Importar.';
  raise notice '  · Varios tipos por viaje.';
  raise notice '  · El corte de SAP guardado movimiento por movimiento: un documento se agrupa';
  raise notice '    sobre TODO lo importado, así que -36 el lunes y +36 el martes ya dan cero.';
  raise notice ' ';
  raise notice 'Ahora en Administración -> Roles hay que marcar quién ve «Importar» y «La base».';
end $$;
