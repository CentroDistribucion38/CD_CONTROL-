-- CARNAVAL · los 3 pallets de Peldar que siguen "sin entrada" (remisiones 89615067, 89615071, 89614028)
-- Corre cada bloque POR SEPARADO (el editor solo muestra el resultado de lo último que corres).

-- ============ 1) DIAGNÓSTICO (solo lee) ============
-- Mira cómo están guardados hoy esos 3 ingresos. Mándame lo que salga.
select id, fecha, codigo, remision, placa, clave, pallets,
       ingreso, entrada_mercancia, em_leida, anulado,
       jsonb_array_length(coalesce(historial, '[]'::jsonb)) as cambios
from public.carnaval_movimientos
where tipo = 'INGRESO'
  and remision in ('89615067', '89615071', '89614028')
order by remision, anulado;

-- ============ 2) ARREGLO DIRECTO (escribe) ============
-- Pone la fecha de INGRESO y la Entrada de Mercancía que trae tu archivo nuevo
-- (03/11/2026 · 5020205545 / 5020205546 / 5020205547).
-- Solo toca esos 3 ingresos vigentes; no cambia pallets ni fechas de recibo.
update public.carnaval_movimientos
   set ingreso = date '2026-11-03',
       entrada_mercancia = case remision
         when '89615067' then '5020205545'   -- 3500005 · SRN750
         when '89615071' then '5020205546'   -- 3501430 · WZI415
         when '89614028' then '5020205547'   -- 3500005 · SQX891
       end,
       em_leida = true
 where tipo = 'INGRESO' and anulado = false
   and remision in ('89615067', '89615071', '89614028');
-- Debe decir: UPDATE 3

-- Verificación: ya no deben salir como pendientes
select codigo, sum(pallets) as pallets_sin_entrada
from public.carnaval_movimientos
where tipo = 'INGRESO' and anulado = false and em_leida = true
  and (entrada_mercancia is null or ingreso is null)
group by codigo;
