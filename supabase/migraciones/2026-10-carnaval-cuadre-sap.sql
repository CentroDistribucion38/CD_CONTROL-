-- AG07 Carnaval · CUADRE SAP (paso 1: pallets contra la ZEXI de AG07 y AG71)
-- Se puede correr varias veces.

-- 1) Entrada de mercancía de cada ingreso de Peldar (columnas «INGRESO» y «Entrada de Mercancía» del archivo).
--    Un ingreso sin fecha de ingreso o sin entrada de mercancía NO está en SAP: no se puede meter a control de calidad.
--    em_leida = true cuando el archivo ya se leyó con esas columnas (las filas viejas, sin leer, no se tratan como pendientes).
alter table public.carnaval_movimientos add column if not exists ingreso date;
alter table public.carnaval_movimientos add column if not exists entrada_mercancia text;
alter table public.carnaval_movimientos add column if not exists em_leida boolean not null default false;

-- 2) La ZEXI de AG07 (trae también AG71) que se sube en el Cuadre SAP: una por día.
create table if not exists public.carnaval_zexi (
  fecha          date primary key,
  filas          jsonb not null,        -- [{almacen, codigo, descripcion, libre, calidad, bloqueado, total}]
  archivo        text,
  actualizado_por uuid default auth.uid(),
  actualizado_en timestamptz not null default now()
);
alter table public.carnaval_zexi enable row level security;

drop policy if exists carnaval_zexi_ver on public.carnaval_zexi;
create policy carnaval_zexi_ver on public.carnaval_zexi for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists carnaval_zexi_ins on public.carnaval_zexi;
create policy carnaval_zexi_ins on public.carnaval_zexi for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists carnaval_zexi_upd on public.carnaval_zexi;
create policy carnaval_zexi_upd on public.carnaval_zexi for update
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar')
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists carnaval_zexi_del on public.carnaval_zexi;
create policy carnaval_zexi_del on public.carnaval_zexi for delete
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
grant select, insert, update, delete on public.carnaval_zexi to authenticated;

-- Verificación
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'carnaval_movimientos' and column_name in ('ingreso', 'entrada_mercancia', 'em_leida');
