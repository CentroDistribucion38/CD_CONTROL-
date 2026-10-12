/* =====================================================================
   INVENTARIO · BALANCE · PASIVOS
   ---------------------------------------------------------------------
   «Dentro del balance debe ir un módulo que se llame Pasivos: uno será la
    base (lo de BLOQUEADOS.xlsx, hoja DATA), que se alimenta del balance y
    de un archivo plano con la baja proyectada y la rotura de línea; y el
    maestro con lo que está en el Excel.»

   pasivos_maestro  → la hoja MAESTRO (código, caja, und por caja, HL, costo…)
   pasivos_base     → la hoja DATA, solo lo esencial (fecha, estado, causal,
                      código, unidades, almacén) + de dónde vino.
   v_pasivos_base   → DATA con sus fórmulas: descripción, caja, HL, cajas,
                      año, mes, día y costo, igual que los BUSCARV del Excel.

   Se puede correr varias veces: no borra nada de lo cargado y el maestro
   solo se siembra con los códigos que todavía no estén.
   ===================================================================== */

begin;

create table if not exists public.pasivos_maestro (
  codigo            text primary key,             -- CÓDIGO
  material          text,                         -- MATERIAL (casi siempre = código)
  descripcion       text not null,                -- DESCRIPCIÓN
  familia           text,                         -- FAMILIA
  unidades_por_caja numeric(12,2),                -- UNIDADES / UND POR CAJA
  plancha           numeric(8,2),                 -- PLANCHA
  alto              numeric(8,2),                 -- ALTO
  cajas_por_estiba  numeric(10,2),                -- ESTD
  tipo              text,                         -- TIPO (EER, CA…)
  hl_unidad         numeric(14,6),                -- HL por unidad
  caja              text,                         -- CAJA (código de la caja plástica)
  costo             numeric(14,2),                -- COSTO por unidad
  activo            boolean not null default true,
  actualizado_en    timestamptz not null default now()
);

create table if not exists public.pasivos_base (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  estado      text not null,                      -- BAJA, LAVADO, ROTURA…
  causal      text not null,                      -- SORTING, PRESORTING, ROTURA DE LINEA, BAJA PROYECTADA…
  codigo      text not null,
  unidades    numeric(14,2) not null,             -- con signo (la baja proyectada puede ir en negativo)
  almacen     text not null,                      -- AG18, AG22, AG07…
  origen      text not null default 'manual' check (origen in ('balance', 'archivo', 'manual', 'historico')),
  archivo     text,                               -- nombre del archivo plano, si vino de uno
  nota        text,
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists pasivos_base_fecha_idx on public.pasivos_base (fecha desc);
create index if not exists pasivos_base_codigo_idx on public.pasivos_base (codigo);

/* DATA CON SUS FÓRMULAS. */
create or replace view public.v_pasivos_base
with (security_invoker = true) as
  select b.id, b.fecha, b.estado, b.causal, m.caja, b.codigo,
         coalesce(m.descripcion, b.codigo) as descripcion,
         b.unidades, b.almacen,
         round(b.unidades * m.hl_unidad, 4)                                  as hl,
         round(b.unidades / nullif(m.unidades_por_caja, 0), 2)               as cajas,
         extract(year from b.fecha)::int  as anio,
         extract(month from b.fecha)::int as mes,
         extract(day from b.fecha)::int   as dia,
         round(b.unidades * m.costo, 2)                                      as costo,
         b.origen, b.archivo, b.nota, b.creado_en,
         (m.codigo is null) as sin_maestro
    from public.pasivos_base b
    left join public.pasivos_maestro m on m.codigo = b.codigo;
grant select on public.v_pasivos_base to authenticated;

/* PERMISOS: los de la pantalla de Pasivos (Base) y de su Maestro. */
alter table public.pasivos_base enable row level security;
drop policy if exists pasivos_base_ver on public.pasivos_base;
create policy pasivos_base_ver on public.pasivos_base for select
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') <> 'ninguno');
drop policy if exists pasivos_base_ins on public.pasivos_base;
create policy pasivos_base_ins on public.pasivos_base for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');
drop policy if exists pasivos_base_upd on public.pasivos_base;
create policy pasivos_base_upd on public.pasivos_base for update
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');
drop policy if exists pasivos_base_del on public.pasivos_base;
create policy pasivos_base_del on public.pasivos_base for delete
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') = 'editar');

alter table public.pasivos_maestro enable row level security;
drop policy if exists pasivos_maestro_ver on public.pasivos_maestro;
create policy pasivos_maestro_ver on public.pasivos_maestro for select
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos') <> 'ninguno'
      or public.mi_nivel_pantalla('/inventario/balance/pasivos/maestro') <> 'ninguno');
drop policy if exists pasivos_maestro_ins on public.pasivos_maestro;
create policy pasivos_maestro_ins on public.pasivos_maestro for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/pasivos/maestro') = 'editar');
drop policy if exists pasivos_maestro_upd on public.pasivos_maestro;
create policy pasivos_maestro_upd on public.pasivos_maestro for update
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos/maestro') = 'editar');
drop policy if exists pasivos_maestro_del on public.pasivos_maestro;
create policy pasivos_maestro_del on public.pasivos_maestro for delete
  using (public.mi_nivel_pantalla('/inventario/balance/pasivos/maestro') = 'editar');

grant select, insert, update, delete on public.pasivos_base, public.pasivos_maestro to authenticated;

