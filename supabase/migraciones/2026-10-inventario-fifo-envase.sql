-- =====================================================================
-- INVENTARIO · FECHA DEL ENVASE AUTOMÁTICA: FABRICACIÓN = RECEPCIÓN, Y
-- EL VENCIMIENTO CALCULADO
--
-- «Eso lo va a pedir la auditoría: fue uno de los hallazgos de la pasada.
--  Que los pelados no ingresen la fecha. Con lo que está, pon la de HOY.
--  Se pone fecha de fabricación, que sería la de la recepción, y la de
--  vencimiento se debe calcular. En el registro de conteo eso siempre se
--  generará automático: no lo tomaremos ni nada.»
--
-- LA REGLA (la hace la base, no la pantalla: nadie la puede saltar ni olvidar)
--   Cada renglón de ENVASE con ubicación lleva su fecha de RECEPCIÓN
--   (`fecha_fifo`), que se muestra como FABRICACIÓN:
--   · Si en esa misma ubicación ya estaba ese material (su renglón anterior,
--     de cualquier conteo no anulado) y nadie dijo «Ya no está» después,
--     HEREDA su fecha: «Sigue igual» o «Cambió cantidad» no la tocan, suba o
--     baje la cantidad.
--   · Si no estaba (nuevo ahí, «Otro SKU», o volvió después de un «Ya no
--     está»), su fecha es la DEL DÍA del conteo (hora de Colombia).
--   VENCIMIENTO = recepción + vida útil del material en el Maestro (igual que
--   el producto). Si el envase no tiene vida útil en el Maestro, el
--   vencimiento queda vacío hasta que se la pongan: la recepción sí queda.
--
-- LO YA CONTADO arranca con la fecha de HOY (el día que se corre esto), y
-- de ahí en adelante corre la regla.
--
-- Se guarda aparte de las casillas de vencimiento del renglón (no toca la
-- llave única ni la suma de lo repetido). Producto no cambia: sigue con
-- la fecha que se teclea. Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.conteo_lineas add column if not exists fecha_fifo date;
comment on column public.conteo_lineas.fecha_fifo is
  'FIFO del envase: desde qué día está ese material en esa ubicación. La pone la base (trigger), nadie la escribe.';
create index if not exists conteo_lineas_ubic_prod_idx on public.conteo_lineas (ubicacion_id, producto_id);

-- ---------------------------------------------------------------------
-- 1 · LA REGLA
-- ---------------------------------------------------------------------
create or replace function public.conteo_fifo_para(
  p_id uuid, p_ubic uuid, p_prod uuid,
  p_vd smallint, p_vm smallint, p_va smallint,
  p_estado text, p_averia boolean, p_pnc boolean, p_cuando timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dia date := (coalesce(p_cuando, now()) at time zone 'America/Bogota')::date;
  v_fifo date; v_en timestamptz; v_hay boolean := false;
begin
  if p_ubic is null or p_prod is null then return v_dia; end if;
  if coalesce((select tipo_material from public.productos where id = p_prod), '') <> 'ENVASE' then
    return null;
  end if;

  /* 1) El mismo material con la misma llave (estado, avería, PNC, vencimiento). */
  select coalesce(cl.fecha_fifo, (coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) at time zone 'America/Bogota')::date),
         coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en)
    into v_fifo, v_en
    from public.conteo_lineas cl
    join public.conteos c on c.id = cl.conteo_id
   where cl.ubicacion_id = p_ubic and cl.producto_id = p_prod and cl.id <> p_id
     and c.estado::text <> 'anulado'
     and coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) <= coalesce(p_cuando, now())
     and cl.venc_dia is not distinct from p_vd and cl.venc_mes is not distinct from p_vm
     and cl.venc_anio is not distinct from p_va
     and coalesce(cl.estado_envase, '') = coalesce(p_estado, '')
     and cl.averia = coalesce(p_averia, false) and cl.pnc = coalesce(p_pnc, false)
   order by coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) desc, cl.id desc
   limit 1;
  if found then
    v_hay := not exists (
      select 1 from public.conteo_retirados r
       where r.ubicacion_id = p_ubic and r.producto_id = p_prod
         and r.venc_dia is not distinct from p_vd and r.venc_mes is not distinct from p_vm
         and r.venc_anio is not distinct from p_va
         and coalesce(r.estado_envase, '') = coalesce(p_estado, '')
         and r.averia = coalesce(p_averia, false) and r.pnc = coalesce(p_pnc, false)
         and r.retirado_en > v_en and r.retirado_en <= coalesce(p_cuando, now()));
  end if;

  /* 2) Si no, el mismo material en esa ubicación con cualquier estado. */
  if not v_hay then
    select coalesce(cl.fecha_fifo, (coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) at time zone 'America/Bogota')::date),
           coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en)
      into v_fifo, v_en
      from public.conteo_lineas cl
      join public.conteos c on c.id = cl.conteo_id
     where cl.ubicacion_id = p_ubic and cl.producto_id = p_prod and cl.id <> p_id
       and c.estado::text <> 'anulado'
       and coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) <= coalesce(p_cuando, now())
     order by coalesce(cl.contado_en, c.cerrado_en, c.iniciado_en, c.creado_en) desc, cl.id desc
     limit 1;
    if found then
      v_hay := not exists (
        select 1 from public.conteo_retirados r
         where r.ubicacion_id = p_ubic and r.producto_id = p_prod
           and r.retirado_en > v_en and r.retirado_en <= coalesce(p_cuando, now()));
    end if;
  end if;

  if v_hay and v_fifo is not null then return least(v_fifo, v_dia); end if;
  return v_dia;
