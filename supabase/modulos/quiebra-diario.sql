-- =====================================================================
-- CONTROL · MÓDULO QUIEBRA — TABLERO DIARIO
-- Requiere: supabase/00-nucleo.sql y supabase/modulos/quiebra.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
--
-- POR QUÉ EXISTE ESTO
-- El tablero grande vive de lo importado de SAP. Pero el día a día no
-- espera al maestro: a las 6 a.m. hay que reportar la quiebra de ayer y
-- el archivo todavía no está, o llega incompleto, o la producción del
-- turno 3 se cargó tarde. Entonces alguien la escribe a mano.
--
-- LA REGLA QUE ORDENA TODO
-- Lo escrito a mano NO vive en las mismas tablas que lo importado.
-- quiebra_bajas y quiebra_produccion siguen siendo el reflejo exacto de
-- SAP y la importación las puede borrar y rehacer sin miedo. Lo que se
-- escribe a mano vive aquí, en su propia tabla, y por eso una
-- importación NUNCA lo pisa: son dos capas, no una sola casilla que se
-- pelean dos procesos.
--
-- Al leer, manda el dato escrito a mano y la app muestra las dos cifras
-- lado a lado con el aviso de que no coinciden. Nadie pierde su trabajo
-- en silencio, y nadie se queda sin saber que SAP dice otra cosa.
--
-- Un valor nulo (o una fila que no existe) significa "no lo escribí:
-- usa lo de SAP". Borrar el dato manual es volver a lo importado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La cabecera del día
--    le_*  = Latest Estimate: lo que el plan decía para ese día.
--            Nunca viene de SAP; solo se escribe a mano.
--    produccion = solo se llena si hay que corregir lo importado.
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_diario (
  fecha           date primary key,
  le_produccion   numeric(16,3),
  le_baja         numeric(16,3),
  produccion      numeric(16,3),
  -- Baja TOTAL del día escrita a mano, sin repartir por causal. La hoja
  -- SIMULADOR solo tiene un "Losses T1" por día, así que hay que poder
  -- escribir el total suelto. Si además se escribe el desglose por
  -- causal, el desglose gana: es más específico.
  baja            numeric(16,3),
  nota            text,
  actualizado_por uuid references public.perfiles(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

-- Por si la tabla ya existía sin la columna.
alter table public.quiebra_diario add column if not exists baja numeric(16,3);

-- ---------------------------------------------------------------------
-- 2. La pérdida del día, abierta por causal
--    Una fila por causal escrita a mano. Las causales que no estén aquí
--    se leen de lo importado.
-- ---------------------------------------------------------------------
create table if not exists public.quiebra_diario_causal (
  fecha    date not null references public.quiebra_diario(fecha) on delete cascade,
  causal   text not null,
  cantidad numeric(16,3) not null,
  primary key (fecha, causal)
);

create index if not exists quiebra_diario_causal_fecha_idx
  on public.quiebra_diario_causal (fecha);

-- Solo las siete causales que existen. Es la MISMA lista cerrada a la que
-- normaliza la importación (normalizarCausal), donde todo lo desconocido
-- cae en "Otros".
--
-- Sin esta reja, una causal mal escrita se guardaba igual y quedaba
-- sumando al total del día sin salir en ninguna fila de la pantalla: la
-- cifra no cuadraba y no había dónde verlo. Es mejor que reviente aquí.
-- Si algún día se agrega una causal en el código, hay que agregarla acá.
alter table public.quiebra_diario_causal
  drop constraint if exists quiebra_diario_causal_conocida;
alter table public.quiebra_diario_causal
  add constraint quiebra_diario_causal_conocida check (causal in (
    'Sorting distribución', 'Presorting', 'Rotura máquina', 'Rotura depósito',
    'Sorting envase', 'Lavado / extrasucio', 'Otros'
  ));

-- ---------------------------------------------------------------------
-- 3. Vistas de lectura
-- ---------------------------------------------------------------------

-- Lo importado, por día y causal. La tenía el tablero grande calculada
-- en el navegador; el diario la necesita ya sumada.
create or replace view public.v_quiebra_dia_causal as
select fecha, causal, sum(cantidad) as unidades
from public.quiebra_bajas
group by 1, 2;

-- El día resuelto: qué dice SAP, qué se escribió a mano y qué manda.
create or replace view public.v_quiebra_diario as
with sap as (
  select
    coalesce(p.fecha, b.fecha)  as fecha,
    coalesce(p.prod, 0)         as sap_produccion,
    coalesce(b.perd, 0)         as sap_baja
  from      (select fecha, sum(cantidad) prod from public.quiebra_produccion group by 1) p
  full join (select fecha, sum(cantidad) perd from public.quiebra_bajas      group by 1) b
         on b.fecha = p.fecha
),
manual as (
  select d.fecha, d.le_produccion, d.le_baja, d.produccion, d.nota,
         d.actualizado_por, d.actualizado_en,
         d.baja as baja_total,
         (select sum(c.cantidad) from public.quiebra_diario_causal c where c.fecha = d.fecha) as baja_causales,
         (select count(*)        from public.quiebra_diario_causal c where c.fecha = d.fecha) as causales_manuales
  from public.quiebra_diario d
)
select
  coalesce(s.fecha, m.fecha)                             as fecha,
  s.sap_produccion,
  s.sap_baja,
  m.produccion                                           as manual_produccion,
  m.baja_total                                           as manual_baja_total,
  m.baja_causales                                        as manual_baja_causales,
  coalesce(m.baja_causales, m.baja_total)                as manual_baja,
  m.le_produccion,
  m.le_baja,
  m.nota,
  m.actualizado_por,
  m.actualizado_en,
  coalesce(m.causales_manuales, 0)                       as causales_manuales,
  -- Tres niveles, de lo más específico a lo más general:
  --   desglose por causal  >  total escrito a mano  >  lo de SAP
  coalesce(m.produccion, s.sap_produccion, 0)                            as produccion,
  coalesce(m.baja_causales, m.baja_total, s.sap_baja, 0)                 as baja,
  case when coalesce(m.produccion, s.sap_produccion, 0) > 0
       then coalesce(m.baja_causales, m.baja_total, s.sap_baja, 0)
          / coalesce(m.produccion, s.sap_produccion)
  end                                                                    as pct
from sap s
full join manual m on m.fecha = s.fecha;

-- El año mes por mes, ya con lo escrito aplicado. Es la segunda tabla
-- de la hoja SIMULADOR: METAS / Producción / Losses / % Losses.
create or replace view public.v_quiebra_diario_mes as
select
  date_trunc('month', fecha)::date            as mes,
  extract(year  from fecha)::int              as anio,
  extract(month from fecha)::int              as num_mes,
  sum(produccion)                             as produccion,
  sum(baja)                                   as baja,
  case when sum(produccion) > 0
       then sum(baja) / sum(produccion) end   as pct,
  count(*) filter (where causales_manuales > 0
                      or manual_produccion is not null
                      or manual_baja_total is not null) as dias_escritos
from public.v_quiebra_diario
where fecha is not null
group by 1, 2, 3;

-- ---------------------------------------------------------------------
-- 4. Guardar un día — una sola llamada, todo o nada
--    p_causales llega como {"Presorting": 1200, "Rotura máquina": 340}.
--    Un objeto vacío borra el desglose manual del día.
--    Un campo en null borra ese dato manual (vuelve a mandar SAP).
-- ---------------------------------------------------------------------
create or replace function public.quiebra_diario_guardar(
  p_fecha         date,
  p_le_produccion numeric,
  p_le_baja       numeric,
  p_produccion    numeric,
  p_nota          text,
  p_causales      jsonb,
  p_baja          numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raras text;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede editar el diario';
  end if;

  insert into public.quiebra_diario as d
    (fecha, le_produccion, le_baja, produccion, baja, nota, actualizado_por, actualizado_en)
  values
    (p_fecha, p_le_produccion, p_le_baja, p_produccion, p_baja,
     nullif(btrim(p_nota), ''), auth.uid(), now())
  on conflict (fecha) do update set
    le_produccion   = excluded.le_produccion,
    le_baja         = excluded.le_baja,
    produccion      = excluded.produccion,
    baja            = excluded.baja,
    nota            = excluded.nota,
    actualizado_por = excluded.actualizado_por,
    actualizado_en  = excluded.actualizado_en;

  delete from public.quiebra_diario_causal where fecha = p_fecha;

  if p_causales is not null and jsonb_typeof(p_causales) = 'object' then
    -- Se avisa con nombre y apellido antes de que reviente la reja de la
    -- tabla: "violates check constraint" no le dice nada a nadie.
    select string_agg(k, ', ') into v_raras
    from jsonb_each(p_causales) as e(k, v)
    where k not in (
      'Sorting distribución', 'Presorting', 'Rotura máquina', 'Rotura depósito',
      'Sorting envase', 'Lavado / extrasucio', 'Otros'
    );
    if v_raras is not null then
      raise exception 'Causal desconocida: %. La app y la base están desfasadas.', v_raras;
    end if;

    insert into public.quiebra_diario_causal (fecha, causal, cantidad)
    select p_fecha, k, (v #>> '{}')::numeric
    from jsonb_each(p_causales) as e(k, v)
    where v is not null and jsonb_typeof(v) = 'number';
  end if;

  -- Un día sin nada escrito no tiene por qué quedar ocupando fila: así
  -- "borrar todo" devuelve el día a ser exactamente lo que dice SAP.
  delete from public.quiebra_diario d
   where d.fecha = p_fecha
     and d.le_produccion is null and d.le_baja is null
     and d.produccion is null and d.baja is null and d.nota is null
     and not exists (select 1 from public.quiebra_diario_causal c where c.fecha = d.fecha);
end $$;

-- ---------------------------------------------------------------------
-- 4b. Guardar VARIOS días de un golpe — la rejilla del mes
--     Llega como un arreglo:
--       [{"fecha":"2026-08-01","produccion":3442118,"baja":55000,
--         "causales":{"Presorting":1200}}, ...]
--     Todo o nada: si un día revienta, no se guarda ninguno. La rejilla
--     deja tocar treinta días antes de darle a Guardar, y guardar la
--     mitad sería peor que no guardar nada.
--
--     Solo se tocan las claves que vengan. Un día que traiga
--     "produccion": null borra ese dato manual; un día que no traiga la
--     clave "produccion" la deja como estaba.
-- ---------------------------------------------------------------------
create or replace function public.quiebra_diario_guardar_lote(p_dias jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia   jsonb;
  v_fecha date;
  v_n     integer := 0;
  v_raras text;
begin
  if not public.es_editor() then
    raise exception 'Solo un supervisor o administrador puede editar el diario';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' then
    raise exception 'Se esperaba un arreglo de días';
  end if;

  for v_dia in select * from jsonb_array_elements(p_dias) loop
    v_fecha := (v_dia->>'fecha')::date;
    if v_fecha is null then
      raise exception 'Un día del lote llegó sin fecha';
    end if;

    -- Las causales se validan ANTES de escribir nada, para que el error
    -- salga con nombre y apellido y no como "violates check constraint".
    if v_dia ? 'causales' and jsonb_typeof(v_dia->'causales') = 'object' then
      select string_agg(k, ', ') into v_raras
      from jsonb_each(v_dia->'causales') as e(k, v)
      where k not in (
        'Sorting distribución', 'Presorting', 'Rotura máquina', 'Rotura depósito',
        'Sorting envase', 'Lavado / extrasucio', 'Otros'
      );
      if v_raras is not null then
        raise exception 'Causal desconocida en %: %. La app y la base están desfasadas.',
          v_fecha, v_raras;
      end if;
    end if;

    insert into public.quiebra_diario as d
      (fecha, le_produccion, le_baja, produccion, baja, nota, actualizado_por, actualizado_en)
    values (
      v_fecha,
      nullif(v_dia->>'le_produccion', '')::numeric,
      nullif(v_dia->>'le_baja', '')::numeric,
      nullif(v_dia->>'produccion', '')::numeric,
      nullif(v_dia->>'baja', '')::numeric,
      nullif(btrim(coalesce(v_dia->>'nota', '')), ''),
      auth.uid(), now()
    )
    on conflict (fecha) do update set
      le_produccion   = case when v_dia ? 'le_produccion'
                             then nullif(v_dia->>'le_produccion', '')::numeric
                             else d.le_produccion end,
      le_baja         = case when v_dia ? 'le_baja'
                             then nullif(v_dia->>'le_baja', '')::numeric
                             else d.le_baja end,
      produccion      = case when v_dia ? 'produccion'
                             then nullif(v_dia->>'produccion', '')::numeric
                             else d.produccion end,
      baja            = case when v_dia ? 'baja'
                             then nullif(v_dia->>'baja', '')::numeric
                             else d.baja end,
      nota            = case when v_dia ? 'nota'
                             then nullif(btrim(coalesce(v_dia->>'nota', '')), '')
                             else d.nota end,
      actualizado_por = auth.uid(),
      actualizado_en  = now();

    if v_dia ? 'causales' then
      delete from public.quiebra_diario_causal where fecha = v_fecha;
      if jsonb_typeof(v_dia->'causales') = 'object' then
        insert into public.quiebra_diario_causal (fecha, causal, cantidad)
        select v_fecha, k, (v #>> '{}')::numeric
        from jsonb_each(v_dia->'causales') as e(k, v)
        where v is not null and jsonb_typeof(v) = 'number';
      end if;
    end if;

    v_n := v_n + 1;
  end loop;

  -- Los días que quedaron sin nada escrito no tienen por qué ocupar
  -- fila: así "borrar todo" devuelve el día a ser lo que dice SAP.
  delete from public.quiebra_diario d
   where d.le_produccion is null and d.le_baja is null
     and d.produccion is null and d.baja is null and d.nota is null
     and not exists (select 1 from public.quiebra_diario_causal c where c.fecha = d.fecha);

  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 5. RLS — todos leen, solo editores escriben
-- ---------------------------------------------------------------------
alter table public.quiebra_diario        enable row level security;
alter table public.quiebra_diario_causal enable row level security;

do $$
declare t text;
begin
  foreach t in array array['quiebra_diario','quiebra_diario_causal'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.es_editor()) with check (public.es_editor())',
      t||'_write', t);
  end loop;
end $$;

grant select on
  public.v_quiebra_dia_causal, public.v_quiebra_diario, public.v_quiebra_diario_mes
to authenticated;
grant execute on function
  public.quiebra_diario_guardar(date, numeric, numeric, numeric, text, jsonb, numeric)
to authenticated;
grant execute on function public.quiebra_diario_guardar_lote(jsonb) to authenticated;
