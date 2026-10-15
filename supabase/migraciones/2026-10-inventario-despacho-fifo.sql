-- =====================================================================
-- INVENTARIO · DESPACHO FIFO (/inventario/despacho)
--
-- Pantalla nueva: elegir 1–3 materiales y ver, módulo por módulo, de dónde sacarlos cumpliendo el FIFO,
-- con hoja para imprimir. Solo LEE el conteo enviado; no crea tablas.
--
-- Lo único que hace falta es el permiso: quien ya tenía el Tablero de Inventario (/inventario/tablero)
-- recibe el mismo nivel aquí. No pisa lo que se haya puesto a mano. Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/despacho', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/tablero'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra || jsonb_build_object('/inventario/despacho', permisos_extra -> '/inventario/tablero')
     where permisos_extra ? '/inventario/tablero'
       and not (permisos_extra ? '/inventario/despacho');
  end if;
end $$;

commit;

-- COMPROBACIÓN: debe haber una fila por rol que tenga el Tablero.
select rol, nivel from public.rol_permisos where seccion = '/inventario/despacho' order by rol;