/* EL MAESTRO DEL EXCEL (hoja MAESTRO de BLOQUEADOS.xlsx). Solo entra lo que no esté. */
insert into public.pasivos_maestro
  (codigo, material, descripcion, familia, unidades_por_caja, plancha, alto, cajas_por_estiba, tipo, hl_unidad, caja, costo)
values
  ('412644', '412644', 'ENVASE MARRON 330NR NUEVO', 'No Retornable', 30, 9, 5, 45, 'CA', 0.0033, '3500159', 569.61),
  ('412671', '412671', 'ENVASE MARRON 330NR CLUB COLOMBIA', 'No Retornable', 30, 9, 5, 45, 'EER', 0.0033, '3500159', 626.15),
  ('412707', '412707', 'ENVASE FLINT AGUILA 330NR NUEVO', 'No Retornable', 30, 9, 5, 45, 'CA', 0.0033, '3500159', 501.36),
  ('421887', '3500163', 'Envase Coronita 210', 'Envase', null, null, null, null, 'EER', 0.0021, '3500159', 1),
  ('3500005', '3500005', 'Envase Costeñita 175R', 'Envase', 38, 9, 6, 54, 'EER', 0.00175, '3500231', 200),
  ('3500024', '3500024', 'CILINDRO CO2 20 kg', 'Envase', 1, 30, 1, 30, 'EER', null, null, 100000),
  ('3500025', '3500025', 'Barril Acero INOX DIN 30 LT', 'Envase', 1, 9, 1, 9, 'EER', 0.3, null, 100000),
  ('3500026', '3500026', 'Barril Acero INOX DIN 50 LT', 'Envase', 1, 9, 1, 9, 'EER', 0.5, null, 100000),
  ('3500159', '3500159', 'Caja Plástica Café 330cc X 30', 'Caja', 1, 9, 5, 45, 'EER', 0.099, '3500159', 3000),
  ('3500162', '3500162', 'Envase Marron 330R', 'Envase', 30, 9, 5, 45, 'EER', 0.0033, '3500159', 100),
  ('3500163', '3500163', 'Estiba Cerv Madera 1280X1080X120', 'Estiba', 1, 1, 1, 1, 'EER', 0.405, null, 20000),
  ('3500207', '3500207', 'BOTELLA MARRON 225R', 'Envase', 38, 9, 6, 54, 'EER', 0.00225, '3500231', 100),
  ('3500213', '3500213', 'Envase Flint 330R', 'Envase', 30, 9, 5, 45, 'EER', 0.0033, '3500159', 100),
  ('3500231', '3500231', 'Caja Plástica Café 225cc X 38', 'Caja', 1, 9, 6, 54, 'EER', 0.095, '3500231', 3000),
  ('3500232', '3500232', 'Envase Green 330R', 'Envase', 30, 9, 5, 45, 'EER', 0.0033, '3500159', 100),
  ('3500373', '3500373', 'Envase Marron 750R', 'Envase', 16, 9, 4, 36, 'EER', 0.0075, '3500374', 400),
  ('3500374', '3500374', 'CAJA PLASTICA MARRON 750cc x 16', 'Caja', 1, 9, 4, 36, 'EER', 0.12, '3500374', 3000),
  ('3500383', '3500383', 'Envase Flint 750R', 'Envase', 16, 9, 4, 36, 'EER', 0.0075, '3500374', 400),
  ('3500446', '3500446', 'Envase Marron Club Col 330R', 'Envase', 30, 9, 5, 45, 'EER', 0.0033, '3500159', 100),
  ('3500472', '3500472', 'Envase Flint 175R', 'Envase', 38, 9, 6, 54, 'EER', 0.00175, '3500231', 100),
  ('3500587', '3500587', 'BBC BARRIL ACERO INOX DIN 30 LT', 'Envase', 1, 16, 1, 16, 'EER', 0.3, null, 3000),
  ('3500887', '3500887', 'BOTELLA FLINT 1000R', 'Envase', 13, 9, 4, 36, 'CA', 0.01, '3501211', 400),
  ('3500888', '3500888', 'BOTELLA MARRON 1000CC', 'Envase', 13, 9, 4, 36, 'CA', 0.01, '3501211', 400),
  ('3501211', '3501211', 'CAJA PLASTICA MARRON 1000cc x13', 'Caja', 1, 9, 4, 36, 'CA', 0.13, '3501211', 3000),
  ('3501224', '3501224', 'CAJA PLASTICA MARRON 250cc x38', 'Caja', 1, 9, 5, 45, 'EER', 0.095, '3501224', 3000),
  ('3501225', '3501225', 'BOTELLA FLINT 250 CC', 'Envase', 38, 9, 5, 45, 'EER', 0.0025, '3501224', 100),
  ('3501226', '3501226', 'BOTELLA MARRON 250 CC', 'Envase', 38, 9, 5, 45, 'EER', 0.0025, '3501224', 100),
  ('3501430', '3501430', 'ENVASE COSTENA BACANA 320CC R', 'Envase', 30, 9, 5, 45, 'EER', 0.0032, '3500159', 100),
  ('3501539', '3501539', 'Envase Trophy 850', 'Envase', 13, 9, 4, 36, 'EER', 0.0085, '3501211', 400)
on conflict (codigo) do nothing;

commit;

-- Para confirmar:
select count(*) as materiales_en_maestro from public.pasivos_maestro;
