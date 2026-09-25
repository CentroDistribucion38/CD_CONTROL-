-- =====================================================================
-- EL SIMULADOR DE CONA — cuánta quiebra me queda disponible este mes
--
-- Dos cifras se escriben a mano y dos salen de ellas:
--
--     CONA              85.166.358   se escribe
--     % Quiebra              2,65%   se escribe
--     ---------------------------------------------
--     Proyección und     2.256.908   = CONA × %
--     Disponible           495.924   = Proyección − quiebra del mes
--
-- Comprobado contra la hoja de Cristian: 85.166.358 × 2,65% da
-- 2.256.908,49, que es el 2.256.908 de la tabla. La resta la hace la
-- plataforma con la quiebra REAL del mes en curso, que ya conoce: en el
-- Excel ese número se copiaba a mano y es donde se desactualiza.
--
-- POR QUÉ SE GUARDA, Y POR MES.
-- El CONA no es una suposición de quien mira: es la cifra con la que se
-- está trabajando el mes. Si viviera solo en la pantalla, cada persona
-- vería un disponible distinto y ninguno sería el bueno. Se guarda una
-- fila por mes y la ve todo el mundo igual.
--
-- El porcentaje va como FRACCIÓN —0,0265 y no 2,65— igual que
-- quiebra_metas. Dos columnas de porcentaje con escalas distintas en la
-- misma base es la forma más fácil de multiplicar por cien de más.
--
-- Correr en el editor SQL de Supabase. Se puede correr dos veces.
-- =====================================================================

create table if not exists public.quiebra_simulador (
  anio            integer not null,
  mes             integer not null check (mes between 1 and 12),

  -- Unidades. El CONA de la hoja son unidades, no cajas ni hectolitros.
  cona            numeric(16,2) not null check (cona >= 0),

  -- Fracción: 0,0265 = 2,65 %. El tope es 1 para que nadie guarde un
  -- 2,65 creyendo que son 2,65 % y termine con un 265 %.
  pct_quiebra     numeric(6,5) not null check (pct_quiebra >= 0 and pct_quiebra <= 1),

  actualizado_por uuid references public.perfiles(id) on delete set null,
  actualizado_en  timestamptz not null default now(),
  primary key (anio, mes)
);

comment on table public.quiebra_simulador is
  'CONA y % de quiebra con los que se está trabajando cada mes. La '
  'proyección y el disponible NO se guardan: se calculan, y guardar algo '
  'que se calcula es guardarse el derecho a que un día no cuadre.';

-- ---------------------------------------------------------------------
-- Quién lo puede tocar.
--
-- Leer, todo el que entre: el disponible es una cifra de operación y
-- media bodega la mira. Escribir, solo quien edita quiebra — es un dato
-- oficial del mes, no una nota personal.
-- ---------------------------------------------------------------------
alter table public.quiebra_simulador enable row level security;

drop policy if exists quiebra_simulador_select on public.quiebra_simulador;
create policy quiebra_simulador_select
  on public.quiebra_simulador for select
  to authenticated
  using (true);

drop policy if exists quiebra_simulador_write on public.quiebra_simulador;
create policy quiebra_simulador_write
  on public.quiebra_simulador for all
  to authenticated
  using (public.es_editor())
  with check (public.es_editor());

grant select, insert, update, delete on public.quiebra_simulador to authenticated;

-- ---------------------------------------------------------------------
-- Guardar el mes.
--
-- Va como función y no como upsert desde la pantalla por una razón
-- concreta: "quién lo actualizó" tiene que salir de la sesión, no de lo
-- que mande el navegador. Si el id del autor viajara en el cuerpo de la
-- petición, cualquiera podría guardar el CONA a nombre de otro.
-- ---------------------------------------------------------------------
create or replace function public.quiebra_simulador_guardar(
  p_anio integer,
  p_mes  integer,
  p_cona numeric,
  p_pct  numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_editor() then
    raise exception 'Guardar el CONA requiere rol de supervisor o administrador';
  end if;
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes inválido: %', p_mes;
  end if;
  if p_cona < 0 then
    raise exception 'El CONA no puede ser negativo';
  end if;
  /* Se rechaza el porcentaje fuera de rango con un mensaje que dice qué
     escala se espera: el error de la restricción diría "check
     constraint violated" y nadie sabría que faltaba dividir entre cien. */
  if p_pct < 0 or p_pct > 1 then
    raise exception 'El %% de quiebra va como fracción (0,0265 = 2,65 %%), y llegó %', p_pct;
  end if;

  insert into public.quiebra_simulador (anio, mes, cona, pct_quiebra, actualizado_por, actualizado_en)
  values (p_anio, p_mes, p_cona, p_pct, auth.uid(), now())
  on conflict (anio, mes) do update
    set cona = excluded.cona,
        pct_quiebra = excluded.pct_quiebra,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;
end $$;

grant execute on function public.quiebra_simulador_guardar(integer, integer, numeric, numeric)
  to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación. Las tres tienen que decir 'ok'.
-- ---------------------------------------------------------------------
do $$
declare
  v_tabla boolean;
  v_fn    boolean;
  v_rls   boolean;
begin
  select exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'quiebra_simulador') into v_tabla;
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'quiebra_simulador_guardar') into v_fn;
  select coalesce(bool_and(c.relrowsecurity), false) into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'quiebra_simulador';

  raise notice 'tabla quiebra_simulador ... %', case when v_tabla then 'ok' else 'MAL' end;
  raise notice 'función guardar ......... %', case when v_fn    then 'ok' else 'MAL' end;
  raise notice 'RLS encendido ........... %', case when v_rls   then 'ok' else 'MAL' end;
end $$;
