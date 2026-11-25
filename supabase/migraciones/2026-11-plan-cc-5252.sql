-- «CC» en TREN-5 es el 5252 Club Col Lta 330X6 N (sus 1083 HL cuadran con el «Pendiente por envasar específico»), no el 16466 Austen.
update public.pe_plan_filas set sku = '5252', nombre = 'Club Col Lta 330X6 N'
 where tren = 'TREN-5' and etiqueta = 'CC' and sku = '16466';
