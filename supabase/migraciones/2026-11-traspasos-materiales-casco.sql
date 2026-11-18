-- =====================================================================
-- TRASPASOS · SKU Y CANTIDAD DEL CASCO DE VIDRIO EN CADA VIAJE
-- ---------------------------------------------------------------------
-- «Necesito que agreguemos el SKU y la cantidad … de acuerdo a lo que
--  tenga en inventario. Si es de Bodega 38 es del casco AG22, si es de
--  Fábrica es AG18 … solo me deben salir los SKU que tengan inventario y
--  en cantidad que pueda registrar, ni más ni menos; si intento sacar
--  más, que salga en rojo y no me deje. Se descuenta en casco cuando el
--  facturador dé el aval (cuando pone el número del DOC).»
--
-- LO QUE DECIDIÓ:
--   · La cantidad va en ESTIBAS (y se muestra su equivalente en HL).
--   · Lo registrado y todavía sin DOC queda APARTADO: otro viaje no
--     puede sacar esas mismas estibas.
--   · Al dar el aval se RESTA del casco de origen y se SUMA en el casco
--     de destino (si el destino tiene casco; si no —un cliente, una
--     bodega sin tabla— solo se resta).
--   · Se mueve la columna «Inventario casco de vidrio» (la misma que
--     mueve Casco → Registrar → Movimiento); la de «con baja» no.
--
-- CÓMO ESTÁ ARMADO:
--   1. traspasos_tipos.materiales  → qué tipos piden SKU: 'casco' (y
--      'pet', para el paso siguiente). Se siembra con Casco vidrio y
--      Envase; se cambia en Traspasos → Maestro → Tipos.
--   2. traspasos_puntos.casco_ubicacion → a qué tabla de casco
--      corresponde cada bodega (Bodega 38 → AG22, Fábrica → AG18,
--      Carnaval → AG07…). Se siembra por el nombre.
--   3. traspasos_viaje_materiales  → los renglones SKU + estibas.
--   4. traspaso_casco_disponible()  → lo que hay: inventario − apartado.
--   5. traspaso_materiales_guardar()→ guarda los renglones, revisando que
--      alcance (la base es la que manda, no solo la pantalla).
--   6. Un disparador en traspasos_viajes: al poner el DOC (salida_en)
--      descuenta y suma en casco y deja el movimiento en
--      Casco → Movimientos con el número de entrega; si facturación
--      reabre la salida, lo devuelve.
--
-- NO TOCA traspaso_registrar_varios ni traspaso_confirmar_salida: esas
-- funciones tienen muchas reglas acumuladas y reescribirlas ya ha hecho
-- perder reglas. Se cuelga de ellas (igual que la cédula del vidrio).
--
-- Correr DESPUÉS de los SQL de casco (2026-10-casco-movimientos.sql) y de
-- traspasos (2026-09-traspasos-facturacion.sql). Se puede correr varias veces.
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.casco_aplicar_delta(date, text, text, numeric)') is null then
    raise exception 'Primero corre supabase/migraciones/2026-10-casco-movimientos.sql';
  end if;
  if to_regprocedure('public.traspaso_confirmar_salida(uuid, text)') is null then
    raise exception 'Primero corre supabase/migraciones/2026-09-traspasos-facturacion.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. QUÉ TIPOS PIDEN SKU
-- ---------------------------------------------------------------------
alter table public.traspasos_tipos add column if not exists materiales text;
do $$ begin
  alter table public.traspasos_tipos add constraint traspasos_tipos_materiales_ck check (materiales in ('casco', 'pet'));
exception when duplicate_object then null; end $$;

/* `is null`: si alguien ya lo cambió a mano, volver a correr esto no se lo pisa. */
update public.traspasos_tipos set materiales = 'casco'
 where materiales is null and not coalesce(lleva_vidrio, false)
   and (clave = 'casco_vidrio' or nombre ilike 'casco%vidrio%');  -- SOLO casco de vidrio
update public.traspasos_tipos set materiales = 'pet'
 where materiales is null and (clave = 'pet' or nombre ilike 'pet');

