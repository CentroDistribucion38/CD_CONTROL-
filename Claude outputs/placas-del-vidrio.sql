-- Solo lee. Dime qué sale.
select
  s.codigo                          as cedula,
  s.placa                           as "placa del vidrio",
  s.estado,
  case when s.supervisora_en is null then 'sin cerrar'
       when s.despachada_en is not null then 'ya se despachó'
       else 'LISTA para despachar' end as estado_real,
  (select count(*) from public.roturas_salida_tolvas t where t.salida_id = s.id) as tolvas,
  to_char(s.creada_en at time zone 'America/Bogota', 'DD/MM HH24:MI') as creada
from public.roturas_salidas s
where s.despachada_en is null and s.estado <> 'anulada'
order by s.creada_en desc;
