-- =====================================================================
-- CASCO DE VIDRIO — el vidrio vacío que hay en cada sitio, en estibas y en HL
-- ---------------------------------------------------------------------
-- «Dentro de inventario un módulo que se llame CASCO DE VIDRIO: COD, la
--  descripción del maestro, INVENTARIO CASCO DE VIDRIO, EXTRASUCIO CON
--  BAJA, el HL lo calculas tú, y la ubicación como desplegable para
--  luego generar el análisis de PARTIR.»
--
-- ---------------------------------------------------------------------
-- QUÉ ES CADA COSA (sacado del Excel INVENTARIO_CASCO_DE_VIDRIO)
-- ---------------------------------------------------------------------
--   · Las cantidades son ESTIBAS. El Excel las va sumando a mano
--     (=24+15-36+…): cada número es un movimiento y el total es el saldo.
--   · HL = (inventario + baja) × botellas por estiba × HL por botella.
--     Ejemplo: 56 estibas de 175 cc = 56 × 2.052 × 0,00175 = 201,096 HL,
--     que es justo la cifra que la hoja PARTIR guardó ese día.
--   · HL sale del MAESTRO (productos.unidades_por_estiba y productos.hl),
--     no de un número escrito en cada fórmula: en el Excel el mismo
--     material usa 30 botellas por caja en una tabla y 38 en otra, y en
--     el 750R de Carnaval falta el factor de botellas por caja.
--
-- SE GUARDA EL HL DEL DÍA y no se recalcula con el maestro de hoy: el
-- historial de enero no puede cambiar porque en octubre corrigieron un
-- factor. Por eso la tabla trae `hl` y `hl_estiba` (el factor usado).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. LOS SITIOS (las 4 tablas del Excel)
-- ---------------------------------------------------------------------
create table if not exists public.casco_ubicaciones (
  clave       text primary key,
  nombre      text not null,
  /* El rótulo de la segunda cantidad. Es «Extrasucio con baja» en la
     Bodega 38 y «Lavado con baja» en la Fábrica; en Carnaval no hay.
     NULL = ese sitio no lleva segunda columna. */
  baja_rotulo text,
  orden       integer,
  activo      boolean not null default true
);

insert into public.casco_ubicaciones (clave, nombre, baja_rotulo, orden) values
  ('BODEGA 38',        'Bodega 38',        'Extrasucio con baja', 1),
  ('FABRICA',          'Fábrica',          'Lavado con baja',     2),
  ('CARNAVAL',         'Carnaval',         null,                  3),
  ('CARNAVAL PALMAR',  'Carnaval Palmar',  null,                  4)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 2. LOS CÓDIGOS QUE NO ESTÁN EN EL MAESTRO
-- ---------------------------------------------------------------------
-- En el Excel hay «códigos» que son nombres: ANDINA, HEINEKEN,
-- EXPORTACION, OTROS. No son un SKU de SAP: son un cajón. Se guardan
-- aquí con sus factores, para que también tengan HL.
create table if not exists public.casco_extras (
  sku                text primary key,
  nombre             text not null,
  unidades_por_estiba integer not null check (unidades_por_estiba > 0),
  hl_unidad          numeric(14,8) not null check (hl_unidad > 0),
  activo             boolean not null default true
);

insert into public.casco_extras (sku, nombre, unidades_por_estiba, hl_unidad) values
  ('ANDINA',      'Envase Andina',          1350, 0.0033),
  ('HEINEKEN',    'Botella Heineken',       2052, 0.00175),
  ('EXPORTACION', 'Botella exportación',    1350, 0.0033),
  ('OTROS',       'Otros envases',          1350, 0.0033)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------
-- 3. EL FACTOR: HL DE UNA ESTIBA
-- ---------------------------------------------------------------------
-- Primero los cajones de arriba; si no, el maestro. En el maestro,
-- las botellas por estiba son `unidades_por_estiba`, o cajas por estiba
-- × unidades por caja si esa no viene. El HL de una botella es `hl`, o
-- el contenido en cc / 100.000 (330 cc → 0,0033 HL) si no viene.
-- Devuelve NULL si falta algo: NUNCA un cero, que se leería como «no
-- hay vidrio» cuando lo que pasa es que el maestro está incompleto.
create or replace function public.casco_hl_estiba(p_sku text)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select e.unidades_por_estiba * e.hl_unidad
       from public.casco_extras e where e.sku = p_sku),
    (select nullif(
              coalesce(p.unidades_por_estiba, p.cajas_por_estiba::bigint * p.unidades_por_caja), 0)
            * nullif(coalesce(p.hl, p.contenido / 100000.0), 0)
       from public.productos p where p.sku = p_sku)
  )
