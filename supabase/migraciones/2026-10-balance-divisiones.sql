-- BALANCE · PASAR SOLO UNA PARTE DE LAS CAJAS DE UNA UBICACIÓN (ver el archivo completo en la entrega)
create table if not exists public.balance_divisiones (
  id               uuid primary key default gen_random_uuid(),
  conteo_envase_id uuid not null,
  cajas            numeric not null check (cajas > 0),
  usuario_id       uuid default auth.uid(),
  creado_en        timestamptz default now()
);
create index if not exists ix_bal_div_envase on public.balance_divisiones (conteo_envase_id);
alter table public.balance_divisiones enable row level security;
drop policy if exists "bal_div_ver" on public.balance_divisiones;
create policy "bal_div_ver" on public.balance_divisiones for select using (mi_nivel_pantalla('/inventario/balance') <> 'ninguno');
drop policy if exists "bal_div_ins" on public.balance_divisiones;
create policy "bal_div_ins" on public.balance_divisiones for insert with check (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));
drop policy if exists "bal_div_del" on public.balance_divisiones;
create policy "bal_div_del" on public.balance_divisiones for delete using (mi_nivel_pantalla('/inventario/balance') not in ('ninguno', 'ver'));
grant select, insert, delete on public.balance_divisiones to authenticated;
