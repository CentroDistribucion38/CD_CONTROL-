-- =====================================================================
-- ROTURAS SE MUDÓ DENTRO DE QUIEBRA
--
-- «Ingresa el módulo de Roturas dentro de Quiebra, y acomódalos por
--  submódulos, así como en sitio y así.»
--
-- ---------------------------------------------------------------------
-- LO QUE CAMBIÓ Y LO QUE NO
-- ---------------------------------------------------------------------
-- Quiebra pasó a tener TRES submódulos —Envase, En sitio y Salida— y
-- Roturas dejó de ser una tarjeta aparte en la portada.
--
-- LAS DIRECCIONES DE ROTURAS NO SE TOCARON. Sus pantallas siguen en
-- /roturas/en-sitio y /roturas/salida, con todo lo que cuelga de ellas.
-- Es a propósito y es lo único que había que decidir bien: los permisos
-- de cada persona están guardados EN ESTA BASE como el TEXTO de la
-- dirección —en rol_permisos.seccion y en perfiles.permisos_extra—, así
-- que renombrar una ruta deja esas filas apuntando a algo que ya no
-- existe y la persona pierde la pantalla EN SILENCIO: no da error,
-- simplemente deja de verse. Es el mismo motivo por el que el módulo que
-- la gente llama T1/T2 sigue viviendo en /sider.
--
-- ---------------------------------------------------------------------
-- LA ÚNICA RUTA QUE SÍ CAMBIÓ, Y POR QUÉ
-- ---------------------------------------------------------------------
-- /quiebra ERA el tablero de envase. Ahora /quiebra es la pantalla que
-- escoge submódulo —hacía falta una— y el tablero se mudó a
-- /quiebra/tablero.
--
-- Sin este archivo, todo el que tenía permiso sobre /quiebra entraría a
-- la bifurcación y encontraría el submódulo de Envase cerrado: su
-- permiso quedó apuntando a una pantalla que ahora es otra cosa. Aquí se
-- COPIA ese nivel a la ruta nueva.
--
-- SE COPIA, NO SE MUEVE. /quiebra sigue existiendo y sigue siendo la
-- puerta del módulo: quien no la tenga no vería ni la bifurcación.
--
-- Y NO SE PISA LO QUE YA ESTÉ PUESTO. Si alguien ya le dio un nivel a
-- /quiebra/tablero —corriendo esto antes, o a mano en /admin/roles—, ese
-- manda. Una migración que se puede correr varias veces no puede
-- deshacer en la segunda vuelta lo que una persona decidió entre las
-- dos.
--
-- ---------------------------------------------------------------------
-- POR QUÉ TODO VA EN UN SOLO BLOQUE
-- ---------------------------------------------------------------------
-- El editor de Supabase no ejecuta un archivo como una sola transacción:
-- un `begin;` arriba no lo agrupa como uno espera. Ya me costó una
-- migración que funcionaba con psql y reventaba allá. Un bloque anónimo
-- es UNA sentencia: o pasa entero o no pasa nada, lo corra quien lo
-- corra. Y aquí importa de verdad — a medio aplicar, unos roles tendrían
-- el permiso del tablero y otros no.
--
-- Y NO SE NOMBRA AQUÍ EL DELIMITADOR DEL BLOQUE. El editor de Supabase
-- cuenta esos signos para saber dónde acaba cada sentencia: uno suelto en
-- un comentario le invierte la cuenta y parte el bloque por la mitad.
-- Pasó en otra migración de este mismo lote.
--
-- ORDEN: después de supabase/02-roles.sql y supabase/03-usuarios.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

do $$
declare
  /* QUIÉNES SE VAN A TOCAR, APUNTADOS ANTES DE TOCARLOS.
     Hace falta para comprobar después SOLO lo que esta migración hizo.
     Sin esta lista, la comprobación juzgaría también al rol que ya tenía
     el tablero puesto a mano con otro nivel —y ese no se pisa a
     propósito—, así que la migración se negaría a correr por una fila
     que ella misma decidió respetar.

     Es la segunda vez hoy que caigo en lo mismo: comprobar de más es
     tan error como comprobar de menos, y se ve igual de bien escrito. */
  v_roles_nuevos text[];
  v_personas_nuevas uuid[];
  v_roles int; v_personas int; v_malos int; v_ejemplo text;
