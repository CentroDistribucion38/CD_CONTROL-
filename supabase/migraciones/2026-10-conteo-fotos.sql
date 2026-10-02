-- =====================================================================
-- INVENTARIO · LA FOTO DE UN RENGLÓN DEL CONTEO
--
-- «En Contar, en Datos adicionales, agrega la camarita por si quiero poner
-- evidencia de un mixeo, lo que sea, para tener soporte.»
--
-- UNA FOTO POR RENGLÓN (la primary key es el renglón): tomar otra la
-- reemplaza. La foto no cambia ninguna cuenta: es soporte, y por eso es
-- opcional y vive aparte del renglón —en su propia tabla— para no tocar
-- `conteo_lineas`, `v_conteo_fefo` ni las funciones del conteo.
--
-- Si el renglón se borra, la fila de la foto se va con él (cascade). El
-- archivo en el bucket lo limpia la pantalla al borrar el renglón.
--
-- El Excel del consolidado trae una hoja «Evidencias» SOLO cuando hay fotos
-- en lo que se exporta; las demás hojas no cambian.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.conteo_fotos (
  linea_id    uuid primary key references public.conteo_lineas(id) on delete cascade,
  conteo_id   uuid not null references public.conteos(id) on delete cascade,
  ruta        text not null,
  bytes       integer,
  ancho       integer,
  alto        integer,
  /* La hora DE LA FOTO, no de la subida: sin señal puede pasar un rato. */
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  subida_en   timestamptz not null default now()
);
create index if not exists conteo_fotos_conteo_idx on public.conteo_fotos (conteo_id);

alter table public.conteo_fotos enable row level security;

/* Como las líneas del conteo: quien cuenta, la ve y la pone. */
drop policy if exists conteo_fotos_ver on public.conteo_fotos;
create policy conteo_fotos_ver on public.conteo_fotos
  for select to authenticated using (true);
drop policy if exists conteo_fotos_poner on public.conteo_fotos;
create policy conteo_fotos_poner on public.conteo_fotos
  for insert to authenticated with check (true);
drop policy if exists conteo_fotos_cambiar on public.conteo_fotos;
create policy conteo_fotos_cambiar on public.conteo_fotos
  for update to authenticated using (true) with check (true);
drop policy if exists conteo_fotos_quitar on public.conteo_fotos;
create policy conteo_fotos_quitar on public.conteo_fotos
  for delete to authenticated using (true);

revoke all on public.conteo_fotos from public, anon;
grant select, insert, update, delete on public.conteo_fotos to authenticated;

-- El bucket: privado, solo imágenes, hasta 15 MB (las fotos salen de ~0,5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventario', 'inventario', false, 15728640,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = 15728640,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists inventario_fotos_ver on storage.objects;
create policy inventario_fotos_ver on storage.objects
  for select to authenticated using (bucket_id = 'inventario');
drop policy if exists inventario_fotos_subir on storage.objects;
create policy inventario_fotos_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'inventario');
drop policy if exists inventario_fotos_cambiar on storage.objects;
create policy inventario_fotos_cambiar on storage.objects
  for update to authenticated using (bucket_id = 'inventario') with check (bucket_id = 'inventario');
drop policy if exists inventario_fotos_borrar on storage.objects;
create policy inventario_fotos_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'inventario');

commit;
