-- =====================================================================
-- CASCO DE VIDRIO — EL DÍA DE HOY (8-oct-2026) TAL COMO ESTÁ EN LA HOJA «CASCO»
-- ---------------------------------------------------------------------
-- Carga las CUATRO tablas de la hoja CASCO con lo que tienen hoy:
--   · el inventario y la baja POR SEPARADO, con la cuenta tal cual
--     (24+15-36…) para poder seguir sumando encima;
--   · la columna UBICACIONES (P19, P16/20…) y CALIDAD de la Bodega 38;
--   · CARNAVAL PALMAR, que la hoja PARTIR nunca trajo y por eso salía vacío.
--
-- El HL es el de tu hoja (coincide con PARTIR del 8-oct en los tres sitios
-- que PARTIR sí tiene). Reemplaza los renglones «importados» de ese día:
-- ahora son registros de verdad, con inventario y baja separados.
--
-- CORRER DESPUÉS de 2026-10-casco-de-vidrio.sql, 2026-10-casco-puesto-calidad.sql
-- y 2026-10-casco-historial-partir.sql. Son TRES instrucciones independientes
-- (el editor de Supabase no conserva nada entre una y otra). Se puede
-- correr dos veces.
-- =====================================================================

-- 1. LA CARGA (si un material ya estaba ese día, se actualiza).
insert into public.casco_registros as r
  (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad)
