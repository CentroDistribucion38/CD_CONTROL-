-- =====================================================================
-- ROTURA DE LÍNEA · CUÁNTO SE USA CADA COSA DEL MAESTRO
--
-- Requiere: supabase/modulos/rotura-linea.sql
--
-- La pantalla del maestro tiene que poder decir «esta máquina la
-- nombran 1.865 registros» ANTES de que alguien le dé borrar. Sin eso,
-- la única respuesta posible es que la base rechace el borrado con un
-- «violates foreign key constraint», que no le explica nada a nadie.
--
-- ES UNA VISTA Y NO UNA COLUMNA porque es una CUENTA: guardarla en la
-- tabla obligaría a mantenerla al día en cada insert y en cada borrado,
-- y el día que se desincronice nadie lo va a notar.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================
create or replace view public.v_rotlinea_uso as
select 'envase'::text as clase, envase as clave,
       count(*)::int as registros, sum(und)::bigint as unidades, max(fecha) as ultima
  from public.rotlinea_registro group by envase
union all
select 'maquina', maquina::text, count(*)::int, sum(und)::bigint, max(fecha)
  from public.rotlinea_registro group by maquina
union all
select 'linea', linea::text, count(*)::int, sum(und)::bigint, max(fecha)
  from public.rotlinea_registro group by linea
union all
/* El SKU no lo nombra el registro de rotura —ese va por envase— sino la
   PRODUCCIÓN. Contarlo desde la otra tabla es lo que evita decir "este
   SKU no se usa" de uno que aparece en mil órdenes de SAP. */
select 'sku', sku, count(*)::int, sum(cantidad)::bigint, max(fecha)
  from public.rotlinea_produccion group by sku;

grant select on public.v_rotlinea_uso to authenticated;

do $$
begin
  if to_regclass('public.v_rotlinea_uso') is null then
    raise exception 'FALTÓ: v_rotlinea_uso';
  end if;
  raise notice 'Listo: el maestro ya sabe cuánto se usa cada cosa.';
end $$;
