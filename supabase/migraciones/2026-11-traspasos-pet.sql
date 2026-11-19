-- =====================================================================
-- TRASPASOS · PET POR FORMATO
--
-- «Mi idea: ir sacando la tendencia, cuántos Vhs de acuerdo al formato
-- (200, 330, 1000, 1.500) debo programar según el promedio.»
--
-- Para eso cada Vh de PET tiene que decir QUÉ llevó. Desde aquí:
--   · al registrar un viaje de un tipo PET (Maestro → Tipos, «Pide SKU»
--     = PET) se escoge el SKU y las estibas, como con el casco;
--   · el FORMATO sale solo del maestro de productos (el contenido en ml;
--     si no está, se lee del nombre: «330cc», «1.5L», «1000 ML»);
--   · Traspasos › PET muestra los Vhs por formato y Traspasos › Programar
--     PET el promedio, la tendencia y cuántos programar.
--
--   traspasos_viaje_pet      los renglones SKU + estibas de cada Vh.
--   traspasos_formato_ml()   el formato de un producto, en ml.
--   traspaso_pet_catalogo()  los productos PET que se pueden escoger.
--   traspaso_pet_guardar()   guarda los renglones de un viaje.
--   v_traspasos_pet          un renglón por Vh y SKU, con fecha, turno,
--                            placa, ruta, formato, estibas, pacas y HL.
--
-- No mueve inventario (el PET no tiene tabla de casco): solo cuenta.
-- PERMISOS (Admin › Roles): Traspasos › PET y Traspasos › Programar PET.
-- Se puede correr varias veces.
-- =====================================================================
begin;

-- Que el tipo PET pida SKU (si todavía no lo hace).
update public.traspasos_tipos set materiales = 'pet'
 where materiales is null and (clave = 'pet' or nombre ilike 'pet' or nombre ilike 'pet %');

-- ---------------------------------------------------------------------
-- 1. EL FORMATO DE UN PRODUCTO, EN ML
-- ---------------------------------------------------------------------
create or replace function public.traspasos_formato_ml(p_nombre text, p_contenido numeric)
returns integer
language plpgsql immutable
as $$
declare m text[]; v numeric;
begin
  if p_contenido is not null and p_contenido > 0 then
    -- El maestro trae el contenido en cc (= ml). Algunos lo traen en litros (1,5): se pasa a ml.
    return round(case when p_contenido < 10 then p_contenido * 1000 else p_contenido end);
  end if;
  m := regexp_match(lower(coalesce(p_nombre, '')), '(\d+(?:[.,]\d+)?)\s*(cc|ml|lts?|l)\M');
  if m is null then return null; end if;
  v := replace(m[1], ',', '.')::numeric;
  if m[2] in ('l', 'lt', 'lts') then v := v * 1000; end if;
  return round(v);
end $$;

-- ---------------------------------------------------------------------
-- 2. LOS RENGLONES DEL VIAJE
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_viaje_pet (
  id          uuid primary key default gen_random_uuid(),
  viaje       uuid not null references public.traspasos_viajes(id) on delete cascade,
  sku         text not null,
  estibas     numeric(12,2) not null check (estibas > 0),
  /* El formato al registrar (si mañana cambia el maestro, lo que salió no cambia). */
  formato_ml  integer,
  creado_por  uuid references public.perfiles(id) on delete set null,
  creado_en   timestamptz not null default now(),
  constraint traspasos_viaje_pet_unico unique (viaje, sku)
);
create index if not exists traspasos_viaje_pet_viaje_idx on public.traspasos_viaje_pet (viaje);

alter table public.traspasos_viaje_pet enable row level security;
drop policy if exists traspasos_viaje_pet_ver on public.traspasos_viaje_pet;
create policy traspasos_viaje_pet_ver on public.traspasos_viaje_pet
  for select to authenticated
  using ((select public.puede_ver('/traspasos')) or (select public.puede_ver('/traspasos/pet'))
         or (select public.puede_ver('/traspasos/pet/programar')));
revoke insert, update, delete on public.traspasos_viaje_pet from authenticated;
grant select on public.traspasos_viaje_pet to authenticated;