end $$;
revoke all on function public.conteo_fifo_para(uuid, uuid, uuid, smallint, smallint, smallint, text, boolean, boolean, timestamptz) from public, anon;

-- ---------------------------------------------------------------------
-- 2 · LA PONE LA BASE AL GUARDAR CADA RENGLÓN
--   Al agregar, siempre. Al corregir, solo si cambió la ubicación o el
--   material (corregir la cantidad o el estado no le cambia la fecha).
-- ---------------------------------------------------------------------
create or replace function public.conteo_lineas_fifo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /* Al corregir un renglón sin cambiarle la ubicación ni el material, la fecha se queda
     (corregir la cantidad o el estado no la mueve). */
  if tg_op = 'UPDATE'
     and new.ubicacion_id is not distinct from old.ubicacion_id
     and new.producto_id = old.producto_id
     and new.fecha_fifo is not null then
    return new;
  end if;
  new.fecha_fifo := public.conteo_fifo_para(new.id, new.ubicacion_id, new.producto_id,
    new.venc_dia, new.venc_mes, new.venc_anio, new.estado_envase, new.averia, new.pnc,
    coalesce(new.contado_en, now()));
  return new;
end $$;

drop trigger if exists conteo_lineas_fifo on public.conteo_lineas;
create trigger conteo_lineas_fifo
  before insert or update on public.conteo_lineas
  for each row execute function public.conteo_lineas_fifo();

-- ---------------------------------------------------------------------
-- 3 · LO YA CONTADO ARRANCA CON LA FECHA DE HOY
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  update public.conteo_lineas cl
     set fecha_fifo = (now() at time zone 'America/Bogota')::date
    from public.productos p
   where p.id = cl.producto_id and p.tipo_material = 'ENVASE'
     and cl.fecha_fifo is distinct from (now() at time zone 'America/Bogota')::date;
  get diagnostics n = row_count;
  raise notice 'Lo ya contado: % renglones de envase quedan con la fecha de hoy.', n;
end $$;

