-- =====================================================================
-- SIDER · LA SALIDA EN DOS TIEMPOS: FICHA Y DAR SALIDA
--
--   1. QUIEN CERTIFICA (en el patio) toma la ubicación, escoge UNO O
--      VARIOS materiales con sus estibas, pone la placa y toma las tres
--      fotos. Al tocar «Guardar» se crea una FICHA PENDIENTE. El camión
--      todavía NO va en tránsito.
--   2. EL FACTURADOR ve las fichas, escribe el NÚMERO DE FACTURA y le da
--      SALIDA. Recién ahí nacen los viajes —uno por material, todos con
--      la misma placa y factura— y pasan a En tránsito. La hora de salida
--      es la de ese momento.
--
-- LA FICHA NO TOCA `sider_viajes`. Es a propósito: Tránsito, Fuente
-- principal, Seguimiento, Informe AI y el cruce con ZLDE leen viajes, y
-- una ficha sin factura no es un viaje. Al vivir aparte, ninguno de ellos
-- necesita saber que las fichas existen.
--
-- QUIÉN VE QUÉ
--   · quien la creó ve las suyas (y las puede descartar);
--   · quien tiene «Dar salida» ve TODAS las pendientes y les da salida;
--   · quien creó una ficha NO le da salida por ese solo hecho: quien
--     certifica en el patio y quien factura son dos manos distintas.
--   · el administrador (quien manda) ve y hace todo.
--
-- TODO O NADA. Guardar y dar salida son una sola llamada: si falla el
-- tercer material no queda ni el primero.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.sider_fichas (
  id           uuid primary key default gen_random_uuid(),
  placa        text not null check (btrim(placa) <> ''),
  planta       text not null references public.sider_origenes(planta),
  lote         text,
  nota         text,
  lat          numeric(10,7) not null,
  lng          numeric(10,7) not null,
  precision_m  numeric(8,2),
  ubicado_en   timestamptz,
  direccion    text,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'con_salida', 'descartada')),
  creado_por   uuid references public.perfiles(id) on delete set null default auth.uid(),
  creado_en    timestamptz not null default now(),
  -- El rastro de la salida: quién la dio, cuándo y con qué factura.
  factura      text,
  salida_por   uuid references public.perfiles(id) on delete set null,
  salida_en    timestamptz,
  viajes       uuid[]
);
create index if not exists sider_fichas_estado_idx on public.sider_fichas (estado, creado_en desc);
create index if not exists sider_fichas_creador_idx on public.sider_fichas (creado_por, estado);

create table if not exists public.sider_ficha_lineas (
  id        uuid primary key default gen_random_uuid(),
  ficha_id  uuid not null references public.sider_fichas(id) on delete cascade,
  sku       text not null references public.sider_skus(sku),
  estibas   numeric(10,2) not null check (estibas > 0),
  -- El mismo material dos veces serían las mismas botellas contadas dos veces.
  unique (ficha_id, sku)
);
create index if not exists sider_ficha_lineas_ficha_idx on public.sider_ficha_lineas (ficha_id);

create table if not exists public.sider_ficha_fotos (
  id        uuid primary key default gen_random_uuid(),
  ficha_id  uuid not null references public.sider_fichas(id) on delete cascade,
  ranura    ranura_foto not null,
  ruta      text not null,
  ancho     integer,
  alto      integer,
  bytes     integer,
  subida_en timestamptz not null default now(),
  unique (ficha_id, ranura),
  -- La observación es de la llegada; la salida solo tiene tres ranuras.
  check (ranura in ('costado_izq', 'costado_der', 'placa'))
);
create index if not exists sider_ficha_fotos_ficha_idx on public.sider_ficha_fotos (ficha_id);

-- ---------------------------------------------------------------------
-- QUIÉN LEE Y QUIÉN ESCRIBE
-- Las tablas solo se LEEN directo; se escriben por las funciones de
-- abajo, salvo las fotos, que las sube el navegador del que certifica.
-- ---------------------------------------------------------------------
alter table public.sider_fichas       enable row level security;
alter table public.sider_ficha_lineas enable row level security;
alter table public.sider_ficha_fotos  enable row level security;

