-- =====================================================================
-- CASCO DE VIDRIO · EL INVENTARIO PUEDE QUEDAR NEGATIVO
--
-- «Aquí tengo 26 en inventario y ayer sacaron 80: me debe dejar -54,
--  pero ese dato en rojo para tener la visual.»
--
-- Antes la base rechazaba cualquier inventario negativo (al guardar
-- Control, al registrar un movimiento que saca más de lo que hay, y al
-- deshacer una baja). Ahora lo acepta: el negativo es un dato real
-- (salió más de lo contado) y la pantalla lo marca en rojo para que se
-- revise. Nada más cambia: mismos permisos, mismo HL con el maestro.
--
-- Y LA CUENTA SE ARRASTRA: «cuando selecciono no me muestra toda mi
-- operación, todas mis partidas + y −». Cuando un día arranca con el
-- saldo del anterior (por un movimiento o una baja), ahora copia también
-- la cuenta (24+15-36…), no solo el resultado.
--
-- Son las MISMAS funciones de 2026-10-casco-registrar-baja.sql y
-- 2026-10-casco-movimientos.sql, sin la regla de «no negativo».
-- Se puede correr las veces que sea.
-- =====================================================================
begin;

-- 1. Guardar Control.
create or replace function public.casco_guardar(p_fecha date, p_ubicacion text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_sku text; v_inv numeric; v_baja numeric; v_fac numeric;
  v_n integer := 0; v_skus text[] := '{}'; v_hoy date;
  v_tiene_baja boolean; v_puesto text; v_calidad text;
begin
  if not public.casco_puede_editar() then
    raise exception 'No tienes permiso para registrar casco de vidrio';
  end if;
  v_hoy := (now() at time zone 'America/Bogota')::date;
  if p_fecha is null or p_fecha > v_hoy then
    raise exception 'Esa fecha todavía no ha llegado';
  end if;
  select (baja_rotulo is not null) into v_tiene_baja
    from public.casco_ubicaciones where clave = p_ubicacion and activo;
  if v_tiene_baja is null then
    raise exception 'Esa ubicación no existe o está apagada';
  end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas tienen que venir como lista';
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_sku  := btrim(coalesce(f->>'sku', ''));
    v_inv  := coalesce(nullif(f->>'inventario', '')::numeric, 0);
    v_baja := case when v_tiene_baja then coalesce(nullif(f->>'baja', '')::numeric, 0) else 0 end;
    v_puesto  := nullif(left(btrim(coalesce(f->>'puesto', '')), 120), '');
    v_calidad := nullif(left(btrim(coalesce(f->>'calidad', '')), 240), '');

    if v_sku = '' then raise exception 'Hay un renglón sin material'; end if;
    if v_sku = any(v_skus) then raise exception 'El material % está dos veces en la lista', v_sku; end if;
    -- NEGATIVOS PERMITIDOS: si ayer salieron 80 y había 26, queda -54. La pantalla lo pinta en rojo.

    v_fac := public.casco_hl_estiba(v_sku);
    if v_fac is null then
      raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', v_sku;
    end if;

    insert into public.casco_registros as r
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad, creado_por)
    values
      (p_fecha, p_ubicacion, v_sku, v_inv, nullif(btrim(coalesce(f->>'inv_expr', '')), ''),
       case when v_tiene_baja then v_baja end,
       case when v_tiene_baja then nullif(btrim(coalesce(f->>'baja_expr', '')), '') end,
       round((v_inv + v_baja) * v_fac, 4), v_fac, 'registro', v_puesto, v_calidad, auth.uid())
    on conflict (fecha, ubicacion, sku) do update set
      inventario = excluded.inventario, inv_expr = excluded.inv_expr,
      baja = excluded.baja, baja_expr = excluded.baja_expr,
      hl = excluded.hl, hl_estiba = excluded.hl_estiba,
      puesto = excluded.puesto, calidad = excluded.calidad,
      origen = 'registro', actualizado_en = now();

    v_skus := v_skus || v_sku;
    v_n := v_n + 1;
  end loop;

  delete from public.casco_registros
   where fecha = p_fecha and ubicacion = p_ubicacion and not (sku = any(v_skus));

  return v_n;
end $$;
grant execute on function public.casco_guardar(date, text, jsonb) to authenticated;

