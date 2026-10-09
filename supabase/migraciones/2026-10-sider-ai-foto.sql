-- =====================================================================
-- T1 / T2 · REVISIÓN AI (certificada y normal): UNA FOTO DE LO QUE SE EVIDENCIÓ
--
-- «Aquí debería poder adjuntar foto de lo que evidenció, solo 1, con marca
--  de agua y todo.»
--
-- La foto se sella en el teléfono (placa, revisión, fecha, hora y
-- coordenadas quemadas en la banda) y se sube al bucket `sider` en
-- ai/<id de la revisión>/<hora>.jpg. Aquí:
--   1. la columna donde queda su ruta (una por revisión; tomar otra la reemplaza),
--   2. el permiso para subirla al bucket a quien hace la revisión,
--   3. la función que la amarra a la revisión.
--
-- Se puede correr varias veces.
-- =====================================================================

alter table public.sider_ai_revisiones
  add column if not exists foto_ruta text,
  add column if not exists foto_en   timestamptz,
  add column if not exists foto_por  uuid;

comment on column public.sider_ai_revisiones.foto_ruta is
  'La foto de lo que se evidenció en la revisión (bucket sider). Una por revisión.';

-- Quien hace la revisión AI puede subir al bucket, solo bajo ai/.
drop policy if exists sider_ai_foto_subir on storage.objects;
create policy sider_ai_foto_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sider' and name like 'ai/%'
              and (public.puede_editar('/sider/sorting')
                   or (public.es_editor() and public.puede_editar('/sider/transito'))));

create or replace function public.sider_ai_foto(p_revision uuid, p_ruta text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.puede_editar('/sider/sorting')
          or (public.es_editor() and public.puede_editar('/sider/transito'))) then
    raise exception 'Adjuntar la foto requiere permiso de edición en Revisión AI';
  end if;
  if p_ruta is null or p_ruta not like 'ai/' || p_revision::text || '/%' then
    raise exception 'Esa ruta de foto no es de esta revisión';
  end if;
  update public.sider_ai_revisiones
     set foto_ruta = p_ruta, foto_en = now(), foto_por = auth.uid()
   where id = p_revision;
  if not found then raise exception 'Esa revisión no existe'; end if;
end $$;

grant execute on function public.sider_ai_foto(uuid, text) to authenticated;

-- PARA MIRARLO:
--   select placa, tipo, fecha, foto_ruta, foto_en from public.sider_ai_revisiones
--    where foto_ruta is not null order by foto_en desc;
