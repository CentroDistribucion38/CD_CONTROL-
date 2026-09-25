begin;

-- =====================================================================
-- UN VIAJE ANULADO NO ESTÁ ESPERANDO QUE NADIE CUENTE SU MUESTRA
--
-- «Pero no se quita.»
--
-- ---------------------------------------------------------------------
-- LO QUE PASABA
-- ---------------------------------------------------------------------
-- La pantalla de En tránsito pinta DOS cosas, no una:
--
--   · los que están en camino  (estado = 'en_transito'), y
--   · los que YA LLEGARON y siguen sin revisar, que salen de
--     `v_sider_ai_pendientes`. Esos no están en tránsito —su llegada ya
--     se certificó— pero tienen que verse ahí porque no hay otra
--     pantalla donde reclamarlos.
--
-- Anular pone el viaje en 'anulado', y con eso desaparece del primer
-- grupo. Del segundo NO: esa vista pregunta si el viaje pide revisión y
-- si alguien la hizo, y nunca preguntó en qué estado está. Así que un
-- vehículo anulado seguía saliendo en En tránsito para siempre, y el
-- botón de Anular parecía no hacer nada.
--
-- ---------------------------------------------------------------------
-- POR QUÉ SE ARREGLA EN LA VISTA Y NO EN LA PANTALLA
-- ---------------------------------------------------------------------
-- Porque la frase que define la vista es «los que esperan que alguien
-- cuente su muestra», y un viaje anulado no espera nada: se cerró sin
-- contar y al socio se le abonó todo lo que mandó. Filtrarlo en la
-- pantalla lo escondería en Tránsito y lo dejaría colado en cualquier
-- otro sitio que lea esta vista —hoy el tablero de la revisión AI—,
-- que es donde nadie lo buscaría.
--
-- Se puede correr varias veces sin romper nada.
-- =====================================================================

do $bloque$
begin
  if to_regclass('public.sider_viajes') is null then
    raise exception 'Falta la tabla sider_viajes: corre supabase/modulos/sider.sql primero.';
  end if;
  if to_regclass('public.sider_ai_revisiones') is null then
    raise exception 'Falta el módulo AI: corre supabase/modulos/sider-ai.sql primero.';
  end if;
end $bloque$;

-- ---------------------------------------------------------------------
-- LA VISTA, CON EL ESTADO DENTRO
--
-- `create or replace` y no `drop` + `create`: no se está metiendo ni
-- quitando ninguna columna —solo cambia el `where`—, y reemplazar en
-- sitio conserva los permisos y no se lleva por delante nada que
-- cuelgue de ella. Meter una columna en MEDIO sí obligaría a borrarla
-- antes, que es lo que dejó trancado `2026-09-corregir-viajes.sql`
-- durante semanas.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_ai_pendientes as
select
  v.id as viaje_id, v.placa, v.planta, v.sku, v.estibas,
  coalesce(v.fecha, v.creado_en::date) as fecha,
  v.ai_pedido_en, v.ai_pedido_por, v.ai_motivo,
  p.nombre as pedido_nombre,
  (select max(c.hecha_en) from public.sider_certificaciones c
    where c.viaje_id = v.id and c.punta = 'llegada') as llego_en
from public.sider_viajes v
left join public.perfiles p on p.id = v.ai_pedido_por
where v.requiere_ai
  -- EL RENGLÓN NUEVO, Y ES TODO EL ARREGLO.
  and v.estado <> 'anulado'
  and not exists (select 1 from public.sider_ai_revisiones r where r.viaje_id = v.id);

grant select on public.v_sider_ai_pendientes to authenticated;

do $$
declare v_col int;
begin
  select count(*) into v_col from public.v_sider_ai_pendientes
   where viaje_id in (select id from public.sider_viajes where estado = 'anulado');
  if v_col > 0 then
    raise exception 'Todavía se cuelan % anulados en los pendientes de revisión.', v_col;
  end if;
  raise notice 'Listo: los viajes anulados ya no aparecen como pendientes de revisión AI.';
  raise notice 'Los que sigan en En transito con la marca morada es que NO estan anulados.';
end $$;

commit;
