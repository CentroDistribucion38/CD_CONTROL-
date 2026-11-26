-- =====================================================================
-- REGLA DE FÁBRICA · BAJA EN TODA LA FÁBRICA (26 nov 2026)
--
-- Antes 3500888, 3500887, 3500383 y 3500373 pasaban a BAJA solo en PATIO 1, PATIO 2, SORTING L2, L4 y L6:
-- un conteo en otro módulo de fábrica quedaba en LAVADO. Ahora pasan a BAJA en CUALQUIER ubicación de
-- fábrica (calle FABRICA o clave FABRICA_…), igual que el 3501539. Las filas por ubicación quedan, no estorban.
--
-- Se puede correr varias veces.
-- =====================================================================
insert into public.conteo_reglas_estado (sku, ubicacion, estado, nota)
values ('3500888', null, 'BAJA', 'En fábrica es baja'),
       ('3500887', null, 'BAJA', 'En fábrica es baja'),
       ('3500383', null, 'BAJA', 'En fábrica es baja'),
       ('3500373', null, 'BAJA', 'En fábrica es baja')
on conflict (sku, ubicacion) do update set estado = 'BAJA', activa = true, nota = excluded.nota
returning sku, coalesce(ubicacion, 'toda la fábrica') as ubicacion, estado;
