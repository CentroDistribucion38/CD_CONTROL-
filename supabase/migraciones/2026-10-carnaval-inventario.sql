-- =====================================================================
-- CARNAVAL AG07 · INVENTARIO DIARIO (la hoja «EXISTENCIAS DIARIAS»)
--
-- Un renglón por día con toda la hoja (envase, caja plástica, pallet, estibas de madera, casco de vidrio,
-- pendiente de baja, lavado, caja mala…) y el resultado de la validación de PALLET contra la app.
-- Volver a cargar un día lo reemplaza. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.carnaval_existencias (
  fecha           date primary key,
  secciones       jsonb not null,                    -- [{titulo, colA, colB, filas:[{concepto, a, b}]}]
  validacion      jsonb not null default '[]'::jsonb, -- [{codigo, nombreHoja, hoja, app, dif, decision}]
  foto_nombre     text,
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now()
);

alter table public.carnaval_existencias enable row level security;
drop policy if exists carnaval_exis_ver on public.carnaval_existencias;
create policy carnaval_exis_ver on public.carnaval_existencias for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists carnaval_exis_ins on public.carnaval_existencias;
create policy carnaval_exis_ins on public.carnaval_existencias for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists carnaval_exis_upd on public.carnaval_existencias;
create policy carnaval_exis_upd on public.carnaval_existencias for update
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar')
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');

grant select, insert, update on public.carnaval_existencias to authenticated;

commit;
