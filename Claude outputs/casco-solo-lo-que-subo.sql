-- =====================================================================
-- CASCO · CONTROL = SOLO LO QUE SUBES  (todos los sitios y todos los días)
-- ---------------------------------------------------------------------
-- Regla: si borras una baja (o un archivo de baja), lo que esa baja puso en Control SALE de la celda.
-- En la celda queda solo lo que está en el libro de bajas + lo que tú digitas a mano.
--
-- QUÉ HACE ESTE ARCHIVO (se puede correr varias veces):
--   A. DISPARADOR: desde ahora, cuando se borra una fila de «casco_bajas» (por Borrar datos, por SQL, por
--      donde sea) su valor se resta solo de la celda de Control y se quita de la cuenta. Ya no hace falta
--      acordarse de «Deshacer».
--   B. `casco_quitar_baja` (Deshacer) sigue igual; solo avisa al disparador para no restar dos veces.
--   C. `casco_limpiar_repetidos(...)`: revisa TODAS las celdas de TODOS los sitios y días, y quita lo que
--      quedó de más por haber borrado sin Deshacer y haber vuelto a subir. Primero solo MUESTRA.
--
-- CÓMO USARLO (después de correr este archivo, en el SQL Editor):
--   1.  select * from public.casco_limpiar_repetidos();                 -- solo muestra, no cambia nada
--   2.  Revisa la columna «despues» contra tu conteo.
--         · segura                    = la cifra tiene decimales o sobra 2 veces o más.
--         · confirmada por historial  = es un entero que sobra 1 vez, pero ese día el historial de archivos
--                                       muestra filas borradas (aplicadas − vigentes) y alcanzan para explicarlo.
--         · dudosa                    = la cifra también pudo digitarla una persona y no hay huella de borrado:
--                                       NO se toca sola.
--   3.  select * from public.casco_limpiar_repetidos(true);             -- quita las seguras y las confirmadas
--       (opcional: select * from public.casco_limpiar_repetidos(true, null, null, true); incluye las dudosas
--        — solo si estás seguro de que de verdad sobran.)
--   Ver lo que ya se borró antes, por día:  select * from public.casco_historial_borrados();
--   Opcional por fechas:  select * from public.casco_limpiar_repetidos(false, '2026-10-01', '2026-10-31');
--
-- Regla de seguridad: solo se toca una celda cuando el libro de bajas SÍ tiene esa cifra (así se sabe que
-- es de un archivo) y la cuenta la tiene más veces que el libro. Nunca deja el inventario negativo.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- A. AL BORRAR UNA BAJA, SU VALOR SALE DE LA CELDA
-- ---------------------------------------------------------------------
-- Anota cada baja que ya se devolvió bien a Control (por el disparador o por la limpieza), para que el
-- historial de archivos no cuente dos veces lo que ya está arreglado.
create table if not exists public.casco_bajas_devueltas (
  id bigint generated always as identity primary key,
  fecha date not null, cantidad integer not null default 1, creado_en timestamptz not null default now()
);
alter table public.casco_bajas_devueltas enable row level security;
revoke all on public.casco_bajas_devueltas from anon, authenticated;