-- 2. Un movimiento que saca más de lo que hay deja el saldo en negativo.
create or replace function public.casco_aplicar_delta(p_fecha date, p_ubic text, p_sku text, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hl numeric; v_reg public.casco_registros%rowtype; v_inv numeric; v_nuevo numeric;
  v_nombre text; v_rotulo text;
begin
  select nombre, baja_rotulo into v_nombre, v_rotulo from public.casco_ubicaciones where clave = p_ubic;
  v_hl := public.casco_hl_estiba(p_sku);
  if v_hl is null then
    raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', p_sku;
  end if;

  perform public.casco_asegurar_dia(p_fecha, p_ubic);
  select * into v_reg from public.casco_registros where fecha = p_fecha and ubicacion = p_ubic and sku = p_sku;

  if not found then
    insert into public.casco_registros
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, creado_por)
    values
      (p_fecha, p_ubic, p_sku, p_delta, public.casco_agregar_termino(null, 0, p_delta),
       case when v_rotulo is not null then 0 end, null,
       round(p_delta * v_hl, 4), v_hl, 'registro', auth.uid());
    return;
  end if;

  v_inv := coalesce(v_reg.inventario, 0);
  v_nuevo := v_inv + p_delta;
  update public.casco_registros set
    inventario = v_nuevo,
    inv_expr = public.casco_agregar_termino(v_reg.inv_expr, v_inv, p_delta),
    hl = round((v_nuevo + coalesce(v_reg.baja, 0)) * v_hl, 4), hl_estiba = v_hl,
    origen = 'registro', actualizado_en = now()
   where id = v_reg.id;
end $$;
revoke all on function public.casco_aplicar_delta(date, text, text, numeric) from public, anon, authenticated;

-- 3. Deshacer una baja aunque el saldo quede negativo.
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

  delete from public.casco_bajas where id = p_id;
end $$;
grant execute on function public.casco_quitar_baja(uuid) to authenticated;

