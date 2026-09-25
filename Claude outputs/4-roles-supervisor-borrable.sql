-- =====================================================================
-- ROLES · SUPERVISOR SE PUEDE BORRAR; LAS FIRMAS VAN POR PERMISO
-- ---------------------------------------------------------------------
-- «¿Por qué no me deja eliminar ese?» Supervisor era de sistema porque
-- la aplicación lo nombraba en dos sitios: quién edita Quiebra y quién
-- firma la salida de roturas. Lo mismo pasaba con ABI, Verificador y
-- Validación en las firmas de roturas: borrar cualquiera de esos roles
-- dejaba su firma sin nadie que la pudiera poner.
--
-- AHORA FIRMA QUIEN TIENE «EDITAR» EN LA PANTALLA DE ESA FIRMA:
--
--   visto bueno        /roturas/en-sitio/visto-bueno
--   supervisor (a)     /roturas/salida          (Pesar)
--   verificador        /roturas/salida/verificacion
--   validador          /roturas/salida/validacion
--
-- con la misma regla de la aplicación: el administrador siempre; si no,
-- lo puesto a la persona (permisos_extra) y si no, lo de su rol. La regla
-- de las tres personas distintas sigue en salida_firmar, sin tocar.
--
-- Y Supervisor deja de ser de sistema. Administrador y Operador siguen
-- fijos: uno es el que manda, el otro es con el que nace un usuario.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- El nivel de una pantalla para quien pide, con lo suyo y lo de su rol.
create or replace function public.mi_nivel_pantalla(p_seccion text)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when public.manda() then 'editar'
    else coalesce(
      (select nullif(p.permisos_extra->>p_seccion, '')
         from public.perfiles p where p.id = auth.uid() and p.activo),
      (select rp.nivel::text from public.rol_permisos rp
        where rp.rol = public.mi_rol() and rp.seccion = p_seccion),
      'ninguno')
  end
$$;
grant execute on function public.mi_nivel_pantalla(text) to authenticated;

create or replace function public.rotura_puede(p_papel text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_papel in ('visto_bueno', 'supervisora', 'verificador', 'validador')
     and public.mi_nivel_pantalla(case p_papel
    when 'visto_bueno' then '/roturas/en-sitio/visto-bueno'
    when 'supervisora' then '/roturas/salida'
    when 'verificador' then '/roturas/salida/verificacion'
    when 'validador'   then '/roturas/salida/validacion'
  end) = 'editar'
$$;

-- QUE NADIE GANE UNA FIRMA QUE NO TENÍA. Antes firmaba el rol con ese
-- nombre, aunque otros roles tuvieran «Editar» en la pantalla; y en esas
-- cuatro pantallas «Editar» no sirve para nada más que firmar. Así que,
-- UNA SOLA VEZ (mientras Supervisor todavía es de sistema), a los roles
-- que no podían firmar se les baja esa pantalla a «Ver»: firma el mismo
-- que firmaba ayer.
do $$
declare n int;
begin
  if (select sistema from public.roles where clave = 'supervisor') then
    update public.rol_permisos rp set nivel = 'ver'
      from (values ('/roturas/en-sitio/visto-bueno', 'abi'), ('/roturas/salida', 'supervisor'),
                   ('/roturas/salida/verificacion', 'verificador'), ('/roturas/salida/validacion', 'validador')) f(ruta, firmante)
     where rp.seccion = f.ruta and rp.nivel = 'editar' and rp.rol <> f.firmante
       and not coalesce((select r.manda from public.roles r where r.clave = rp.rol), false);
    get diagnostics n = row_count;
    raise notice 'Pantallas de firma bajadas a «Ver» en roles que no firmaban: %', n;
  end if;
end $$;

update public.roles set sistema = false where clave = 'supervisor';

-- QUIÉN FIRMA DESDE HOY, para mirarlo antes de dar por hecho. Si un rol
-- aparece donde no debe, se le baja a «Ver» esa pantalla en Roles.
do $$
declare r record;
begin
  for r in
    select x.papel, string_agg(distinct ro.nombre, ', ' order by ro.nombre) roles
      from (values ('Visto bueno', '/roturas/en-sitio/visto-bueno'), ('Supervisor (a)', '/roturas/salida'),
                   ('Verificador', '/roturas/salida/verificacion'), ('Validación', '/roturas/salida/validacion')) x(papel, ruta)
      left join public.rol_permisos rp on rp.seccion = x.ruta and rp.nivel = 'editar'
      left join public.roles ro on ro.clave = rp.rol
     group by x.papel
  loop
    raise notice 'Firma % → %', r.papel, coalesce(r.roles, 'solo el administrador');
  end loop;
  raise notice 'LISTO: Supervisor se puede borrar; las firmas de roturas van por permiso de pantalla.';
end $$;

commit;