-- ---------------------------------------------------------------------
-- 3. LO QUE SE PUEDE ESCOGER: los productos PET activos del maestro
-- ---------------------------------------------------------------------
create or replace function public.traspaso_pet_catalogo()
returns table (sku text, nombre text, formato_ml integer, cajas_por_estiba integer, hl_estiba numeric)
language sql stable security definer
set search_path = public
as $$
  select p.sku, p.nombre, public.traspasos_formato_ml(p.nombre, p.contenido),
         p.cajas_por_estiba, public.casco_hl_estiba(p.sku)
    from public.productos p
   where p.activo
     and (p.tipo_envase ilike 'pet' or p.familia ilike '%pet%' or p.nombre ~* '\mpet\M')
     and upper(coalesce(p.tipo_material, 'PRODUCTO')) = 'PRODUCTO'
   order by public.traspasos_formato_ml(p.nombre, p.contenido) nulls last, p.nombre
$$;
grant execute on function public.traspaso_pet_catalogo() to authenticated;

-- ---------------------------------------------------------------------
-- 4. GUARDAR LOS RENGLONES DE UN VIAJE (reemplaza los que tenía)
-- ---------------------------------------------------------------------
create or replace function public.traspaso_pet_guardar(p_viaje uuid, p_filas jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare v public.traspasos_viajes%rowtype; f jsonb; v_n int := 0; v_sku text; v_est numeric; v_fmt int; v_ok boolean;
begin
  if not public.puede_editar('/traspasos') then
    raise exception 'No tienes permiso para registrar viajes.' using errcode = '42501';
  end if;
  select * into v from public.traspasos_viajes where id = p_viaje for update;
  if not found then raise exception 'Ese viaje no existe.'; end if;
  if v.estado <> 'registrado' then raise exception 'Ese viaje está anulado.'; end if;
  if jsonb_typeof(coalesce(p_filas, '[]'::jsonb)) <> 'array' then raise exception 'Los renglones tienen que venir como lista'; end if;

  delete from public.traspasos_viaje_pet where viaje = p_viaje;
  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    v_sku := btrim(coalesce(f->>'sku', ''));
    v_est := round(coalesce(nullif(f->>'estibas', '')::numeric, 0), 2);
    if v_sku = '' then raise exception 'Falta el SKU en un renglón de PET.'; end if;
    if v_est <= 0 then raise exception 'El % va con estibas mayores que cero.', v_sku; end if;
    select true, c.formato_ml into v_ok, v_fmt from public.traspaso_pet_catalogo() c where c.sku = v_sku;
    if not coalesce(v_ok, false) then raise exception 'El % no es un producto PET activo del maestro.', v_sku; end if;
    insert into public.traspasos_viaje_pet (viaje, sku, estibas, formato_ml, creado_por)
    values (p_viaje, v_sku, v_est, v_fmt, auth.uid())
    on conflict (viaje, sku) do update set estibas = public.traspasos_viaje_pet.estibas + excluded.estibas;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.traspaso_pet_guardar(uuid, jsonb) from public, anon;
grant execute on function public.traspaso_pet_guardar(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. LA VISTA: un renglón por Vh y SKU, solo viajes vigentes
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_pet with (security_invoker = true) as
select x.id, x.viaje, v.fecha, v.turno,
       (v.hora at time zone 'America/Bogota')::time as hora,
       v.placa,
       coalesce(po.nombre, v.origen_texto, v.origen)   as origen,
       coalesce(pd.nombre, v.destino_texto, v.destino) as destino,
       x.sku, coalesce(p.nombre, x.sku) as descripcion,
       coalesce(x.formato_ml, public.traspasos_formato_ml(p.nombre, p.contenido)) as formato_ml,
       x.estibas,
       round(x.estibas * p.cajas_por_estiba, 0)              as pacas,
       round(x.estibas * public.casco_hl_estiba(x.sku), 2)  as hl
  from public.traspasos_viaje_pet x
  join public.traspasos_viajes v on v.id = x.viaje and v.estado = 'registrado'
  left join public.productos p on p.sku = x.sku
  left join public.traspasos_puntos po on po.clave = v.origen
  left join public.traspasos_puntos pd on pd.clave = v.destino;
grant select on public.v_traspasos_pet to authenticated;

notify pgrst, 'reload schema';
commit;

do $$
declare v_t int; v_p int;
begin
  select count(*) into v_t from public.traspasos_tipos where materiales = 'pet';
  select count(*) into v_p from public.traspaso_pet_catalogo();
  raise notice '----------------------------------------------------------';
  raise notice 'tipos que piden SKU de PET .... %', v_t;
  raise notice 'productos PET para escoger .... %', v_p;
  if v_t = 0 then raise notice 'OJO: ningún tipo pide PET. En Traspasos › Maestro › Tipos ponle «Pide SKU: PET» al tipo PET.'; end if;
  raise notice 'Siguiente: Admin › Roles → dar Traspasos › PET y Programar PET.';
  raise notice '----------------------------------------------------------';
end $$;
