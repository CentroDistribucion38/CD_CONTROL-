-- =====================================================================
-- INVENTARIO · BALANCE · PASIVOS · EXISTENCIAS (/inventario/balance/existencias)
--
-- Pantalla nueva, solo de lectura: la última ZEXI del día de AG18 y de AG22 (Cuadre SAP) contra la Base de pasivos.
-- No crea tablas. Quien ya tenía la Validación de pasivo recibe el mismo nivel aquí.
-- No pisa lo que se haya puesto a mano. Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/balance/existencias', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/balance/validacion'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra || jsonb_build_object('/inventario/balance/existencias', permisos_extra -> '/inventario/balance/validacion')
     where permisos_extra ? '/inventario/balance/validacion'
       and not (permisos_extra ? '/inventario/balance/existencias');
  end if;
end $$;

commit;

select rol, nivel from public.rol_permisos where seccion = '/inventario/balance/existencias' order by rol;