begin
  if to_regclass('public.rol_permisos') is null then
    raise exception 'Falta supabase/02-roles.sql. Ese va primero.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. ANTES DE TOCAR NADA, DECIR QUÉ SE VA A TOCAR
  -- -------------------------------------------------------------------
  select count(*) into v_roles
    from public.rol_permisos p
   where p.seccion = '/quiebra'
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/quiebra/tablero');

  select count(*) into v_personas
    from public.perfiles
   where permisos_extra ? '/quiebra'
     and not (permisos_extra ? '/quiebra/tablero');

  raise notice 'Roles a los que se les copia el permiso del tablero: %', v_roles;
  raise notice 'Personas con permiso propio sobre /quiebra que también se copia: %', v_personas;

  v_roles_nuevos := array(
    select p.rol from public.rol_permisos p
     where p.seccion = '/quiebra'
       and not exists (select 1 from public.rol_permisos q
                        where q.rol = p.rol and q.seccion = '/quiebra/tablero'));

  v_personas_nuevas := array(
    select id from public.perfiles
     where permisos_extra ? '/quiebra'
       and not (permisos_extra ? '/quiebra/tablero'));

  -- -------------------------------------------------------------------
  -- 2. LOS ROLES
  -- -------------------------------------------------------------------
  insert into public.rol_permisos (rol, seccion, nivel)
  select p.rol, '/quiebra/tablero', p.nivel
    from public.rol_permisos p
   where p.seccion = '/quiebra'
  on conflict (rol, seccion) do nothing;

  -- -------------------------------------------------------------------
  -- 3. LOS PERMISOS PROPIOS DE CADA PERSONA
  --
  -- Existen para la excepción —el de portería que además revisa el
  -- maestro— y MANDAN sobre el rol, hacia arriba y hacia abajo. Por eso
  -- hay que copiarlos también: a quien le quitaron /quiebra a mano se le
  -- tiene que quedar quitado el tablero; y a quien se lo dieron por
  -- encima de su rol, dado.
  --
  -- Si se copiara solo el rol, la persona a la que le habían CERRADO
  -- /quiebra en particular recuperaría el tablero por la puerta de
  -- atrás, que es exactamente la clase de permiso que nadie vuelve a
  -- revisar.
  -- -------------------------------------------------------------------
  update public.perfiles
     set permisos_extra = permisos_extra
         || jsonb_build_object('/quiebra/tablero', permisos_extra -> '/quiebra')
   where permisos_extra ? '/quiebra'
     and not (permisos_extra ? '/quiebra/tablero');

  -- -------------------------------------------------------------------
  -- 4. QUEDÓ ASÍ
  --
  -- No se comprueba «¿corrió?», se comprueba QUE NADIE PERDIÓ NADA: que
  -- para cada rol y para cada persona, el nivel sobre el tablero sea el
  -- MISMO que tenían sobre /quiebra. Contar filas insertadas no diría
  -- nada — podrían haberse insertado todas con el nivel equivocado.
  -- -------------------------------------------------------------------
  /* SOLO LOS QUE ESTA MIGRACIÓN COPIÓ. Al rol que ya tenía el tablero
     puesto a mano no se le pisó nada —eso es lo correcto— y por lo tanto
     no tiene por qué coincidir con su nivel en /quiebra. */
  select count(*) into v_malos
    from public.rol_permisos p
    join public.rol_permisos t on t.rol = p.rol and t.seccion = '/quiebra/tablero'
   where p.seccion = '/quiebra'
     and p.rol = any(v_roles_nuevos)
     and t.nivel is distinct from p.nivel;

  if v_malos > 0 then
    select 'el rol ' || p.rol || ' tenía ' || p.nivel || ' en /quiebra y quedó con ' || t.nivel
      into v_ejemplo
      from public.rol_permisos p
      join public.rol_permisos t on t.rol = p.rol and t.seccion = '/quiebra/tablero'
     where p.seccion = '/quiebra'
       and p.rol = any(v_roles_nuevos)
       and t.nivel is distinct from p.nivel
     limit 1;
    raise exception 'El permiso del tablero no quedó igual en % rol(es). Ejemplo: %', v_malos, v_ejemplo;
  end if;

  select count(*) into v_malos
    from public.rol_permisos p
   where p.seccion = '/quiebra'
     and not exists (select 1 from public.rol_permisos q
                      where q.rol = p.rol and q.seccion = '/quiebra/tablero');
  if v_malos > 0 then
    raise exception '% rol(es) se quedaron sin el permiso del tablero', v_malos;
  end if;

  select count(*) into v_malos
    from public.perfiles
   where id = any(v_personas_nuevas)
     and (permisos_extra -> '/quiebra/tablero') is distinct from (permisos_extra -> '/quiebra');
  if v_malos > 0 then
    raise exception '% persona(s) quedaron con distinto permiso propio sobre el tablero', v_malos;
  end if;

  /* Y NADIE MÁS QUEDÓ CON UN PERMISO PROPIO SOBRE EL TABLERO. Repartir
     de más no lo reclama nadie —nunca falta una pantalla que no debías
     ver— y por eso hay que buscarlo a propósito. */
  select count(*) into v_malos
    from public.perfiles
   where permisos_extra ? '/quiebra/tablero'
     and not (permisos_extra ? '/quiebra');
  if v_malos > 0 then
    raise exception '% persona(s) acabaron con permiso propio sobre el tablero sin tenerlo sobre /quiebra', v_malos;
  end if;

  raise notice 'Listo. Quien podía ver el tablero de Quiebra lo sigue pudiendo ver en /quiebra/tablero.';
  raise notice 'Las pantallas de Roturas NO se movieron: siguen en /roturas/... y sus permisos intactos.';
end $$;
