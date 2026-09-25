-- =====================================================================
-- LA QUIEBRA DEL MES, TAMBIÉN A MANO
--
-- Antes el simulador restaba la quiebra que la plataforma ya conoce. Se
-- agrega poder escribirla: hay meses en los que lo importado todavía no
-- está completo —falta subir el archivo, o faltan días del diario— y el
-- disponible salía mostrando la proyección entera, como si no se hubiera
-- roto nada.
--
--     CONA              se escribe
--     % Quiebra         se escribe
--     Quiebra del mes   se escribe  (si se deja en blanco, la de la app)
--     ---------------------------------------------------------------
--     Proyección und    = CONA × %
--     Disponible        = Proyección − Quiebra del mes
--
-- POR QUÉ NULL Y NO UN CERO.
-- La columna admite null a propósito, y null NO significa "cero": quiere
-- decir "no lo escribí, usa la que sabe la plataforma". Un cero sí es un
-- cero, y es un dato válido —un mes sin una sola unidad rota—. Si null y
-- cero fueran lo mismo, no habría forma de decir "este mes de verdad no
-- se rompió nada" sin que la pantalla lo pisara con lo importado.
--
-- Correr DESPUÉS de 2026-09-simulador-cona.sql. Se puede correr dos veces.
-- =====================================================================

alter table public.quiebra_simulador
  add column if not exists baja_manual numeric(16,2) check (baja_manual is null or baja_manual >= 0);

comment on column public.quiebra_simulador.baja_manual is
  'Quiebra del mes escrita a mano. NULL = usar la que calcula la '
  'plataforma. Cero es un dato: significa que no se rompió nada.';

-- ---------------------------------------------------------------------
-- La función de guardar pasa a recibir cuatro valores.
--
-- Se BORRA la de cuatro argumentos antes de crear la de cinco. "create
-- or replace" con otra cantidad de argumentos no reemplaza: crea una
-- SEGUNDA función con el mismo nombre, y entonces PostgREST tiene que
-- adivinar cuál llamar. Adivina mal el día menos pensado.
-- ---------------------------------------------------------------------
drop function if exists public.quiebra_simulador_guardar(integer, integer, numeric, numeric);

create or replace function public.quiebra_simulador_guardar(
  p_anio integer,
  p_mes  integer,
  p_cona numeric,
  p_pct  numeric,
  p_baja numeric default null
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
  if p_baja is not null and p_baja < 0 then
    raise exception 'La quiebra del mes no puede ser negativa';
  end if;

  insert into public.quiebra_simulador
    (anio, mes, cona, pct_quiebra, baja_manual, actualizado_por, actualizado_en)
  values
    (p_anio, p_mes, p_cona, p_pct, p_baja, auth.uid(), now())
  on conflict (anio, mes) do update
    set cona = excluded.cona,
        pct_quiebra = excluded.pct_quiebra,
        baja_manual = excluded.baja_manual,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;
end $$;

grant execute on function
  public.quiebra_simulador_guardar(integer, integer, numeric, numeric, numeric)
to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación. Las tres tienen que decir 'ok'.
-- ---------------------------------------------------------------------
do $$
declare
  v_col   boolean;
  v_cinco boolean;
  v_viejo integer;
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'quiebra_simulador'
                    and column_name = 'baja_manual') into v_col;

  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'quiebra_simulador_guardar'
                    and p.pronargs = 5) into v_cinco;

  select count(*) into v_viejo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'quiebra_simulador_guardar'
     and p.pronargs <> 5;

  raise notice 'columna baja_manual ....... %', case when v_col   then 'ok' else 'MAL' end;
  raise notice 'función de 5 argumentos ... %', case when v_cinco then 'ok' else 'MAL' end;
  raise notice 'no quedó la vieja ......... %', case when v_viejo = 0 then 'ok'
                                                     else 'MAL (quedaron ' || v_viejo || ')' end;
end $$;
