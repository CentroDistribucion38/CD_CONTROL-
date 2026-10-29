-- AG07 Carnaval · CUADRE SAP · PARTIDAS RÁPIDAS
-- Líneas cortas (código + cantidad) que se suman al CONTEO o a la ZEXI (SAP) de un día, en el paso 1 (pallets) o en el paso 2 (inventario).
-- Se puede correr varias veces.
create table if not exists public.carnaval_partidas (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  paso        smallint not null check (paso in (1, 2)),
  codigo      text not null,
  cantidad    numeric not null,                 -- en unidades (puede ser negativa)
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

select count(*) as partidas from public.carnaval_partidas;
