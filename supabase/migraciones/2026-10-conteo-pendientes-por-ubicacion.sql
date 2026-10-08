-- =====================================================================
-- LO PENDIENTE DE CADA UBICACIÓN NO SE PIERDE
--
-- «Hoy registré en una ubicación 4 materiales. Mañana, al poner la
--  ubicación, me aparecen los 4 y digo de cada uno si sigue igual o si
--  cambió la cantidad. Y si hoy vuelvo a hacer otro conteo en esa misma
--  ubicación deben aparecer no los 4 sino los 3 que faltan. Para que no
--  se pierda nada.»
--
-- ---------------------------------------------------------------------
-- QUÉ PASABA
-- ---------------------------------------------------------------------
-- `v_conteo_ultimo_por_ubicacion` traía los renglones del ÚLTIMO CONTEO
-- que tocó la ubicación, y nada más. Si mañana se confirmaba UNO de los
-- cuatro, ese conteo quedaba como «el último» con un solo renglón, y los
-- otros tres dejaban de aparecer: se perdían de la pre-anotación aunque
-- seguían ahí.
--
-- ---------------------------------------------------------------------
-- QUÉ HACE AHORA
-- ---------------------------------------------------------------------
-- La vista trae, por cada material de la ubicación (código + vencimiento
-- + estado del envase + avería + PNC), SU ÚLTIMO RENGLÓN, venga del
-- conteo que venga. Con eso:
--
--   · Mañana salen los 4 (cada uno con lo que tenía).
--   · Se confirma uno: su último renglón ahora es el de hoy.
--   · Esa misma tarde, otro conteo en la ubicación: la pantalla ve que
--     uno ya se contó hoy (`linea_dia` = hoy) y muestra los 3 que faltan.
--   · Pasado mañana vuelven a salir los 4, con las cantidades nuevas.
--
-- «Hoy» es el día de Bogotá del renglón (`linea_dia`), no del conteo:
-- un recorrido puede estar abierto varios días.
--
-- ---------------------------------------------------------------------
-- «YA NO ESTÁ»
-- ---------------------------------------------------------------------
-- Si el material salió de la ubicación, arrastrarlo para siempre sería
-- un pendiente que nadie puede cerrar —y un renglón en cero la base no
-- lo acepta—. `conteo_retirados` guarda ese «ya no está»: la vista deja
-- de traer ese material mientras no se vuelva a contar (un renglón más
-- nuevo lo hace reaparecer). Cuelga del conteo, así que si ese conteo
-- se borra, el material vuelve a salir.
--
-- Además la vista trae `saldo` (las cajas sueltas de «estibas + saldo»),
-- que antes se perdían al confirmar «sigue igual», y el total ya lo suma.
--
-- ORDEN: después de 2026-09-conteo-preanotacion.sql y de
-- 2026-09-conteo-saldo.sql. SE PUEDE CORRER VARIAS VECES.
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas' and column_name = 'saldo') then
    raise exception 'Falta supabase/migraciones/2026-09-conteo-saldo.sql. Ese va primero.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas' and column_name = 'estado_envase') then
    raise exception 'Falta supabase/migraciones/2026-09-inventario-fefo.sql. Ese va primero.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1 · LO QUE YA NO ESTÁ EN LA UBICACIÓN
-- ---------------------------------------------------------------------
create table if not exists public.conteo_retirados (
  id            uuid primary key default gen_random_uuid(),
  conteo_id     uuid not null references public.conteos(id) on delete cascade,
  ubicacion_id  uuid not null references public.ubicaciones(id) on delete cascade,
  producto_id   uuid not null references public.productos(id) on delete cascade,
  venc_dia      smallint,
  venc_mes      smallint,
  venc_anio     smallint,
  estado_envase text,
  averia        boolean not null default false,
  pnc           boolean not null default false,
  retirado_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  retirado_en   timestamptz not null default now()
);
create index if not exists conteo_retirados_ubicacion_idx on public.conteo_retirados (ubicacion_id, producto_id);
create index if not exists conteo_retirados_conteo_idx on public.conteo_retirados (conteo_id);

alter table public.conteo_retirados enable row level security;
drop policy if exists conteo_retirados_ver on public.conteo_retirados;
create policy conteo_retirados_ver on public.conteo_retirados for select to authenticated using (true);
drop policy if exists conteo_retirados_poner on public.conteo_retirados;
create policy conteo_retirados_poner on public.conteo_retirados for insert to authenticated with check (true);
drop policy if exists conteo_retirados_quitar on public.conteo_retirados;
create policy conteo_retirados_quitar on public.conteo_retirados for delete to authenticated using (true);

