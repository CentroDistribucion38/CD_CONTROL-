-- =====================================================================
-- INVENTARIO · LA CALLE P LLEGA HASTA 49
-- ---------------------------------------------------------------------
-- «En el registro filtro por 49, que es hasta donde llega, y solo está
-- hasta 45.»  No era un filtro que cortara: en el maestro no existen las
-- posiciones 46 a 49, y lo que no está sembrado no puede salir en
-- ninguna lista (las listas salen de la tabla `ubicaciones`).
--
-- Se agregan P_46 a P_49, los dos lados, con la familia y la capacidad
-- de P_45. SI LA CAPACIDAD DE ALGUNA ES OTRA, cámbiala abajo antes de
-- correrlo: de esa cifra sale el aviso de «sobre capacidad».
-- Se puede correr dos veces: si ya existen, solo se actualizan.
-- =====================================================================
begin;

insert into public.ubicaciones (bodega_id, clave, calle, modulo, lado, familia, capacidad)
select b.id, v.clave, v.calle, v.modulo, v.lado, v.familia, v.capacidad
from public.bodegas b
cross join (values
    ('P_46_DER', 'P', '46', 'DER', 'RB/CAJAS/ESTIBAS', 68),
    ('P_46_IZQ', 'P', '46', 'IZQ', 'RB/CAJAS/ESTIBAS', 68),
    ('P_47_DER', 'P', '47', 'DER', 'RB/CAJAS/ESTIBAS', 68),
    ('P_47_IZQ', 'P', '47', 'IZQ', 'RB/CAJAS/ESTIBAS', 68),
    ('P_48_DER', 'P', '48', 'DER', 'RB/CAJAS/ESTIBAS', 68),
    ('P_48_IZQ', 'P', '48', 'IZQ', 'RB/CAJAS/ESTIBAS', 68),
    ('P_49_DER', 'P', '49', 'DER', 'RB/CAJAS/ESTIBAS', 68),
    ('P_49_IZQ', 'P', '49', 'IZQ', 'RB/CAJAS/ESTIBAS', 68)
) as v(clave, calle, modulo, lado, familia, capacidad)
where b.codigo = 'CD38'
on conflict (bodega_id, clave) do update set
  calle = excluded.calle, modulo = excluded.modulo, lado = excluded.lado,
  familia = excluded.familia, capacidad = excluded.capacidad, activa = true;

do $$
declare n int;
begin
  select count(*) into n from public.ubicaciones where calle = 'P' and activa;
  raise notice 'LISTO: la calle P tiene % posiciones activas (con las nuevas deben ser 8 más).', n;
end $$;
commit;
