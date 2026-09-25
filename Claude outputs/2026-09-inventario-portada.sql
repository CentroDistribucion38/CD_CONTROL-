-- =====================================================================
-- INVENTARIO SE PARTE EN DOS Y EL TABLERO SE MUDA DE DIRECCIÓN
--
-- QUÉ PASÓ. /inventario ERA el tablero de FEFO. Como el módulo ya tiene
-- dos ramas —Conteos y Averías—, la ruta del módulo tiene que ser la
-- BIFURCACIÓN: estando parado en ella, el riel debe mostrar las ramas y
-- no las pantallas de una de ellas. Con el tablero ocupando esa
-- dirección, entrar a Inventario era entrar ya a Conteos y no había
-- dónde escoger: «le doy a conteos y no me sale nada».
--
-- El tablero se mudó a /inventario/tablero.
--
-- POR QUÉ HACE FALTA ESTE SQL, Y ES LO IMPORTANTE. En este proyecto
-- LOS PERMISOS SE GUARDAN COMO EL TEXTO DE LA DIRECCIÓN —en
-- rol_permisos.seccion y en perfiles.permisos_extra—. Mover una
-- pantalla deja esas filas apuntando a algo que ya no existe y la
-- persona pierde la pantalla EN SILENCIO: no da error, deja de verse.
-- Es exactamente el motivo por el que las pantallas de Roturas NO se
-- movieron cuando el módulo se metió dentro de Quiebra.
--
-- Aquí sí había que moverla, así que el permiso se muda con ella:
-- quien podía ver o editar /inventario sigue pudiendo lo mismo en
-- /inventario/tablero.
--
-- SE PUEDE CORRER VARIAS VECES. No pisa lo que ya esté puesto a mano en
-- /inventario/tablero: solo rellena lo que falte.
--
-- Y /inventario SE QUEDA. No se borra la fila vieja: /inventario sigue
-- siendo la ruta del módulo —la portada— y es lo que `misPermisos` mira
-- para decidir si el módulo entero aparece en el menú. Borrarla dejaría
-- a alguien con el tablero abierto y sin puerta por donde llegar.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. LOS PERMISOS DE CADA ROL
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/tablero', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario'
on conflict (rol, seccion) do nothing;

-- ---------------------------------------------------------------------
-- 2. LOS PERMISOS SUELTOS DE CADA PERSONA
--
-- `permisos_extra` es un jsonb {"ruta": "nivel"} que manda sobre el rol,
-- HACIA ARRIBA Y HACIA ABAJO: puede decir "ninguno" a propósito, que es
-- cómo se le quita a una sola persona una pantalla que su rol sí da. Por
-- eso se copia el valor tal cual, incluido el "ninguno" — si no, quitarle
-- el tablero a alguien se desharía solo con esta migración.
--
-- Y SOLO SI NO TIENE YA UNA LLAVE PROPIA para la ruta nueva.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then

    update public.perfiles
       set permisos_extra = permisos_extra
           || jsonb_build_object('/inventario/tablero',
                                 permisos_extra -> '/inventario')
     where permisos_extra ? '/inventario'
       and not (permisos_extra ? '/inventario/tablero');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. QUE SE VEA QUÉ QUEDÓ
-- ---------------------------------------------------------------------
do $$
declare
  n_rol int;
  n_per int := 0;
begin
  select count(*) into n_rol
    from public.rol_permisos where seccion = '/inventario/tablero';

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then
    select count(*) into n_per
      from public.perfiles where permisos_extra ? '/inventario/tablero';
  end if;

  raise notice 'Tablero de Inventario: % rol(es) y % persona(s) con permiso propio en /inventario/tablero',
               n_rol, n_per;
  raise notice 'La portada (/inventario) no se tocó: sigue siendo la puerta del modulo.';
end $$;

commit;
