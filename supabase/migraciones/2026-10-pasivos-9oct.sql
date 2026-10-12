/* =====================================================================
   PASIVOS · EL 9 DE OCTUBRE TAL CUAL ESTÁ EN BLOQUEADOS.xlsx (hoja DATA)
   ---------------------------------------------------------------------
   «Vale como yo lo tengo en mi balance.» Las 52 filas del 9 de octubre
   de tu Excel, con sus unidades exactas, marcadas como HISTÓRICO.
   Ese día ya no se trae del balance ni se sube del archivo (para no duplicar).
   Correr DESPUÉS de 2026-10-pasivos.sql. Se puede correr varias veces.
   ===================================================================== */
begin;
delete from public.pasivos_base where fecha = '2026-10-09' and origen = 'historico';
insert into public.pasivos_base (fecha, estado, causal, codigo, unidades, almacen, origen, archivo) 
select f::date, e, c, cod, u::numeric, a, 'historico', 'BLOQUEADOS.xlsx' from (values
  ('2026-10-09', 'BAJA', 'SORTING', '3500005', 61560, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3500162', 85050, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3500213', 0, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3500446', 6750, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3500887', 7488, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3500888', 0, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3501225', -1710, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3501226', 1710, 'AG18'),
  ('2026-10-09', 'BAJA', 'SORTING', '3501430', 86910, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500005', 86184, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500162', 43200, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500213', 41850, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500373', 1152, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500446', 16200, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500887', 19188, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500888', 28548, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501225', 44460, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501226', 35910, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501430', 5400, 'AG18'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501539', 6084, 'AG18'),
  ('2026-10-09', 'BAJA', 'ANDINA', '3500162', 14400, 'AG18'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3500005', 73036, 'AG22'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3500162', 67500, 'AG22'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3500213', 4290, 'AG22'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3500383', 0, 'AG22'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3500446', 0, 'AG22'),
  ('2026-10-09', 'BAJA', 'PRESORTING', '3501430', 17550, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500005', 422712, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500213', 40500, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500446', 140400, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500887', 16704, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3500888', 27328, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501225', 136800, 'AG22'),
  ('2026-10-09', 'LAVADO', 'LAVADO', '3501430', 16200, 'AG22'),
  ('2026-10-09', 'LAVADO', 'EXTRASUCIO', '3500887', 2808, 'AG22'),
  ('2026-10-09', 'LAVADO', 'EXTRASUCIO', '3501225', 15390, 'AG22'),
  ('2026-10-09', 'LAVADO', 'EXTRASUCIO', '3501226', 1710, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3500005', 38592, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3500162', 29575, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3501430', 1520, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3500162', 6203, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3501430', 7795, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3501226', 6954, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3501225', 5189, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3500887', 771, 'AG22'),
  ('2026-10-09', 'BAJA', 'ROTURA DE LINEA', '3500888', 4326, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3500005', 0, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3500162', 0, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3501226', -8664, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3501225', -3952, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3501430', 0, 'AG22'),
  ('2026-10-09', 'LAVADO', 'BAJA PROYECTADA', '3500888', -19812, 'AG22')
) as t(f, e, c, cod, u, a);
commit;

-- Para confirmar: debe dar 52 filas y el total por bloque igual al Excel.
select estado, causal, almacen, count(*) filas, sum(unidades) unidades
  from public.pasivos_base where fecha = '2026-10-09' group by 1, 2, 3 order by 3, 1, 2;
