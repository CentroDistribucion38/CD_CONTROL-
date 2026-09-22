-- =====================================================================
-- TRASPASOS · QUÉ CUENTA EN EL CUMPLIMIENTO
-- ---------------------------------------------------------------------
-- «Validación en los viajes de estibas: solo para Arenosa cuenta en el
-- % cumplimiento. Tolvas de vidrio que no cuente en el % cumplimiento.»
--
-- Dos reglas, y las dos viven en el MAESTRO DE TIPOS, no escritas a
-- mano en una consulta:
--
--   cuenta_plan       false = ese tipo no entra en el plan ni en el %.
--                     Se sigue registrando y se ve en los viajes del
--                     día; simplemente no mide. (Tolvas de vidrio.)
--   pregunta_arenosa  true = al registrarlo hay que decir si es de
--                     Arenosa, y SOLO los de Arenosa cuentan en el %.
--                     (Estibas.)
--
-- La respuesta queda en el viaje (`arenosa`), no en la ruta: un viaje
-- de estibas puede ir por cualquier ruta y seguir siendo de Arenosa.
--
-- Lo ya registrado no se toca: los viajes viejos de estibas quedan en
-- `arenosa = false` y dejan de contar. Si alguno sí era de Arenosa, se
-- corrige desde la edición del viaje.
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LAS DOS BANDERAS DEL MAESTRO DE TIPOS
-- ---------------------------------------------------------------------
alter table public.traspasos_tipos
  add column if not exists cuenta_plan      boolean not null default true,
  add column if not exists pregunta_arenosa boolean not null default false;

comment on column public.traspasos_tipos.cuenta_plan is
  'false: se registra pero no entra en el plan ni en el % de cumplimiento.';
comment on column public.traspasos_tipos.pregunta_arenosa is
  'true: al registrarlo se pregunta si es de Arenosa; solo los de Arenosa cuentan.';

/* Las tolvas de vidrio no miden. Se busca por nombre porque el tipo se
   agregó desde el maestro y su clave la puso quien lo creó. */
update public.traspasos_tipos
   set cuenta_plan = false
 where clave ilike '%tolva%' or nombre ilike '%tolva%';

update public.traspasos_tipos
   set pregunta_arenosa = true
 where clave = 'estibas' or nombre ilike 'estiba%';

-- ---------------------------------------------------------------------
-- 2. LA RESPUESTA, EN EL VIAJE
-- ---------------------------------------------------------------------
alter table public.traspasos_viajes
  add column if not exists arenosa boolean not null default false;

comment on column public.traspasos_viajes.arenosa is
  'Viaje de estibas de Arenosa. Solo estos cuentan en el % de cumplimiento.';

create index if not exists traspasos_viajes_arenosa_idx
  on public.traspasos_viajes (fecha, turno) where arenosa;

-- ---------------------------------------------------------------------
-- 3. REGISTRAR: LA MISMA PUERTA, CON LA PREGUNTA
--
-- Se borra la versión anterior antes de crear la nueva: con dos firmas
-- que solo se diferencian en un parámetro con valor por defecto,
-- PostgREST no sabría cuál llamar.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text);

