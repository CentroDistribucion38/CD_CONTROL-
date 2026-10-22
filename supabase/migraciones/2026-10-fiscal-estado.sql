-- =====================================================================
-- INVENTARIO FISCAL · ESTADO DEL ENVASE, AVERÍA, PNC Y FOTOS EN EL CONTEO (el conteo fiscal es gemelo del normal)
--
-- En el conteo normal el envase se cuenta con su estado (RETORNO, LAVADO, NUEVO, BAJA, EXTRASUCIO,
-- OTROS, MAL ESTADO; el cilindro, LLENO o VACÍO). El fiscal ahora también lo pide:
--   · AVERÍA y PNC (con su política: rótulo y bloqueo mecánico) se anotan como en el normal;
--   · el mismo material, sitio y vencimiento se puede anotar varias veces (cada una es un renglón; no se suma);
--   · el cruce y la validación comparan también el estado, la avería y el PNC;
--   · al mandar a La base el estado va con el renglón.
--
-- Orden: correr DESPUÉS de 2026-10-fiscal-consolidar.sql y ANTES de 2026-10-fiscal-modulo.sql.
-- Se puede correr dos veces. No borra conteos.
-- =====================================================================
begin;

alter table public.inv_fiscal_conteos add column if not exists estado_envase text;
alter table public.inv_fiscal_conteos add column if not exists averia boolean not null default false;
alter table public.inv_fiscal_conteos add column if not exists pnc boolean not null default false;
alter table public.inv_fiscal_conteos add column if not exists pnc_rotulo boolean;
alter table public.inv_fiscal_conteos add column if not exists pnc_bloqueo_mecanico boolean;
alter table public.inv_fiscal_conteos drop constraint if exists inv_fiscal_conteos_averia_pnc;
alter table public.inv_fiscal_conteos add constraint inv_fiscal_conteos_averia_pnc check (not (averia and pnc));
-- El mismo material, sitio, vencimiento y estado se puede anotar VARIAS veces: cada una es su renglón y todos se ven.
-- El cruce y la validación los suman por módulo. Por eso ya no hay llave única.
drop index if exists public.inv_fiscal_conteos_unico;
create index if not exists inv_fiscal_conteos_clave_idx on public.inv_fiscal_conteos
  (hoja_id, contado_por, ubicacion_id, producto_id);

drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
create function public.inv_fiscal_contar_agregar(
  p_hoja uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_equipo text; v_fiscal uuid; v_estado text; v_pub timestamptz; v_fecha date;
  v_id uuid;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;

  select m.equipo, m.fiscal_id, f.estado, f.publicado_en, f.fecha
    into v_equipo, v_fiscal, v_estado, v_pub, v_fecha
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = v_yo;
  if v_equipo is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if v_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'Todavía no es el día: este inventario fiscal se cuenta el %.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota, estado_envase, averia, pnc, pnc_rotulo, pnc_bloqueo_mecanico)
    values
      (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, p_producto, p_estibas, p_saldo, p_cajas, p_dia, p_mes, p_anio,
       nullif(btrim(coalesce(p_nota, '')), ''), nullif(btrim(coalesce(p_estado, '')), ''),
       coalesce(p_averia, false), coalesce(p_pnc, false),
       case when coalesce(p_pnc, false) then p_pnc_rotulo end, case when coalesce(p_pnc, false) then p_pnc_bloqueo end)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'No se pudo anotar el renglón.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) to authenticated;

drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz, estado_envase text,
  averia boolean, pnc boolean, pnc_rotulo boolean, pnc_bloqueo_mecanico boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en, c.estado_envase,
         c.averia, c.pnc, c.pnc_rotulo, c.pnc_bloqueo_mecanico
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- CORREGIR UN RENGLÓN (igual que «Corregir» en el borrador del conteo normal)
-- Cambia el renglón en su sitio: conserva su foto y su hora de anotado. Mientras la hoja está
-- terminada no se puede (salvo en lo que el fiscal mandó a validar), igual que anotar y quitar.
-- ---------------------------------------------------------------------
drop function if exists public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean);
create function public.inv_fiscal_contar_corregir(
  p_id uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null,
  p_averia boolean default false, p_pnc boolean default false, p_pnc_rotulo boolean default null, p_pnc_bloqueo boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  c public.inv_fiscal_conteos%rowtype;
  v_estado text; v_pub timestamptz;
begin
  if v_yo is null then raise exception 'Hay que entrar para contar.'; end if;
  select * into c from public.inv_fiscal_conteos where id = p_id and contado_por = v_yo;
  if not found then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  select f.estado, f.publicado_en into v_estado, v_pub from public.inv_fiscales f where f.id = c.fiscal_id;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;

  -- Hoja terminada: solo se cambia lo que el fiscal mandó a validar y aún no respondiste (igual que anotar y quitar).
  if exists (select 1 from public.inv_fiscal_terminos t where t.hoja_id = c.hoja_id and t.user_id = v_yo) then
    if not exists (
      select 1 from public.inv_fiscal_revisiones r
       where r.hoja_id = c.hoja_id and r.ubicacion_id = c.ubicacion_id and r.estado = 'A_VALIDAR'
         and not exists (select 1 from public.inv_fiscal_revision_envios e
                          where e.hoja_id = r.hoja_id and e.ubicacion_id = r.ubicacion_id
                            and e.user_id = v_yo and e.ronda = r.ronda)
    ) then
      raise exception 'Ya terminaste tu hoja. Reábrela para corregir.';
    end if;
    if p_ubicacion <> c.ubicacion_id then raise exception 'Con la hoja terminada no se puede cambiar el sitio del renglón.'; end if;
  end if;

  if num_nonnulls(p_estibas, p_saldo, p_cajas) = 0 then raise exception 'Falta la cantidad.'; end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'Se cuentan estibas (con su saldo) o cajas, no las dos cosas.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if coalesce(p_averia, false) and coalesce(p_pnc, false) then raise exception 'Una estiba es avería o PNC, no las dos cosas.'; end if;
  if coalesce(p_pnc, false) and (p_pnc_rotulo is null or p_pnc_bloqueo is null) then
    raise exception 'El PNC pide dos respuestas: si tiene rótulo y si tiene bloqueo mecánico.';
  end if;
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    update public.inv_fiscal_conteos set
      ubicacion_id = p_ubicacion, producto_id = p_producto,
      estibas = p_estibas, saldo = p_saldo, cajas = p_cajas,
      venc_dia = p_dia, venc_mes = p_mes, venc_anio = p_anio,
      nota = nullif(btrim(coalesce(p_nota, '')), ''), estado_envase = nullif(btrim(coalesce(p_estado, '')), ''),
      averia = coalesce(p_averia, false), pnc = coalesce(p_pnc, false),
      pnc_rotulo = case when coalesce(p_pnc, false) then p_pnc_rotulo end,
      pnc_bloqueo_mecanico = case when coalesce(p_pnc, false) then p_pnc_bloqueo end
     where id = p_id;
  exception
    when unique_violation then raise exception 'No se pudo corregir el renglón.';
    when foreign_key_violation then raise exception 'Ese sitio o ese material no existe.';
  end;
end $$;
revoke all on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.inv_fiscal_contar_corregir(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- LAS FOTOS DEL CONTEO FISCAL (igual que en el conteo normal)
--   · una foto por renglón (obligatoria si es avería), sellada con hora y lugar en el teléfono;
--   · el estado del MÓDULO: «mezclado» y «sin acceso», que piden foto de evidencia.
-- Cada persona ve solo lo suyo (el conteo es a ciegas): todo entra y sale por funciones.
-- Los archivos van al bucket «inventario», en la carpeta «fiscal/».
-- ---------------------------------------------------------------------
create table if not exists public.inv_fiscal_fotos (
  conteo_id   uuid primary key references public.inv_fiscal_conteos(id) on delete cascade,
  hoja_id     uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  ruta        text not null,
  bytes       integer,
  ancho       integer,
  alto        integer,
  tomada_en   timestamptz,
  lat         numeric(10,7),
  lng         numeric(10,7),
  precision_m numeric(8,2),
  subida_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  subida_en   timestamptz not null default now()
);
create index if not exists inv_fiscal_fotos_hoja_idx on public.inv_fiscal_fotos (hoja_id);
alter table public.inv_fiscal_fotos enable row level security;
revoke all on public.inv_fiscal_fotos from public, anon, authenticated;

create table if not exists public.inv_fiscal_modulos (
  hoja_id      uuid not null references public.inv_fiscal_hojas(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  mezclado     boolean not null default false,
  sin_acceso   boolean not null default false,
  ruta         text,
  bytes        integer,
  ancho        integer,
  alto         integer,
  tomada_en    timestamptz,
  lat          numeric(10,7),
  lng          numeric(10,7),
  precision_m  numeric(8,2),
  marcado_en   timestamptz not null default now(),
  primary key (hoja_id, user_id, ubicacion_id)
);
alter table public.inv_fiscal_modulos enable row level security;
revoke all on public.inv_fiscal_modulos from public, anon, authenticated;

drop function if exists public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric);
create function public.inv_fiscal_foto_guardar(
  p_conteo uuid, p_ruta text, p_bytes integer, p_ancho integer, p_alto integer,
  p_tomada timestamptz, p_lat numeric, p_lng numeric, p_precision numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_hoja uuid;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  select c.hoja_id into v_hoja from public.inv_fiscal_conteos c where c.id = p_conteo and c.contado_por = auth.uid();
  if v_hoja is null then raise exception 'Ese renglón no es tuyo o ya no existe.'; end if;
  if coalesce(btrim(p_ruta), '') = '' then raise exception 'Falta la ruta de la foto.'; end if;
  insert into public.inv_fiscal_fotos (conteo_id, hoja_id, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, subida_por, subida_en)
  values (p_conteo, v_hoja, p_ruta, p_bytes, p_ancho, p_alto, p_tomada, p_lat, p_lng, p_precision, auth.uid(), now())
  on conflict (conteo_id) do update
    set ruta = excluded.ruta, bytes = excluded.bytes, ancho = excluded.ancho, alto = excluded.alto,
        tomada_en = excluded.tomada_en, lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m,
        subida_por = auth.uid(), subida_en = now();
end $$;
revoke all on function public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) from public, anon;
grant execute on function public.inv_fiscal_foto_guardar(uuid, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) to authenticated;

drop function if exists public.inv_fiscal_mis_fotos(uuid);
create function public.inv_fiscal_mis_fotos(p_hoja uuid)
returns table (conteo_id uuid, ruta text)
language sql
stable
security definer
set search_path = public
as $$
  select f.conteo_id, f.ruta from public.inv_fiscal_fotos f
   where f.hoja_id = p_hoja and f.subida_por = auth.uid()
$$;
revoke all on function public.inv_fiscal_mis_fotos(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_fotos(uuid) to authenticated;

drop function if exists public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric);
create function public.inv_fiscal_modulo_marcar(
  p_hoja uuid, p_ubicacion uuid, p_mezclado boolean, p_sin_acceso boolean,
  p_ruta text, p_bytes integer, p_ancho integer, p_alto integer, p_tomada timestamptz,
  p_lat numeric, p_lng numeric, p_precision numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_pub timestamptz;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para contar.'; end if;
  select f.estado, f.publicado_en into v_estado, v_pub
    from public.inv_fiscal_miembros m join public.inv_fiscales f on f.id = m.fiscal_id
   where m.hoja_id = p_hoja and m.user_id = auth.uid();
  if v_estado is null then raise exception 'Esa hoja no es tuya.'; end if;
  if v_pub is null then raise exception 'Este inventario fiscal no está visible en Contar.'; end if;
  if v_estado <> 'abierto' then raise exception 'Este inventario fiscal ya está cerrado.'; end if;
  if not coalesce(p_mezclado, false) and not coalesce(p_sin_acceso, false) then
    delete from public.inv_fiscal_modulos where hoja_id = p_hoja and user_id = auth.uid() and ubicacion_id = p_ubicacion;
    return;
  end if;
  insert into public.inv_fiscal_modulos (hoja_id, user_id, ubicacion_id, mezclado, sin_acceso, ruta, bytes, ancho, alto, tomada_en, lat, lng, precision_m, marcado_en)
  values (p_hoja, auth.uid(), p_ubicacion, coalesce(p_mezclado, false), coalesce(p_sin_acceso, false), p_ruta, p_bytes, p_ancho, p_alto, p_tomada, p_lat, p_lng, p_precision, now())
  on conflict (hoja_id, user_id, ubicacion_id) do update
    set mezclado = excluded.mezclado, sin_acceso = excluded.sin_acceso,
        ruta = coalesce(excluded.ruta, public.inv_fiscal_modulos.ruta),
        bytes = case when excluded.ruta is null then public.inv_fiscal_modulos.bytes else excluded.bytes end,
        ancho = case when excluded.ruta is null then public.inv_fiscal_modulos.ancho else excluded.ancho end,
        alto = case when excluded.ruta is null then public.inv_fiscal_modulos.alto else excluded.alto end,
        tomada_en = case when excluded.ruta is null then public.inv_fiscal_modulos.tomada_en else excluded.tomada_en end,
        lat = case when excluded.ruta is null then public.inv_fiscal_modulos.lat else excluded.lat end,
        lng = case when excluded.ruta is null then public.inv_fiscal_modulos.lng else excluded.lng end,
        precision_m = case when excluded.ruta is null then public.inv_fiscal_modulos.precision_m else excluded.precision_m end,
        marcado_en = now();
end $$;
revoke all on function public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) from public, anon;
grant execute on function public.inv_fiscal_modulo_marcar(uuid, uuid, boolean, boolean, text, integer, integer, integer, timestamptz, numeric, numeric, numeric) to authenticated;

drop function if exists public.inv_fiscal_mis_modulos(uuid);
create function public.inv_fiscal_mis_modulos(p_hoja uuid)
returns table (ubicacion_id uuid, mezclado boolean, sin_acceso boolean, ruta text)
language sql
stable
security definer
set search_path = public
as $$
  select m.ubicacion_id, m.mezclado, m.sin_acceso, m.ruta from public.inv_fiscal_modulos m
   where m.hoja_id = p_hoja and m.user_id = auth.uid()
$$;
revoke all on function public.inv_fiscal_mis_modulos(uuid) from public, anon;
grant execute on function public.inv_fiscal_mis_modulos(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_contar_agregar(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text,boolean,boolean,boolean,boolean)') is null
     or to_regprocedure('public.inv_fiscal_contar_mios(uuid)') is null
     or to_regprocedure('public.inv_fiscal_contar_corregir(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text,boolean,boolean,boolean,boolean)') is null
     or to_regprocedure('public.inv_fiscal_foto_guardar(uuid,text,integer,integer,integer,timestamptz,numeric,numeric,numeric)') is null
     or to_regprocedure('public.inv_fiscal_modulo_marcar(uuid,uuid,boolean,boolean,text,integer,integer,integer,timestamptz,numeric,numeric,numeric)') is null then
    raise exception 'No quedaron las funciones de contar con estado.';
  end if;
end $$;

commit;
select 'OK · estado del envase en el conteo fiscal' as resultado;
