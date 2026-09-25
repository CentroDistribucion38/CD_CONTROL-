-- =====================================================================
-- BORRAR SALIDAS EN LOTE — «por si quiero empezar mi data de cero»
--
-- QUÉ RESUELVE. Hasta hoy una salida solo se podía ANULAR, y anular
-- deja la fila. Eso está bien para una salida que de verdad pasó y ya
-- no aplica, y está mal para lo que de verdad se quiere aquí: sacar de
-- la base las salidas de prueba y arrancar el mes limpio. Once filas
-- anuladas en una pantalla que dice «11 salidas» no es empezar de cero.
--
-- SE BORRA EN LOTE Y NO DE UNA EN UNA. Borrar once salidas con once
-- confirmaciones es lo que hace que la undécima se confirme sin leer.
-- Se escogen, se dice por qué una sola vez, y se van juntas.
--
-- ---------------------------------------------------------------------
-- LO QUE SE PIERDE, Y LO DIGO AQUÍ PARA QUE QUEDE ESCRITO
-- ---------------------------------------------------------------------
-- Borrar una salida se lleva SUS TOLVAS por la llave foránea. Con ellas
-- se va el peso que alguien leyó en la báscula, la tara con la que se
-- pesó ese día y las firmas de quien lo sostuvo. Si esa salida ya se
-- despachó, el número que se borra es uno que se facturó.
--
-- Por eso:
--   · Es de quien MANDA, por la casilla del rol y no por el nombre
--     «admin» —el día que se cree un segundo rol que mande, comparar
--     contra un nombre deja de proteger.
--   · EXIGE MOTIVO, siempre. No hay caso de «error de dedo» aquí: si
--     una salida se abrió mal, se anula o se reabre.
--   · Cada fila borrada queda entera en `roturas_salidas_borradas`,
--     CON SUS TOLVAS, que es el único sitio donde después se puede
--     contestar «¿qué decía la SR-0007?».
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. DÓNDE QUEDA LO BORRADO
--
-- LA SALIDA Y SUS TOLVAS, LAS DOS. Guardar solo la cabecera dejaría el
-- registro contestando «se borró SR-0007, 489 kg» sin poder decir de
-- cuántas tolvas salían esos kilos ni con qué tara — que es justo lo
-- que se pregunta cuando alguien reclama.
-- ---------------------------------------------------------------------
create table if not exists public.roturas_salidas_borradas (
  id          uuid primary key,
  codigo      text,
  placa       text,
  fila        jsonb not null,
  tolvas      jsonb not null default '[]'::jsonb,
  motivo      text not null,
  borrada_por uuid references auth.users(id),
  borrada_en  timestamptz not null default now()
);
alter table public.roturas_salidas_borradas enable row level security;

-- SOLO LA LEE QUIEN MANDA: es el registro de lo que se hizo
-- desaparecer. Si lo leyera cualquiera, sería una segunda copia de las
-- salidas borradas al alcance de todos.
drop policy if exists salidas_borradas_ver on public.roturas_salidas_borradas;
create policy salidas_borradas_ver on public.roturas_salidas_borradas
  for select to authenticated using (public.manda());

-- EL GRANT Y LA POLÍTICA SON DOS COSAS Y HACEN FALTA LAS DOS. Sin el
-- grant, Postgres contesta «permission denied for table» —un error de
-- permiso de tabla— y eso no es lo mismo que la política negando, que
-- devuelve cero filas. Solo select: escribir aquí lo hace la función,
-- que es security definer.
grant select on public.roturas_salidas_borradas to authenticated;

-- ---------------------------------------------------------------------
-- 2. BORRAR, EN LOTE
--
-- RECIBE UN ARREGLO Y NO UN id. Una llamada por salida son once viajes
-- a la base y once formas de quedar a medias: se borran cinco, se cae
-- la red, y quedan seis que nadie sabe si iban a irse. Aquí o se van
-- todas o no se va ninguna, porque es UNA transacción.
--
-- DEVUELVE CUÁNTAS. La pantalla dice «se borraron 11» con el número que
-- contestó la base, no con el que ella creía tener seleccionado.
-- ---------------------------------------------------------------------
create or replace function public.salidas_borrar(p_ids uuid[], p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_n integer;
begin
  if not public.manda() then
    raise exception 'Borrar salidas es del administrador';
  end if;
  if v_motivo = '' then
    raise exception 'Hay que decir por qué se borran: la fila se va y el motivo es lo único que queda';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'No se escogió ninguna salida';
  end if;

  /* EL RASTRO SE ESCRIBE ANTES DEL DELETE. Al revés, las tolvas ya se
     habrían ido con la cascada y el registro guardaría una lista
     vacía: diría que la salida existió y no qué tenía dentro, que es
     justo lo que se le va a preguntar. */
  insert into public.roturas_salidas_borradas
         (id, codigo, placa, fila, tolvas, motivo, borrada_por)
  select s.id, s.codigo, s.placa, to_jsonb(s),
         coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
                     from public.roturas_salida_tolvas t
                    where t.salida_id = s.id), '[]'::jsonb),
         v_motivo, auth.uid()
    from public.roturas_salidas s
   where s.id = any(p_ids)
  on conflict (id) do nothing;

  delete from public.roturas_salidas where id = any(p_ids);
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'Ninguna de esas salidas existe ya';
  end if;
  return v_n;
end $$;

grant execute on function public.salidas_borrar(uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. QUE SE VEA QUÉ QUEDÓ
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.roturas_salidas_borradas;
  raise notice 'Listo. salidas_borrar(uuid[], text) creada; el registro de borradas tiene % fila(s).', n;
  raise notice 'Borrar es del administrador, exige motivo, y se lleva las tolvas de cada salida.';
end $$;

commit;
