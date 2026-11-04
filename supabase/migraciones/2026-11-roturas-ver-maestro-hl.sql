-- =====================================================================
-- ROTURAS · EN SITIO: poder LEER el Maestro de Pasivos para calcular los HL
--
-- Los Paretos y el Excel de En sitio miden en HL, unidades y cajas. Los HL salen del
-- «HL por unidad» del Maestro de Pasivos. Hoy ese maestro solo lo lee quien tiene la
-- pantalla de Pasivos o del Cuadre; esto se lo da (solo lectura) a quien tenga el
-- Análisis o el Tablero de En sitio. No cambia ningún dato.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

drop policy if exists pasivos_maestro_ver_roturas on public.pasivos_maestro;
create policy pasivos_maestro_ver_roturas on public.pasivos_maestro for select
  using (public.mi_nivel_pantalla('/roturas/en-sitio/analisis') <> 'ninguno'
      or public.mi_nivel_pantalla('/roturas/en-sitio/tablero') <> 'ninguno');

commit;