-- ---------------------------------------------------------------------
-- 2. A QUÉ CASCO CORRESPONDE CADA BODEGA
-- ---------------------------------------------------------------------
alter table public.traspasos_puntos add column if not exists casco_ubicacion text
  references public.casco_ubicaciones(clave) on delete set null;

update public.traspasos_puntos p set casco_ubicacion = u.clave
  from public.casco_ubicaciones u
 where p.casco_ubicacion is null
   and (upper(btrim(p.clave)) = upper(u.clave) or upper(btrim(p.nombre)) = upper(u.clave)
        or upper(btrim(p.nombre)) = upper(u.nombre)
        or (u.centro is not null and upper(p.nombre) like '%' || u.centro || '%'));

-- ---------------------------------------------------------------------
-- 3. LOS RENGLONES DEL VIAJE
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_viaje_materiales (
  id            uuid primary key default gen_random_uuid(),
  viaje         uuid not null references public.traspasos_viajes(id) on delete cascade,
  tipo          text not null references public.traspasos_tipos(clave),
  sku           text not null,
  estibas       numeric(12,2) not null check (estibas > 0),
  /* Las tablas de casco que mueve: se guardan al registrar (la bodega del viaje puede cambiar de maestro después). */
  ubic_origen   text references public.casco_ubicaciones(clave),
  ubic_destino  text references public.casco_ubicaciones(clave),
  /* Cuándo se descontó en casco (al poner el DOC) y el movimiento que quedó en Casco. NULL = apartado, sin descontar. */
  aplicado_en   timestamptz,
  aplicado_fecha date,
  casco_mov     uuid references public.casco_movimientos(id) on delete set null,
  creado_por    uuid references public.perfiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint traspasos_viaje_materiales_unico unique (viaje, tipo, sku)
);
create index if not exists traspasos_viaje_materiales_viaje_idx on public.traspasos_viaje_materiales (viaje);
create index if not exists traspasos_viaje_materiales_apartado_idx
  on public.traspasos_viaje_materiales (ubic_origen, sku) where aplicado_en is null;

alter table public.traspasos_viaje_materiales enable row level security;
drop policy if exists traspasos_viaje_materiales_ver on public.traspasos_viaje_materiales;
create policy traspasos_viaje_materiales_ver on public.traspasos_viaje_materiales
  for select to authenticated
  using ((select public.puede_ver('/traspasos')) or (select public.puede_ver('/traspasos/facturacion')));
revoke insert, update, delete on public.traspasos_viaje_materiales from authenticated;
grant select on public.traspasos_viaje_materiales to authenticated;

create or replace view public.v_traspasos_viaje_materiales
with (security_invoker = true) as
  select m.id, m.viaje, m.tipo, m.sku, coalesce(p.nombre, e.nombre, m.sku) as descripcion,
         m.estibas, round(m.estibas * public.casco_hl_estiba(m.sku), 2) as hl,
         m.ubic_origen, m.ubic_destino, m.aplicado_en, m.creado_en
    from public.traspasos_viaje_materiales m
    left join public.productos p on p.sku = m.sku
    left join public.casco_extras e on e.sku = m.sku;
grant select on public.v_traspasos_viaje_materiales to authenticated;

