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
