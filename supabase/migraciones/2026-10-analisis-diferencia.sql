-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA (2026.10.14_BODEGA_38.xlsx, hoja CONTEOS)
--
-- Lo que la app NO tiene y se importa con la plantilla «analisis-diferencia-novedades.xlsx»:
-- BAJA PENDIENTE POR DISPOSICION, SINIESTRO, AJUSTE INV BAJA PRESORTING, FAC PROVEEDOR,
-- PEND NOVEDADES CD (con N° de entrega o SOCIO), CONTEO TW y la ZEXI de las 6 a. m.
-- Lo demás (conteo, DEPA de los cortes, Pasivos AG22 y el BALANCE del Cuadre SAP) ya lo tiene la app.
--
-- Una fila por novedad, en UNIDADES (la plantilla ya pasó estibas y cajas a unidades). Si el tipo suma su
-- caja plástica, viene en caja_codigo · cajas. lado: CONTEO, SAP o NO SUMA (informativo, como CONTEO TW).
-- Volver a subir la plantilla de un día reemplaza lo de ese día.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.analisis_dif_novedades (
  id           bigserial primary key,
  fecha        date not null,
  tipo         text not null,
  lado         text not null check (lado in ('CONTEO', 'SAP', 'NO SUMA')),
  documento    text,
  codigo       text not null,
  unidades     numeric(14,2) not null default 0,
  caja_codigo  text,
  cajas        numeric(14,2),
  archivo      text,
  subido_en    timestamptz not null default now(),
  subido_por   uuid default auth.uid()
);
create index if not exists analisis_dif_novedades_fecha_idx on public.analisis_dif_novedades (fecha);
create index if not exists analisis_dif_novedades_codigo_idx on public.analisis_dif_novedades (codigo);

alter table public.analisis_dif_novedades enable row level security;
drop policy if exists analisis_dif_ver on public.analisis_dif_novedades;
create policy analisis_dif_ver on public.analisis_dif_novedades for select
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') <> 'ninguno');
drop policy if exists analisis_dif_ins on public.analisis_dif_novedades;
create policy analisis_dif_ins on public.analisis_dif_novedades for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_upd on public.analisis_dif_novedades;
create policy analisis_dif_upd on public.analisis_dif_novedades for update
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_del on public.analisis_dif_novedades;
create policy analisis_dif_del on public.analisis_dif_novedades for delete
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');

grant select, insert, update, delete on public.analisis_dif_novedades to authenticated;
grant usage, select on sequence public.analisis_dif_novedades_id_seq to authenticated;

commit;
