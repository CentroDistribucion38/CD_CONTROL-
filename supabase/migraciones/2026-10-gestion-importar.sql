-- =====================================================================
-- GESTIÓN · IMPORTAR (/gestion/importar) — la carga masiva desde Excel.
--
-- No crea tablas: usa las de gestion.sql. Solo da el permiso de la pantalla nueva:
-- admin y supervisor EDITAN; los demás roles no la ven (la importación es de quien administra el módulo).
-- No pisa lo que ya se haya puesto a mano. Se puede correr varias veces.
--
-- Correr DESPUÉS de supabase/modulos/gestion.sql.
-- =====================================================================
begin;

do $$
begin
  if to_regclass('public.rol_permisos') is not null then
    insert into public.rol_permisos (rol, seccion, nivel)
    select r.clave, '/gestion/importar', 'editar'::public.nivel_permiso
      from public.roles r
     where r.clave in ('admin', 'supervisor')
    on conflict (rol, seccion) do nothing;
  end if;
end $$;

commit;

select rol, nivel from public.rol_permisos where seccion = '/gestion/importar' order by rol;
