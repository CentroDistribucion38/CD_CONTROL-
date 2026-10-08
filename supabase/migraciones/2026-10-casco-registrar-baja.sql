-- =====================================================================
-- CASCO DE VIDRIO — REGISTRAR (la BAJA que viene de SAP) y CONTROL
-- ---------------------------------------------------------------------
-- «Lo que se llama Registrar se debe llamar CONTROL, y hay que crear el
--  Registrar: ahí va un MOVIMIENTO o una BAJA. Empezamos por la baja:
--  la hoja de baja trae la cantidad en UNIDADES, con el maestro la
--  convertimos a ESTIBAS, y de ahí se alimenta Control.»
--
-- QUÉ HACE ESTE ARCHIVO
--   1. Las 4 tablas de Control ahora se llaman como en SAP:
--        AG22 EER Barranquilla   (antes Bodega 38)
--        AG18 EER Fábrica        (antes Fábrica)
--        AG07 Alm. Bodega Carnaval (antes Carnaval)
--        CA22 ERR Atlántico      (antes Carnaval Palmar)
--      La CLAVE no cambia (BODEGA 38, FABRICA…): el historial y el
--      tablero siguen apuntando a ella. Solo cambia el nombre que se ve
--      y se agrega `centro` (el código del almacén de la hoja de baja).
--   2. `casco_botellas_estiba(sku)`: botellas que caben en una estiba.
--      Es lo que convierte UNIDADES → ESTIBAS (unidades / botellas).
--   3. `casco_bajas`: el libro de lo que entró por Registrar. Cada fila
--      de la hoja queda una vez (la llave evita que importar dos veces
--      el mismo archivo la sume dos veces).
--   4. `casco_registrar_bajas(filas)`: aplica la baja a Control.
--        · «BAJA LAVADO» y «BAJA EXTRASUCIO» → se RESTAN en la columna
--          «… con baja» del almacén de la fila (Fábrica / Bodega 38).
--        · cualquier otro texto (SORTING, PRESORTING, ROTURA DE
--          MAQUINA…) → se SUMAN al inventario del almacén de la fila.
--      (La columna «con baja» puede quedar negativa; el inventario no.)
--      Se aplica al día de la baja (Fe.contabilización). Si ese día no
--      hay registro en ese sitio, arranca con el último saldo del
--      sitio, igual que la pantalla de Control. A la cuenta de la celda
--      se le agrega «+N» para que se vea de dónde salió.
--   5. `casco_quitar_baja(id)`: deshace una fila importada.
--   6. El permiso de la pantalla nueva (/inventario/casco/registrar) se
--      copia del de /inventario/casco: quien registraba casco sigue
--      pudiendo registrar.
--
-- Se puede correr varias veces. Correr DESPUÉS de los 4 SQL de casco.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LOS NOMBRES DE LAS 4 TABLAS (+ el código del almacén)
-- ---------------------------------------------------------------------
alter table public.casco_ubicaciones add column if not exists centro text;

-- Solo la primera vez (centro vacío): si después alguien cambia un nombre
-- a mano, correr esto otra vez no se lo deshace.
update public.casco_ubicaciones set centro = 'AG22', nombre = 'AG22 EER Barranquilla'
 where clave = 'BODEGA 38' and centro is null;
update public.casco_ubicaciones set centro = 'AG18', nombre = 'AG18 EER Fábrica'
 where clave = 'FABRICA' and centro is null;
update public.casco_ubicaciones set centro = 'AG07', nombre = 'AG07 Alm. Bodega Carnaval'
 where clave = 'CARNAVAL' and centro is null;
update public.casco_ubicaciones set centro = 'CA22', nombre = 'CA22 ERR Atlántico'
 where clave = 'CARNAVAL PALMAR' and centro is null;

-- ---------------------------------------------------------------------
-- 2. UNIDADES → ESTIBAS
-- ---------------------------------------------------------------------
-- Mismo orden que `casco_hl_estiba`: primero los cajones del Excel
-- (ANDINA, HEINEKEN…), después el maestro: botellas por estiba, o cajas
-- por estiba × botellas por caja. NULL si falta (nunca un cero: dividir
-- por cero o dar «0 estibas» escondería un maestro incompleto).
create or replace function public.casco_botellas_estiba(p_sku text)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select e.unidades_por_estiba::numeric from public.casco_extras e where e.sku = p_sku),
    (select nullif(coalesce(p.unidades_por_estiba, p.cajas_por_estiba::bigint * p.unidades_por_caja), 0)::numeric
       from public.productos p where p.sku = p_sku)
  )