$$;
grant execute on function public.casco_hl_estiba(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. LOS REGISTROS (una fila por día, sitio y material = una fila de PARTIR)
-- ---------------------------------------------------------------------
create table if not exists public.casco_registros (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  ubicacion     text not null references public.casco_ubicaciones(clave),
  sku           text not null,
  /* ESTIBAS. Son las del último movimiento del día, ya sumadas; la
     cuenta tal cual se tecleó (`24+15-36`) se guarda aparte para poder
     seguir sumando encima. */
  inventario    numeric(12,2),
  inv_expr      text,
  baja          numeric(12,2),
  baja_expr     text,
  /* El HL del día y el factor con que se calculó. */
  hl            numeric(14,4) not null,
  hl_estiba     numeric(14,6),
  /* 'registro' = tecleado aquí. 'importado' = viene de la hoja PARTIR,
     donde solo existe el total (inventario + baja) en HL. */
  origen        text not null default 'registro' check (origen in ('registro', 'importado')),
  nota          text,
  creado_por    uuid references public.perfiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint casco_unico unique (fecha, ubicacion, sku)
);
create index if not exists casco_fecha_idx on public.casco_registros (fecha desc);
create index if not exists casco_sku_idx   on public.casco_registros (sku);

-- ---------------------------------------------------------------------
-- 5. QUIÉN PUEDE
-- ---------------------------------------------------------------------
create or replace function public.casco_puede_editar()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.mi_nivel_pantalla('/inventario/casco') = 'editar' $$;
grant execute on function public.casco_puede_editar() to authenticated;

alter table public.casco_registros   enable row level security;
alter table public.casco_ubicaciones enable row level security;
alter table public.casco_extras      enable row level security;

drop policy if exists casco_ver on public.casco_registros;
create policy casco_ver on public.casco_registros
  for select to authenticated
  using (public.mi_nivel_pantalla('/inventario/casco') in ('ver', 'editar')
      or public.mi_nivel_pantalla('/inventario/casco/analisis') in ('ver', 'editar'));

drop policy if exists casco_ubicaciones_ver on public.casco_ubicaciones;
create policy casco_ubicaciones_ver on public.casco_ubicaciones
  for select to authenticated using (true);

drop policy if exists casco_extras_ver on public.casco_extras;
create policy casco_extras_ver on public.casco_extras
  for select to authenticated using (true);

/* NADIE ESCRIBE DIRECTO: ni siquiera quien puede editar. Se escribe por
   `casco_guardar`, que calcula el HL en la base. Si la pantalla mandara
   el HL, el HL sería lo que la pantalla quiera. */
revoke insert, update, delete on public.casco_registros from authenticated;
grant select on public.casco_registros, public.casco_ubicaciones, public.casco_extras to authenticated;

-- ---------------------------------------------------------------------
-- 6. GUARDAR UN SITIO EN UN DÍA (reemplaza lo que había de ese día y sitio)
-- ---------------------------------------------------------------------
-- p_filas = [{ "sku": "3500005", "inventario": 56, "inv_expr": "24+15-36…",
--              "baja": 0, "baja_expr": "" }, …]
-- Lo que estaba guardado ese día en ese sitio y ya no viene en la lista
-- se borra: quitar un renglón de la pantalla y guardar tiene que
-- quitarlo de verdad.
create or replace function public.casco_guardar(p_fecha date, p_ubicacion text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb; v_sku text; v_inv numeric; v_baja numeric; v_fac numeric;
  v_n integer := 0; v_skus text[] := '{}'; v_hoy date;
  v_tiene_baja boolean;
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

    if v_sku = '' then raise exception 'Hay un renglón sin material'; end if;
    if v_sku = any(v_skus) then raise exception 'El material % está dos veces en la lista', v_sku; end if;
    if v_inv < 0 or v_baja < 0 then
      raise exception 'El material %: las estibas no pueden quedar negativas (revisa la suma)', v_sku;
    end if;

    v_fac := public.casco_hl_estiba(v_sku);
    if v_fac is null then
      raise exception 'El material % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro', v_sku;
    end if;

    insert into public.casco_registros as r
      (fecha, ubicacion, sku, inventario, inv_expr, baja, baja_expr, hl, hl_estiba, origen, creado_por)
    values
      (p_fecha, p_ubicacion, v_sku, v_inv, nullif(btrim(coalesce(f->>'inv_expr', '')), ''),
       case when v_tiene_baja then v_baja end,
       case when v_tiene_baja then nullif(btrim(coalesce(f->>'baja_expr', '')), '') end,
       round((v_inv + v_baja) * v_fac, 4), v_fac, 'registro', auth.uid())
    on conflict (fecha, ubicacion, sku) do update set
      inventario = excluded.inventario, inv_expr = excluded.inv_expr,
      baja = excluded.baja, baja_expr = excluded.baja_expr,
      hl = excluded.hl, hl_estiba = excluded.hl_estiba,
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
-- 7. LA VISTA QUE LEE LA PANTALLA (y el análisis de PARTIR)
-- ---------------------------------------------------------------------
create or replace view public.v_casco
with (security_invoker = true) as
  select r.id, r.fecha, r.ubicacion, u.nombre as ubicacion_nombre, u.baja_rotulo,
         r.sku, coalesce(p.nombre, e.nombre, r.sku) as descripcion,
         r.inventario, r.inv_expr, r.baja, r.baja_expr,
         r.hl, r.hl_estiba, r.origen, r.actualizado_en
    from public.casco_registros r
    join public.casco_ubicaciones u on u.clave = r.ubicacion
    left join public.productos p on p.sku = r.sku
    left join public.casco_extras e on e.sku = r.sku;
grant select on public.v_casco to authenticated;

commit;
