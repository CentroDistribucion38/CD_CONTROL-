-- AG07 Carnaval · TODO LO PENDIENTE (se puede correr varias veces)
-- 1) Histórico del Cuadre SAP
alter table public.cuadre_sap add column if not exists cierre         jsonb;
alter table public.cuadre_sap add column if not exists cerrado_en     timestamptz;
alter table public.cuadre_sap add column if not exists cerrado_por    uuid;
alter table public.cuadre_sap add column if not exists cerrado_nombre text;

-- 2) Entrada de mercancía + ZEXI de AG07

-- 1) Entrada de mercancía de cada ingreso de Peldar (columnas «INGRESO» y «Entrada de Mercancía» del archivo).
alter table public.carnaval_movimientos add column if not exists ingreso date;
alter table public.carnaval_movimientos add column if not exists entrada_mercancia text;
alter table public.carnaval_movimientos add column if not exists em_leida boolean not null default false;

-- 2) La ZEXI de AG07 (trae también AG71) que se sube en el Cuadre SAP: una por día.
create table if not exists public.carnaval_zexi (
  fecha          date primary key,
  filas          jsonb not null,
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


-- 3) Partidas rápidas
-- Se puede correr varias veces.
create table if not exists public.carnaval_partidas (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  paso        smallint not null check (paso in (1, 2)),
  codigo      text not null,
  cantidad    numeric not null,
  lado        text not null check (lado in ('CONTEO', 'SAP')),
  nota        text,
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists carnaval_partidas_fecha on public.carnaval_partidas (fecha);
alter table public.carnaval_partidas enable row level security;

drop policy if exists carnaval_partidas_ver on public.carnaval_partidas;
create policy carnaval_partidas_ver on public.carnaval_partidas for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
drop policy if exists carnaval_partidas_ins on public.carnaval_partidas;
create policy carnaval_partidas_ins on public.carnaval_partidas for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
drop policy if exists carnaval_partidas_del on public.carnaval_partidas;
create policy carnaval_partidas_del on public.carnaval_partidas for delete
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') = 'editar');
grant select, insert, delete on public.carnaval_partidas to authenticated;


select 'ok' as listo;