$$;
grant execute on function public.casco_botellas_estiba(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. EL LIBRO DE BAJAS
-- ---------------------------------------------------------------------
create table if not exists public.casco_bajas (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,                 -- Fe.contabilización
  centro     text not null,                 -- Almacén de la hoja (AG18, AG22…)
  ubicacion  text not null references public.casco_ubicaciones(clave),
  sku        text not null,
  unidades   numeric(14,2) not null,        -- como vino en SAP (sin signo)
  botellas_estiba numeric(12,2) not null,   -- el factor usado ese día
  estibas    numeric(12,2) not null,        -- unidades / botellas_estiba
  destino    text not null check (destino in ('inventario', 'baja')),
  texto      text,                          -- Texto cab.documento
  documento  text,                          -- Documento material
  clase      text,                          -- Clase de movimiento (945, 951…)
  llave      text not null unique,
  creado_por uuid references public.perfiles(id) on delete set null,
  creado_en  timestamptz not null default now()
);
-- `fecha` es el día de CONTROL al que se sumó; `fecha_sap` es la Fe.contabilización que traía el Excel.
alter table public.casco_bajas add column if not exists fecha_sap date;
-- +1 suma, -1 resta en la columna «con baja». Las bajas que entraron con la versión anterior
-- (que SUMABA en esa columna) quedan en +1, para que deshacerlas las revierta bien.
alter table public.casco_bajas add column if not exists signo smallint not null default 1;

-- EL HISTORIAL DE ARCHIVOS: cada vez que se aplica un Excel queda una fila aquí (quién, cuándo, a qué día de
-- Control, cuántas filas). Las filas de la baja apuntan a su archivo, y se puede deshacer un archivo entero.
create table if not exists public.casco_archivos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  hoja        text,
  dia_control date not null,
  filas_leidas integer,
  aplicadas   integer not null default 0,
  repetidas   integer not null default 0,
  creado_por  uuid references public.perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index if not exists casco_archivos_en_idx on public.casco_archivos (creado_en desc);
alter table public.casco_bajas add column if not exists archivo_id uuid references public.casco_archivos(id) on delete set null;
create index if not exists casco_bajas_archivo_idx on public.casco_bajas (archivo_id);
alter table public.casco_archivos enable row level security;
drop policy if exists casco_archivos_ver on public.casco_archivos;
create policy casco_archivos_ver on public.casco_archivos
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco/registrar') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar'));
revoke insert, update, delete on public.casco_archivos from authenticated;
grant select on public.casco_archivos to authenticated;

create index if not exists casco_bajas_fecha_idx on public.casco_bajas (fecha desc);

alter table public.casco_bajas enable row level security;

drop policy if exists casco_bajas_ver on public.casco_bajas;
create policy casco_bajas_ver on public.casco_bajas
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco/registrar') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar'));

-- Nadie escribe directo: se escribe por las funciones de abajo.
revoke insert, update, delete on public.casco_bajas from authenticated;
grant select on public.casco_bajas to authenticated;

create or replace function public.casco_registrar_puede_editar()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.mi_nivel_pantalla('/inventario/casco/registrar') = 'editar' $$;
grant execute on function public.casco_registrar_puede_editar() to authenticated;

create or replace view public.v_casco_bajas
with (security_invoker = true) as
  select b.id, b.fecha, b.centro, b.ubicacion, u.nombre as ubicacion_nombre,
         b.sku, coalesce(p.nombre, e.nombre, b.sku) as descripcion,
         b.unidades, b.botellas_estiba, b.estibas, b.destino, b.texto,
         b.documento, b.clase, b.creado_en, b.fecha_sap, b.signo, b.archivo_id
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
         (select coalesce(sum(b.estibas), 0) from public.casco_bajas b where b.archivo_id = a.id) as estibas
    from public.casco_archivos a
    left join public.perfiles pf on pf.id = a.creado_por;
grant select on public.v_casco_archivos to authenticated;

-- ---------------------------------------------------------------------
-- 4. LA CUENTA DE LA CELDA: agregar «+N» / quitarlo
-- ---------------------------------------------------------------------
-- p_est lleva SIGNO: positivo agrega «+N», negativo agrega «-N».
create or replace function public.casco_agregar_termino(p_expr text, p_antes numeric, p_est numeric)
returns text
language sql immutable
as $$
  select case
    when coalesce(btrim(p_expr), '') <> '' then p_expr || case when p_est < 0 then '-' else '+' end || trim_scale(abs(p_est))::text
    when coalesce(p_antes, 0) = 0         then trim_scale(p_est)::text
    else trim_scale(p_antes)::text || case when p_est < 0 then '-' else '+' end || trim_scale(abs(p_est))::text
  end
$$;

