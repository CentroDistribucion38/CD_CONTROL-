-- =====================================================================
-- ZLDE POR DÍA — lo que hay que correr una vez en el SQL Editor
-- =====================================================================
-- Esto es un RECORTE de supabase/modulos/sider.sql: solo lo que cambió.
-- Correr el archivo completo hace exactamente lo mismo; este recorte
-- existe para no tener que pegar mil líneas.
--
-- Se puede correr varias veces sin romper nada: cada paso comprueba si
-- ya está hecho.
--
-- DESPUÉS DE ESTO hay que REIMPORTAR el archivo de ZLDE de cada mes que
-- se quiera ver por día. Los meses ya cargados no se pierden: quedan con
-- su total mensual puesto en el día 1, así que el informe del mes sigue
-- dando lo mismo, pero un rango de días dentro de ese mes solo mostrará
-- lo que caiga en el día 1 hasta que se reimporte.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- EL DÍA, NO EL MES.
--
-- Se guardaba una fila por MES porque el informe es MTD y el día no
-- hacía falta. Pero el archivo de ZLDE trae la fecha EN CADA LÍNEA —el
-- lector ya la busca para saber de qué mes es— y esa fecha se estaba
-- botando al resumir. Guardándola, el seguimiento se puede pedir por un
-- día, por un rango cualquiera, por un mes o por un año, y el mes deja
-- de ser el único corte posible.
--
-- Sigue siendo diminuto: las 45.374 líneas de un mes se vuelven unos
-- cientos de filas por día, CD, planta y clase, no decenas de miles.
--
-- La columna mes SE QUEDA, derivada de fecha: agrupar por mes es la
-- consulta más común y tenerla ya calculada evita un date_trunc por
-- fila en cada informe.
-- ---------------------------------------------------------------------
alter table public.sider_zlde add column if not exists fecha date;
-- Lo ya cargado tenía el primer día del mes: ese es su fecha.
update public.sider_zlde set fecha = mes where fecha is null;
alter table public.sider_zlde alter column fecha set not null;

-- La llave pasa del mes al día. Se hace en un bloque guardado porque
-- este archivo se corre varias veces y la segunda vez ya está hecho.
do $$ begin
  if exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.sider_zlde'::regclass and c.contype = 'p'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(c.conkey) k join pg_attribute a
                on a.attrelid = c.conrelid and a.attnum = k)
           = array['cd_origen','clase','mes','planta']
  ) then
    alter table public.sider_zlde drop constraint sider_zlde_pkey;
    alter table public.sider_zlde add primary key (fecha, cd_origen, planta, clase);
  end if;
end $$;

-- El seguimiento pide rangos de fechas: sin este índice, cada consulta
-- lee la tabla entera.
create index if not exists sider_zlde_fecha on public.sider_zlde (fecha);

/* DEJA DE SER UNA VISTA Y PASA A SER UNA FUNCIÓN CON RANGO.
   Una vista no recibe parámetros, así que el informe estaba clavado al
   mes: era la única unidad que se podía pedir. Con la fecha guardada por
   día, el corte lo elige quien mira —un día, una semana, del 3 al 17, un
   mes, un año— y eso solo cabe en una función.
   Sigue siendo security invoker (el default): la función no salta el RLS,
   lee con los permisos de quien pregunta, igual que la vista. */
drop view if exists public.v_sider_seguimiento;
drop function if exists public.sider_seguimiento(date, date);