revoke all on public.conteo_retirados from public, anon;
grant select, insert, delete on public.conteo_retirados to authenticated;

comment on table public.conteo_retirados is
  '«Ya no está»: materiales que quien contó dijo que salieron de la ubicación. La pre-anotación deja de traerlos hasta que se vuelvan a contar.';

-- ---------------------------------------------------------------------
-- 2 · LO PENDIENTE DE CADA UBICACIÓN: el último renglón de cada material
--
-- Se borra y se crea de nuevo (y no `create or replace`) porque la
-- vista cambia de forma; nada más depende de ella.
-- ---------------------------------------------------------------------
drop view if exists public.v_conteo_ultimo_por_ubicacion;
create view public.v_conteo_ultimo_por_ubicacion as
with lineas as (
  select
    cl.id              as linea_id,
    cl.ubicacion_id,
    cl.conteo_id,
    c.codigo           as conteo_codigo,
    c.estado::text     as conteo_estado,
    /* CUÁNDO SE CONTÓ ESE RENGLÓN, no cuándo se abrió el conteo. */
    coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) as contado_en,
    cl.producto_id,
    p.sku              as codigo,
    p.nombre           as material,
    p.cajas_por_estiba as factor_estibado,
    cl.estibas, cl.cajas, cl.saldo,
    cl.venc_dia, cl.venc_mes, cl.venc_anio,
    cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota
  from public.conteo_lineas cl
  join public.conteos  c on c.id = cl.conteo_id
  join public.productos p on p.id = cl.producto_id
  where cl.ubicacion_id is not null
    and c.estado::text <> 'anulado'
),
ordenadas as (
  select l.*,
    /* LA LLAVE DE UN MATERIAL EN UNA UBICACIÓN es la misma del índice único
       de los renglones: código, vencimiento, avería, PNC y estado del envase. */
    row_number() over (
      partition by l.ubicacion_id, l.producto_id, l.venc_dia, l.venc_mes, l.venc_anio,
                   coalesce(l.estado_envase, ''), l.averia, l.pnc
      order by l.contado_en desc, l.linea_id desc
    ) as orden
  from lineas l
)
select
  o.linea_id, o.ubicacion_id, o.conteo_id, o.conteo_codigo, o.conteo_estado, o.contado_en,
  o.producto_id, o.codigo, o.material, o.factor_estibado,
  o.estibas, o.cajas, o.venc_dia, o.venc_mes, o.venc_anio,
  o.rotacion, o.averia, o.pnc, o.estado_envase, o.nota,
  (coalesce(o.factor_estibado, 0) * coalesce(o.estibas, 0)
     + coalesce(o.cajas, 0) + coalesce(o.saldo, 0))::bigint as total_cajas,
  o.saldo,
  to_char(o.contado_en at time zone 'America/Bogota', 'YYYY-MM-DD') as linea_dia
from ordenadas o
where o.orden = 1
  and not exists (
    select 1 from public.conteo_retirados r
     where r.ubicacion_id = o.ubicacion_id and r.producto_id = o.producto_id
       and r.venc_dia  is not distinct from o.venc_dia
       and r.venc_mes  is not distinct from o.venc_mes
       and r.venc_anio is not distinct from o.venc_anio
       and coalesce(r.estado_envase, '') = coalesce(o.estado_envase, '')
       and r.averia = o.averia and r.pnc = o.pnc
       and r.retirado_en > o.contado_en);

grant select on public.v_conteo_ultimo_por_ubicacion to authenticated;

comment on view public.v_conteo_ultimo_por_ubicacion is
  'El ÚLTIMO renglón de cada material de cada ubicación, venga del conteo que venga (menos lo que se dijo «ya no está»). Es la pre-anotación: lo contado hoy ya no falta, lo de otros días sigue pendiente.';

-- ---------------------------------------------------------------------
-- QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := '';
begin
  if to_regclass('public.conteo_retirados') is null then v_falta := v_falta || ' · la tabla de lo que ya no está'; end if;
  if to_regclass('public.v_conteo_ultimo_por_ubicacion') is null then v_falta := v_falta || ' · la vista de pendientes'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'v_conteo_ultimo_por_ubicacion' and column_name = 'linea_dia') then
    v_falta := v_falta || ' · el día de cada renglón'; end if;
  if v_falta <> '' then raise exception 'No quedó todo. Falta:%', v_falta; end if;
  raise notice 'LISTO · La pre-anotación arrastra lo pendiente de cada ubicación y no repite lo contado hoy.';
end $$;

commit;
