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
-- Un historial de papeles firmados que cualquiera puede reescribir no es
-- un historial.
--
-- EL ADMINISTRADOR ANULA, CON MOTIVO; NADIE BORRA. «Que el administrador
-- pueda corregir: lo máximo, anular.» Anular y no editar: el PDF es el
-- papel que se firmó, y si se cambiaran los datos del renglón el PDF
-- seguiría diciendo lo de antes. La hoja anulada queda a la vista,
-- tachada, con quién, cuándo y por qué; deja de contar y el día vuelve a
-- salir «sin hoja». Si anuló la que no era, la restituye. Y anular
-- REEMPLAZA a borrar: nada desaparece, que es lo que sirve si auditan.
--
-- Y LAS CIFRAS QUE DECÍA VAN EN EL RENGLÓN —unidades y kilos—: así el
-- tablero puede avisar cuando el día cambió DESPUÉS de generar la hoja,
-- sin abrir el PDF.
--
-- SE PUEDE CORRER VARIAS VECES. Quien ya corrió la primera versión
-- —la que dejaba borrar al administrador— la vuelve a correr y queda
-- igual que quien la corre por primera vez.
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

/* SIN POLÍTICA DE BORRAR: un PDF generado no se borra, se anula. La
   primera versión de este archivo dejaba borrar al administrador; se
   quita aquí para quien ya la había corrido. */
drop policy if exists rotlinea_hojas_borrar on storage.objects;


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

/* Ni UPDATE ni DELETE, ni las políticas que los permitirían: lo
   generado no se pisa ni se borra. Lo único que cambia de una hoja es si
   está anulada, y solo por las funciones de abajo. */
drop policy if exists rotlinea_hojas_delete on public.rotlinea_hojas;
grant select, insert on public.rotlinea_hojas to authenticated;
revoke update, delete on public.rotlinea_hojas from authenticated;


-- ---------------------------------------------------------------------
-- 3. LA ANULACIÓN, EN EL MISMO RENGLÓN
-- ---------------------------------------------------------------------
alter table public.rotlinea_hojas
  add column if not exists anulada_en     timestamptz,
  add column if not exists anulada_por    uuid references public.perfiles(id) on delete set null,
  add column if not exists anulada_motivo text;

/* O ESTÁ ANULADA CON FECHA Y MOTIVO, O NO LO ESTÁ. Una anulación sin
   motivo es una hoja que desapareció sin que nadie sepa por qué. */
alter table public.rotlinea_hojas drop constraint if exists rotlinea_hojas_anulada_completa;
alter table public.rotlinea_hojas add constraint rotlinea_hojas_anulada_completa check (
  (anulada_en is null and anulada_motivo is null and anulada_por is null)
  or (anulada_en is not null and length(btrim(anulada_motivo)) >= 5)
);


-- ---------------------------------------------------------------------
-- 4. QUIÉN ANULA: quien administra, y solo por estas dos funciones
-- ---------------------------------------------------------------------
create or replace function public.rotlinea_hoja_manda()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.perfiles yo
      join public.roles r on r.clave = yo.rol
     where yo.id = auth.uid() and yo.activo and r.manda)
$fn$;

create or replace function public.rotlinea_hoja_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_ya timestamptz;
begin
  if not public.rotlinea_hoja_manda() then
    raise exception 'Solo el administrador anula hojas.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se anula (al menos 5 letras): una hoja anulada sin motivo no se entiende después.';
  end if;
  select anulada_en into v_ya from public.rotlinea_hojas where id = p_id for update;
  if not found then raise exception 'Esa hoja no existe.'; end if;
  if v_ya is not null then raise exception 'Esa hoja ya está anulada.'; end if;
  update public.rotlinea_hojas
     set anulada_en = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
   where id = p_id;
end $fn$;

create or replace function public.rotlinea_hoja_restituir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.rotlinea_hoja_manda() then
    raise exception 'Solo el administrador quita una anulación.' using errcode = '42501';
  end if;
  update public.rotlinea_hojas
     set anulada_en = null, anulada_por = null, anulada_motivo = null
   where id = p_id and anulada_en is not null;
  if not found then raise exception 'Esa hoja no está anulada.'; end if;
end $fn$;

revoke all on function public.rotlinea_hoja_manda()                 from public, anon;
revoke all on function public.rotlinea_hoja_anular(uuid, text)      from public, anon;
revoke all on function public.rotlinea_hoja_restituir(uuid)         from public, anon;
grant execute on function public.rotlinea_hoja_manda()              to authenticated;
grant execute on function public.rotlinea_hoja_anular(uuid, text)   to authenticated;
grant execute on function public.rotlinea_hoja_restituir(uuid)      to authenticated;


-- ---------------------------------------------------------------------
-- 5. CON EL NOMBRE DE QUIEN LA GENERÓ Y DE QUIEN LA ANULÓ
--    (las columnas de la anulación van al final: así `create or replace`
--    sirve también sobre la vista de la primera versión)
-- ---------------------------------------------------------------------
create or replace view public.v_rotlinea_hojas
with (security_invoker = true) as
select h.id, h.fecha, h.ruta, h.bytes, h.unidades, h.kg, h.lineas,
       h.elaboro, h.supervisor, h.observaciones,
       h.generado_por, p.nombre as generado_nombre, h.generado_en,
       h.anulada_en, h.anulada_motivo, a.nombre as anulada_nombre
from public.rotlinea_hojas h
left join public.perfiles p on p.id = h.generado_por
left join public.perfiles a on a.id = h.anulada_por;

grant select on public.v_rotlinea_hojas to authenticated;


-- ---------------------------------------------------------------------
-- 6. QUEDÓ ASÍ
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
  if to_regprocedure('public.rotlinea_hoja_anular(uuid, text)') is null then
    v_falta := v_falta || ' · la función para anular'; end if;
  if exists (select 1 from pg_policies where tablename = 'rotlinea_hojas' and cmd = 'DELETE') then
    v_falta := v_falta || ' · quitar el permiso de borrar hojas'; end if;
  if v_falta <> '' then raise exception 'NO QUEDÓ TODO. Falta:%', v_falta; end if;
  raise notice 'LISTO: las hojas del día se guardan tal cual se generan, el administrador las anula con motivo y ninguna se borra.';
end $bloque$;