-- Quita lo que agregó `casco_agregar_termino` con ese mismo p_est (con signo). Si el término no está al
-- final de la cuenta, agrega el contrario para que el saldo cuadre igual.
create or replace function public.casco_quitar_termino(p_expr text, p_est numeric)
returns text
language sql immutable
as $$
  select case
    when coalesce(btrim(p_expr), '') = ''                              then null
    when p_expr = trim_scale(p_est)::text                              then null
    when right(p_expr, length(trim_scale(abs(p_est))::text) + 1)
         = case when p_est < 0 then '-' else '+' end || trim_scale(abs(p_est))::text
         then nullif(left(p_expr, length(p_expr) - length(trim_scale(abs(p_est))::text) - 1), '')
    else p_expr || case when p_est < 0 then '+' else '-' end || trim_scale(abs(p_est))::text
  end
$$;

-- ---------------------------------------------------------------------
-- GUARDAR CONTROL: la columna «con baja» ahora admite negativos (las bajas de SAP la RESTAN).
-- Es `casco_guardar` de 2026-10-casco-puesto-calidad.sql con UNA sola regla distinta.
-- ---------------------------------------------------------------------
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
    -- El inventario no puede quedar negativo. La columna «con baja» SÍ puede: ahí se restan las bajas de SAP.
    if v_inv < 0 then
      raise exception 'El material %: las estibas del inventario no pueden quedar negativas (revisa la suma)', v_sku;
    end if;

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

-- ---------------------------------------------------------------------
-- 5. APLICAR LA BAJA A CONTROL
-- ---------------------------------------------------------------------
-- p_filas = [{ "fecha": "2026-09-24", "centro": "AG18", "sku": "3500005",
--              "unidades": 116280, "texto": "BAJA SORTING JG",
--              "documento": "6353847740", "clase": "945",
--              "llave": "6353847740|AG18|3500005|BAJA SORTING JG|116280|1" }, …]
-- Devuelve { aplicadas, repetidas, futuras, sin_factor:[sku…],
--            sin_sitio:[centro…], sin_columna:[centro…] }.
-- Lo que no se pudo aplicar NO queda en el libro: se puede volver a
-- importar el mismo archivo cuando se complete el maestro o el sitio.
-- La versión anterior (solo p_filas) se quita: dos funciones con el mismo nombre confunden a la API.
drop function if exists public.casco_registrar_bajas(jsonb);
drop function if exists public.casco_registrar_bajas(jsonb, date);
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
          (fecha, ubicacion, sku, inventario, baja, hl, hl_estiba, origen, puesto, calidad, creado_por)
        select v_fecha, ubicacion, sku, inventario, baja, hl, hl_estiba, 'registro', puesto, calidad, auth.uid()
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

-- ---------------------------------------------------------------------
-- 6. DESHACER UNA FILA IMPORTADA
-- ---------------------------------------------------------------------
-- Resta las estibas de Control (y quita el «+N» de la cuenta) y la saca
-- del libro. Si Control ya tiene menos de lo que esa baja puso, no la
-- deshace en silencio: avisa para que se revise la celda.
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

  delete from public.casco_bajas where id = p_id;
end $$;
grant execute on function public.casco_quitar_baja(uuid) to authenticated;

-- Varias a la vez (todo o nada: si una no se puede deshacer, no se deshace ninguna).
create or replace function public.casco_quitar_bajas(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_n integer := 0;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para quitar bajas de casco de vidrio';
  end if;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    perform public.casco_quitar_baja(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.casco_quitar_bajas(uuid[]) to authenticated;

-- Un archivo entero: deshace todas sus filas vigentes (todo o nada) y borra su renglón del historial.
create or replace function public.casco_quitar_archivo(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not public.casco_registrar_puede_editar() then
    raise exception 'No tienes permiso para quitar bajas de casco de vidrio';
  end if;
  select public.casco_quitar_bajas(coalesce(array_agg(id), '{}'::uuid[])) into v_n
    from public.casco_bajas where archivo_id = p_id;
  delete from public.casco_archivos where id = p_id;
  return coalesce(v_n, 0);
end $$;
grant execute on function public.casco_quitar_archivo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. EL PERMISO DE LA PANTALLA NUEVA
-- ---------------------------------------------------------------------
-- Los permisos se guardan como el TEXTO de la dirección. «Registrar» es
-- una dirección nueva: quien podía ver/editar casco (ahora «Control»)
-- conserva el mismo nivel en «Registrar». No pisa lo puesto a mano.
insert into public.rol_permisos (rol, seccion, nivel)
select p.rol, '/inventario/casco/registrar', p.nivel
  from public.rol_permisos p
 where p.seccion = '/inventario/casco'
on conflict (rol, seccion) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfiles'
                and column_name = 'permisos_extra') then
    update public.perfiles
       set permisos_extra = permisos_extra
           || jsonb_build_object('/inventario/casco/registrar', permisos_extra -> '/inventario/casco')
     where permisos_extra ? '/inventario/casco'
       and not (permisos_extra ? '/inventario/casco/registrar');
  end if;
end $$;

commit;

select clave, nombre, centro, baja_rotulo from public.casco_ubicaciones order by orden;
