-- =====================================================================
-- 5S · PASO 5 — SOLO EL SUPER ADMINISTRADOR
--
-- «Que nadie que no sea super admin pueda ver lo de 5S.»
-- Se puede correr en cualquier momento después de 2026-11-cinco-s.sql.
--
-- Todo 5S (tablas, vistas, funciones y fotos del bucket cinco-s) pregunta
-- por s5_ve() para ver y por s5_edita(ruta) para cambiar. Las dos pasan a
-- responder lo mismo: ¿quien entró es de un rol que MANDA (super
-- administrador)? A nadie más le llega una sola fila ni una foto, aunque
-- su rol tenga marcadas pantallas de 5S en Admin › Roles. En la app el
-- módulo tampoco se le muestra a nadie más.
-- =====================================================================
begin;

create or replace function public.s5_ve() returns boolean
language sql stable security definer set search_path = public
as $$
  select public.manda()
$$;
grant execute on function public.s5_ve() to authenticated;

create or replace function public.s5_edita(p_ruta text) returns boolean
language sql stable security definer set search_path = public
as $$ select public.manda() and p_ruta is not null $$;
grant execute on function public.s5_edita(text) to authenticated;

notify pgrst, 'reload schema';
commit;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.perfiles p join public.roles r on r.clave = p.rol where r.manda and p.activo;
  raise notice '----------------------------------------------------------';
  raise notice '5S solo para super administrador ... ok';
  raise notice 'personas que lo ven ................ %', v_n;
  raise notice '----------------------------------------------------------';
end $$;
