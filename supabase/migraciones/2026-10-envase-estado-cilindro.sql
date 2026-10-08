-- =====================================================================
-- INVENTARIO · ESTADO DEL CILINDRO: LLENO y VACÍO
--
-- «Anoto el cilindro 3500024, VACÍO, 1 estiba, y no me deja.»
-- Salía «No se puede borrar: hay cosas que apuntan a esto». No era un
-- borrado: al anotar, la pantalla manda el estado «VACÍO» (o «LLENO») y
-- el renglón apunta a `envase_estados`, donde esas dos claves NUNCA
-- se habían creado — solo estaban RETORNO, LAVADO, NUEVO, BAJA,
-- EXTRASUCIO, OTROS y MAL ESTADO. Postgres rechazaba el INSERT por la
-- llave foránea `conteo_lineas_estado_envase_fkey`.
--
-- Esto crea las dos claves. No toca nada de lo ya contado.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
insert into public.envase_estados (clave, orden, activo) values
  ('LLENO', 8, true), ('VACÍO', 9, true)
on conflict (clave) do update set activo = true;

select clave, orden, activo from public.envase_estados order by orden;
