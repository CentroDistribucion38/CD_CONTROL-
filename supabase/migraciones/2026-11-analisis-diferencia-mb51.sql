-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA · LOS 311 DE LA MB51 (hoja «311 MB51» de la plantilla)
--
-- Lo que sale de la MB51 (solo los movimientos 311) se sube con la plantilla del día y se cruza con la ZEXI
-- en el bloque «Partidas de los 311». Mismo permiso que la pantalla del análisis. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.analisis_dif_mb51 (
  id        bigint generated always as identity primary key,
  fecha     date    not null,
  almacen   text    not null,
  codigo    text    not null,
  cantidad  numeric not null,          -- + entra al almacén · − sale de él
  documento text,
  hora      text,
  archivo   text,
  subido_en timestamptz not null default now()
);
create index if not exists analisis_dif_mb51_fecha on public.analisis_dif_mb51 (fecha);

alter table public.analisis_dif_mb51 enable row level security;
drop policy if exists analisis_dif_mb51_ver on public.analisis_dif_mb51;
create policy analisis_dif_mb51_ver on public.analisis_dif_mb51 for select
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') <> 'ninguno');
drop policy if exists analisis_dif_mb51_ins on public.analisis_dif_mb51;
create policy analisis_dif_mb51_ins on public.analisis_dif_mb51 for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_mb51_del on public.analisis_dif_mb51;
create policy analisis_dif_mb51_del on public.analisis_dif_mb51 for delete
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
grant select, insert, delete on public.analisis_dif_mb51 to authenticated;

commit;

select 'LISTO: ya se puede subir la hoja «311 MB51» en la plantilla del Análisis de diferencia.' as resultado;
