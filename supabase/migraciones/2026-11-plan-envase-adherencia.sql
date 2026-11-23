-- PLAN VS NOTIFICADO · REPORTE DE ADHERENCIA (cierre real de la semana).
-- «Con este yo cierro la semana y así digo qué quedó del plan de producción, y con eso validamos.»
-- Reporte_de_Adherencia_*.xlsx: por planta, semana (AAAA-SS), línea (TREN-N) y producto, lo REAL producido en CAJAS.
-- Una semana se reemplaza entera cada vez que se sube (el último reporte manda). Se puede correr varias veces.
begin;

create table if not exists public.pe_adherencia (
  id           bigserial primary key,
  lunes        date not null,
  anio         int  not null,
  semana       int  not null,
  planta       text,
  tren         text not null,
  sku          text not null,
  producto     text,
  ref_nombre   numeric,          -- unidades por caja leídas del nombre («X 38»), por si el maestro no las tiene
  cajas_real   numeric not null,
  cajas_plan   numeric,
  archivo      text,
  subido_en    timestamptz not null default now(),
  subido_por   uuid default auth.uid(),
  unique (lunes, tren, sku)
);
create index if not exists pe_adherencia_lunes_idx on public.pe_adherencia (lunes);

alter table public.pe_adherencia enable row level security;
drop policy if exists pe_adherencia_ver on public.pe_adherencia;
drop policy if exists pe_adherencia_cargar on public.pe_adherencia;
drop policy if exists pe_adherencia_borrar on public.pe_adherencia;
create policy pe_adherencia_ver on public.pe_adherencia for select to authenticated using (public.pe_ve());
create policy pe_adherencia_cargar on public.pe_adherencia for insert to authenticated with check (public.pe_carga());
create policy pe_adherencia_borrar on public.pe_adherencia for delete to authenticated using (public.pe_carga());
grant select, insert, delete on public.pe_adherencia to authenticated;
grant usage, select on sequence public.pe_adherencia_id_seq to authenticated;

/* GUARDAR EL REPORTE DE UNA SEMANA: borra lo que hubiera de esa semana y mete lo nuevo, todo junto. Devuelve cuántas filas. */
create or replace function public.pe_guardar_adherencia(p_lunes date, p_anio int, p_semana int, p_archivo text, p_filas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.pe_carga() then raise exception 'Sin permiso para cargar la adherencia.'; end if;
  delete from public.pe_adherencia where lunes = p_lunes;
  insert into public.pe_adherencia (lunes, anio, semana, planta, tren, sku, producto, ref_nombre, cajas_real, cajas_plan, archivo)
  select p_lunes, p_anio, p_semana, f->>'planta', f->>'tren', f->>'sku', f->>'producto', nullif(f->>'ref', '')::numeric,
         (f->>'cajas_real')::numeric, nullif(f->>'cajas_plan', '')::numeric, p_archivo
    from jsonb_array_elements(p_filas) f;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pe_guardar_adherencia(date, int, int, text, jsonb) from public;
grant execute on function public.pe_guardar_adherencia(date, int, int, text, jsonb) to authenticated;

commit;
