-- =====================================================================
-- INVENTARIO · BALANCE · VALIDACIÓN DE PASIVO (/inventario/balance/validacion)
--
-- Pantalla nueva, solo de lectura: conteo físico − pasivo = pendiente por baja, validado contra el Cuadre SAP AG18.
-- No crea tablas. Quien ya tenía el Cuadre SAP (/inventario/balance/cuadre) recibe el mismo nivel aquí.
-- No pisa lo que se haya puesto a mano. Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/balance/validacion', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/balance/cuadre'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra || jsonb_build_object('/inventario/balance/validacion', permisos_extra -> '/inventario/balance/cuadre')
     where permisos_extra ? '/inventario/balance/cuadre'
       and not (permisos_extra ? '/inventario/balance/validacion');
  end if;
end $$;

commit;

select rol, nivel from public.rol_permisos where seccion = '/inventario/balance/validacion' order by rol;
