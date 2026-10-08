-- =====================================================================
-- INVENTARIO · NUEVO ESTADO DEL ENVASE «MAL ESTADO» (junto a «OTROS»)
--
-- «En el conteo, en otro estado hay que poner en mal estado.» … «Deja los dos.»
--
-- Los estados del envase quedan: Retorno, Lavado, Nuevo, Baja, Extrasucio,
-- Otros y Mal estado. El estado de cada renglón apunta a `envase_estados`,
-- así que la clave nueva tiene que estar aquí para poder guardarse.
--
-- NO se toca lo ya contado ni «OTROS»: se queda activo, tal cual.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

insert into public.envase_estados (clave, orden, activo) values
  ('OTROS', 6, true), ('MAL ESTADO', 7, true)
on conflict (clave) do update set activo = true, orden = excluded.orden;

do $$
begin
  raise notice 'LISTO · el estado del envase ofrece OTROS y MAL ESTADO.';
end $$;

commit;
