-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA · ROTURAS EN SITIO (cantidad corregida a mano)
--
-- Las roturas de Quiebra en sitio entran al CONTEO como una partida («ROTURA EN SITIO»): cajas rotas × unidades por caja,
-- al código de su envase. Si esa cantidad no es la real, se corrige aquí, por día y código; sin renglón aquí vale lo calculado.
--
-- Mismo permiso que la pantalla del análisis. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.analisis_dif_roturas (
  fecha           date    not null,
  codigo          text    not null,
  unidades        numeric not null check (unidades >= 0),
  nota            text,
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  primary key (fecha, codigo)
);

alter table public.analisis_dif_roturas enable row level security;
drop policy if exists analisis_dif_roturas_ver on public.analisis_dif_roturas;
create policy analisis_dif_roturas_ver on public.analisis_dif_roturas for select
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') <> 'ninguno');
drop policy if exists analisis_dif_roturas_ins on public.analisis_dif_roturas;
create policy analisis_dif_roturas_ins on public.analisis_dif_roturas for insert
  with check (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_roturas_upd on public.analisis_dif_roturas;
create policy analisis_dif_roturas_upd on public.analisis_dif_roturas for update
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
drop policy if exists analisis_dif_roturas_del on public.analisis_dif_roturas;
create policy analisis_dif_roturas_del on public.analisis_dif_roturas for delete
  using (public.mi_nivel_pantalla('/inventario/balance/analisis') = 'editar');
grant select, insert, update, delete on public.analisis_dif_roturas to authenticated;

commit;
