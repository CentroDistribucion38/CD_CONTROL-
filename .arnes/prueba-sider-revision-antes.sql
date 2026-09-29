-- =====================================================================
-- EL ESTADO DE ANTES DE MIGRAR «REVISIÓN AI NORMAL Y CERTIFICADA»
--
-- La base ya trae 2026-09-sider-sorting.sql: en este estado v_sider_ai
-- SOLO trae las 'ai', y un Sorting hecho vive en la tabla sin aparecer
-- ahí. La migración nueva cambia eso a propósito —ahora las dos entran,
-- marcadas— y lo que NO puede cambiar es lo que ya se cobraba: la huella
-- de las AI de antes tiene que salir idéntica.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into public.sider_origenes (planta, cd_origen, activo) values ('BAQ','Barranquilla',true)
on conflict (planta) do update set activo = true;
insert into public.sider_skus (sku, descripcion, activo) values ('G175','Costeñita 175',true)
on conflict (sku) do update set activo = true;

/* Un viaje con AI hecha (la que ya se cobra), uno con Sorting hecho (el
   que hoy NO aparece en el informe) y dos importadas sin viaje. */
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai, requiere_sorting) values
  ('cccccccc-0000-0000-0000-000000000001','OLD001','BAQ','G175',20,'2026-08-01','recibido',true,false),
  ('cccccccc-0000-0000-0000-000000000002','OLD002','BAQ','G175',20,'2026-08-02','recibido',false,true);
insert into public.sider_certificaciones (viaje_id, punta, lat, lng) values
  ('cccccccc-0000-0000-0000-000000000001','llegada',10.96,-74.79),
  ('cccccccc-0000-0000-0000-000000000002','llegada',10.96,-74.79);

insert into public.sider_ai_revisiones
  (id, viaje_id, fecha, planta, placa, turno, canal, envase, recibidas, revisadas, origen, tipo)
values
  ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
   '2026-08-01','BAQ','OLD001','T1','t1','G175',82080,4104,'formulario','ai'),
  ('dddddddd-0000-0000-0000-000000000002', null,'2026-05-08','BAQ','JYM958','T1','t1','G175',
   82080,4104,'importado','ai'),
  ('dddddddd-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000002',
   '2026-08-02','BAQ','OLD002','T1','t1','G175',41040,2052,'formulario','sorting');
insert into public.sider_ai_conteos (revision_id, defecto, unidades) values
  ('dddddddd-0000-0000-0000-000000000001','rota',37),
  ('dddddddd-0000-0000-0000-000000000001','faltante',11),
  ('dddddddd-0000-0000-0000-000000000002','rota',60),
  ('dddddddd-0000-0000-0000-000000000004','rota',30);

create table public._rev_huella as
select count(*)::int as filas,
       coalesce(sum(no_abono), 0)::bigint as no_abono,
       coalesce(sum(abono_sap), 0)::bigint as abono_sap,
       md5(string_agg(id::text || ':' || indice::text || ':' || no_abono::text || ':' ||
                      hl_defectos::text || ':' || defectos_hoja::text, '|' order by id)) as md5
  from public.v_sider_ai;

/* Lo que se le cobra hoy al socio por el Sorting: nada, no está en la
   vista. Se guarda cuánto SERÍA, calculado a mano, para comprobar que
   después de migrar entra exactamente eso. */
create table public._rev_sorting_esperado as
select round(41040 * 30::numeric / 2052)::int as no_abono;

do $$
declare h record;
begin
  select * into h from public._rev_huella;
  if h.filas <> 2 then
    raise exception 'FALLA: antes de migrar v_sider_ai debe traer 2 AI y trae %', h.filas;
  end if;
  raise notice 'antes de migrar: % AI en el informe, no-abono %', h.filas, h.no_abono;
end $$;