-- 4. Arrancar un día con el saldo del anterior COPIANDO LA CUENTA.
create or replace function public.casco_asegurar_dia(p_fecha date, p_ubic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_prev date;
begin
  if exists (select 1 from public.casco_registros where fecha = p_fecha and ubicacion = p_ubic) then return; end if;
  select max(fecha) into v_prev from public.casco_registros where ubicacion = p_ubic and fecha < p_fecha;
  if v_prev is null then return; end if;
  insert into public.casco_registros
    (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad, creado_por)
  select p_fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, 'registro', puesto, calidad, auth.uid()
    from public.casco_registros where ubicacion = p_ubic and fecha = v_prev;
end $$;
revoke all on function public.casco_asegurar_dia(date, text) from public, anon, authenticated;

-- 5. Las bajas de SAP: igual, el día nuevo copia la cuenta.
create or replace function public.casco_registrar_bajas(
  p_filas jsonb, p_fecha date default null,
  p_archivo text default null, p_hoja text default null, p_leidas integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_fecha date; v_fecha_sap date; v_centro text; v_sku text; v_uni numeric; v_texto text; v_llave text;
  v_ubic text; v_rotulo text; v_dest text; v_bot numeric; v_hl numeric; v_est numeric;
  v_id uuid; v_prev date; v_reg public.casco_registros%rowtype;
  v_apl int := 0; v_rep int := 0; v_fut int := 0;
  v_sin_factor text[] := '{}'; v_sin_sitio text[] := '{}'; v_sin_col text[] := '{}';
  v_inv numeric; v_baja numeric; v_arch uuid;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para registrar bajas de casco de vidrio';
  end if;
  -- El archivo se anota primero; si al final nada entró (todo repetido o sin factor), se quita.
  if nullif(btrim(coalesce(p_archivo, '')), '') is not null then
    insert into public.casco_archivos (nombre, hoja, dia_control, filas_leidas, creado_por)
    values (btrim(p_archivo), nullif(btrim(coalesce(p_hoja, '')), ''),
            coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), p_leidas, auth.uid())
    returning id into v_arch;
  end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las filas tienen que venir como lista';
  end if;

  for r in
    select x.value as fila
      from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) with ordinality as x(value, n)
     order by x.n
  loop
    -- p_fecha = el día de Control que escogió quien registra; sin él, el día del Excel.
    v_fecha_sap := nullif(r.fila->>'fecha', '')::date;
    v_fecha := coalesce(p_fecha, v_fecha_sap);
    v_centro := upper(btrim(coalesce(r.fila->>'centro', '')));
    v_sku := btrim(coalesce(r.fila->>'sku', ''));
    v_uni := abs(coalesce(nullif(r.fila->>'unidades', '')::numeric, 0));
    v_texto := btrim(coalesce(r.fila->>'texto', ''));
    v_llave := btrim(coalesce(r.fila->>'llave', ''));
    continue when v_fecha is null or v_sku = '' or v_llave = '' or v_uni = 0;

    if v_fecha > v_hoy then v_fut := v_fut + 1; continue; end if;

    select clave, baja_rotulo into v_ubic, v_rotulo
      from public.casco_ubicaciones where centro = v_centro and activo limit 1;
    if v_ubic is null then
      if not (v_centro = any(v_sin_sitio)) then v_sin_sitio := v_sin_sitio || v_centro; end if;
      continue;
    end if;

    -- LAVADO y EXTRASUCIO van a la columna «… con baja»; lo demás, al inventario.
    v_dest := case when translate(upper(v_texto), 'ÁÉÍÓÚ', 'AEIOU') ~ '(LAVADO|EXTRASUCIO)'
                   then 'baja' else 'inventario' end;
    if v_dest = 'baja' and v_rotulo is null then
      if not (v_centro = any(v_sin_col)) then v_sin_col := v_sin_col || v_centro; end if;
      continue;
    end if;

    v_bot := public.casco_botellas_estiba(v_sku);
    v_hl  := public.casco_hl_estiba(v_sku);
    if v_bot is null or v_hl is null then
      if not (v_sku = any(v_sin_factor)) then v_sin_factor := v_sin_factor || v_sku; end if;
      continue;
    end if;
    v_est := round(v_uni / v_bot, 2);

    -- El libro primero: si esa fila ya entró, no se suma otra vez.
    v_id := null;
    insert into public.casco_bajas
      (fecha, fecha_sap, centro, ubicacion, sku, unidades, botellas_estiba, estibas, destino, signo,
       texto, documento, clase, llave, creado_por, archivo_id)
    values
      (v_fecha, v_fecha_sap, v_centro, v_ubic, v_sku, v_uni, v_bot, v_est, v_dest,
       case when v_dest = 'baja' then -1 else 1 end,
       nullif(v_texto, ''), nullif(btrim(coalesce(r.fila->>'documento', '')), ''),
       nullif(btrim(coalesce(r.fila->>'clase', '')), ''), v_llave, auth.uid(), v_arch)
    on conflict (llave) do nothing
    returning id into v_id;
    if v_id is null then v_rep := v_rep + 1; continue; end if;

    -- Si ese día no hay registro en ese sitio, arranca con el último saldo
    -- (igual que Control); si no, la tabla del día quedaría con un solo material.
    if not exists (select 1 from public.casco_registros where fecha = v_fecha and ubicacion = v_ubic) then
      select max(fecha) into v_prev from public.casco_registros
       where ubicacion = v_ubic and fecha < v_fecha;
      if v_prev is not null then
        insert into public.casco_registros
          (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, puesto, calidad, creado_por)
        select v_fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, 'registro', puesto, calidad, auth.uid()
          from public.casco_registros where ubicacion = v_ubic and fecha = v_prev;
      end if;
    end if;

    select * into v_reg from public.casco_registros
     where fecha = v_fecha and ubicacion = v_ubic and sku = v_sku;

    if not found then
      insert into public.casco_registros
        (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, creado_por)
      values
        (v_fecha, v_ubic, v_sku,
         case when v_dest = 'inventario' then v_est else 0 end,
         case when v_dest = 'inventario' then public.casco_agregar_termino(null, 0, v_est) end,
         case when v_rotulo is not null then case when v_dest = 'baja' then -v_est else 0 end end,
         case when v_dest = 'baja' then public.casco_agregar_termino(null, 0, -v_est) end,
         round((case when v_dest = 'baja' then -v_est else v_est end) * v_hl, 4), v_hl, 'registro', auth.uid());
    else
      v_inv  := coalesce(v_reg.inventario, 0);
      v_baja := coalesce(v_reg.baja, 0);
      if v_dest = 'inventario' then
        update public.casco_registros set
          inventario = v_inv + v_est,
          inv_expr = public.casco_agregar_termino(v_reg.inv_expr, v_inv, v_est),
          hl = round((v_inv + v_est + v_baja) * v_hl, 4), hl_estiba = v_hl,
          origen = 'registro', actualizado_en = now()
         where id = v_reg.id;
      else
        update public.casco_registros set
          baja = v_baja - v_est,
          baja_expr = public.casco_agregar_termino(v_reg.baja_expr, v_baja, -v_est),
          hl = round((v_inv + v_baja - v_est) * v_hl, 4), hl_estiba = v_hl,
          origen = 'registro', actualizado_en = now()
         where id = v_reg.id;
      end if;
    end if;

    v_apl := v_apl + 1;
  end loop;

  if v_arch is not null then
    if v_apl = 0 then delete from public.casco_archivos where id = v_arch; v_arch := null;
    else update public.casco_archivos set aplicadas = v_apl, repetidas = v_rep where id = v_arch;
    end if;
  end if;

  return jsonb_build_object('aplicadas', v_apl, 'repetidas', v_rep, 'futuras', v_fut, 'archivo', v_arch,
    'sin_factor', to_jsonb(v_sin_factor), 'sin_sitio', to_jsonb(v_sin_sitio),
    'sin_columna', to_jsonb(v_sin_col));
end $$;
grant execute on function public.casco_registrar_bajas(jsonb, date, text, text, integer) to authenticated;

commit;