create or replace function public.sider_seguimiento(p_desde date, p_hasta date)
returns table (
  cd_origen text, planta text, aplica_sider boolean, fuera_del_maestro boolean,
  vh_recibidos numeric, vh_bu_mtd numeric, vh_real_mtd numeric, pct_cumplimiento_vh numeric,
  hl_recibido numeric, bu_mtd numeric, real_mtd numeric,
  pct_cumplimiento numeric, pct_certificacion numeric,
  viajes bigint, estibas numeric, lineas_zlde bigint, meta numeric
)
language sql
stable
as $$
with m as (select valor as meta from public.sider_parametros where clave = 'meta_certificacion'),
recibido as (
  /* EL INDICADOR ES ESO: envase retornable que llegó a Barranquilla. No
     es un número mágico escondido en una fórmula —es la definición del
     % de certificación, y es el mismo filtro que tiene tu pivote—. La
     pantalla de ZLDE sí deja moverlo para explorar; el informe no, o
     dejaría de ser el informe. */
  select z.cd_origen,
         sum(z.hl) as hl, sum(z.vh_recibidos) as vh_recibidos, sum(z.lineas) as lineas
    from public.sider_zlde z
   where lower(btrim(z.planta)) = 'barranquilla'
     and lower(btrim(z.clase))  = 'eer'
     and z.fecha between p_desde and p_hasta
   group by 1
),
certificado as (
  select v.cd_origen,
         sum(coalesce(v.hl, 0))    as hl,
         count(*)                  as viajes,
         sum(v.estibas)            as estibas,
         -- Vehículos equivalentes, no renglones: es lo mismo que cuenta
         -- ZLDE del otro lado (estibas ÷ 36). Comparar renglones contra
         -- vehículos daría un porcentaje que no significa nada.
         sum(coalesce(v.sider, 0)) as vh
  from public.v_sider_viajes v
  -- Un viaje anulado no certificó nada. Uno en tránsito sí: la salida ya
  -- quedó certificada con su ubicación y sus fotos, y es lo que la hoja
  -- "Base de Datos" registraba al despachar.
  where v.estado <> 'anulado'
    /* El rango es de FECHAS, y v.fecha es un timestamptz: el día de
       cierre entra completo con < hasta+1, no con <= hasta, que se
       comería las horas de ese día. */
    and v.fecha >= p_desde::timestamptz
    and v.fecha <  (p_hasta + 1)::timestamptz
  group by 1
)
select
  coalesce(r.cd_origen, c.cd_origen)        as cd_origen,
  o.planta,
  coalesce(o.aplica_sider, true)            as aplica_sider,
  -- Un nombre de CD que viene en el archivo de ZLDE y no está en el
  -- maestro: se muestra marcado en vez de descartarlo, porque puede ser
  -- un CD nuevo o un nombre escrito distinto, y las dos cosas hay que
  -- verlas.
  (o.planta is null)                        as fuera_del_maestro,

  -- BLOQUE 1 · VEHÍCULOS
  coalesce(r.vh_recibidos, 0)               as vh_recibidos,
  round(coalesce(r.vh_recibidos, 0) * (select meta from m), 4) as vh_bu_mtd,
  coalesce(c.vh, 0)                         as vh_real_mtd,
  case when coalesce(r.vh_recibidos, 0) * (select meta from m) > 0
       then round(coalesce(c.vh, 0) / (r.vh_recibidos * (select meta from m)), 6)
  end                                       as pct_cumplimiento_vh,

  -- BLOQUE 2 y 3 · HECTOLITROS
  -- En el Excel eran dos bloques con las mismas tres primeras columnas y
  -- solo el porcentaje distinto. Aquí van las tres columnas UNA vez y
  -- los dos porcentajes al lado, que es la misma información sin
  -- repetirla: repetida, el día que una copia se mueva y la otra no,
  -- nadie sabe cuál creer.
  coalesce(r.hl, 0)                         as hl_recibido,
  round(coalesce(r.hl, 0) * (select meta from m), 3) as bu_mtd,
  coalesce(c.hl, 0)                         as real_mtd,
  -- % Cumplimiento: contra la META. Dice si se llegó a lo que tocaba.
  case when coalesce(r.hl, 0) * (select meta from m) > 0
       then round(coalesce(c.hl, 0) / (r.hl * (select meta from m)), 6)
  end                                       as pct_cumplimiento,
  -- % Certificación: contra lo RECIBIDO. Dice qué fracción del envase
  -- que llegó vino certificada. Es el número del informe.
  -- Sin HL recibido no hay contra qué comparar: queda en null y la app
  -- lo pinta neutro. Un 0% ahí diría "no cumpliste" cuando lo cierto es
  -- "no sé".
  case when coalesce(r.hl, 0) > 0
       then round(coalesce(c.hl, 0) / r.hl, 6) end as pct_certificacion,

  coalesce(c.viajes, 0)                     as viajes,
  coalesce(c.estibas, 0)                    as estibas,
  coalesce(r.lineas, 0)                     as lineas_zlde,
  (select meta from m)                      as meta
