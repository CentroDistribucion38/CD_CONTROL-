-- =====================================================================
-- EL ESTADO DE ANTES DE MIGRAR
--
-- La migración de Sorting cambia la llave de una tabla que YA TIENE
-- DATOS —las 293 revisiones importadas del Excel y las que se hicieron
-- en el muelle—. Probarla sobre una base vacía dice que el SQL corre,
-- no que respeta lo que hay. Aquí se deja lo que habría en la base real
-- de Cristian, se saca una huella de lo que suma el cobro al socio, y
-- después de migrar se comprueba que la huella es la MISMA.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into public.sider_origenes (planta, cd_origen, activo) values ('BAQ','Barranquilla',true)
on conflict (planta) do update set activo = true;
insert into public.sider_skus (sku, descripcion, activo) values ('G175','Costeñita 175',true)
on conflict (sku) do update set activo = true;

/* DOS VIAJES DE LOS QUE YA EXISTÍAN: uno con su revisión AI hecha en el
   muelle, y uno marcado que todavía espera. */
insert into public.sider_viajes (id, placa, planta, sku, estibas, fecha, estado, requiere_ai) values
  ('cccccccc-0000-0000-0000-000000000001','OLD001','BAQ','G175',20,'2026-08-01','recibido',true),
  ('cccccccc-0000-0000-0000-000000000002','OLD002','BAQ','G175',20,'2026-08-02','recibido',true)
on conflict (id) do nothing;
insert into public.sider_certificaciones (viaje_id, punta, lat, lng) values
  ('cccccccc-0000-0000-0000-000000000001','llegada',10.96,-74.79),
  ('cccccccc-0000-0000-0000-000000000002','llegada',10.96,-74.79)
on conflict do nothing;

/* UNA REVISIÓN DE MUELLE, con sus conteos: 82.080 recibidas y 4.104
   revisadas, la fila real del Excel, donde se ven los redondeos. */
insert into public.sider_ai_revisiones
  (id, viaje_id, fecha, planta, placa, turno, canal, envase, recibidas, revisadas, origen)
values
  ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
   '2026-08-01','BAQ','OLD001','T1','t1','G175',82080,4104,'formulario');
insert into public.sider_ai_conteos (revision_id, defecto, unidades) values
  ('dddddddd-0000-0000-0000-000000000001','rota',37),
  ('dddddddd-0000-0000-0000-000000000001','faltante',11),
  ('dddddddd-0000-0000-0000-000000000001','hongo',5);

/* Y DOS IMPORTADAS, SIN VIAJE: son las que hacen que la llave (viaje_id)
   con nulos sea un caso de verdad y no de libro. */
insert into public.sider_ai_revisiones
  (id, viaje_id, fecha, planta, placa, turno, canal, envase, recibidas, revisadas, origen)
values
  ('dddddddd-0000-0000-0000-000000000002', null,'2026-05-08','BAQ','JYM958','T1','t1','G175',
   82080,4104,'importado'),
  ('dddddddd-0000-0000-0000-000000000003', null,'2026-05-09','BAQ','JYM959','T2','t1','G175',
   41040,2052,'importado');
insert into public.sider_ai_conteos (revision_id, defecto, unidades) values
  ('dddddddd-0000-0000-0000-000000000002','rota',60),
  ('dddddddd-0000-0000-0000-000000000003','rota',20),
  ('dddddddd-0000-0000-0000-000000000003','cemento',7);

/* LA HUELLA. Es lo que sale a SAP y lo que se le cobra al socio: si esta
   cadena cambia después de migrar, se le cobró distinto a alguien. Se
   guarda en una tabla real y no temporal porque la migración y las
   pruebas corren en sesiones distintas. */
create table public._sorting_huella as
select count(*)::int as filas,
       coalesce(sum(no_abono), 0)::bigint as no_abono,
       coalesce(sum(abono_sap), 0)::bigint as abono_sap,
       coalesce(sum(defectos), 0)::bigint as defectos,
       md5(string_agg(id::text || ':' || indice::text || ':' || no_abono::text || ':' ||
                      hl_defectos::text || ':' || defectos_hoja::text, '|' order by id)) as md5
  from public.v_sider_ai;

do $$
declare h record;
begin
  select * into h from public._sorting_huella;
  if h.filas <> 3 then
    raise exception 'FALLA: el estado de antes debería tener 3 revisiones y tiene %', h.filas;
  end if;
  raise notice 'antes de migrar: % revisiones, no-abono %, abono SAP %', h.filas, h.no_abono, h.abono_sap;
end $$;
