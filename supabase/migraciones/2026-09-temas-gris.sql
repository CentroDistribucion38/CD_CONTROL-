-- =====================================================================
-- TRES TEMAS MÁS: negro, gris y halo
-- =====================================================================
-- Se puede correr varias veces sin romper nada.
--
-- El único cambio en la base es la lista de temas permitidos. El color
-- vive en globals.css, no aquí: esta regla existe nada más para que un
-- valor escrito a mano no deje a alguien con la aplicación en un tema
-- que no existe.
-- =====================================================================

alter table public.perfiles
  drop constraint if exists perfiles_tema_valido;
alter table public.perfiles
  add constraint perfiles_tema_valido
  check (tema in ('oficial', 'tinta', 'pizarra', 'ambar',
                  'negro', 'gris', 'halo'));

-- Comprobación: los siete pasan y un inventado no.
do $$
begin
  if not (select 'halo' in ('oficial','tinta','pizarra','ambar','negro','gris','halo')) then
    raise exception 'listo: mal';
  end if;
  raise notice 'listo: los siete temas quedaron permitidos';
end $$;
