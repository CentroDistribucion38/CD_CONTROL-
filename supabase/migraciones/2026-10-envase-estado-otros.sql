-- =====================================================================
-- INVENTARIO · ESTADO DEL ENVASE «OTROS»
--
-- «En lo de lavado, retorno y así, pon otros también.» Una sola opción
-- nueva en la lista de estados del envase (Retorno, Lavado, Nuevo, Baja,
-- Extrasucio): OTROS, para lo que no es ninguno de los cinco. El estado
-- del renglón apunta a `envase_estados`, así que la clave tiene que estar
-- aquí para poderse guardar.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;
insert into public.envase_estados (clave, orden, activo) values ('OTROS', 6, true)
on conflict (clave) do update set activo = true;
commit;
-- LISTO · el estado del envase ofrece OTROS
