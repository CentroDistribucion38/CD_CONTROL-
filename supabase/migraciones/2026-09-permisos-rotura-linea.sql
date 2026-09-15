-- =====================================================================
-- PERMISOS DE «ROTURA DE LÍNEA»
--
-- Requiere: supabase/02-roles.sql
--           supabase/modulos/rotura-linea.sql
--
-- La pantalla nueva vive en /quiebra/rotura. Sin esta fila NADIE la ve
-- —ni el administrador—, porque el menú se arma con lo que diga
-- rol_permisos y no con lo que exista en el código. Es a propósito: una
-- pantalla que aparece sola el día que alguien la sube es una pantalla
-- que nadie decidió mostrar.
--
-- QUIÉN QUÉ.
--   supervisor  editar — es quien pesa y registra
--   operador    ver    — para consultar el día sin poder escribirlo
-- El administrador no se nombra: su rol manda y ve todo.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================
insert into public.rol_permisos (rol, seccion, nivel) values
  ('supervisor', '/quiebra/rotura',         'editar'),
  ('supervisor', '/quiebra/rotura/tablero', 'ver'),
  ('supervisor', '/quiebra/rotura/maestro', 'editar'),
  ('operador',   '/quiebra/rotura',         'ver'),
  ('operador',   '/quiebra/rotura/tablero', 'ver'),
  ('operador',   '/quiebra/rotura/maestro', 'ver')
on conflict (rol, seccion) do update set nivel = excluded.nivel;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.rol_permisos
   where seccion like '/quiebra/rotura%';
  if v_n < 6 then raise exception 'FALTÓ: los permisos de /quiebra/rotura'; end if;
  raise notice 'Listo: rotura de línea y su maestro visibles para supervisor (editar) y operador (ver).';
end $$;
