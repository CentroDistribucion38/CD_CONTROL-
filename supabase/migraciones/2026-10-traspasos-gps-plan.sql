-- =====================================================================
-- TIEMPOS GPS × PLAN: cada zona se liga a un PUNTO de Traspasos
--
-- Así el GPS sabe que la zona «Bodega 38» es el punto «Bodega 38» de los
-- viajes y puede decir, viaje por viaje, cuándo salió del origen y cuándo
-- llegó al destino. Va DESPUÉS de 2026-10-traspasos-gps.sql.
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================
begin;

do $bloque$
begin
  if to_regclass('public.gps_zonas') is null then
    raise exception 'Falta correr antes: 2026-10-traspasos-gps.sql';
  end if;
end $bloque$;

alter table public.gps_zonas
  add column if not exists punto text references public.traspasos_puntos(clave) on delete set null;

commit;