-- ---------------------------------------------------------------------
-- 4 · LAS VISTAS LA TRAEN (al final, sin mover las columnas de antes)
-- ---------------------------------------------------------------------
create or replace view public.v_conteo_fefo as
select
  cl.id, cl.conteo_id, c.codigo as conteo, c.estado, c.tipo,
  cl.producto_id,
  p.sku as codigo, p.nombre as material, p.tipo_material, p.familia, p.vida_util,
  p.cajas_por_estiba as factor_estibado,
  cl.ubicacion_id, u.clave as ubicacion, u.calle, u.modulo, u.lado, u.capacidad,
  cl.estibas, cl.cajas, cl.saldo,

  (coalesce(p.cajas_por_estiba, 0) * coalesce(cl.estibas, 0)
     + coalesce(cl.cajas, 0)
     + coalesce(cl.saldo, 0))::bigint as total_cajas,
  coalesce(cl.estibas, 0) as total_estibas,

  cl.venc_dia, cl.venc_mes, cl.venc_anio,
  cl.fab_dia, cl.fab_mes, cl.fab_anio,
  /* EL ENVASE: fabricación = su recepción (la pone la base) y vencimiento = recepción + vida útil. */
  f.fab as fabricacion,
  f.ven as vencimiento,
  (f.ven - current_date)::integer as dias_para_vencer,
  (f.ven - current_date - coalesce(p.dias_minimo, 0))::integer as dias_para_salir,

  cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota,
  u.clave as ubicacion_texto,
  u.clave
    || case when cl.averia then ' AVERIA' else '' end
    || case when cl.pnc then ' PNC' else '' end
    || case when cl.estado_envase is null then '' else ' ' || cl.estado_envase end
    || case when cl.nota is null or cl.nota = '' then '' else ' ' || cl.nota end
    as ubicacion_combinada,
  cl.cantidad_teorica, cl.cantidad_contada,
  cl.contado_por, per.nombre as conto, cl.contado_en,
  /* FIFO DEL ENVASE: desde cuándo está ese material en esa posición, y cuántos días lleva. */
  cl.fecha_fifo,
  case when cl.fecha_fifo is null then null::integer
       else (now() at time zone 'America/Bogota')::date - cl.fecha_fifo end as dias_en_posicion
from public.conteo_lineas cl
join public.conteos c on c.id = cl.conteo_id
join public.productos p on p.id = cl.producto_id
left join public.ubicaciones u on u.id = cl.ubicacion_id
left join public.perfiles per on per.id = cl.contado_por
left join lateral (
  select
    case when cl.fab_anio is not null
           then make_date(2000 + cl.fab_anio, cl.fab_mes::integer, cl.fab_dia::integer)
         when p.tipo_material = 'ENVASE' then cl.fecha_fifo end as fab,
    case when cl.venc_anio is not null
           then make_date(2000 + cl.venc_anio, cl.venc_mes::integer, cl.venc_dia::integer)
         when p.tipo_material = 'ENVASE' and cl.fecha_fifo is not null and coalesce(p.vida_util, 0) > 0
           then cl.fecha_fifo + p.vida_util end as ven
) f on true;

grant select on public.v_conteo_fefo to authenticated;

create or replace view public.v_conteo_ultimo_por_ubicacion as
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
    cl.rotacion, cl.averia, cl.pnc, cl.estado_envase, cl.nota,
    cl.fecha_fifo
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
  to_char(o.contado_en at time zone 'America/Bogota', 'YYYY-MM-DD') as linea_dia,
  o.fecha_fifo
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

-- ---------------------------------------------------------------------
-- 5 · COMPROBACIÓN — SE PARA, NO AVISA
-- ---------------------------------------------------------------------
do $$
declare v_sin int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'v_conteo_fefo' and column_name = 'fecha_fifo') then
    raise exception 'v_conteo_fefo no trae la fecha FIFO.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'conteo_lineas_fifo') then
    raise exception 'Falta el trigger que pone la fecha FIFO.';
  end if;
  select count(*) into v_sin from public.conteo_lineas cl join public.productos p on p.id = cl.producto_id
   where p.tipo_material = 'ENVASE' and cl.fecha_fifo is null;
  if v_sin > 0 then raise exception 'Quedaron % renglones de envase sin fecha FIFO.', v_sin; end if;
  raise notice 'LISTO · El envase lleva su fecha sola: fabricación = recepción (hereda la de su posición o entra con la del día) y vencimiento = recepción + vida útil.';
end $$;

commit;
