-- =====================================================================
-- PASIVOS · HISTÓRICO DE LA BASE (lo que se guarda al terminar el día)
--
-- «Dentro de la vista de Base debo tener otra hoja con el histórico: cuando suba todo, le doy guardar
--  y pasamos al siguiente paso (el Cuadre SAP).»
--
-- Un renglón por día: el resumen de la base de ese día (por almacén y causal: filas, unidades, cajas,
-- HL y costo), quién lo guardó y cuándo. Volver a guardar el mismo día lo reemplaza. Las filas de la
-- base NO se copian: siguen en pasivos_base; esto es la foto del día para el histórico.
--
-- El Cuadre SAP de AG22 no necesita SQL nuevo: usa cuadre_sap con almacen = 'AG22'.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.pasivos_cierres (
  fecha          date primary key,
  resumen        jsonb not null,
  cerrado_en     timestamptz not null default now(),
  cerrado_por    uuid default auth.uid(),
  cerrado_nombre text
);

alter table public.pasivos_cierres enable row level security;
drop policy if exists pasivos_cierres_ver on public.pasivos_cierres;
create policy pasivos_cierres_ver on public.pasivos_cierres for select
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') <> 'ninguno');
drop policy if exists pasivos_cierres_ins on public.pasivos_cierres;
create policy pasivos_cierres_ins on public.pasivos_cierres for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');
drop policy if exists pasivos_cierres_upd on public.pasivos_cierres;
create policy pasivos_cierres_upd on public.pasivos_cierres for update
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');
drop policy if exists pasivos_cierres_del on public.pasivos_cierres;
create policy pasivos_cierres_del on public.pasivos_cierres for delete
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');

grant select, insert, update, delete on public.pasivos_cierres to authenticated;

commit;
