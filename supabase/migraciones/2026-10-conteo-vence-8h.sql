-- =====================================================================
-- INVENTARIO · CONTEO · EL CONTEO ABIERTO SE CIERRA SOLO A LAS 8 HORAS SIN USO
--
-- «Si abro el conteo hoy a las 3:05 y solo era de prueba, y en realidad lo abro
--  mañana a las 6 para iniciar, debe reflejarme mañana: si no se usa se debe
--  cerrar, y la persona vuelve a poner Contar. Con más de 8 horas el conteo
--  debe cerrarse para que cuando abra mi sesión vuelva a iniciar.»
--
-- QUÉ HACE
--   · `conteo_fefo_vencer()` pasa a «anulado» los recorridos ABIERTOS (en_proceso) de
--     quien llama que llevan más de 8 horas sin un solo movimiento (último renglón
--     anotado o corregido; si no tiene renglones, desde que se abrió).
--   · NO borra nada: los renglones quedan en la base y se ve en «Tiempos» como
--     «Cerrado sin enviar». Un recorrido anulado no entra al tablero (solo lo enviado).
--   · `conteo_fefo_abrir()` lo llama primero: al tocar «Contar» después de 8 horas
--     arranca un recorrido nuevo, y su hora de inicio es la del primer renglón nuevo.
--   · La pantalla de Contar también lo llama al cargar (ver `miConteoFefo`), para que
--     el recorrido viejo no aparezca como abierto.
--
-- Requiere 2026-10-conteo-tiempos.sql (la columna `registrado_en`). Se puede correr dos veces.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'conteo_lineas' and column_name = 'registrado_en') then
    raise exception 'Falta supabase/migraciones/2026-10-conteo-tiempos.sql. Ese va primero.';
  end if;
  if to_regproc('public.conteo_fefo_abrir') is null then
    raise exception 'Falta supabase/migraciones/2026-09-conteo-treinta-a-la-vez.sql. Ese va primero.';
  end if;
end $$;

drop function if exists public.conteo_fefo_vencer();
create function public.conteo_fefo_vencer()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then return 0; end if;
  with vencidos as (
    select c.id
      from public.conteos c
     where c.responsable_id = auth.uid() and c.tipo = 'fefo' and c.estado = 'en_proceso'
       and greatest(
             coalesce(c.iniciado_en, c.creado_en),
             coalesce((select max(greatest(cl.contado_en, cl.registrado_en)) from public.conteo_lineas cl where cl.conteo_id = c.id), c.creado_en)
           ) < now() - interval '8 hours'
  )
  update public.conteos c
     set estado = 'anulado',
         cerrado_en = now(),
         nota = case when coalesce(c.nota, '') = '' then 'Cerrado solo: más de 8 horas sin uso.'
                     else c.nota || ' · Cerrado solo: más de 8 horas sin uso.' end
    from vencidos v
   where c.id = v.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.conteo_fefo_vencer() from public, anon;
grant execute on function public.conteo_fefo_vencer() to authenticated;

create or replace function public.conteo_fefo_abrir(p_bodega uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para contar.';
  end if;

  /* Lo que lleva más de 8 horas sin uso se cierra ANTES de buscar el abierto. */
  perform public.conteo_fefo_vencer();

  select id into v_id
    from public.conteos
   where responsable_id = auth.uid() and tipo = 'fefo'
     and bodega_id = p_bodega and estado = 'en_proceso'
   order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if;

  perform pg_advisory_xact_lock(hashtext('conteo_fefo_abrir:' || current_date::text));

  select id into v_id
    from public.conteos
   where responsable_id = auth.uid() and tipo = 'fefo'
     and bodega_id = p_bodega and estado = 'en_proceso'
   order by creado_en desc limit 1;
  if v_id is not null then return v_id; end if;

  v_cod := 'FEFO-' || to_char(current_date, 'YYYYMMDD') || '-' ||
           lpad((1 + (select count(*) from public.conteos
                       where tipo = 'fefo' and creado_en::date = current_date))::text, 2, '0');

  insert into public.conteos (codigo, bodega_id, tipo, estado, responsable_id, iniciado_en)
       values (v_cod, p_bodega, 'fefo', 'en_proceso', auth.uid(), now())
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.conteo_fefo_abrir(uuid) to authenticated;

do $$
begin
  if (select prosrc from pg_proc where proname = 'conteo_fefo_abrir' and pronamespace = 'public'::regnamespace) not like '%pg_advisory_xact_lock%' then
    raise exception 'El candado de abrir no quedó puesto.';
  end if;
end $$;

commit;
-- LISTO · el conteo abierto se cierra solo a las 8 horas sin uso
