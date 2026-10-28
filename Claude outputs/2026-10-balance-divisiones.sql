-- =====================================================================
-- BALANCE · PASAR SOLO UNA PARTE DE LAS CAJAS DE UNA UBICACIÓN
-- (ej.: de 90 cajas en FABRICA_SORTING_L4, pasar 45 a ANDINA y dejar 45)
--
-- El renglón del conteo NO se toca. Se guarda aquí cuántas cajas se separan
-- de él; esa parte nace como un renglón nuevo (su id es el de esta fila) y
-- se reclasifica como cualquier otro. Seguro de correr varias veces.
-- =====================================================================
create table if not exists public.balance_divisiones (
  id               uuid primary key default gen_random_uuid(),
  conteo_envase_id uuid not null,          -- renglón del conteo del que se separan las cajas (o la parte de la que se separan)
  cajas            numeric not null check (cajas > 0),
  usuario_id       uuid default auth.uid(),
  creado_en        timestamptz default now()
);

create index if not exists ix_bal_div_envase on public.balance_divisiones (conteo_envase_id);

alter table public.balance_divisiones enable row level security;
drop policy if exists "bal_div_ver" on public.balance_divisiones;
create policy "bal_div_ver" on public.balance_divisiones
  for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
drop policy if exists "bal_div_ins" on public.balance_divisiones;
create policy "bal_div_ins" on public.balance_divisiones
  for insert with check (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));
drop policy if exists "bal_div_del" on public.balance_divisiones;
create policy "bal_div_del" on public.balance_divisiones
  for delete using (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));

grant select, insert, delete on public.balance_divisiones to authenticated;

-- Verificación: debe devolver 1 fila con existe = true
select to_regclass('public.balance_divisiones') is not null as existe;
