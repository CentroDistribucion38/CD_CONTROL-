-- ===================================================================
-- SIDER · AI — EL HISTÓRICO DE BARRANQUILLA, 2026
--
-- Sale de «Registro Cobro AI COL V02.xlsx», hoja BD AI BAQ, leída por
-- FÓRMULAS y no por valores. Mayo a agosto de 2026.
--
--   285 revisiones importadas
--   10 filas dejadas fuera, una por una, al final de este archivo
--
-- LOS PORCENTAJES DEL EXCEL NO SE IMPORTAN. Ni el «% ÍNDICE DE COBRO»
-- ni el «% TOTAL BOTELLAS CON DEFECTOS» ni los Hl. Todos salen de las
-- unidades contadas, en `v_sider_ai`, con las nueve categorías que
-- cobran. Importar un porcentaje ya calculado sería poder
-- contradecir a la vista, y entonces habría que decidir cuál manda
-- cuando el socio reclame.
--
-- Se puede correr varias veces: la llave es planta+fecha+placa+envase.
-- ===================================================================

begin;

do $$
begin
  if to_regproc('public.sider_ai_importar') is null then
    raise exception 'Falta supabase/migraciones/2026-09-sider-ai-historico.sql. Ese va primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- LOS SOCIOS QUE APARECEN EN LA HOJA
--
-- La clave se normaliza igual que en el maestro del módulo: minúsculas,
-- sin tildes, sin puntuación. Es lo que hace que «Logisinú S.A.S Zomac»
-- y «Logisinu S.A.S Zomac» —dos socios distintos en el Excel— caigan en
-- el mismo y el informe no salga partido en dos.
--
-- `do nothing` y no `do update`: si el socio ya está en el maestro, su
-- nombre bueno es el del maestro, no el que alguien tecleó en una fila.
-- ---------------------------------------------------------------------
insert into public.sider_ai_socios (clave, nombre, activo) values
  ('cervylicores_distribuciones_sas', 'Cervylicores Distribuciones SAS', true),
  ('comercializadora_central_ltda_', 'Comercializadora Central Ltda.', true),
  ('logisinu_s_a_s_zomac', 'Logisinú S.A.S Zomac', true),
  ('los_gavilanes_cia_ltda_', 'Los Gavilanes Cia Ltda.', true),
  ('los_gavilanes_y_cia_ltda_', 'Los Gavilanes Y Cia Ltda.', true)
on conflict (clave) do nothing;

-- Los envases de la hoja. El litraje sale del código —G175 son 175 cc—
-- que es la regla de los dieciocho de la hoja «Datos».
insert into public.sider_ai_envases (clave, descripcion, litros, activo) values
  ('CB320', 'CB320', 0.32, true),
  ('F1000', 'F1000', 1.0, true),
  ('F175', 'F175', 0.175, true),
  ('F330', 'F330', 0.33, true),
  ('G175', 'G175', 0.175, true),
  ('M1000', 'M1000', 1.0, true),
  ('M250', 'M250', 0.25, true),
  ('M330', 'M330', 0.33, true)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- LAS 285 REVISIONES