create or replace function public.casco_bajas_revertir_al_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg public.casco_registros%rowtype; v_hl numeric; v_inv numeric; v_baja numeric;
begin
  insert into public.casco_bajas_devueltas (fecha) values (old.fecha);
  if coalesce(current_setting('casco.sin_revertir', true), '') = '1' then return old; end if;
  select * into v_reg from public.casco_registros
   where fecha = old.fecha and ubicacion = old.ubicacion and sku = old.sku;
  if not found then return old; end if;
  v_hl   := coalesce(v_reg.hl_estiba, public.casco_hl_estiba(old.sku), 0);
  v_inv  := coalesce(v_reg.inventario, 0);
  v_baja := coalesce(v_reg.baja, 0);
  if old.destino = 'inventario' then
    if v_inv - old.estibas < 0 then
      raise notice 'Casco %/% (%): el inventario quedaría negativo al sacar % est.; se deja en 0. Revisa la celda.',
        old.ubicacion, old.sku, old.fecha, old.estibas;
    end if;
    v_inv := greatest(v_inv - old.estibas, 0);
    update public.casco_registros
       set inventario = v_inv, inv_expr = public.casco_quitar_termino(v_reg.inv_expr, old.estibas),
           hl = round((v_inv + v_baja) * v_hl, 4), actualizado_en = now()
     where id = v_reg.id;
  else
    v_baja := v_baja - old.signo * old.estibas;
    update public.casco_registros
       set baja = v_baja, baja_expr = public.casco_quitar_termino(v_reg.baja_expr, old.signo * old.estibas),
           hl = round((v_inv + v_baja) * v_hl, 4), actualizado_en = now()
     where id = v_reg.id;
  end if;
  return old;
end $$;

drop trigger if exists casco_bajas_revertir on public.casco_bajas;
create trigger casco_bajas_revertir
  before delete on public.casco_bajas
  for each row execute function public.casco_bajas_revertir_al_borrar();

