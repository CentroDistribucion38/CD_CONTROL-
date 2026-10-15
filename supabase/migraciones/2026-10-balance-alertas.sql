-- =====================================================================
-- INVENTARIO · BALANCE · ALERTAS (/inventario/balance/alertas)
--
-- Pantalla nueva: compara el Balance del día con el del día anterior con conteo enviado.
-- Solo LEE; no crea tablas.
--
-- Lo único que hace falta es el permiso: quien ya tenía el Balance (/inventario/balance) recibe el
-- mismo nivel aquí. No pisa lo que se haya puesto a mano. Se puede correr varias veces.
-- =====================================================================
begin;

insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/balance/alertas', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/balance'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra || jsonb_build_object('/inventario/balance/alertas', permisos_extra -> '/inventario/balance')
     where permisos_extra ? '/inventario/balance'
       and not (permisos_extra ? '/inventario/balance/alertas');
  end if;
end $$;

commit;

-- COMPROBACIÓN: debe haber una fila por rol que tenga el Balance.
select rol, nivel from public.rol_permisos where seccion = '/inventario/balance/alertas' order by rol;