-- ---------------------------------------------------------------------
-- 4. LO QUE SE PUEDE DESPACHAR: inventario del casco − lo apartado
-- ---------------------------------------------------------------------
-- El inventario es el del último día registrado en esa tabla de casco (hasta hoy).
-- Apartado = renglones de viajes registrados que todavía no tienen DOC. `p_menos` deja por fuera un viaje
-- (el que se está corrigiendo, para que no se aparte a sí mismo).
create or replace function public.traspaso_casco_disponible(p_ubic text, p_menos uuid default null)
returns table (sku text, descripcion text, inventario numeric, apartado numeric, disponible numeric, hl_estiba numeric)
language sql stable security definer
set search_path = public
as $$
  with dia as (
    select max(fecha) as f from public.casco_registros
     where ubicacion = p_ubic and fecha <= (now() at time zone 'America/Bogota')::date
  ), inv as (
    select r.sku, coalesce(r.inventario, 0) as inventario
      from public.casco_registros r, dia
     where r.ubicacion = p_ubic and r.fecha = dia.f
  ), apa as (
    select m.sku, sum(m.estibas) as apartado
      from public.traspasos_viaje_materiales m
      join public.traspasos_viajes v on v.id = m.viaje
     where m.ubic_origen = p_ubic and m.aplicado_en is null
       and v.estado = 'registrado' and v.salida_en is null
       and (p_menos is null or m.viaje <> p_menos)
     group by m.sku
  )
  select i.sku, coalesce(p.nombre, e.nombre, i.sku), i.inventario, coalesce(a.apartado, 0),
         i.inventario - coalesce(a.apartado, 0), public.casco_hl_estiba(i.sku)
    from inv i
    left join apa a on a.sku = i.sku
    left join public.productos p on p.sku = i.sku
    left join public.casco_extras e on e.sku = i.sku
   where (select public.puede_ver('/traspasos')) or (select public.puede_ver('/traspasos/facturacion'))
   order by 2