select '2026-10-08'::date, v.ubicacion, v.sku, v.inventario, v.inv_expr,
       case when u.baja_rotulo is not null then v.baja end,
       case when u.baja_rotulo is not null then v.baja_expr end,
       v.hl, public.casco_hl_estiba(v.sku), 'registro', v.puesto, v.calidad
  from (values
    ('BODEGA 38','3500005',48::numeric,'24+15-36+21+32+3+20-36+32+61+26-5-20-36-36-36-29+77-36+28+5-8-36+10+9+21-36-36-36-36+71+3+9+2+33+5-1',0::numeric,'99-5+8-10-21-71',172.368::numeric,'P13/16/17 - SORTING','105 PICO ABAJO + 22 CAJAS'),
    ('BODEGA 38','EXPORTACION',0::numeric,null,0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3500162',26::numeric,'3+45-8-13+22-36+36+32-36+57+17-36-36+6+27+51+38-36-36-36-36+79-36-36-7-36-30-6+37+10+7+1+1+32+36+6+35-36-36-20',0::numeric,null,115.83::numeric,'P16/20',null),
    ('BODEGA 38','3500213',3::numeric,'7-7+1-1-7+1+6+1+1+1',0::numeric,null,13.365::numeric,'P19',null),
    ('BODEGA 38','3500446',17::numeric,'8-2-3+10+4-1+3+2+1+2+10+4-36-2+1-1+10+7',0::numeric,null,75.735::numeric,'P18',null),
    ('BODEGA 38','3500887',0::numeric,'1-1+1-1+1+1-1-1',80::numeric,'116+8+2+2-12-17-15+12-10+10-16',374.4::numeric,'P30',null),
    ('BODEGA 38','3500888',0::numeric,'3-3+7+3+4-5+2-2+7+1-13+4+3+1+36-36-12',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3501226',1::numeric,'6-3+3+3-3+5+32-5-1-6+15+7-36+10+4+4+10-36-7-9+7-15-2+13+4+6+6-6+7-13-16+10+6+1',0::numeric,null,3.375::numeric,'P22',null),
    ('BODEGA 38','ANDINA',0::numeric,'10-10+1-1',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3501430',8::numeric,'18-18+4+18-8+3-8+12+4+18+9+14-36-15+24+6+14-36-23-6-1+7+2-1+28+5+10-36',0::numeric,null,34.56::numeric,'P19',null),
    ('BODEGA 38','421887',0::numeric,'9+5-14',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3500207',0::numeric,'2-2',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3500383',1::numeric,'1+9-8-1+1-2+1',0::numeric,null,4.32::numeric,'P17',null),
    ('BODEGA 38','3500472',0::numeric,'2-2',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3503016',0::numeric,'24+8-24-8',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','OTROS',0::numeric,'4-4',0::numeric,null,0::numeric,null,null),
    ('BODEGA 38','3501225',4::numeric,'16+15+4+42-6+5-36-36+6-2+4+4-10-4-20+13+5+1-1+2+9-5+1+6+2-11',34::numeric,'52+1-2-9-1-12+5',128.25::numeric,'P19',null),
    ('BODEGA 38','3501539',0::numeric,null,0::numeric,null,0::numeric,null,null),
    ('FABRICA','3500005',0::numeric,'32-8+88-36-36-36+68+78+38-36-36-36-36-36-8+25-25+36-36+74+32+81+16+5-36-36-36-36-36-28+1+49-36+43-36-21+55-3-72+66+10+54-36+33-108+1',0::numeric,null,0::numeric,null,null),
    ('FABRICA','3500162',0::numeric,'73+36-36-36+53-36-36+18-36+77+97+1-36-36+97-144-36-8-12+24-16-18+58-15-33+67-31-36-31+96+6-36-35+85-72-13',0::numeric,null,0::numeric,null,null),
    ('FABRICA','3500213',1::numeric,'0+1',0::numeric,null,4.455::numeric,null,null),
    ('FABRICA','3500446',23::numeric,'5+10+10-25+6+5+4-15+8+3-3+17-5-5+9-1',0::numeric,null,102.465::numeric,null,null),
    ('FABRICA','3500887',29::numeric,'5-4+8+17+3+5-1+1-34+13+1+11+4',132::numeric,'28-9+19-5+22+4+2+4+15+37-12-5-16+3+16+2-3+17-13+6-1+16-3+8',753.48::numeric,null,null),
    ('FABRICA','3500888',36::numeric,'24+3+20+19-36+17+15+21+24+40-9-3-36-36+8-18+4-36+21+28+92-69-36+6+4-2+33+12+12-9-36-36-36+20-20-5+1+16+16+11-8',96::numeric,'28+18-4+26-54+47-1+69-6-16+7-13+50-12-1+27-43+5-36-36+77-36',617.76::numeric,null,null),
    ('FABRICA','ANDINA',13::numeric,null,0::numeric,null,57.915::numeric,null,null),
    ('FABRICA','3501430',0::numeric,'7+37-36+37+56+26-36-28-36+5-11+15-36+41+29+45+16-36-36-36+3-23+2+2+24+55-36+17-36-30+14-15',0::numeric,null,0::numeric,null,null),
    ('FABRICA','HEINEKEN',4::numeric,null,0::numeric,null,14.364::numeric,null,null),
    ('FABRICA','3501226',27::numeric,'5+17-18+33+15+1+7-4+16-5+5+8+2+14-36-36-24+7+3+20+25+3+1+4+7+3+5+26+5-36-36-36+26+2+17-36-4+23+19+14+4-36-30+9-7+8+20+6+6-1-36+22',0::numeric,null,115.425::numeric,null,null),
    ('FABRICA','3501225',32::numeric,'22+7+14+2-36+10+3+4-6-13+17+8+5+14+17-36',0::numeric,null,136.8::numeric,null,null),
    ('FABRICA','3501539',0::numeric,null,10::numeric,null,39.78::numeric,null,null),
    ('CARNAVAL','3500207',0::numeric,'2-2',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3500213',0::numeric,null,0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3500162',0::numeric,'2+15+33+31+36+31-88-60+36+35-71+36-36+108+13+20-86-55',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3500005',165::numeric,'6+15+36+36+36+36-48-86+36+244-86-86-15-86+36+36+36+36-86-50-38+36+36+36+36-86+36+8-50+25-30-30+36-55+180+28+36+36-86-82-86+29+36-86+36-47+36+36+21-86+36+36+36+36+72-86-86-30+36+108',0::numeric,null,592.515::numeric,null,null),
    ('CARNAVAL','3500373',0::numeric,'1-1',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3500383',2::numeric,null,0::numeric,null,0.54::numeric,null,null),
    ('CARNAVAL','3500888',8::numeric,'6-6+5+36+36+36+22-116-19+13+36-49+84+36-116+36-20-14+36-38+2-2-4+12-12+36+36+36+20+36+36-116+36-84-36+8-2+2',0::numeric,null,37.44::numeric,null,null),
    ('CARNAVAL','3500446',0::numeric,'36+2-36-2+3+5+5-13+1-1',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3501226',67::numeric,'36+30-6-56+36+7+9+15+2-5-66+32-2-32+36-34+36+13+16',0::numeric,null,226.125::numeric,null,null),
    ('CARNAVAL','3500887',1::numeric,'1+8-9+36+36+14-86+33-32+34-34+1-2+1',0::numeric,null,4.68::numeric,null,null),
    ('CARNAVAL','3501430',0::numeric,'36-34+36+36+36+23+36+23-86-106+6+1-7+36+36+30-36-38-28+15+36-51',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3501225',75::numeric,'16+23+36',0::numeric,null,253.125::numeric,null,null),
    ('CARNAVAL','ANDINA',0::numeric,'10-10+9-9',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3503016',0::numeric,'24+8-32',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','3500472',0::numeric,'2-2',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL','421887',2::numeric,'13-11',0::numeric,null,5.67::numeric,null,null),
    ('CARNAVAL PALMAR','3500162',4::numeric,'36-10+10+40+40+40+40-94+40-116+40+40+40+40+40+40+40-116-116-9+40+40-96+9+40-98+40+40+40-116+40+40+40+40-32+40+32+40-116-112+40-56+40+40+40-116+40-44+40+40+40-116',0::numeric,null,17.82::numeric,null,null),
    ('CARNAVAL PALMAR','421887',0::numeric,'40-40+40-40',0::numeric,null,0::numeric,null,null),
    ('CARNAVAL PALMAR','3500213',2::numeric,'36+36-71+40+40+40-107+40+40-86+40-12+40-60-16+40+40-78',0::numeric,null,8.91::numeric,null,null)
  ) as v(ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, puesto, calidad)
  join public.casco_ubicaciones u on u.clave = v.ubicacion
on conflict (fecha, ubicacion, sku) do update set
  inventario = excluded.inventario, inv_expr = excluded.inv_expr,
  baja = excluded.baja, baja_expr = excluded.baja_expr,
  hl = excluded.hl, hl_estiba = excluded.hl_estiba,
  puesto = excluded.puesto, calidad = excluded.calidad,
  origen = 'registro', actualizado_en = now();

-- 2. LO QUE QUEDÓ «IMPORTADO» DE ESE DÍA Y NO ESTÁ EN LA HOJA CASCO (otro
--    nombre del mismo material en PARTIR) se quita, para que no cuente doble.
delete from public.casco_registros
 where fecha = '2026-10-08' and origen = 'importado';

-- 3. REVISIÓN: el HL de cada sitio el 8-oct. Deben salir
--    922,203 · 1.842,444 · 1.120,095 · 26,730  (Bodega 38 · Fábrica · Carnaval · Palmar).
select ubicacion, count(*) as materiales, round(sum(hl), 3) as hl
  from public.casco_registros where fecha = '2026-10-08'
 group by ubicacion order by ubicacion;