-- ---------------------------------------------------------------------
-- B. DESHACER (igual que antes; solo avisa al disparador)
-- ---------------------------------------------------------------------
create or replace function public.casco_quitar_baja(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.casco_bajas%rowtype; v_reg public.casco_registros%rowtype;
  v_inv numeric; v_baja numeric; v_hl numeric; v_nuevo numeric;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para quitar bajas de casco de vidrio';
  end if;
  select * into b from public.casco_bajas where id = p_id;
  if not found then raise exception 'Esa baja ya no está'; end if;

  select * into v_reg from public.casco_registros
   where fecha = b.fecha and ubicacion = b.ubicacion and sku = b.sku;
  if found then
    v_inv := coalesce(v_reg.inventario, 0); v_baja := coalesce(v_reg.baja, 0);
    v_hl := coalesce(v_reg.hl_estiba, public.casco_hl_estiba(b.sku));
    if b.destino = 'inventario' then
      v_nuevo := v_inv - b.estibas;
      if v_nuevo < 0 then
        raise exception 'No se puede deshacer: en Control ese día ya quedan menos estibas de % de las que esta baja puso. Revisa la celda.', b.sku;
      end if;
      update public.casco_registros set
        inventario = v_nuevo, inv_expr = public.casco_quitar_termino(v_reg.inv_expr, b.estibas),
        hl = round((v_nuevo + v_baja) * coalesce(v_hl, 0), 4), actualizado_en = now()
       where id = v_reg.id;
    else
      -- Lo que esta baja aplicó en la columna: signo × estibas (-1 la resta; las viejas, +1, la sumaban).
      v_nuevo := v_baja - b.signo * b.estibas;
      update public.casco_registros set
        baja = v_nuevo, baja_expr = public.casco_quitar_termino(v_reg.baja_expr, b.signo * b.estibas),
        hl = round((v_inv + v_nuevo) * coalesce(v_hl, 0), 4), actualizado_en = now()
       where id = v_reg.id;
    end if;
  end if;

  -- Esta función ya devolvió el valor a la celda; el disparador no debe devolverlo otra vez.
  perform set_config('casco.sin_revertir', '1', true);
  delete from public.casco_bajas where id = p_id;
  perform set_config('casco.sin_revertir', '0', true);
end $$;
grant execute on function public.casco_quitar_baja(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- C. LIMPIAR LO QUE QUEDÓ DE MÁS (todos los sitios y días)
-- ---------------------------------------------------------------------
drop function if exists public.casco_limpiar_repetidos(boolean, date, date, boolean);
create or replace function public.casco_limpiar_repetidos(
  p_aplicar boolean default false, p_desde date default null, p_hasta date default null,
  p_incluir_dudosas boolean default false)
returns table (
  fecha date, ubicacion text, sku text, columna text, estibas_de_la_baja numeric,
  veces_en_el_libro integer, veces_en_la_cuenta integer, sobran integer, confianza text, filas_borradas_ese_dia integer,
  tiene_hoy numeric, despues numeric, estado text, cuenta_hoy text)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record; v_reg public.casco_registros%rowtype; v_hl numeric;
  v_inv numeric; v_baja numeric; v_expr text; v_i int;
  v_borr jsonb;
begin
  -- Filas de archivo que ya no están en el libro, por día de Control (aplicadas − vigentes): la huella de lo borrado.
  select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) into v_borr from (
    select a.dia_control::text as d,
           greatest(sum(greatest(a.aplicadas - (select count(*) from public.casco_bajas b where b.archivo_id = a.id), 0))
                    - coalesce((select sum(g.cantidad) from public.casco_bajas_devueltas g where g.fecha = a.dia_control), 0), 0) as n
      from public.casco_archivos a group by a.dia_control) q;

  for c in
    with libro as (
      select b.fecha, b.ubicacion, b.sku,
             case when b.destino = 'inventario' then 'inventario' else 'baja' end as col,
             b.estibas, count(*)::int as m
        from public.casco_bajas b
       where (p_desde is null or b.fecha >= p_desde) and (p_hasta is null or b.fecha <= p_hasta)
         and (b.destino = 'inventario' or b.signo = -1)
       group by 1, 2, 3, 4, 5
    ),
    term as (
      select r.fecha, r.ubicacion, r.sku, 'inventario'::text as col, t[1] as sg, t[2]::numeric as v
        from public.casco_registros r,
             lateral regexp_matches(coalesce(r.inv_expr, ''), '([+-]?)(\d+(?:\.\d+)?)', 'g') as t
       where coalesce(r.inv_expr, '') !~ '[*/()x×]'
      union all
      select r.fecha, r.ubicacion, r.sku, 'baja', t[1], t[2]::numeric
        from public.casco_registros r,
             lateral regexp_matches(coalesce(r.baja_expr, ''), '([+-]?)(\d+(?:\.\d+)?)', 'g') as t
       where coalesce(r.baja_expr, '') !~ '[*/()x×]'
    ),
    cuenta as (
      select l.*,
             coalesce((select sum(case when l.col = 'inventario'
                                       then case when t.sg = '-' then -1 else 1 end
                                       else case when t.sg = '-' then 1 else -1 end end)
                         from term t
                        where t.fecha = l.fecha and t.ubicacion = l.ubicacion and t.sku = l.sku
                          and t.col = l.col and t.v = l.estibas), 0)::int as puesta
        from libro l
    )
    select q.*, (sum(q.puesta - q.m) over (partition by q.fecha))::int as sobran_dia
      from (select * from cuenta where puesta > m) q
     order by q.fecha, q.ubicacion, q.sku, q.col
  loop
    select * into v_reg from public.casco_registros r
     where r.fecha = c.fecha and r.ubicacion = c.ubicacion and r.sku = c.sku;
    v_hl   := coalesce(v_reg.hl_estiba, public.casco_hl_estiba(c.sku), 0);
    v_inv  := coalesce(v_reg.inventario, 0);
    v_baja := coalesce(v_reg.baja, 0);

    fecha := c.fecha; ubicacion := c.ubicacion; sku := c.sku; columna := c.col;
    estibas_de_la_baja := c.estibas; veces_en_el_libro := c.m; veces_en_la_cuenta := c.puesta;
    sobran := c.puesta - c.m;
    filas_borradas_ese_dia := coalesce((v_borr ->> c.fecha::text)::int, 0);
    confianza := case
      when c.estibas <> trunc(c.estibas) or (c.puesta - c.m) >= 2 then 'segura'
      when c.sobran_dia <= filas_borradas_ese_dia then 'confirmada por historial'
      else 'dudosa' end;
    cuenta_hoy := case when c.col = 'inventario' then v_reg.inv_expr else v_reg.baja_expr end;

    if c.col = 'inventario' then
      tiene_hoy := v_inv; despues := v_inv - c.estibas * sobran;
    else
      tiene_hoy := v_baja; despues := v_baja + c.estibas * sobran;
    end if;

    if c.col = 'inventario' and despues < 0 then
      estado := 'NO SE PUEDE: quedaría negativo';
    elsif confianza = 'dudosa' and not p_incluir_dudosas then
      estado := case when p_aplicar then 'omitida (dudosa)' else 'dudosa: no se toca sola' end;
    elsif not p_aplicar then
      estado := 'se quitaría';
    else
      v_expr := case when c.col = 'inventario' then v_reg.inv_expr else v_reg.baja_expr end;
      for v_i in 1 .. sobran loop
        v_expr := public.casco_quitar_termino(v_expr, case when c.col = 'inventario' then c.estibas else -c.estibas end);
      end loop;
      if c.col = 'inventario' then
        update public.casco_registros r
           set inventario = despues, inv_expr = v_expr,
               hl = round((despues + v_baja) * v_hl, 4), actualizado_en = now()
         where r.id = v_reg.id;
      else
        update public.casco_registros r
           set baja = despues, baja_expr = v_expr,
               hl = round((v_inv + despues) * v_hl, 4), actualizado_en = now()
         where r.id = v_reg.id;
      end if;
      insert into public.casco_bajas_devueltas (fecha, cantidad) values (c.fecha, sobran);
      estado := 'QUITADO';
    end if;
    return next;
  end loop;
end $$;
revoke all on function public.casco_limpiar_repetidos(boolean, date, date, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- D. LO YA BORRADO, POR DÍA DE CONTROL (solo lee)
-- ---------------------------------------------------------------------
-- aplicadas = filas que entraron con los archivos de ese día; vigentes = las que siguen en el libro;
-- borradas = la diferencia; encontradas = cuántas de esas borradas se ven como sobrante en alguna celda
-- (casco_limpiar_repetidos). «sin_ubicar» > 0 = se borraron filas cuyo valor sigue en alguna celda
-- pero nadie volvió a subirlas, así que no hay forma de saber cuál es: ahí hay que mirar la celda.
create or replace function public.casco_historial_borrados()
returns table (dia_control date, archivos integer, aplicadas integer, vigentes integer,
               borradas integer, encontradas_en_celdas integer, sin_ubicar integer)
language sql stable
security definer
set search_path = public
as $$
  with arch as (
    select a.dia_control, a.aplicadas,
           (select count(*)::int from public.casco_bajas b where b.archivo_id = a.id) as vigentes
      from public.casco_archivos a),
  dia as (select dia_control, count(*)::int as archivos, sum(aplicadas)::int as aplicadas, sum(vigentes)::int as vigentes,
                 greatest(sum(greatest(aplicadas - vigentes, 0)) - coalesce((select sum(g.cantidad) from public.casco_bajas_devueltas g where g.fecha = arch.dia_control), 0), 0)::int as borradas
            from arch group by 1),
  hall as (select l.fecha, sum(l.sobran)::int as hallado from public.casco_limpiar_repetidos(false) l group by 1)
  select d.dia_control, d.archivos, d.aplicadas, d.vigentes, d.borradas,
         least(d.borradas, coalesce(h.hallado, 0)), greatest(d.borradas - coalesce(h.hallado, 0), 0)
    from dia d left join hall h on h.fecha = d.dia_control
   order by d.dia_control desc
$$;
revoke all on function public.casco_historial_borrados() from public, anon, authenticated;

commit;

select 'LISTO: borrar una baja ahora la resta de Control. Corre:  select * from public.casco_limpiar_repetidos();   y para ver lo ya borrado:  select * from public.casco_historial_borrados();' as siguiente_paso;