$$;
grant execute on function public.traspaso_casco_disponible(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. GUARDAR LOS RENGLONES DE UN VIAJE
-- ---------------------------------------------------------------------
-- p_filas = [{ "tipo": "envase", "sku": "3500005", "estibas": 10 }, …]. Reemplaza los renglones del viaje.
-- Todo o nada: si un renglón no alcanza, no queda ninguno y se dice cuál y cuánto hay.
create or replace function public.traspaso_materiales_guardar(p_viaje uuid, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.traspasos_viajes%rowtype; f jsonb; v_n int := 0;
  v_tipo text; v_sku text; v_est numeric; v_uo text; v_ud text; v_disp numeric; v_nom text;
begin
  if not public.puede_editar('/traspasos') then
    raise exception 'No tienes permiso para registrar viajes.' using errcode = '42501';
  end if;
  select * into v from public.traspasos_viajes where id = p_viaje for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado.'; end if;
  if v.salida_en is not null then raise exception 'Ese viaje ya salió con DOC: el material ya no se cambia.'; end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then raise exception 'Los renglones tienen que venir como lista'; end if;

  select casco_ubicacion into v_uo from public.traspasos_puntos where clave = v.origen;
  select casco_ubicacion into v_ud from public.traspasos_puntos where clave = v.destino;

  delete from public.traspasos_viaje_materiales where viaje = p_viaje;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_tipo := btrim(coalesce(f->>'tipo', ''));
    v_sku  := btrim(coalesce(f->>'sku', ''));
    v_est  := round(coalesce(nullif(f->>'estibas', '')::numeric, 0), 2);
    if v_sku = '' then raise exception 'Falta el SKU en un renglón.'; end if;
    if v_est <= 0 then raise exception 'El % va con cantidad mayor que cero.', v_sku; end if;
    if not exists (select 1 from public.traspasos_tipos where clave = v_tipo and materiales = 'casco') then
      raise exception 'El tipo % no lleva casco de vidrio.', v_tipo;
    end if;
    if v_uo is null then
      raise exception 'La bodega de origen no tiene inventario de casco de vidrio: escoge en el Maestro a qué casco corresponde.';
    end if;
    if public.casco_hl_estiba(v_sku) is null then
      raise exception 'El % no tiene botellas por estiba o HL en el maestro: complétalo en Inventario → Maestro.', v_sku;
    end if;

    select d.disponible, d.descripcion into v_disp, v_nom
      from public.traspaso_casco_disponible(v_uo, p_viaje) d where d.sku = v_sku;
    if v_disp is null then
      raise exception 'En el casco de origen no hay % registrado.', v_sku;
    end if;
    if v_est > v_disp + 0.004 then
      raise exception 'Del % (%) solo se pueden despachar % estibas y el viaje lleva %.',
        v_sku, v_nom, trim_scale(greatest(v_disp, 0)), trim_scale(v_est);
    end if;

    insert into public.traspasos_viaje_materiales (viaje, tipo, sku, estibas, ubic_origen, ubic_destino, creado_por)
    values (p_viaje, v_tipo, v_sku, v_est, v_uo, v_ud, auth.uid())
    on conflict (viaje, tipo, sku) do update set estibas = public.traspasos_viaje_materiales.estibas + excluded.estibas;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.traspaso_materiales_guardar(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. EL AVAL DEL FACTURADOR DESCUENTA (y reabrir lo devuelve)
-- ---------------------------------------------------------------------
create or replace function public.traspasos_materiales_al_aval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.traspasos_viaje_materiales%rowtype;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_o text; v_d text; v_mov uuid;
begin
  /* EL AVAL: el viaje recibe su DOC. */
  if old.salida_en is null and new.salida_en is not null then
    select coalesce(nombre, new.origen) into v_o from public.traspasos_puntos where clave = new.origen;
    select coalesce(nombre, new.destino) into v_d from public.traspasos_puntos where clave = new.destino;
    for m in select * from public.traspasos_viaje_materiales where viaje = new.id and aplicado_en is null loop
      insert into public.casco_movimientos
        (fecha, origen, destino, ubic_origen, ubic_destino, sku, estibas, entrega, placa, afecta, creado_por)
      values
        (v_hoy, coalesce(v_o, new.origen, '—'), coalesce(v_d, new.destino, '—'), m.ubic_origen, m.ubic_destino,
         m.sku, m.estibas, new.factura_documento, new.placa, true, auth.uid())
      returning id into v_mov;
      if m.ubic_destino is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_destino, m.sku, m.estibas); end if;
      if m.ubic_origen is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_origen, m.sku, -m.estibas); end if;
      update public.traspasos_viaje_materiales
         set aplicado_en = now(), aplicado_fecha = v_hoy, casco_mov = v_mov
       where id = m.id;
    end loop;

  /* REABRIR LA SALIDA: lo descontado vuelve, hoy. */
  elsif old.salida_en is not null and new.salida_en is null then
    for m in select * from public.traspasos_viaje_materiales where viaje = new.id and aplicado_en is not null loop
      if m.ubic_origen is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_origen, m.sku, m.estibas); end if;
      if m.ubic_destino is not null then perform public.casco_aplicar_delta(v_hoy, m.ubic_destino, m.sku, -m.estibas); end if;
      if m.casco_mov is not null then delete from public.casco_movimientos where id = m.casco_mov; end if;
      update public.traspasos_viaje_materiales set aplicado_en = null, aplicado_fecha = null, casco_mov = null where id = m.id;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.traspasos_materiales_al_aval() from public, anon, authenticated;

drop trigger if exists traspasos_materiales_al_aval on public.traspasos_viajes;
create trigger traspasos_materiales_al_aval
  after update of salida_en on public.traspasos_viajes
  for each row execute function public.traspasos_materiales_al_aval();

-- ---------------------------------------------------------------------
-- 7. LO QUE QUEDÓ
-- ---------------------------------------------------------------------
do $$
declare v_t text; v_p text;
begin
  select string_agg(nombre, ', ' order by nombre) into v_t from public.traspasos_tipos where materiales = 'casco';
  select string_agg(p.nombre || ' → ' || u.nombre, ' · ' order by p.nombre) into v_p
    from public.traspasos_puntos p join public.casco_ubicaciones u on u.clave = p.casco_ubicacion;
  raise notice '--------------------------------------------------------';
  raise notice 'TIPOS QUE PIDEN SKU DE CASCO: %', coalesce(v_t, '(ninguno: escógelos en Traspasos → Maestro → Tipos)');
  raise notice 'BODEGAS CON CASCO: %', coalesce(v_p, '(ninguna: escógelas en Traspasos → Maestro → Bodegas)');
  raise notice '--------------------------------------------------------';
end $$;

notify pgrst, 'reload schema';
commit;
