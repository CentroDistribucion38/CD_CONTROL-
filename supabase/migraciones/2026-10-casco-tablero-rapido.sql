-- =====================================================================
-- CASCO DE VIDRIO · EL TABLERO EN UNA SOLA LECTURA
--
-- «No se pudo leer el casco: canceling statement due to statement timeout»
--
-- El tablero leía casco_registros renglón por renglón, en páginas de
-- 1.000, y la regla de permisos (RLS) revisaba el permiso EN CADA
-- RENGLÓN de cada página. Con todo el historial la base se pasaba del
-- tiempo límite.
--
-- AHORA: una función que revisa el permiso UNA vez y devuelve todo el
-- casco en un solo paquete. Quien no tiene permiso para ver el casco
-- (Registrar o Tablero) recibe un error y no ve nada: lo mismo que antes.
--
-- Trae también el arreglo de la regla (por si no corriste
-- 2026-10-casco-lectura-rapida.sql). Se puede correr las veces que sea.
-- =====================================================================
begin;

-- 1. La regla de lectura, preguntando el permiso una vez por consulta.
drop policy if exists casco_ver on public.casco_registros;
create policy casco_ver on public.casco_registros
  for select to authenticated
  using ((select public.mi_nivel_pantalla('/inventario/casco')) in ('ver', 'editar')
      or (select public.mi_nivel_pantalla('/inventario/casco/tablero')) in ('ver', 'editar'));

-- 2. Todo el casco para el tablero, en un solo paquete.
--    Cada renglón va como [fecha, ubicación, sku, hl, inventario, baja,
--    puesto, calidad]: en lista y no con nombres, para que pese menos.
create or replace function public.casco_tablero_datos()
returns json
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar')
       or public.mi_nivel_pantalla('/inventario/casco/tablero') in ('ver', 'editar')) then
    raise exception 'No tienes permiso para ver el casco de vidrio.' using errcode = '42501';
  end if;
  return (
    select coalesce(json_agg(json_build_array(
             r.fecha, r.ubicacion, r.sku, r.hl, r.inventario, r.baja,
             to_jsonb(r) ->> 'puesto', to_jsonb(r) ->> 'calidad')
           order by r.fecha, r.ubicacion, r.sku), '[]'::json)
      from public.casco_registros r
  );
end
$$;
revoke all on function public.casco_tablero_datos() from public;
grant execute on function public.casco_tablero_datos() to authenticated;

analyze public.casco_registros;
commit;

-- Para confirmar: cuántos renglones devuelve (debe salir rápido).
select json_array_length(public.casco_tablero_datos()) as renglones;
