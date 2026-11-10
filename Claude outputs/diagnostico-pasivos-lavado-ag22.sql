-- DIAGNÓSTICO · «bajé el LAVADO en AG22 y el Pasivo subió»
-- Solo LEE (no cambia nada). Corre cada bloque por separado en el SQL Editor y pásame lo que salga.

-- 1) Qué corregiste en La base (antes → después, en cajas/estibas/saldo)
select en, codigo, antes, despues
from public.conteo_lineas_correcciones
order by en desc
limit 20;

-- 2) Lo que hay HOY en la Base de pasivos para LAVADO · AG22, por día y por origen
--    (cambia el rango de fechas si hace falta)
select fecha, origen, estado, causal, codigo,
       sum(unidades) as unidades, count(*) as filas,
       min(creado_en) as primera_carga, max(creado_en) as ultima_carga
from public.pasivos_base
where almacen = 'AG22' and estado = 'LAVADO' and fecha >= current_date - 7
group by fecha, origen, estado, causal, codigo
order by fecha desc, codigo, origen;

-- 3) ¿Hay el MISMO material duplicado en un día (por ejemplo una fila 'balance' y otra 'archivo' o 'manual')?
select fecha, codigo, almacen, estado,
       count(*) as filas, array_agg(distinct origen) as origenes, sum(unidades) as unidades
from public.pasivos_base
where fecha >= current_date - 7 and estado = 'LAVADO'
group by fecha, codigo, almacen, estado
having count(*) > 1
order by fecha desc, codigo;