create or replace function public.sider_ficha_visible(p_ficha uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puede_ver('/sider/salida')
      or exists (select 1 from public.sider_fichas f
                  where f.id = p_ficha and f.creado_por = auth.uid())
$$;
grant execute on function public.sider_ficha_visible(uuid) to authenticated;

drop policy if exists sider_fichas_ver on public.sider_fichas;
create policy sider_fichas_ver on public.sider_fichas
  for select to authenticated using (public.sider_ficha_visible(id));

drop policy if exists sider_ficha_lineas_ver on public.sider_ficha_lineas;
create policy sider_ficha_lineas_ver on public.sider_ficha_lineas
  for select to authenticated using (public.sider_ficha_visible(ficha_id));

drop policy if exists sider_ficha_fotos_ver on public.sider_ficha_fotos;
create policy sider_ficha_fotos_ver on public.sider_ficha_fotos
  for select to authenticated using (public.sider_ficha_visible(ficha_id));

/* Las fotos las sube quien creó la ficha, y solo mientras está pendiente. */
drop policy if exists sider_ficha_fotos_subir on public.sider_ficha_fotos;
create policy sider_ficha_fotos_subir on public.sider_ficha_fotos
  for insert to authenticated
  with check (exists (select 1 from public.sider_fichas f
                       where f.id = ficha_id and f.creado_por = auth.uid() and f.estado = 'pendiente'));

grant select on public.sider_fichas, public.sider_ficha_lineas, public.sider_ficha_fotos to authenticated;
grant insert on public.sider_ficha_fotos to authenticated;

-- ---------------------------------------------------------------------
-- 1. GUARDAR LA FICHA
--    p_lineas: [{"sku":"3500887","estibas":40}, {"sku":"3501225","estibas":12}]
--    Devuelve el id de la ficha; las fotos se suben después contra ese id.
-- ---------------------------------------------------------------------
create or replace function public.sider_ficha_guardar(
  p_placa       text,
  p_planta      text,
  p_lat         numeric,
  p_lng         numeric,
  p_precision_m numeric,
  p_ubicado_en  timestamptz,
  p_direccion   text,
  p_nota        text,
  p_lote        text,
  p_lineas      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_placa  text := upper(btrim(coalesce(p_placa, '')));
  v_l      jsonb;
  v_sku    text;
  v_est    numeric;
  v_vistos text[] := '{}';
begin
  /* Certificar sigue siendo de quien tiene el permiso de esa pantalla. */
  if not public.puede_editar('/sider/certificar') then
    raise exception 'Guardar una ficha requiere el permiso de Certificar (Roles)';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Falta la ubicación: no se puede certificar sin saber dónde se hizo';
  end if;
  if v_placa = '' then
    raise exception 'Falta la placa';
  end if;
  if not exists (select 1 from public.sider_origenes where planta = p_planta and activo) then
    raise exception 'Ese origen no existe o está apagado';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Falta al menos un material con sus estibas';
  end if;
  if jsonb_array_length(p_lineas) > 10 then
    raise exception 'Una ficha lleva máximo 10 materiales';
  end if;

  insert into public.sider_fichas
    (placa, planta, lote, nota, lat, lng, precision_m, ubicado_en, direccion, creado_por)
  values
    (v_placa, p_planta,
     nullif(upper(btrim(coalesce(p_lote, ''))), ''),
     nullif(btrim(coalesce(p_nota, '')), ''),
     p_lat, p_lng, p_precision_m, p_ubicado_en,
     nullif(btrim(coalesce(p_direccion, '')), ''),
     auth.uid())
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_l) <> 'object' then
      raise exception 'Cada material debe traer su código y sus estibas';
    end if;
    v_sku := btrim(coalesce(v_l ->> 'sku', ''));
    if v_sku = '' then raise exception 'A un material le falta el código'; end if;
    if v_sku = any (v_vistos) then
      raise exception 'El material % está repetido: suma sus estibas en una sola línea', v_sku;
    end if;
    v_vistos := v_vistos || v_sku;
    if not exists (select 1 from public.sider_skus where sku = v_sku and activo) then
      raise exception 'El material % no existe en el maestro o está apagado', v_sku;
    end if;
    begin
      v_est := (v_l ->> 'estibas')::numeric;
    exception when others then
      raise exception 'Las estibas del material % no son un número', v_sku;
    end;
    if v_est is null or v_est <= 0 then
      raise exception 'Las estibas del material % tienen que ser más de cero', v_sku;
    end if;
    insert into public.sider_ficha_lineas (ficha_id, sku, estibas) values (v_id, v_sku, v_est);
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 2. DAR SALIDA — la factura convierte la ficha en viajes en tránsito
-- ---------------------------------------------------------------------
create or replace function public.sider_ficha_dar_salida(p_ficha uuid, p_factura text)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_f      public.sider_fichas%rowtype;
  v_fact   text := upper(btrim(coalesce(p_factura, '')));
  v_ids    uuid[] := '{}';
  v_viaje  uuid;
  v_cert   uuid;
  l        record;
  v_fotos  int;
begin
  if not public.puede_editar('/sider/salida') then
    raise exception 'Dar salida requiere el permiso «Dar salida» (Roles)';
  end if;

  /* for update: dos facturadores tocando la misma ficha a la vez no
     pueden crear los viajes dos veces. */
  select * into v_f from public.sider_fichas where id = p_ficha for update;
  if not found then raise exception 'Esa ficha no existe'; end if;
  if v_f.estado = 'con_salida' then raise exception 'A esa ficha ya se le dio salida'; end if;
  if v_f.estado = 'descartada' then raise exception 'Esa ficha fue descartada'; end if;

  if v_fact = '' then
    raise exception 'Falta el número de factura';
  end if;
  if length(v_fact) > 30 then
    raise exception 'El número de factura es muy largo (máximo 30 caracteres)';
  end if;

  select count(*) into v_fotos from public.sider_ficha_fotos where ficha_id = p_ficha;
  if v_fotos < 3 then
    raise exception 'A esa ficha le faltan fotos (%/3): quien la creó debe descartarla y hacerla de nuevo', v_fotos;
  end if;

  for l in select * from public.sider_ficha_lineas where ficha_id = p_ficha order by sku loop
    insert into public.sider_viajes (placa, planta, sku, estibas, factura, lote, observacion, creado_por)
    values (v_f.placa, v_f.planta, l.sku, l.estibas, v_fact, v_f.lote, v_f.nota, v_f.creado_por)
    returning id into v_viaje;

    /* La hora de salida es la de AHORA, la del facturador: es cuando el
       camión sale de verdad. El lugar y su hora de GPS son los de la
       ficha, que es donde se estaba cuando se tomaron las fotos. */
    insert into public.sider_certificaciones
      (viaje_id, punta, lat, lng, precision_m, ubicado_en, direccion, nota, hecha_por)
    values
      (v_viaje, 'salida', v_f.lat, v_f.lng, v_f.precision_m, v_f.ubicado_en, v_f.direccion, v_f.nota, v_f.creado_por)
    returning id into v_cert;

    /* Las mismas tres fotos para cada material del camión: son del
       camión, no del material. Apuntan al mismo archivo. */
    insert into public.sider_fotos (certificacion_id, ranura, ruta, ancho, alto, bytes)
    select v_cert, ranura, ruta, ancho, alto, bytes
      from public.sider_ficha_fotos where ficha_id = p_ficha;

    v_ids := v_ids || v_viaje;
  end loop;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Esa ficha no tiene materiales';
  end if;

  update public.sider_fichas
     set estado = 'con_salida', factura = v_fact, salida_por = auth.uid(),
         salida_en = now(), viajes = v_ids
   where id = p_ficha;

  return v_ids;
end $$;

-- ---------------------------------------------------------------------
-- 3. DESCARTAR — quien la creó, o quien da salida
-- ---------------------------------------------------------------------
create or replace function public.sider_ficha_descartar(p_ficha uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_f public.sider_fichas%rowtype;
begin
  select * into v_f from public.sider_fichas where id = p_ficha for update;
  if not found then raise exception 'Esa ficha no existe'; end if;
  if not (v_f.creado_por = auth.uid() or public.puede_editar('/sider/salida')) then
    raise exception 'Solo quien creó la ficha o quien da salida la puede descartar';
  end if;
  if v_f.estado = 'con_salida' then raise exception 'A esa ficha ya se le dio salida: no se puede descartar'; end if;
  update public.sider_fichas set estado = 'descartada' where id = p_ficha;
end $$;

grant execute on function
  public.sider_ficha_guardar(text, text, numeric, numeric, numeric, timestamptz, text, text, text, jsonb),
  public.sider_ficha_dar_salida(uuid, text),
  public.sider_ficha_descartar(uuid)
to authenticated;

do $$
begin
  if to_regprocedure('public.sider_ficha_dar_salida(uuid,text)') is null then
    raise exception 'No quedó la función de dar salida.';
  end if;
  raise notice 'Listo: la salida ahora es ficha (Certificar) y dar salida con factura (facturador).';
end $$;

commit;
