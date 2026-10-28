-- =====================================================================
-- CUADRE SAP · AG07 CARNAVAL (envase vacío de Peldar, por pallets)
--
-- Reemplaza el Excel INVENTARIO_PALLETS: cada movimiento es un renglón con pallets (+ entra, − sale).
-- El saldo por código = la suma de sus pallets. Unidades = pallets × unidades por pallet.
-- HL = pallets × unidades por pallet × cc / 100.000.
--
-- Tipos de movimiento (solo estos cuatro):
--   INICIAL   saldo con el que arranca la app (se carga una sola vez, aquí abajo)
--   INGRESO   entra de Peldar (sale del archivo diario; cada fila se identifica por remisión+placa+código)
--   TRASIEGO  sale (siempre resta)
--   AJUSTE    suma o resta, con nota
--
-- Se puede correr varias veces (la semilla no se duplica).
-- =====================================================================
begin;

-- 1) PRODUCTOS (hoja BASE del Excel): unidades por pallet y cc
create table if not exists public.carnaval_productos (
  codigo          text primary key,
  descripcion     text not null,
  und_por_pallet  integer not null check (und_por_pallet > 0),
  cc              integer not null check (cc > 0),
  orden           integer not null default 0
);

-- 2) AJUSTES GENERALES (el corte: lo recibido hasta esa fecha ya está dentro del saldo inicial)
create table if not exists public.carnaval_config (
  clave  text primary key,
  valor  text not null
);

-- 3) MOVIMIENTOS
create table if not exists public.carnaval_movimientos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,                       -- INGRESO: fecha de recibo
  tipo          text not null check (tipo in ('INICIAL','INGRESO','TRASIEGO','AJUSTE')),
  codigo        text not null references public.carnaval_productos(codigo),
  pallets       numeric(12,2) not null,              -- con signo
  und           numeric(14,0),                       -- unidades que dice el archivo de Peldar (control)
  clave         text,                                -- INGRESO: remisión|placa|código (|n si se repite)
  remision      text,
  placa         text,
  nota          text,
  historial     jsonb not null default '[]'::jsonb,  -- cambios aprobados: [{antes, despues, por, en}]
  anulado       boolean not null default false,
  anulado_motivo text,
  anulado_por   uuid,
  anulado_en    timestamptz,
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now(),
  constraint carnaval_signo check (
    (tipo = 'TRASIEGO' and pallets < 0) or (tipo in ('INGRESO') and pallets > 0)
    or tipo in ('INICIAL','AJUSTE')
  )
);
create unique index if not exists carnaval_mov_clave on public.carnaval_movimientos (clave) where clave is not null;
create index if not exists carnaval_mov_fecha on public.carnaval_movimientos (fecha);
create index if not exists carnaval_mov_codigo on public.carnaval_movimientos (codigo);

-- 4) RLS: ver con «ver» o «editar» en Registro o Control; escribir solo con «editar» en Registro
alter table public.carnaval_productos enable row level security;
alter table public.carnaval_config enable row level security;
alter table public.carnaval_movimientos enable row level security;

drop policy if exists carnaval_prod_ver on public.carnaval_productos;
create policy carnaval_prod_ver on public.carnaval_productos for select
  using (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/balance/carnaval/control') <> 'ninguno');

drop policy if exists carnaval_cfg_ver on public.carnaval_config;
create policy carnaval_cfg_ver on public.carnaval_config for select
  using (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/balance/carnaval/control') <> 'ninguno');

drop policy if exists carnaval_mov_ver on public.carnaval_movimientos;
create policy carnaval_mov_ver on public.carnaval_movimientos for select
  using (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/balance/carnaval/control') <> 'ninguno');
drop policy if exists carnaval_mov_ins on public.carnaval_movimientos;
create policy carnaval_mov_ins on public.carnaval_movimientos for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') = 'editar');
drop policy if exists carnaval_mov_upd on public.carnaval_movimientos;
create policy carnaval_mov_upd on public.carnaval_movimientos for update
  using (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') = 'editar')
  with check (public.mi_nivel_pantalla('/inventario/balance/carnaval/registro') = 'editar');
-- nadie borra: lo equivocado se anula (queda la huella)

grant select on public.carnaval_productos, public.carnaval_config to authenticated;
grant select, insert, update on public.carnaval_movimientos to authenticated;

-- 5) SALDOS a una fecha: pallets por código (sin anulados)
create or replace function public.carnaval_saldos(p_fecha date)
returns table (codigo text, pallets numeric)
language sql stable security invoker
as $$
  select m.codigo, coalesce(sum(m.pallets), 0)
    from public.carnaval_movimientos m
   where not m.anulado and m.fecha <= p_fecha
   group by m.codigo;
$$;
grant execute on function public.carnaval_saldos(date) to authenticated;

-- 6) SEMILLA · productos (hoja BASE del Excel)
insert into public.carnaval_productos (codigo, descripcion, und_por_pallet, cc, orden) values
  ('3500005', 'Envase Costeñita 175R',                 5616, 175,  1),
  ('3501430', 'Envase Costeña Bacana 320cc R',         4050, 320,  2),
  ('412644',  'Envase Marrón 330NR Nuevo',             4347, 330,  3),
  ('412671',  'Envase Marrón 330NR Club Colombia Nuevo', 4050, 330, 4),
  ('412707',  'Envase Flint Águila 330NR Nuevo',       4347, 330,  5),
  ('3500162', 'Envase Marrón 330R',                    4347, 330,  6),
  ('3500213', 'Envase Flint 330R',                     4347, 330,  7),
  ('3500446', 'Envase Marrón Club Col 330R',           4050, 330,  8),
  ('3500887', 'Botella Flint 1000cc',                  1260, 1000, 9),
  ('3500888', 'Botella Marrón 1000cc',                 1260, 1000, 10),
  ('3501225', 'Botella Flint 250cc',                   5175, 250,  11),
  ('3501226', 'Botella Marrón 250cc',                  5175, 250,  12),
  ('400733',  'Envase NR Cervezas',                    4347, 330,  13),
  ('415850',  'Envase Azul 330 Ret',                   4347, 330,  14),
  ('415849',  'Envase Azul 175 Ret',                   7488, 175,  15),
  ('3500472', 'Flint 175 Retornable',                  7488, 175,  16)
on conflict (codigo) do nothing;

-- 7) SEMILLA · corte e inventario inicial (el saldo del Excel al 27-oct-2026, con los ajustes del 28-oct ya dentro).
--    Lo recibido de Peldar con fecha de recibo hasta el corte NO se vuelve a cargar: ya está dentro de este saldo.
insert into public.carnaval_config (clave, valor) values ('corte', '2026-10-27')
on conflict (clave) do nothing;

insert into public.carnaval_movimientos (fecha, tipo, codigo, pallets, nota)
select date '2026-10-27', 'INICIAL', v.codigo, v.pallets, 'Saldo del Excel INVENTARIO_PALLETS'
  from (values ('3500005', 167::numeric), ('3501430', 122::numeric), ('412707', 1::numeric)) as v(codigo, pallets)
 where not exists (select 1 from public.carnaval_movimientos where tipo = 'INICIAL' and codigo = v.codigo);

commit;
