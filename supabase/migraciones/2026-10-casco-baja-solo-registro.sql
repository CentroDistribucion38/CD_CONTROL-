-- =====================================================================
-- CASCO · BAJAS: «QUEDE EN EL REGISTRO - NO HAGA NADA EN EL KARDEX»
--
-- «En el archivo de baja, si tiene ese texto, no debe hacer nada: queda el
--  registro pero no hace nada.»
--
-- Una fila de la hoja Baja que trae esa nota (en cualquier celda; suele ir
-- en una columna sin encabezado al final) se guarda en el libro de bajas
-- con destino «registro»: consta quién la subió, de qué archivo y su
-- documento SAP, pero NO suma al inventario ni resta en la columna de baja.
-- Deshacerla solo la saca del libro.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- 1. El libro acepta el destino nuevo y guarda la nota tal como vino.
alter table public.casco_bajas drop constraint if exists casco_bajas_destino_check;
alter table public.casco_bajas
  add constraint casco_bajas_destino_check check (destino in ('inventario', 'baja', 'registro'));
alter table public.casco_bajas add column if not exists nota text;

-- 2. Las vistas: la nota se ve, y las estibas de un archivo no cuentan lo que no movió nada.
create or replace view public.v_casco_bajas
with (security_invoker = true) as
  select b.id, b.fecha, b.centro, b.ubicacion, u.nombre as ubicacion_nombre,
         b.sku, coalesce(p.nombre, e.nombre, b.sku) as descripcion,
         b.unidades, b.botellas_estiba, b.estibas, b.destino, b.texto,
         b.documento, b.clase, b.creado_en, b.fecha_sap, b.signo, b.archivo_id, b.nota
    from public.casco_bajas b
    join public.casco_ubicaciones u on u.clave = b.ubicacion
    left join public.productos p on p.sku = b.sku
    left join public.casco_extras e on e.sku = b.sku;
grant select on public.v_casco_bajas to authenticated;

create or replace view public.v_casco_archivos
with (security_invoker = true) as
  select a.id, a.nombre, a.hoja, a.dia_control, a.filas_leidas, a.aplicadas, a.repetidas, a.creado_en,
         pf.nombre as usuario,
         (select count(*) from public.casco_bajas b where b.archivo_id = a.id) as vigentes,
         (select coalesce(sum(b.estibas), 0) from public.casco_bajas b
           where b.archivo_id = a.id and b.destino <> 'registro') as estibas
    from public.casco_archivos a
    left join public.perfiles pf on pf.id = a.creado_por;
grant select on public.v_casco_archivos to authenticated;

-- 3. Deshacer: «solo registro» no tiene celda que revertir.
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

  -- SOLO REGISTRO no movió ninguna celda: quitarla es solo sacarla del libro.
  if b.destino = 'registro' then
    delete from public.casco_bajas where id = p_id;
    return;
  end if;

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

-- 4. Registrar: la nota manda antes que el texto.
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
  v_nota text; v_sol int := 0;
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
    v_nota  := nullif(btrim(coalesce(r.fila->>'nota', '')), '');
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

    -- «NO HAGA NADA» GANA A TODO: la fila queda en el libro y no toca el kárdex.
    -- Misma regla que NOTA_SOLO_REGISTRO en src/modulos/casco/baja.ts.
    if v_nota is not null and translate(lower(v_nota), 'áéíóú', 'aeiou')
         ~ '(no haga nada|no hacer nada|no hace nada|solo registro|quede en el registro|queda en el registro)' then
      v_bot := public.casco_botellas_estiba(v_sku);
      v_id := null;
      insert into public.casco_bajas
        (fecha, fecha_sap, centro, ubicacion, sku, unidades, botellas_estiba, estibas, destino, signo,
         texto, documento, clase, llave, creado_por, archivo_id, nota)
      values
        (v_fecha, v_fecha_sap, v_centro, v_ubic, v_sku, v_uni, coalesce(v_bot, 0), 0, 'registro', 1,
         nullif(v_texto, ''), nullif(btrim(coalesce(r.fila->>'documento', '')), ''),
         nullif(btrim(coalesce(r.fila->>'clase', '')), ''), v_llave, auth.uid(), v_arch, v_nota)
      on conflict (llave) do nothing
      returning id into v_id;
      if v_id is null then v_rep := v_rep + 1; else v_sol := v_sol + 1; end if;
      continue;
    end if;
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
    if v_apl + v_sol = 0 then delete from public.casco_archivos where id = v_arch; v_arch := null;
    else update public.casco_archivos set aplicadas = v_apl + v_sol, repetidas = v_rep where id = v_arch;
    end if;
  end if;

  return jsonb_build_object('aplicadas', v_apl, 'solo_registro', v_sol, 'repetidas', v_rep, 'futuras', v_fut, 'archivo', v_arch,
    'sin_factor', to_jsonb(v_sin_factor), 'sin_sitio', to_jsonb(v_sin_sitio),
    'sin_columna', to_jsonb(v_sin_col));
end $$;
grant execute on function public.casco_registrar_bajas(jsonb, date, text, text, integer) to authenticated;

-- 5. Comprobación.
do $$
declare v_src text;
begin
  select pg_get_functiondef(to_regprocedure('public.casco_registrar_bajas(jsonb,date,text,text,integer)')) into v_src;
  if v_src not like '%no haga nada%' then
    raise exception 'casco_registrar_bajas no reconoce «no haga nada».';
  end if;
  select pg_get_functiondef(to_regprocedure('public.casco_quitar_baja(uuid)')) into v_src;
  if v_src not like '%''registro''%' then
    raise exception 'casco_quitar_baja no sabe deshacer una fila de solo registro.';
  end if;
  raise notice 'Listo: las filas con «NO HAGA NADA» quedan en el registro sin mover el kárdex.';
end $$;

commit;
