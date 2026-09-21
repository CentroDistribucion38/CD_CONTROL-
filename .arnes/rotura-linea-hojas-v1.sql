-- =====================================================================
-- ROTURA EN LÍNEA · LAS HOJAS DEL DÍA QUE SE GENERARON, GUARDADAS
--
-- «Que guarde y me salga el cuadro de generar el PDF; y si no, que en el
-- tablero de rotura haya una hoja con todos los PDF generados.»
--
-- Cada vez que alguien genera la hoja para firmar, el PDF se guarda TAL
-- CUAL SE MANDÓ y queda un renglón que dice de qué día es, quién lo
-- generó, a qué hora, a qué supervisor iba y qué cifras decía.
--
-- ---------------------------------------------------------------------
-- EL ARCHIVO Y NO SOLO EL RENGLÓN.
--
-- Guardar solo «se generó a las 3:30» y volver a armar el PDF al abrirlo
-- sería más liviano, pero daría un papel DISTINTO del que se firmó si
-- alguien corrigió una pesada después. Lo que el supervisor firmó es ese
-- archivo, con esas cifras; es lo que se guarda.
--
-- NO SE CORRIGE NI SE PISA. No hay política de UPDATE: si hace falta
-- otra versión, se genera otra y quedan las dos, cada una con su hora.
-- Borrar solo lo puede el administrador. Un historial de papeles
-- firmados que cualquiera puede reescribir no es un historial.
--
-- Y LAS CIFRAS QUE DECÍA VAN EN EL RENGLÓN —unidades y kilos—: así el
-- tablero puede avisar cuando el día cambió DESPUÉS de generar la hoja,
-- sin abrir el PDF.
--
-- SE PUEDE CORRER VARIAS VECES.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DÓNDE SE GUARDAN LOS PDF
--
-- Privado: se abren con un enlace que vence, no con una dirección que
-- se pueda reenviar para siempre. Solo PDF, y hasta 5 MB —una hoja pesa
-- ~110 KB; algo de 5 MB no es una hoja—.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rotlinea-hojas', 'rotlinea-hojas', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rotlinea_hojas_ver on storage.objects;
create policy rotlinea_hojas_ver on storage.objects
  for select to authenticated using (bucket_id = 'rotlinea-hojas');

drop policy if exists rotlinea_hojas_subir on storage.objects;
create policy rotlinea_hojas_subir on storage.objects
  for insert to authenticated with check (bucket_id = 'rotlinea-hojas' and public.es_editor());

drop policy if exists rotlinea_hojas_borrar on storage.objects;
create policy rotlinea_hojas_borrar on storage.objects
  for delete to authenticated using (bucket_id = 'rotlinea-hojas' and public.mi_rol() = 'admin');


-- ---------------------------------------------------------------------
-- 2. EL RENGLÓN DE CADA HOJA
-- ---------------------------------------------------------------------
create table if not exists public.rotlinea_hojas (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  /* Dónde quedó el PDF dentro del espacio `rotlinea-hojas`. Empieza por
     la fecha: así una hoja no puede quedar guardada con el día de otra. */
  ruta          text not null unique,
  bytes         integer check (bytes is null or bytes > 0),
  unidades      bigint  not null default 0 check (unidades >= 0),
  kg            numeric(12, 2) not null default 0 check (kg >= 0),
  lineas        smallint not null default 0 check (lineas >= 0),
  elaboro       text,
  supervisor    text,
  observaciones text,
  generado_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  generado_en   timestamptz not null default now(),
  constraint rotlinea_hojas_ruta_del_dia check (ruta like fecha::text || '/%')
);

create index if not exists rotlinea_hojas_por_fecha
  on public.rotlinea_hojas (fecha desc, generado_en desc);

alter table public.rotlinea_hojas enable row level security;

drop policy if exists rotlinea_hojas_select on public.rotlinea_hojas;
create policy rotlinea_hojas_select on public.rotlinea_hojas
  for select to authenticated using (true);

/* LA GENERA QUIEN ESTÁ, Y A SU NOMBRE. `generado_por` tiene que ser uno
   mismo: sin esto, cualquiera podría dejar una hoja «generada» por otro. */
drop policy if exists rotlinea_hojas_insert on public.rotlinea_hojas;
create policy rotlinea_hojas_insert on public.rotlinea_hojas
  for insert to authenticated
  with check (public.es_editor() and generado_por = auth.uid());

drop policy if exists rotlinea_hojas_delete on public.rotlinea_hojas;
create policy rotlinea_hojas_delete on public.rotlinea_hojas
  for delete to authenticated using (public.mi_rol() = 'admin');

/* Ni UPDATE ni la política que lo permitiría: lo generado no se pisa. */
grant select, insert, delete on public.rotlinea_hojas to authenticated;
revoke update on public.rotlinea_hojas from authenticated;


-- ---------------------------------------------------------------------
-- 3. CON EL NOMBRE DE QUIEN LA GENERÓ
-- ---------------------------------------------------------------------
create or replace view public.v_rotlinea_hojas
with (security_invoker = true) as
select h.id, h.fecha, h.ruta, h.bytes, h.unidades, h.kg, h.lineas,
       h.elaboro, h.supervisor, h.observaciones,
       h.generado_por, p.nombre as generado_nombre, h.generado_en
from public.rotlinea_hojas h
left join public.perfiles p on p.id = h.generado_por;

grant select on public.v_rotlinea_hojas to authenticated;


-- ---------------------------------------------------------------------
-- 4. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $bloque$
declare v_falta text := '';
begin
  if not exists (select 1 from storage.buckets where id = 'rotlinea-hojas') then
    v_falta := v_falta || ' · el espacio de los PDF (rotlinea-hojas)'; end if;
  if to_regclass('public.rotlinea_hojas') is null then
    v_falta := v_falta || ' · la tabla rotlinea_hojas'; end if;
  if to_regclass('public.v_rotlinea_hojas') is null then
    v_falta := v_falta || ' · la vista v_rotlinea_hojas'; end if;
  if v_falta <> '' then raise exception 'NO QUEDÓ TODO. Falta:%', v_falta; end if;
  raise notice 'LISTO: las hojas del día se guardan tal cual se generan, y el tablero las lista.';
end $bloque$;
