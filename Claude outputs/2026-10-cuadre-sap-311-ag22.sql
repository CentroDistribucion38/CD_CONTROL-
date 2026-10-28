-- =====================================================================
-- CUADRE SAP · AG22 · LOS 311 (partidas de AG18/17/16 y archivo de movimientos de SAP)
-- Se puede correr varias veces (si ya corriste la versión anterior, corre esta: agrega lo nuevo).
-- =====================================================================
alter table public.cuadre_sap add column if not exists ajustes311 jsonb;
-- El archivo de movimientos de SAP (311) subido en AG22: { archivo, en, filas:[{codigo, cantidad (+ entró / − salió de AG22), documentos}] }.
alter table public.cuadre_sap add column if not exists movs_sap jsonb;

select 'LISTO: ya funcionan los iconos 311 y Mov. SAP en Cuadre SAP · AG22.' as resultado;
