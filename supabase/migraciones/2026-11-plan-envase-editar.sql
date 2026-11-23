-- PLAN VS NOTIFICADO › CARGAR: cambiar el papel de un instructivo (plan inicial / corte) desde la pantalla.
-- «papel» vacío = automático (el primero generado que cubre desde el lunes es el plan inicial; los demás, cortes).
-- Borrar un instructivo ya se podía con el permiso de cargar (pe_carga); sus filas se van con él (on delete cascade).
-- Se puede correr varias veces.
begin;
alter table public.pe_planes add column if not exists papel text;
alter table public.pe_planes drop constraint if exists pe_planes_papel_chk;
alter table public.pe_planes add constraint pe_planes_papel_chk check (papel is null or papel in ('inicial', 'corte'));
drop policy if exists pe_planes_cambiar on public.pe_planes;
create policy pe_planes_cambiar on public.pe_planes for update to authenticated using (public.pe_carga()) with check (public.pe_carga());
commit;
