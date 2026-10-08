-- =====================================================================
-- INVENTARIO · MAESTRO DE UBICACIONES: FABRICA L2, L4 y L6
--
-- «En fábrica no veo el módulo de L2-L4-L6» (Inventario → Maestro → Ubicaciones).
--
-- La pantalla de Contar ya ofrecía la calle FABRICA con sus tres módulos,
-- pero el Maestro de ubicaciones solo muestra lo que está cargado en la base.
-- Aquí se cargan: calle FABRICA, módulos L2, L4 y L6, sin lado y sin
-- capacidad (una línea de producción se cuenta como una sola posición, igual
-- que EST07 o JAULA_PNC). La clave sigue la forma de siempre —calle + módulo—:
-- FABRICAL2, FABRICAL4 y FABRICAL6, la misma que genera Contar al anotar, así
-- que no se duplican.
--
-- No toca nada que ya exista (si alguna está, se deja como está y se activa).
-- Se crean en cada bodega que ya tenga ubicaciones.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad, activa)
select b.bodega_id, 'FABRICA' || m, 'FABRICA', m, null, null, null, true
  from (select distinct bodega_id from public.ubicaciones) b
 cross join (values ('L2'), ('L4'), ('L6')) as v(m)
on conflict (bodega_id, clave) do update set activa = true;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.ubicaciones where calle = 'FABRICA' and modulo in ('L2', 'L4', 'L6') and activa;
  if v_n = 0 then raise exception 'No quedó ninguna: no hay bodega con ubicaciones cargadas.'; end if;
  raise notice 'LISTO · FABRICA L2, L4 y L6 en el maestro de ubicaciones (% filas).', v_n;
end $$;

commit;