from recibido r
full join certificado c on c.cd_origen = r.cd_origen
left join public.sider_origenes o on o.cd_origen = coalesce(r.cd_origen, c.cd_origen)
$$;

-- ---------------------------------------------------------------------
-- QUÉ DÍAS TIENEN ALGO.
-- El calendario necesita saberlo para apagar los días vacíos: un
-- calendario que deja tocar cualquier día y contesta "no hay nada" hace
-- buscar a ciegas. Se contestan las dos puntas por separado, porque un
-- día puede tener ZLDE y no viajes o al revés, y las dos cosas son
-- información.
-- ---------------------------------------------------------------------
create or replace view public.v_sider_dias as
with z as (
  select fecha, sum(hl) as hl_zlde
    from public.sider_zlde
   group by 1
),
c as (
  select coalesce(v.fecha::date, v.creado_en::date) as fecha, count(*) as viajes
    from public.sider_viajes v
   where v.estado <> 'anulado'
   group by 1
)
select coalesce(z.fecha, c.fecha)   as fecha,
       coalesce(z.hl_zlde, 0)       as hl_zlde,
       coalesce(c.viajes, 0)::int   as viajes
  from z
  full join c on c.fecha = z.fecha;

create or replace function public.sider_zlde_importar(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses date[];
  n integer := 0;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede importar ZLDE';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No llegó ninguna fila que guardar';
  end if;

  /* SE BORRA POR MES, AUNQUE SE GUARDE POR DÍA.
     Importar un mes REEMPLAZA ese mes: si se borrara solo por los días
     que trae el archivo, un archivo corregido al que le falta el día 7
     dejaría vivo el día 7 viejo, y el total del mes saldría con datos de
     dos importaciones distintas. Se borra el mes completo y se vuelve a
     escribir. */
  select array_agg(distinct date_trunc('month', (f->>'fecha')::date)::date)
    into v_meses
    from jsonb_array_elements(p_filas) f;

  delete from public.sider_zlde where mes = any(v_meses);

  insert into public.sider_zlde
    (fecha, mes, cd_origen, planta, clase, hl, vh_recibidos, lineas, importado_por)
  select (f->>'fecha')::date,
         date_trunc('month', (f->>'fecha')::date)::date,
         btrim(f->>'cd_origen'),
         coalesce(nullif(btrim(f->>'planta'), ''), 'sin planta'),
         coalesce(nullif(btrim(f->>'clase'),  ''), 'sin clase'),
         (f->>'hl')::numeric,
         coalesce((f->>'vh')::numeric, 0),
         coalesce((f->>'lineas')::integer, 0),
         auth.uid()
  from jsonb_array_elements(p_filas) f
  where btrim(coalesce(f->>'cd_origen', '')) <> ''
  -- Si el archivo trae la misma combinación dos veces, se suman en vez
  -- de que la segunda tumbe a la primera sin avisar.
  on conflict (fecha, cd_origen, planta, clase) do update
     set hl           = public.sider_zlde.hl           + excluded.hl,
         vh_recibidos = public.sider_zlde.vh_recibidos + excluded.vh_recibidos,
         lineas       = public.sider_zlde.lineas       + excluded.lineas;

  get diagnostics n = row_count;
  return jsonb_build_object('filas', n, 'meses', to_jsonb(v_meses));
end $$;

-- Los permisos de lo nuevo.
grant select on public.v_sider_dias to authenticated;
grant execute on function public.sider_seguimiento(date, date) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- COMPROBACIÓN. Debe decir "listo" tres veces.
-- ---------------------------------------------------------------------
select 'listo · la columna fecha existe y no admite nulos' as paso
 where exists (select 1 from information_schema.columns
                where table_name = 'sider_zlde' and column_name = 'fecha'
                  and is_nullable = 'NO')
union all
select 'listo · la llave es por dia'
 where exists (select 1 from pg_constraint c
                where c.conrelid = 'public.sider_zlde'::regclass and c.contype = 'p'
                  and (select array_agg(a.attname::text order by a.attname)
                         from unnest(c.conkey) k join pg_attribute a
                           on a.attrelid = c.conrelid and a.attnum = k)
                      = array['cd_origen','clase','fecha','planta'])
union all
select 'listo · la funcion del informe responde'
 where exists (select 1 from pg_proc where proname = 'sider_seguimiento');
