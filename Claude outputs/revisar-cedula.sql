-- =====================================================================
-- ¿POR QUÉ NO SALE LA CÉDULA EN FACTURACIÓN?
--
-- Esto NO CAMBIA NADA. Solo mira y contesta.
-- Pégalo en el SQL Editor de Supabase y dale Run.
-- =====================================================================

-- 1. ¿ESTÁ CORRIDO EL SQL 8?
select
  case when to_regclass('public.v_salidas_por_despachar') is null
       then 'NO — falta correr 2026-09-vidrio-cedula-facturacion.sql (el SQL 8). Sin eso no hay cédulas.'
       else 'sí' end                                    as "1. el SQL 8",
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'traspaso_confirmar_salida'
                       and p.pronargs = 4)
       then 'sí' else 'NO — confirmar salida todavía recibe 2 argumentos: la pantalla no puede mandar la cédula.' end
                                                        as "2. la función de 4 argumentos";

-- 2. TUS SALIDAS DE VIDRIO, Y EN QUÉ ESTADO ESTÁ CADA UNA
--    OJO: solo las CERRADAS salen en el desplegable. Una salida que se
--    está pesando todavía no es una cédula.
select
  s.codigo                                    as cedula,
  s.placa,
  s.estado,
  (select count(*) from public.roturas_salida_tolvas t where t.salida_id = s.id) as tolvas_pesadas,
  case when s.supervisora_en is null then '← FALTA CERRARLA: quien pesó tiene que firmar'
       when s.despachada_en is not null then 'ya se despachó'
       else 'LISTA, debería salir en el desplegable' end as diagnostico,
  s.creada_en
from public.roturas_salidas s
where s.creada_en > now() - interval '7 days'
order by s.creada_en desc
limit 20;

-- 3. TUS VIAJES POR FACTURAR, Y SI SU PLACA TIENE VIDRIO ESPERANDO
--    La placa tiene que ser LA MISMA. Se compara sin espacios ni guiones.
select
  v.codigo                                    as viaje,
  v.placa                                     as placa_del_viaje,
  v.fecha, v.turno,
  coalesce((
    select string_agg(s.codigo || ' (' || s.estado || ')', ', ')
      from public.roturas_salidas s
     where upper(regexp_replace(coalesce(s.placa, ''), '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g'))
       and s.despachada_en is null
  ), '— ninguna —')                           as vidrio_de_esa_placa
from public.traspasos_viajes v
where v.estado = 'registrado' and not v.vacio and v.salida_en is null
  and v.fecha > current_date - 3
order by v.fecha desc, v.hora desc
limit 20;
