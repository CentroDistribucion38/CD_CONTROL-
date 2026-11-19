-- =====================================================================
-- CASCO DE VIDRIO · CONTROL SE ENTERA EN EL MOMENTO EN QUE CAMBIA
--
-- «No es que cada 20 s: solo cuando detecte el cambio» (y sin consumo de
-- más). La base AVISA a las pantallas de Control abiertas cuando cambia
-- una fila de casco_registros (un traspaso que ejecutó facturación, una
-- baja, un movimiento, otro equipo que guardó). Sin cambios no se pide
-- nada: no hay consultas cada tantos segundos.
--
-- Cada pantalla solo recibe las filas que su rol puede ver (el permiso de
-- siempre de casco_registros). Se puede correr varias veces.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'casco_registros') then
    alter publication supabase_realtime add table public.casco_registros;
  end if;
  raise notice '----------------------------------------------------------';
  raise notice 'Control de casco avisa en tiempo real ... ok';
  raise notice '----------------------------------------------------------';
end $$;