create or replace function public.traspaso_registrar_varios(
  p_fecha     date,
  p_turno     text,
  p_tipos     jsonb,
  p_placa     text,
  p_origen    text,
  p_destino   text,
  p_documento text,
  p_nota      text default null,
  p_arenosa   boolean default false
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_cod text; v_primero text; v_carga integer; v_n int; v_pide boolean;
begin
  if p_tipos is null or jsonb_typeof(p_tipos) <> 'array' or jsonb_array_length(p_tipos) = 0 then
    raise exception 'Hay que escoger al menos un tipo de viaje.';
  end if;

  /* NINGÚN TIPO REPETIDO. Dos veces el mismo tipo en el mismo viaje
     haría que el plan de ese tipo avanzara dos con un solo camión. */
  select count(*) into v_n from (
    select distinct lower(btrim(e->>'tipo')) as t
      from jsonb_array_elements(p_tipos) e
     where nullif(btrim(coalesce(e->>'tipo', '')), '') is not null
  ) x;
  if v_n <> jsonb_array_length(p_tipos) then
    raise exception 'Hay un tipo repetido o vacío en la lista. Cada tipo va una sola vez.';
  end if;

  v_primero := btrim(p_tipos->0->>'tipo');
  v_carga   := nullif(p_tipos->0->>'cantidad', '')::integer;

  /* ¿ALGUNO DE LOS TIPOS PREGUNTA POR ARENOSA? Si ninguno, la respuesta
     se ignora: marcar «de Arenosa» un viaje de casco no significa nada. */
  select bool_or(t.pregunta_arenosa) into v_pide
    from public.traspasos_tipos t
   where t.clave in (select btrim(e->>'tipo') from jsonb_array_elements(p_tipos) e);

  select r.id, r.codigo into v_id, v_cod
    from public.traspaso_registrar(
      p_fecha, p_turno, v_primero, p_placa, p_origen, p_destino,
      1, false, v_carga, null, p_nota, p_documento) r;

  insert into public.traspasos_viaje_tipos (viaje_id, tipo, cantidad)
  select v_id, btrim(e->>'tipo'), nullif(e->>'cantidad', '')::integer
    from jsonb_array_elements(p_tipos) e
  on conflict (viaje_id, tipo) do update set cantidad = excluded.cantidad;

  if coalesce(v_pide, false) and coalesce(p_arenosa, false) then
    update public.traspasos_viajes set arenosa = true where traspasos_viajes.id = v_id;
  end if;

  return query select v_id, v_cod;
end $$;

revoke all on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text, boolean) from public;
grant execute on function public.traspaso_registrar_varios(date, text, jsonb, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. EL CONTROL, CON LAS DOS REGLAS
--
-- Se filtra en `lineas`, que es donde cada viaje se abre por tipo: un
-- camión con casco Y estibas cuenta su casco siempre, y sus estibas
-- solo si el viaje es de Arenosa.
--
-- Los tipos que no miden salen de la vista entera —también del plan—:
-- dejarlos con «planeado 3, cumplido 0» pintaría un 0 % que no es
-- verdad, y eso es peor que no mostrarlos.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_control as
with plan as (
  select fecha, turno, tipo, planeado, nota, id as plan_id
    from public.traspasos_plan
   where estado = 'registrado' and publicado
),
lineas as (
  select v.id, v.fecha, v.turno, v.placa, v.viajes,
         coalesce(vt.tipo, v.tipo)          as tipo,
         coalesce(vt.cantidad, case when vt.tipo is null then v.carga end) as carga
    from public.traspasos_viajes v
    left join public.traspasos_viaje_tipos vt on vt.viaje_id = v.id
    join public.traspasos_tipos t on t.clave = coalesce(vt.tipo, v.tipo)
   where v.estado = 'registrado' and not v.vacio
     and t.cuenta_plan                                   -- tolvas de vidrio, fuera
     and (not t.pregunta_arenosa or v.arenosa)           -- estibas, solo Arenosa
),
real as (
  select fecha, turno, tipo,
         sum(viajes)::int             as cumplido,
         count(*)::int                as registros,
         coalesce(sum(carga), 0)::int as carga,
         count(distinct placa)::int   as placas
    from lineas
   group by fecha, turno, tipo
)
select
  coalesce(p.fecha, r.fecha)   as fecha,
  coalesce(p.turno, r.turno)   as turno,
  public.traspaso_orden_turno(coalesce(p.turno, r.turno)) as turno_orden,
  coalesce(p.tipo,  r.tipo)    as tipo,
  t.nombre                     as tipo_nombre,
  t.orden                      as tipo_orden,
  p.plan_id,
  coalesce(p.planeado, 0)      as planeado,
  coalesce(pv.vacios, 0)       as vacios_planeados,
  p.nota,
  coalesce(r.cumplido, 0)      as cumplido,
  coalesce(r.registros, 0)     as registros,
  coalesce(r.carga, 0)         as carga,
  coalesce(r.placas, 0)        as placas,
  least(coalesce(r.cumplido, 0), coalesce(p.planeado, 0))          as adheridos,
  greatest(coalesce(r.cumplido, 0) - coalesce(p.planeado, 0), 0)   as adicionales,
  greatest(coalesce(p.planeado, 0) - coalesce(r.cumplido, 0), 0)   as faltan,
  (p.plan_id is null)          as sin_planear,
  case when coalesce(p.planeado, 0) = 0 then null
       else least(round(100.0 * least(coalesce(r.cumplido, 0), p.planeado) / p.planeado)::int, 100)
  end                          as adherencia,
  case when coalesce(p.planeado, 0) = 0 then null
       else round(100.0 * coalesce(r.cumplido, 0) / p.planeado)::int
  end                          as cumplimiento
from plan p
full join real r
  on r.fecha = p.fecha and r.turno = p.turno and r.tipo = p.tipo
join public.traspasos_tipos t on t.clave = coalesce(p.tipo, r.tipo)
left join public.traspasos_plan_vacios pv
  on pv.fecha = coalesce(p.fecha, r.fecha) and pv.turno = coalesce(p.turno, r.turno)
where t.cuenta_plan;

grant select on public.v_traspasos_control to authenticated;

do $$
declare n_t int; n_e int;
begin
  select count(*) into n_t from public.traspasos_tipos where not cuenta_plan;
  select count(*) into n_e from public.traspasos_tipos where pregunta_arenosa;
  raise notice 'LISTO: % tipo(s) no miden en el cumplimiento, % pregunta(n) por Arenosa.', n_t, n_e;
end $$;
commit;