-- ---------------------------------------------------------------------
select public.sider_ai_importar('2026-05-08','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 4, "cemento": 5, "otras_cias": 10, "extrasucio": 7, "cristalizado": 6, "mezclado": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-12','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 5, "extrasucio": 4, "cuerpo_extra": 8, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-12','BAQ','SBL495','T1','socios','los_gavilanes_cia_ltda_','G175',false,20520,4104,'{"rota": 3, "faltante": 3, "otras_cias": 2, "extrasucio": 11, "cristalizado": 5, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-25','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,12150,2700,'{"rota": 3, "faltante": 14}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-13','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 3, "faltante": 8, "otras_cias": 6, "extrasucio": 13, "mezclado": 2, "cuerpo_extra": 2, "cajas_malas": 1, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-13','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,12312,4104,'{"rota": 2, "faltante": 3, "otras_cias": 5, "extrasucio": 21, "cuerpo_extra": 1, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-13','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,5400,2700,'{"rota": 3, "cemento": 3, "otras_cias": 7, "extrasucio": 3, "cristalizado": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "otras_cias": 4, "extrasucio": 17, "cristalizado": 9, "mezclado": 6, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "faltante": 2, "cemento": 5, "otras_cias": 6, "extrasucio": 7, "cristalizado": 12, "mezclado": 4, "cajas_malas": 1, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','F330',false,24300,2700,'{"rota": 5, "faltante": 6, "otras_cias": 6, "cristalizado": 11, "mezclado": 30, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,4050,2700,'{"rota": 3, "faltante": 4, "otras_cias": 3, "extrasucio": 7, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 5, "faltante": 3, "otras_cias": 2, "extrasucio": 10, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"faltante": 2, "otras_cias": 1, "mezclado": 5, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-14','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"otras_cias": 10, "cristalizado": 6, "mezclado": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-15','BAQ','VCM547','T1','socios','cervylicores_distribuciones_sas','M250',false,61560,3420,'{"rota": 1, "extrasucio": 38, "mezclado": 8, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-16','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,16416,4104,'{"rota": 2, "faltante": 2, "cemento": 3, "extrasucio": 8, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-15','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,77936,4104,'{"rota": 1, "otras_cias": 2, "extrasucio": 12, "cuerpo_extra": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-16','BAQ','TLQ792','T1','socios','comercializadora_central_ltda_','G175',false,73872,4104,'{"rota": 2, "faltante": 5, "cemento": 7, "otras_cias": 2, "extrasucio": 11, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-16','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 5, "faltante": 2, "cemento": 2, "otras_cias": 1, "extrasucio": 6, "mezclado": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-16','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F1000',false,2340,936,'{"rota": 2, "faltante": 4, "mezclado": 2, "cuerpo_extra": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-19','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,4050,2700,'{"rota": 2, "faltante": 1, "otras_cias": 3, "extrasucio": 15, "mezclado": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-19','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,4104,4104,'{"rota": 7, "faltante": 3, "cemento": 2, "extrasucio": 12, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-19','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 4, "cemento": 5, "otras_cias": 9, "extrasucio": 7, "cristalizado": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-20','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F330',false,4050,2700,'{"rota": 1, "faltante": 4, "otras_cias": 1, "mezclado": 2, "cuerpo_extra": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-20','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 5, "faltante": 3, "cemento": 6, "extrasucio": 7, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-20','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F330',true,5400,2700,'{"rota": 3, "otras_cias": 4, "extrasucio": 9, "cristalizado": 8, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-21','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,4104,4104,'{"rota": 8, "faltante": 3, "otras_cias": 4, "extrasucio": 12, "cristalizado": 5, "mezclado": 1, "cuerpo_extra": 6, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-21','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',false,48600,2700,'{"rota": 3, "faltante": 4, "otras_cias": 3, "extrasucio": 7, "cristalizado": 2, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-21','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,6750,2700,'{"faltante": 2, "otras_cias": 1, "cristalizado": 5, "mezclado": 5, "cuerpo_extra": 4, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-22','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 6, "faltante": 4, "cemento": 3, "otras_cias": 5, "extrasucio": 8, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-22','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 3, "faltante": 4, "otras_cias": 3, "extrasucio": 7, "cristalizado": 4, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-30','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 2, "faltante": 2, "cemento": 5, "otras_cias": 6, "extrasucio": 7, "cristalizado": 12, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-23','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,16416,4104,'{"rota": 3, "faltante": 4, "cristalizado": 5, "mezclado": 2, "cuerpo_extra": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-23','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "extrasucio": 11, "cuerpo_extra": 5, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-23','BAQ','LRN900','T2','t1','logisinu_s_a_s_zomac','M330',true,24300,2700,'{"rota": 3, "otras_cias": 6, "extrasucio": 11, "cristalizado": 3, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-23','BAQ','SBL485','T2','t1','los_gavilanes_y_cia_ltda_','G175',true,4104,4104,'{"rota": 4, "cemento": 5, "otras_cias": 7, "extrasucio": 8, "cristalizado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-05-24','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','M330',false,2700,2700,'{"rota": 1, "faltante": 4, "otras_cias": 5, "extrasucio": 6, "cristalizado": 12, "mezclado": 8, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-02','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,2808,936,'{"rota": 1, "faltante": 3, "hongo": 3, "mezclado": 4, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-03','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "faltante": 3, "otras_cias": 4, "extrasucio": 47, "cristalizado": 35, "etiq_asoleada": 7}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-03','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 2, "faltante": 4, "otras_cias": 2, "extrasucio": 15, "hongo": 4, "mezclado": 5, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-04','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"faltante": 3, "otras_cias": 3, "extrasucio": 2, "hongo": 6, "mezclado": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-04','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 3, "cemento": 8, "otras_cias": 2, "extrasucio": 22, "mezclado": 4, "cuerpo_extra": 5}'::jsonb,'3285618114',null);
select public.sider_ai_importar('2026-06-04','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 2, "otras_cias": 2, "extrasucio": 15, "cristalizado": 5, "mezclado": 1, "cuerpo_extra": 8}'::jsonb,'3285618115',null);
select public.sider_ai_importar('2026-06-05','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,9450,2700,'{"rota": 1, "faltante": 5, "otras_cias": 4, "etiq_asoleada": 3, "mezclado": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-06','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 2, "faltante": 4, "cemento": 6, "otras_cias": 2, "extrasucio": 17, "cuerpo_extra": 5, "cajas_malas": 1}'::jsonb,'3285618144',null);
select public.sider_ai_importar('2026-06-05','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 2, "cemento": 4, "otras_cias": 1, "extrasucio": 10, "cristalizado": 6, "mezclado": 2, "cuerpo_extra": 3, "estiba_mala": 1}'::jsonb,'3307185886',null);
select public.sider_ai_importar('2026-06-05','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 1, "otras_cias": 1, "extrasucio": 25, "mezclado": 4, "cuerpo_extra": 8}'::jsonb,'3285618154',null);
select public.sider_ai_importar('2026-06-06','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,1404,936,'{"rota": 2, "faltante": 3, "hongo": 14, "mezclado": 2, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-06','BAQ','LKK479','T3','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 7, "otras_cias": 3, "extrasucio": 19, "etiq_asoleada": 13, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-07','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 2, "cemento": 4, "otras_cias": 12, "extrasucio": 7, "cristalizado": 6, "mezclado": 4}'::jsonb,'3285618214',null);
select public.sider_ai_importar('2026-06-07','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','F175',true,77976,4104,'{"rota": 4, "faltante": 114, "cemento": 4, "otras_cias": 6, "extrasucio": 4, "cristalizado": 6}'::jsonb,'3285618215',null);
select public.sider_ai_importar('2026-06-09','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"faltante": 4, "cemento": 4, "otras_cias": 6, "extrasucio": 4, "cristalizado": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-09','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 1, "faltante": 3, "otras_cias": 1, "cristalizado": 7, "hongo": 5, "mezclado": 2}'::jsonb,'3307188375',null);
select public.sider_ai_importar('2026-06-09','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 4, "faltante": 2, "extrasucio": 10, "cristalizado": 5, "hongo": 7, "cuerpo_extra": 5}'::jsonb,'3285618241',null);
select public.sider_ai_importar('2026-06-09','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',true,18468,4104,'{"rota": 4, "faltante": 6, "cemento": 4, "otras_cias": 5, "extrasucio": 6, "cristalizado": 6, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-10','BAQ','LKN900','T1','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 1, "faltante": 1, "cemento": 3, "hongo": 6, "mezclado": 1, "cuerpo_extra": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-10','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 2, "faltante": 4, "otras_cias": 2, "cristalizado": 10, "mezclado": 2, "cuerpo_extra": 7, "estiba_mala": 1}'::jsonb,'3307189583',null);
select public.sider_ai_importar('2026-06-10','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,18468,4104,'{"faltante": 1, "cemento": 4, "otras_cias": 2, "antiguo": 5, "extrasucio": 10, "hongo": 12, "cuerpo_extra": 5}'::jsonb,'3307189614',null);
select public.sider_ai_importar('2026-06-11','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"faltante": 2, "cemento": 2, "extrasucio": 10, "cristalizado": 5, "hongo": 7, "cuerpo_extra": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-11','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"faltante": 1, "otras_cias": 1, "antiguo": 5, "extrasucio": 18, "cristalizado": 7, "mezclado": 2, "cuerpo_extra": 9, "cajas_malas": 1}'::jsonb,'3285618312',null);
select public.sider_ai_importar('2026-06-11','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,2700,2700,'{"faltante": 2, "otras_cias": 1, "cristalizado": 8, "etiq_asoleada": 5, "mezclado": 1, "cuerpo_extra": 9, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-20','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','G175',true,43092,4104,'{"rota": 5, "cemento": 3, "otras_cias": 7, "extrasucio": 8, "cristalizado": 7, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-20','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',true,2700,2700,'{"rota": 5, "faltante": 8, "otras_cias": 7, "extrasucio": 4, "cristalizado": 5, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-20','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','M330',false,18900,2700,'{"faltante": 5, "otras_cias": 3, "mezclado": 6, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-22','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,18468,4104,'{"rota": 3, "otras_cias": 3, "extrasucio": 43, "etiq_asoleada": 10, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-22','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "cemento": 4, "otras_cias": 4, "extrasucio": 18, "etiq_asoleada": 12, "cuerpo_extra": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-23','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"faltante": 5, "otras_cias": 2, "hongo": 6, "mezclado": 12, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-23','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 2, "faltante": 6, "otras_cias": 4, "antiguo": 1, "extrasucio": 7, "etiq_asoleada": 5, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-23','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M1000',false,1404,936,'{"rota": 1, "faltante": 3, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-23','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','CB320',false,27000,2700,'{"rota": 2, "faltante": 4, "extrasucio": 4, "mezclado": 5, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-23','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 2, "cemento": 5, "otras_cias": 4, "extrasucio": 6, "cristalizado": 6, "mezclado": 2, "cuerpo_extra": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-24','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,18468,4104,'{"rota": 1, "faltante": 5, "otras_cias": 4, "extrasucio": 14, "hongo": 7, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-24','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','CB320',false,2700,2700,'{"rota": 2, "faltante": 4, "etiq_asoleada": 8, "mezclado": 6, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-24','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 3, "faltante": 2, "otras_cias": 1, "extrasucio": 12, "hongo": 5, "mezclado": 1, "cuerpo_extra": 6, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-25','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20500,4104,'{"rota": 1, "faltante": 6, "cemento": 3, "otras_cias": 4, "extrasucio": 13, "etiq_asoleada": 9, "cuerpo_extra": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-25','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,3276,936,'{"rota": 1, "faltante": 2, "mezclado": 3, "cuerpo_extra": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-25','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "cemento": 5, "otras_cias": 1, "extrasucio": 7, "hongo": 4, "cuerpo_extra": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-25','BAQ','SBL475','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"faltante": 3, "otras_cias": 1, "extrasucio": 15, "hongo": 6, "etiq_asoleada": 5, "mezclado": 2, "cajas_malas": 2}'::jsonb,'3307210139',null);
select public.sider_ai_importar('2026-06-25','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','M330',false,33750,2700,'{"rota": 2, "faltante": 4, "cristalizado": 5, "hongo": 7, "mezclado": 1, "cuerpo_extra": 3}'::jsonb,'3285618813',null);
select public.sider_ai_importar('2026-06-25','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 2, "faltante": 6, "cemento": 3, "extrasucio": 9, "cuerpo_extra": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-26','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 4, "cemento": 3, "otras_cias": 1, "antiguo": 4, "extrasucio": 12, "mezclado": 1, "cuerpo_extra": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-26','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','CB320',false,2700,2700,'{"rota": 1, "faltante": 1, "otras_cias": 2, "cristalizado": 8, "mezclado": 3, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-26','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 5, "extrasucio": 8, "cristalizado": 15, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-27','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 4, "otras_cias": 3, "extrasucio": 33, "etiq_asoleada": 9, "cuerpo_extra": 1, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-27','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','F330',false,9450,2700,'{"faltante": 4, "cemento": 4, "otras_cias": 1, "cristalizado": 10, "etiq_asoleada": 7, "mezclado": 2}'::jsonb,'3307212513',null);
select public.sider_ai_importar('2026-06-29','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 6, "cemento": 3, "otras_cias": 8, "extrasucio": 6, "cristalizado": 8, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-29','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 4, "faltante": 17, "cemento": 2, "otras_cias": 6, "extrasucio": 5, "cristalizado": 5, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-06-30','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 3, "cemento": 3, "otras_cias": 2, "extrasucio": 11, "hongo": 4, "cuerpo_extra": 8}'::jsonb,'3285618935',null);
select public.sider_ai_importar('2026-06-30','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 5, "cemento": 9, "extrasucio": 15}'::jsonb,'3285618936',null);
select public.sider_ai_importar('2026-06-30','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"faltante": 2, "cemento": 2, "otras_cias": 1, "extrasucio": 18, "cristalizado": 7, "mezclado": 1, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,'3307214036',null);
select public.sider_ai_importar('2026-07-01','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"faltante": 8, "cemento": 2, "otras_cias": 6, "extrasucio": 15, "cristalizado": 5, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-01','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','M330',false,6750,2700,'{"rota": 4, "faltante": 2, "cemento": 1, "cristalizado": 7, "etiq_asoleada": 4, "cuerpo_extra": 5}'::jsonb,'3285618969',null);
select public.sider_ai_importar('2026-07-01','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,3272,468,'{"rota": 1, "faltante": 2, "etiq_asoleada": 4, "mezclado": 2, "cuerpo_extra": 5, "cajas_malas": 1}'::jsonb,'3307215127',null);
select public.sider_ai_importar('2026-07-01','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','CB320',true,6750,2700,'{"rota": 3, "faltante": 9, "otras_cias": 4, "extrasucio": 5, "cristalizado": 1, "mezclado": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-02','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','G175',false,57456,4104,'{"faltante": 5, "cemento": 2, "otras_cias": 1, "extrasucio": 10, "hongo": 2, "mezclado": 2, "cuerpo_extra": 7, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-02','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 4, "cemento": 3, "otras_cias": 8, "extrasucio": 8, "cristalizado": 7, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-02','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 4, "faltante": 7, "otras_cias": 4, "extrasucio": 6, "cristalizado": 10, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','TLQ792','T1','socios','comercializadora_central_ltda_','G175',false,73872,4104,'{"rota": 2, "cemento": 3, "otras_cias": 1, "extrasucio": 12, "hongo": 9, "mezclado": 1, "cuerpo_extra": 5, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 3, "faltante": 6, "cemento": 3, "cristalizado": 8, "mezclado": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,6750,2700,'{"rota": 2, "faltante": 4, "otras_cias": 3, "etiq_asoleada": 3, "mezclado": 2, "cuerpo_extra": 8}'::jsonb,'3307218054',null);
select public.sider_ai_importar('2026-07-03','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 3, "faltante": 10, "extrasucio": 9, "etiq_asoleada": 5}'::jsonb,'3285619042',null);
select public.sider_ai_importar('2026-07-03','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 6, "cemento": 8, "otras_cias": 3, "mezclado": 1, "cuerpo_extra": 4, "cajas_malas": 1}'::jsonb,'3285619043',null);
select public.sider_ai_importar('2026-07-02','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 3, "cemento": 3, "otras_cias": 7, "extrasucio": 6, "cristalizado": 7, "mezclado": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','SBL','T2','socios','los_gavilanes_y_cia_ltda_','G175',true,8208,4208,'{"rota": 5, "faltante": 12, "otras_cias": 8, "extrasucio": 6, "cristalizado": 7}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 4, "faltante": 7, "cemento": 4, "otras_cias": 6, "extrasucio": 8, "cristalizado": 9, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-03','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','M330',false,12150,2700,'{"rota": 2, "faltante": 3, "otras_cias": 6, "etiq_asoleada": 9, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-04','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 6, "cemento": 8, "otras_cias": 3, "extrasucio": 10, "hongo": 7, "mezclado": 1, "cuerpo_extra": 4, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-04','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 3, "faltante": 12, "cemento": 9, "otras_cias": 6, "extrasucio": 9, "cristalizado": 6}'::jsonb,'3285619109',null);
select public.sider_ai_importar('2026-07-04','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 4, "cemento": 4, "otras_cias": 5, "extrasucio": 6, "cristalizado": 8, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-05','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 5, "otras_cias": 4, "extrasucio": 17, "hongo": 3, "etiq_asoleada": 7, "mezclado": 2, "cuerpo_extra": 2, "estiba_mala": 1}'::jsonb,'3285619121',null);
select public.sider_ai_importar('2026-07-05','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','M330',false,5400,2700,'{"rota": 1, "faltante": 3, "otras_cias": 3, "hongo": 2, "etiq_asoleada": 8, "mezclado": 4, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,'3285619125',null);
select public.sider_ai_importar('2026-07-05','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 4, "cemento": 3, "otras_cias": 4, "extrasucio": 11, "etiq_asoleada": 8, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,'3285619126',null);
select public.sider_ai_importar('2026-07-05','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','CB320',false,4050,2700,'{"rota": 2, "faltante": 2, "cemento": 3, "mezclado": 6, "cuerpo_extra": 1}'::jsonb,'3307220697',null);
select public.sider_ai_importar('2026-07-06','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F330',true,6750,2700,'{"rota": 4, "faltante": 6, "otras_cias": 5, "extrasucio": 4, "cristalizado": 9, "mezclado": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-07','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 4, "otras_cias": 5, "extrasucio": 7, "cristalizado": 7, "mezclado": 3, "cuerpo_extra": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-07','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',true,65664,4104,'{"rota": 9, "faltante": 14, "otras_cias": 6, "extrasucio": 11, "cristalizado": 6, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-07','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',true,69768,4104,'{"rota": 5, "faltante": 7, "otras_cias": 9, "extrasucio": 6, "cristalizado": 8, "mezclado": 4, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-07','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 4, "otras_cias": 6, "extrasucio": 6, "cristalizado": 7, "mezclado": 2, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-14','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',true,16416,4104,'{"rota": 4, "faltante": 9, "otras_cias": 6, "extrasucio": 7, "cristalizado": 8, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-08','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,16416,4104,'{"rota": 4, "faltante": 8, "otras_cias": 9, "extrasucio": 8, "cristalizado": 6, "cuerpo_extra": 3}'::jsonb,'3307223742',null);
select public.sider_ai_importar('2026-07-08','BAQ','JYM540','T2','socios','logisinu_s_a_s_zomac','M330',false,13500,2700,'{"rota": 2, "faltante": 4, "extrasucio": 4, "hongo": 1, "etiq_asoleada": 9, "mezclado": 5, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-08','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 1, "faltante": 4, "otras_cias": 3, "antiguo": 1, "extrasucio": 9, "etiq_asoleada": 7, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-08','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M1000',false,936,936,'{"rota": 1, "faltante": 3, "mezclado": 4, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',true,77926,4104,'{"rota": 4, "faltante": 8, "cemento": 4, "otras_cias": 8, "extrasucio": 7, "cristalizado": 7, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','TLQ792','T1','socios','comercializadora_central_ltda_','M330',true,29700,2700,'{"rota": 4, "otras_cias": 12, "extrasucio": 5, "cristalizado": 4, "etiq_asoleada": 6, "mezclado": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,8208,4104,'{"rota": 4, "faltante": 6, "otras_cias": 4, "extrasucio": 5, "cristalizado": 8, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 3, "faltante": 10, "otras_cias": 8, "extrasucio": 9, "cristalizado": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',true,51300,4104,'{"rota": 5, "faltante": 7, "otras_cias": 11, "extrasucio": 6, "cristalizado": 6, "mezclado": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-09','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,2700,2700,'{"rota": 2, "otras_cias": 4, "hongo": 5, "etiq_asoleada": 6, "mezclado": 5, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-10','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,2052,2052,'{"rota": 4, "faltante": 12, "otras_cias": 5, "extrasucio": 6, "cristalizado": 5, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-10','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,20520,4104,'{"rota": 2, "faltante": 7, "otras_cias": 7, "extrasucio": 7, "cristalizado": 6, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-10','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','M330',false,41850,2700,'{"rota": 1, "faltante": 6, "otras_cias": 5, "etiq_asoleada": 7, "mezclado": 4, "cuerpo_extra": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-10','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "otras_cias": 3, "extrasucio": 10, "etiq_asoleada": 6, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-10','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 2, "faltante": 4, "otras_cias": 3, "extrasucio": 9, "etiq_asoleada": 6, "cuerpo_extra": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-11','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',true,41040,4104,'{"rota": 4, "faltante": 10, "cemento": 6, "otras_cias": 4, "extrasucio": 7, "cristalizado": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-11','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 4, "faltante": 7, "otras_cias": 7, "extrasucio": 7, "cristalizado": 12, "mezclado": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-11','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,8208,4104,'{"rota": 4, "cemento": 1, "otras_cias": 6, "extrasucio": 7, "cristalizado": 8, "mezclado": 3, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-11','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,20520,4104,'{"rota": 2, "faltante": 8, "cemento": 6, "otras_cias": 4, "extrasucio": 7, "cristalizado": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-13','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','M330',false,43200,2700,'{"rota": 1, "faltante": 2, "otras_cias": 3, "extrasucio": 4, "etiq_asoleada": 9, "mezclado": 6, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-13','BAQ','LKK479','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 3, "faltante": 6, "extrasucio": 17, "cuerpo_extra": 10, "estiba_mala": 1}'::jsonb,'3285619393',null);
select public.sider_ai_importar('2026-07-13','BAQ','JYW549','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 4, "faltante": 1, "cemento": 5, "otras_cias": 3, "extrasucio": 12, "hongo": 7, "mezclado": 1, "cuerpo_extra": 8}'::jsonb,'3285619392',null);
select public.sider_ai_importar('2026-07-14','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','F330',false,6750,2700,'{"faltante": 3, "otras_cias": 4, "extrasucio": 3, "etiq_asoleada": 8, "mezclado": 4, "cuerpo_extra": 3, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-14','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F330',false,4050,2700,'{"rota": 1, "etiq_asoleada": 11, "mezclado": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-14','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 3, "faltante": 4, "otras_cias": 2, "extrasucio": 6, "etiq_asoleada": 10, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-14','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 3, "faltante": 3, "cemento": 2, "otras_cias": 2, "extrasucio": 14, "cristalizado": 7, "mezclado": 1, "cuerpo_extra": 6, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-15','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 1, "faltante": 6, "otras_cias": 5, "extrasucio": 4, "etiq_asoleada": 3, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-15','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,1350,936,'{"faltante": 3, "mezclado": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-15','BAQ','LKK479','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 3, "faltante": 5, "otras_cias": 2, "extrasucio": 7, "etiq_asoleada": 6, "cuerpo_extra": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-15','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 2, "faltante": 3, "otras_cias": 4, "extrasucio": 11, "etiq_asoleada": 10, "cuerpo_extra": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-15','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"faltante": 4, "cemento": 3, "extrasucio": 8, "hongo": 4, "mezclado": 2, "cuerpo_extra": 5, "estiba_mala": 1}'::jsonb,'3307232606',null);
select public.sider_ai_importar('2026-07-15','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,38988,4104,'{"rota": 3, "faltante": 5, "otras_cias": 2, "extrasucio": 7, "etiq_asoleada": 6, "cuerpo_extra": 2}'::jsonb,'3285619475',null);
select public.sider_ai_importar('2026-07-16','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "cemento": 2, "extrasucio": 7, "etiq_asoleada": 5, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-16','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 2, "faltante": 2, "cemento": 3, "extrasucio": 14, "mezclado": 4, "cuerpo_extra": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-16','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,57456,4104,'{"cemento": 2, "extrasucio": 7, "etiq_asoleada": 5, "cuerpo_extra": 1}'::jsonb,'3285619509',null);
select public.sider_ai_importar('2026-07-17','BAQ','TLQ792','T1','socios','comercializadora_central_ltda_','G175',false,73872,4104,'{"rota": 2, "faltante": 11, "otras_cias": 2, "extrasucio": 21, "etiq_asoleada": 4, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-17','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,1404,936,'{"faltante": 2, "extrasucio": 1, "etiq_asoleada": 12, "mezclado": 5, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-17','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M1000',false,936,936,'{"rota": 1, "faltante": 1, "etiq_asoleada": 6, "mezclado": 3, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-17','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 4, "faltante": 5, "cemento": 2, "otras_cias": 2, "extrasucio": 15, "etiq_asoleada": 5, "mezclado": 1, "cuerpo_extra": 8, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-17','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 3, "cemento": 4, "extrasucio": 9, "hongo": 7, "mezclado": 2}'::jsonb,'3285619547',null);
select public.sider_ai_importar('2026-07-17','BAQ','SNO319','T2','socios','cervylicores_distribuciones_sas','G175',false,22572,4104,'{"rota": 3, "faltante": 6, "otras_cias": 3, "extrasucio": 18, "cuerpo_extra": 8, "estiba_mala": 1}'::jsonb,'3285619551',null);
select public.sider_ai_importar('2026-07-17','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 1, "faltante": 2, "cemento": 1, "otras_cias": 2, "extrasucio": 12, "etiq_asoleada": 5, "mezclado": 1}'::jsonb,'3285619548',null);
select public.sider_ai_importar('2026-07-18','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,16416,4104,'{"rota": 2, "faltante": 2, "cemento": 3, "otras_cias": 3, "extrasucio": 6, "etiq_asoleada": 4, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-19','BAQ','LRN900','T3','socios','logisinu_s_a_s_zomac','F330',false,5400,2700,'{"rota": 1, "faltante": 3, "etiq_asoleada": 5, "mezclado": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-21','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,4050,2700,'{"rota": 2, "faltante": 5, "hongo": 4, "mezclado": 2, "cuerpo_extra": 7, "cajas_malas": 1}'::jsonb,'3307238922',null);
select public.sider_ai_importar('2026-07-21','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,5400,2700,'{"rota": 1, "faltante": 3, "cemento": 1, "otras_cias": 2, "etiq_asoleada": 10, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,'3307238921',null);
select public.sider_ai_importar('2026-07-21','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 6, "otras_cias": 9, "extrasucio": 8, "cristalizado": 9, "mezclado": 4, "cuerpo_extra": 1}'::jsonb,'3285619643',null);
select public.sider_ai_importar('2026-07-21','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 3, "faltante": 15, "otras_cias": 6, "extrasucio": 12, "cristalizado": 7}'::jsonb,'3285619642',null);
select public.sider_ai_importar('2026-07-22','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 4, "faltante": 4, "otras_cias": 3, "extrasucio": 14, "cristalizado": 10, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,'3285619678',null);
select public.sider_ai_importar('2026-07-22','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,4050,2700,'{"rota": 3, "faltante": 2, "etiq_asoleada": 8, "mezclado": 4, "cuerpo_extra": 7}'::jsonb,'3307240362',null);
select public.sider_ai_importar('2026-07-22','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,6750,2700,'{"rota": 2, "faltante": 5, "otras_cias": 2, "cristalizado": 6, "mezclado": 4}'::jsonb,'3307240420',null);
select public.sider_ai_importar('2026-07-22','BAQ','TLQ792','T2','socios','comercializadora_central_ltda_','G175',true,73872,4104,'{"rota": 6, "faltante": 12, "otras_cias": 8, "extrasucio": 12, "cristalizado": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-23','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 2, "faltante": 4, "cemento": 2, "otras_cias": 1, "extrasucio": 12, "hongo": 2, "etiq_asoleada": 5, "cuerpo_extra": 6}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-23','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 4, "faltante": 9, "cemento": 4, "otras_cias": 1, "extrasucio": 16, "hongo": 6, "etiq_asoleada": 2, "cuerpo_extra": 8, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-23','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','F330',false,2700,2700,'{"rota": 4, "faltante": 8, "cemento": 1, "otras_cias": 2, "hongo": 3, "etiq_asoleada": 10, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-24','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 5, "faltante": 2, "otras_cias": 3, "extrasucio": 12, "cristalizado": 8, "mezclado": 2, "cuerpo_extra": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-25','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 4, "cemento": 5, "otras_cias": 2, "extrasucio": 17, "cuerpo_extra": 6, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-25','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 3, "faltante": 2, "cemento": 2, "otras_cias": 1, "extrasucio": 9, "etiq_asoleada": 7, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,'3307245708',null);
select public.sider_ai_importar('2026-07-25','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 4, "faltante": 10, "otras_cias": 9, "extrasucio": 12, "cristalizado": 10, "mezclado": 4}'::jsonb,'3285619795',null);
select public.sider_ai_importar('2026-07-28','BAQ','JYM540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 6, "otras_cias": 3, "extrasucio": 6, "etiq_asoleada": 4, "cuerpo_extra": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-29','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','M330',false,28350,2700,'{"rota": 2, "faltante": 4, "otras_cias": 4, "hongo": 2, "mezclado": 3, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-29','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 2, "otras_cias": 1, "extrasucio": 5, "etiq_asoleada": 7}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-31','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 1, "otras_cias": 2, "extrasucio": 4, "etiq_asoleada": 3, "mezclado": 6, "cuerpo_extra": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-07-30','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 2, "otras_cias": 3, "extrasucio": 5, "etiq_asoleada": 6, "cajas_malas": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-01','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','M1000',false,936,936,'{"rota": 1, "faltante": 2, "extrasucio": 3, "mezclado": 4, "cuerpo_extra": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-03','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,13500,2700,'{"rota": 1, "faltante": 5, "otras_cias": 3, "etiq_asoleada": 4, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-03','BAQ','LKN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 4, "faltante": 10, "otras_cias": 9, "extrasucio": 12, "cristalizado": 10, "mezclado": 4}'::jsonb,'3285620068',null);
select public.sider_ai_importar('2026-08-04','BAQ','TLQ792','T1','socios','comercializadora_central_ltda_','M330',false,48600,2700,'{"rota": 2, "faltante": 4, "otras_cias": 2, "hongo": 5, "mezclado": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-04','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','F330',false,9450,2700,'{"rota": 1, "faltante": 2, "otras_cias": 1, "extrasucio": 3, "etiq_asoleada": 11, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-06','BAQ','PQU200','T1','socios','logisinu_s_a_s_zomac','F330',false,8100,2700,'{"faltante": 5, "cemento": 1, "otras_cias": 3, "hongo": 6, "mezclado": 4, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-06','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "faltante": 3, "otras_cias": 4, "extrasucio": 8, "etiq_asoleada": 5, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-06','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 1, "faltante": 4, "cemento": 3, "otras_cias": 3, "extrasucio": 4, "etiq_asoleada": 7, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-06','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','F1000',false,3744,936,'{"rota": 1, "faltante": 2, "extrasucio": 3, "mezclado": 4, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-07','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 2, "otras_cias": 2, "antiguo": 1, "extrasucio": 8, "etiq_asoleada": 5, "cuerpo_extra": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-07','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 2, "faltante": 3, "otras_cias": 4, "extrasucio": 8, "etiq_asoleada": 5, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-07','BAQ','TLQ792','T2','socios','comercializadora_central_ltda_','M330',false,2700,2700,'{"rota": 2, "faltante": 4, "otras_cias": 2, "cristalizado": 5, "mezclado": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,'3307263424',null);
select public.sider_ai_importar('2026-08-08','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','F330',false,13500,2700,'{"rota": 1, "cemento": 1, "otras_cias": 5, "hongo": 2, "etiq_asoleada": 6, "mezclado": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-08','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 1, "faltante": 4, "cemento": 2, "otras_cias": 2, "extrasucio": 7, "etiq_asoleada": 2, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-08','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,4680,936,'{"rota": 1, "faltante": 2, "cemento": 2, "hongo": 1, "etiq_asoleada": 1, "mezclado": 3, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-08','BAQ','PQU900','T1','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"faltante": 3, "otras_cias": 4, "hongo": 5, "mezclado": 5, "cuerpo_extra": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-08','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F330',false,2700,2700,'{"rota": 4, "cemento": 2, "otras_cias": 2, "mezclado": 2, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-10','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "faltante": 4, "cemento": 4, "antiguo": 1, "extrasucio": 20, "estiba_mala": 1}'::jsonb,'3307265166',null);
select public.sider_ai_importar('2026-08-10','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,71820,4104,'{"faltante": 15, "otras_cias": 4, "antiguo": 2}'::jsonb,'3285620254',null);
select public.sider_ai_importar('2026-08-10','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F330',true,5400,2700,'{"rota": 4, "otras_cias": 2, "extrasucio": 2, "cristalizado": 8, "etiq_asoleada": 7, "mezclado": 5}'::jsonb,'3307266068',null);
select public.sider_ai_importar('2026-08-11','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"cemento": 10}'::jsonb,'3285620277',null);
select public.sider_ai_importar('2026-08-11','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"faltante": 8, "cemento": 2, "extrasucio": 25, "cristalizado": 10}'::jsonb,'3285620276',null);
select public.sider_ai_importar('2026-08-11','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 5, "otras_cias": 2, "cristalizado": 4, "cajas_malas": 1}'::jsonb,'3307266239',null);
select public.sider_ai_importar('2026-08-11','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 5, "faltante": 10, "otras_cias": 9, "extrasucio": 9, "cristalizado": 7, "mezclado": 3}'::jsonb,'3285620286',null);
select public.sider_ai_importar('2026-08-11','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 4, "faltante": 8, "otras_cias": 7, "extrasucio": 9, "cristalizado": 6, "mezclado": 3, "cuerpo_extra": 2}'::jsonb,'3285620301',null);
select public.sider_ai_importar('2026-08-12','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',false,20520,4104,'{"rota": 3, "faltante": 4, "otras_cias": 2, "extrasucio": 30, "cuerpo_extra": 2}'::jsonb,'3285620304',null);
select public.sider_ai_importar('2026-08-12','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 1, "faltante": 2, "otras_cias": 3, "hongo": 4, "mezclado": 1, "cuerpo_extra": 5, "estiba_mala": 1}'::jsonb,'3307267852',null);
select public.sider_ai_importar('2026-08-12','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 4, "faltante": 15, "cemento": 4, "otras_cias": 6, "extrasucio": 9, "cristalizado": 8}'::jsonb,'3285620331',null);
select public.sider_ai_importar('2026-08-13','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,3744,936,'{"rota": 3, "faltante": 1, "mezclado": 1, "cuerpo_extra": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-13','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 4, "cemento": 2, "otras_cias": 11, "extrasucio": 8, "cristalizado": 5, "mezclado": 3, "cuerpo_extra": 4}'::jsonb,'3285620351',null);
select public.sider_ai_importar('2026-08-13','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 3, "faltante": 12, "cemento": 3, "otras_cias": 6, "extrasucio": 8, "cristalizado": 8}'::jsonb,'3285620352',null);
select public.sider_ai_importar('2026-08-13','BAQ','NLW768','T3','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 1, "faltante": 5, "otras_cias": 2, "extrasucio": 8, "etiq_asoleada": 6, "cuerpo_extra": 1, "estiba_mala": 1}'::jsonb,'3285620362',null);
select public.sider_ai_importar('2026-08-14','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"faltante": 14, "cristalizado": 3, "cuerpo_extra": 1}'::jsonb,'3307272015',null);
select public.sider_ai_importar('2026-08-14','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 2, "faltante": 4, "otras_cias": 2, "cristalizado": 5, "mezclado": 2, "cajas_malas": 1}'::jsonb,'3307272014',null);
select public.sider_ai_importar('2026-08-14','BAQ','JYM957','T3','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 3, "cemento": 4, "otras_cias": 3, "extrasucio": 7, "etiq_asoleada": 2, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-14','BAQ','JYW540','T3','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 5, "otras_cias": 2, "extrasucio": 4, "etiq_asoleada": 5, "cajas_malas": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-15','BAQ','LTQ792','T1','socios','comercializadora_central_ltda_','G175',false,73872,4104,'{"faltante": 3, "otras_cias": 2, "extrasucio": 16, "cuerpo_extra": 20, "cajas_malas": 1}'::jsonb,'3307272644',null);
select public.sider_ai_importar('2026-08-15','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 2, "faltante": 11, "otras_cias": 2, "cristalizado": 18, "mezclado": 1, "cajas_malas": 1}'::jsonb,'3307272648',null);
select public.sider_ai_importar('2026-08-15','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,4050,2700,'{"rota": 2, "hongo": 3, "mezclado": 2}'::jsonb,'3307272651',null);
select public.sider_ai_importar('2026-08-15','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 3, "faltante": 14, "otras_cias": 7, "extrasucio": 11, "cristalizado": 9, "mezclado": 3, "cuerpo_extra": 2}'::jsonb,'3285620432',null);
select public.sider_ai_importar('2026-08-15','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 1, "faltante": 3, "otras_cias": 3, "extrasucio": 7, "cuerpo_extra": 1, "cajas_malas": 1}'::jsonb,'3285620433',null);
select public.sider_ai_importar('2026-08-18','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','F330',false,6750,2700,'{"rota": 1, "faltante": 4, "antiguo": 1, "hongo": 6, "mezclado": 4, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-18','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','M330',false,6750,2700,'{"faltante": 2, "otras_cias": 6, "extrasucio": 6, "etiq_asoleada": 3, "mezclado": 3, "cuerpo_extra": 1, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-18','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','M330',false,8100,2700,'{"rota": 1, "faltante": 4, "otras_cias": 3, "etiq_asoleada": 8, "mezclado": 3, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-18','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 3, "cemento": 3, "otras_cias": 3, "extrasucio": 7, "etiq_asoleada": 5, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-19','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 3, "faltante": 9, "otras_cias": 7, "antiguo": 6, "extrasucio": 11, "cristalizado": 7}'::jsonb,'3285620520',null);
select public.sider_ai_importar('2026-08-19','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',true,4050,2700,'{"rota": 4, "cemento": 4, "otras_cias": 7, "extrasucio": 7, "cristalizado": 6, "mezclado": 5}'::jsonb,'3307275541',null);
select public.sider_ai_importar('2026-08-19','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',true,2700,2700,'{"rota": 4, "cemento": 3, "otras_cias": 9, "extrasucio": 6, "cristalizado": 8, "etiq_asoleada": 4, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-20','BAQ','PQU200','T1','socios','logisinu_s_a_s_zomac','M330',true,48600,2700,'{"rota": 6, "cemento": 2, "otras_cias": 8, "extrasucio": 7, "cristalizado": 8, "mezclado": 6}'::jsonb,'3285620572',null);
select public.sider_ai_importar('2026-08-20','BAQ','NLW768','T1','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 3, "faltante": 14, "cemento": 2, "otras_cias": 11, "extrasucio": 10, "cristalizado": 7}'::jsonb,'3285620573',null);
select public.sider_ai_importar('2026-08-20','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',true,29700,2700,'{"rota": 4, "cemento": 3, "otras_cias": 9, "extrasucio": 6, "cristalizado": 8, "etiq_asoleada": 4, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-20','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,20520,4104,'{"rota": 4, "faltante": 12, "otras_cias": 8, "extrasucio": 6, "cristalizado": 9, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-20','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"faltante": 3, "cemento": 4, "otras_cias": 4, "extrasucio": 6, "etiq_asoleada": 5, "cajas_malas": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-20','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 3, "cemento": 2, "otras_cias": 1, "extrasucio": 10, "mezclado": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-21','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,18468,4104,'{"rota": 2, "faltante": 4, "otras_cias": 3, "extrasucio": 7, "etiq_asoleada": 7, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-21','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 1, "faltante": 7, "otras_cias": 2, "extrasucio": 7, "etiq_asoleada": 9, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-21','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','M330',false,17550,2700,'{"faltante": 4, "otras_cias": 3, "extrasucio": 4, "etiq_asoleada": 6, "mezclado": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-21','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','F330',false,4050,2700,'{"rota": 2, "faltante": 3, "otras_cias": 4, "hongo": 5, "mezclado": 4, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-21','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 2, "faltante": 4, "extrasucio": 15, "cuerpo_extra": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-22','BAQ','WCO3','T2','socios','los_gavilanes_y_cia_ltda_','M1000',false,1404,936,'{"rota": 1, "faltante": 2, "cemento": 2, "mezclado": 3, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-22','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 3, "faltante": 12, "otras_cias": 4, "extrasucio": 11, "etiq_asoleada": 8, "cajas_malas": 1, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-22','BAQ','JYW540','T3','socios','logisinu_s_a_s_zomac','G175',true,77976,4104,'{"rota": 4, "faltante": 12, "cemento": 4, "otras_cias": 9, "extrasucio": 9, "cristalizado": 8}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-24','BAQ','PQU200','T1','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 1, "faltante": 2, "otras_cias": 3, "extrasucio": 6, "mezclado": 2, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-24','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 2, "faltante": 5, "otras_cias": 2, "extrasucio": 5, "mezclado": 4, "cuerpo_extra": 2, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-24','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',false,18648,4104,'{"rota": 3, "faltante": 6, "otras_cias": 2, "extrasucio": 20, "mezclado": 2, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','JYM957','T1','socios','logisinu_s_a_s_zomac','M330',false,77976,4104,'{"faltante": 6, "cemento": 2, "otras_cias": 3, "antiguo": 5, "extrasucio": 7, "etiq_asoleada": 6, "cuerpo_extra": 1, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 4, "otras_cias": 2, "antiguo": 2, "extrasucio": 5, "etiq_asoleada": 9, "estiba_mala": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','JYW540','T1','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 1, "faltante": 6, "otras_cias": 3, "extrasucio": 11, "etiq_asoleada": 8, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-18','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,9450,2700,'{"rota": 2, "faltante": 1, "otras_cias": 3, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',false,36936,4104,'{"rota": 2, "faltante": 4, "cemento": 1, "extrasucio": 17, "cuerpo_extra": 7}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"rota": 1, "faltante": 5, "otras_cias": 2, "extrasucio": 10, "etiq_asoleada": 4, "mezclado": 1, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-25','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 1, "faltante": 4, "otras_cias": 2, "cristalizado": 10, "mezclado": 2, "cuerpo_extra": 5}'::jsonb,'3285620760',null);
select public.sider_ai_importar('2026-08-26','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M1000',false,936,936,'{"faltante": 3, "extrasucio": 4, "etiq_asoleada": 1, "mezclado": 3, "cajas_malas": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-26','BAQ','JYM958','T2','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"rota": 1, "faltante": 38, "extrasucio": 12}'::jsonb,'3285620803',null);
select public.sider_ai_importar('2026-08-26','BAQ','JYM957','T2','socios','logisinu_s_a_s_zomac','M330',false,2700,2700,'{"rota": 2, "faltante": 2, "otras_cias": 2, "cristalizado": 7}'::jsonb,'3285620809',null);
select public.sider_ai_importar('2026-08-26','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"antiguo": 10, "extrasucio": 13, "cristalizado": 8, "cajas_malas": 2, "estiba_mala": 1}'::jsonb,'3285620810',null);
select public.sider_ai_importar('2026-08-26','BAQ','NLW768','T3','socios','logisinu_s_a_s_zomac','G175',true,73872,4104,'{"rota": 5, "faltante": 14, "otras_cias": 12, "extrasucio": 7, "cristalizado": 8, "mezclado": 4}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-26','BAQ','PQU200','T3','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 5, "faltante": 8, "otras_cias": 7, "extrasucio": 6, "cristalizado": 6, "cuerpo_extra": 3}'::jsonb,'3285620821',null);
select public.sider_ai_importar('2026-08-27','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','F1000',false,1872,936,'{"cemento": 2, "mezclado": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-27','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','F330',false,6750,2700,'{"rota": 2, "faltante": 3, "otras_cias": 2, "cristalizado": 10, "hongo": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-27','BAQ','JYM957','T3','socios','logisinu_s_a_s_zomac','G175',true,61560,4104,'{"rota": 6, "faltante": 14, "otras_cias": 11, "extrasucio": 9, "cristalizado": 10, "mezclado": 5}'::jsonb,'3285620865',null);
select public.sider_ai_importar('2026-08-27','BAQ','JYM958','T3','socios','logisinu_s_a_s_zomac','G175',true,82080,4104,'{"rota": 3, "faltante": 7, "otras_cias": 8, "extrasucio": 7, "cristalizado": 8, "cuerpo_extra": 4}'::jsonb,'3285620866',null);
select public.sider_ai_importar('2026-08-28','BAQ','LRN900','T1','socios','logisinu_s_a_s_zomac','F330',false,8100,2700,'{"rota": 1, "otras_cias": 4, "hongo": 4, "etiq_asoleada": 3, "mezclado": 3, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-28','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',false,20520,4104,'{"rota": 1, "faltante": 3, "cemento": 3, "otras_cias": 2, "extrasucio": 7, "etiq_asoleada": 4, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-28','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,8100,2700,'{"rota": 1, "faltante": 6, "cristalizado": 10, "etiq_asoleada": 5}'::jsonb,'3307290299',null);
select public.sider_ai_importar('2026-08-28','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','M330',false,20250,2700,'{"rota": 2, "otras_cias": 2, "etiq_asoleada": 7, "mezclado": 1, "cuerpo_extra": 5}'::jsonb,'3285620911',null);
select public.sider_ai_importar('2026-08-28','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"faltante": 3, "extrasucio": 25}'::jsonb,'3285620907',null);
select public.sider_ai_importar('2026-08-28','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','M330',false,13500,2700,'{"rota": 1, "faltante": 22, "otras_cias": 4, "extrasucio": 12}'::jsonb,'3307290288',null);
select public.sider_ai_importar('2026-08-28','BAQ','JYW540','T2','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 3, "cemento": 5, "extrasucio": 12, "estiba_mala": 1}'::jsonb,'3285620903',null);
select public.sider_ai_importar('2026-08-29','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','CB320',false,4050,2700,'{"rota": 2, "faltante": 4, "cemento": 3, "extrasucio": 3, "mezclado": 6, "cuerpo_extra": 2, "cajas_malas": 1, "estiba_mala": 1}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-29','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','M330',false,24300,2700,'{"rota": 3, "faltante": 1, "otras_cias": 2, "etiq_asoleada": 15, "mezclado": 1, "cuerpo_extra": 2}'::jsonb,null,null);
select public.sider_ai_importar('2026-08-29','BAQ','PQO200','T2','socios','logisinu_s_a_s_zomac','G175',false,20520,4104,'{"rota": 2, "faltante": 3, "cemento": 1, "otras_cias": 2, "extrasucio": 10, "etiq_asoleada": 15, "cajas_malas": 1}'::jsonb,'3285620940',null);
select public.sider_ai_importar('2026-08-29','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',false,73872,4104,'{"cemento": 5, "extrasucio": 10, "etiq_asoleada": 6, "cajas_malas": 2, "estiba_mala": 1}'::jsonb,'3285620941',null);
select public.sider_ai_importar('2026-08-31','BAQ','JYM958','T1','socios','logisinu_s_a_s_zomac','G175',false,82080,4104,'{"faltante": 10, "extrasucio": 20, "etiq_asoleada": 12}'::jsonb,'3285620958',null);
select public.sider_ai_importar('2026-08-31','BAQ','SBL485','T1','socios','los_gavilanes_y_cia_ltda_','M330',false,6750,2700,'{"rota": 4, "etiq_asoleada": 8, "mezclado": 5}'::jsonb,'3307292310',null);
select public.sider_ai_importar('2026-09-02','BAQ','NLW768','T2','socios','logisinu_s_a_s_zomac','G175',true,55404,4104,'{"rota": 5, "faltante": 13, "otras_cias": 9, "extrasucio": 10, "cristalizado": 8, "mezclado": 6}'::jsonb,'3285621011',null);
select public.sider_ai_importar('2026-09-02','BAQ','SBL485','T2','socios','los_gavilanes_y_cia_ltda_','G175',true,20520,4104,'{"rota": 4, "faltante": 9, "cemento": 2, "otras_cias": 5, "cristalizado": 7, "cuerpo_extra": 3}'::jsonb,'3307296308',null);
select public.sider_ai_importar('2026-09-03','BAQ','LRN900','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 5, "faltante": 14, "otras_cias": 12, "extrasucio": 10, "cristalizado": 9, "cuerpo_extra": 2}'::jsonb,'3285621041',null);
select public.sider_ai_importar('2026-09-03','BAQ','WCO324','T2','socios','los_gavilanes_y_cia_ltda_','G175',true,4104,4104,'{"rota": 4, "otras_cias": 11, "extrasucio": 7, "cristalizado": 8, "mezclado": 4, "cuerpo_extra": 4}'::jsonb,'3307298368',null);
select public.sider_ai_importar('2026-09-03','BAQ','JYW540','T3','socios','logisinu_s_a_s_zomac','G175',false,77976,4104,'{"rota": 2, "faltante": 7, "cemento": 4, "extrasucio": 25, "etiq_asoleada": 5, "cajas_malas": 2}'::jsonb,'3285621040',null);
select public.sider_ai_importar('2026-09-04','BAQ','PQU200','T2','socios','logisinu_s_a_s_zomac','G175',true,36936,4104,'{"rota": 5, "faltante": 9, "otras_cias": 8, "extrasucio": 9, "cristalizado": 8, "mezclado": 1, "cuerpo_extra": 3}'::jsonb,null,null);
select public.sider_ai_importar('2026-09-08','BAQ','WCO324','T1','socios','los_gavilanes_y_cia_ltda_','G175',true,4104,4104,'{"rota": 5, "faltante": 13, "cemento": 2, "otras_cias": 9, "extrasucio": 12, "cristalizado": 7}'::jsonb,null,null);

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.sider_ai_revisiones where origen = 'importado';
  if v_n <> 285 then
    raise exception 'Deberían quedar 285 revisiones importadas y quedaron %.', v_n;
  end if;
  raise notice 'Histórico BAQ listo: 285 revisiones de mayo a agosto de 2026.';
end $$;

commit;

-- ===================================================================
-- LO QUE NO ENTRÓ, Y POR QUÉ
-- ===================================================================
-- fila 12: 2026-05-08 · Logisinu S.A.S Zomac · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 13: 2026-05-12 · Logisinu S.A.S Zomac · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 14: 2026-05-12 · Los Gavilanes Y Cia Ltda. · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 50: 2026-06-03 · Los Gavilanes Y Cia Ltda. · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 66: 2026-06-09 · Logisinú S.A.S Zomac · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 126: 2026-07-06 · Los Gavilanes Y Cia Ltda. · recibidas 20,520 y revisadas 41,104.
--   No se puede revisar más de lo que llegó. El esquema lo rechaza.
--   Al dividir por una muestra inflada el índice sale MÁS BAJO de lo
--   que debería: a ese socio se le cobró de menos.
-- fila 147: 2026-07-10 · Los Gavilanes Y Cia Ltda. · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 194: 2026-07-29 · Logisinú S.A.S Zomac · recibidas 2,430 y revisadas 2,700.
--   No se puede revisar más de lo que llegó. El esquema lo rechaza.
--   Al dividir por una muestra inflada el índice sale MÁS BAJO de lo
--   que debería: a ese socio se le cobró de menos.
-- fila 208: 2026-08-06 · Los Gavilanes Y Cia Ltda. · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
-- fila 254: 2026-08-20 · Los Gavilanes Y Cia Ltda. · misma fecha, placa y envase que una
--   fila anterior. Entró la primera.
