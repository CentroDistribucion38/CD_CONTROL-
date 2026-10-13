-- =====================================================================
-- CUADRE SAP · AG18 FÁBRICA
--
-- «Primero hago ese ejercicio, me muestra la diferencia y me dice qué haré en SAP; luego de que
--  lo haga vuelvo y bajo la transacción de SAP (el 311) y me debe volver a mostrar cómo quedó el
--  análisis con esa existencia y ver si ya todo quedó balanceado.»
--
-- Un renglón por día y almacén: el ZEXI que se subió (el stock de SAP), las estibas de madera del
-- almacén que se digitan, si se suma el pend. baja, y los movimientos 311 que se bajaron de SAP.
-- El conteo, el pend. baja, el lavado con baja y Andina NO se guardan aquí: salen de la app.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.cuadre_sap (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  almacen          text not null default 'AG18',
  estibas_almacen  numeric(12,2),
  sumar_pend_baja  boolean not null default true,
  zexi             jsonb,          -- [{codigo, descripcion, cantidad}]
  zexi_archivo     text,
  zexi_en          timestamptz,
  movimientos      jsonb,          -- [{codigo, cantidad (neto en AG18: + entra, − sale), documento}]
  mov_archivo      text,
  mov_en           timestamptz,
  actualizado_por  uuid default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  constraint cuadre_sap_unico unique (fecha, almacen)
);

alter table public.cuadre_sap enable row level security;
drop policy if exists cuadre_sap_ver on public.cuadre_sap;
create policy cuadre_sap_ver on public.cuadre_sap for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists cuadre_sap_ins on public.cuadre_sap;
create policy cuadre_sap_ins on public.cuadre_sap for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists cuadre_sap_upd on public.cuadre_sap;
create policy cuadre_sap_upd on public.cuadre_sap for update
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists cuadre_sap_del on public.cuadre_sap;
create policy cuadre_sap_del on public.cuadre_sap for delete
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');

grant select, insert, update, delete on public.cuadre_sap to authenticated;

/* El cuadre lee el pend. baja y Andina de Pasivos y los factores del maestro de Pasivos: quien
   tenga el Cuadre los puede LEER aunque no tenga la pantalla de Pasivos. */
drop policy if exists pasivos_base_ver_cuadre on public.pasivos_base;
create policy pasivos_base_ver_cuadre on public.pasivos_base for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists pasivos_maestro_ver_cuadre on public.pasivos_maestro;
create policy pasivos_maestro_ver_cuadre on public.pasivos_maestro for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');

commit;
