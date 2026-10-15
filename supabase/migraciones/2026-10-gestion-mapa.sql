-- =====================================================================
-- GESTIÓN · MAPA (/gestion/arbol y /gestion/flujos)
--
-- Dos pantallas nuevas que solo LEEN lo que ya hay en Gestión (indicadores, procesos y resultados):
-- el árbol de KPI y el flujo de procesos. No crea tablas.
--
-- Lo único que hace falta es el permiso: quien ya tenía el Tablero de Gestión (/gestion) recibe el
-- mismo nivel en las dos pantallas. No pisa lo que se haya puesto a mano. Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, n.ruta, p.nivel
  from public.rol_permisos p
 cross join (values ('/gestion/arbol'), ('/gestion/flujos')) as n(ruta)
 where p.seccion = '/gestion'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra
             || jsonb_build_object('/gestion/arbol', permisos_extra -> '/gestion')
             || jsonb_build_object('/gestion/flujos', permisos_extra -> '/gestion')
     where permisos_extra ? '/gestion'
       and not (permisos_extra ? '/gestion/arbol');
  end if;
end $$;

commit;

-- COMPROBACIÓN: una fila por rol y pantalla.
select seccion, rol, nivel from public.rol_permisos
 where seccion in ('/gestion/arbol', '/gestion/flujos') order by seccion, rol;
