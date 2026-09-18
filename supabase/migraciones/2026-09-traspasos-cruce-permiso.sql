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
