-- =====================================================================
-- TRASPASOS · PET: EL SKU ES OBLIGATORIO
--
-- «Debe ser obligatorio que pongan qué SKU es.»
--
--   · traspaso_registrar_con_pet: registra el viaje (traspaso_registrar_varios) y su PET (traspaso_pet_guardar) en UNA sola
--     llamada. Si falta el SKU o el PET no se puede guardar, NO se registra el viaje (antes eran dos llamadas y, si la segunda
--     fallaba, el viaje quedaba sin SKU y salía «Sin formato»).
--   · Candado en la base: un Vh de PET con carga registrado desde hoy que al final de la operación no tenga su SKU se rechaza
--     («El Vh de PET va con su SKU»), venga de donde venga (también de una pantalla vieja que no se haya actualizado).
--     Los viajes de más de un día atrás no se tocan.
--
-- Necesita 2026-11-traspasos-pet.sql. Se puede correr varias veces.
-- =====================================================================
begin;

create or replace function public.traspaso_es_pet(p_tipo text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.traspasos_tipos t
                  where t.clave = p_tipo
                    and (t.materiales = 'pet' or t.clave = 'pet' or t.nombre ilike 'pet' or t.nombre ilike 'pet %'))
$$;

drop function if exists public.traspaso_registrar_con_pet(date, text, jsonb, text, text, text, text, text, boolean, jsonb);
create function public.traspaso_registrar_con_pet(
  p_fecha     date,
  p_turno     text,
  p_tipos     jsonb,
  p_placa     text,
  p_origen    text,
  p_destino   text,
  p_documento text,
  p_nota      text default null,
  p_arenosa   boolean default false,
  p_pet       jsonb default '[]'::jsonb
)
returns table (id uuid, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_cod text; v_n int;
begin
  if jsonb_typeof(coalesce(p_pet, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_pet, '[]'::jsonb)) = 0 then
    raise exception 'El Vh de PET va con su SKU: escoge qué SKU lleva y cuántas estibas.';
  end if;
  select r.id, r.codigo into v_id, v_cod
    from public.traspaso_registrar_varios(p_fecha, p_turno, p_tipos, p_placa, p_origen, p_destino, p_documento, p_nota, p_arenosa) r;
  v_n := public.traspaso_pet_guardar(v_id, p_pet);
  if coalesce(v_n, 0) = 0 then
    raise exception 'El Vh de PET va con su SKU: escoge qué SKU lleva y cuántas estibas.';
  end if;
  return query select v_id, v_cod;
end $$;
revoke all on function public.traspaso_registrar_con_pet(date, text, jsonb, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.traspaso_registrar_con_pet(date, text, jsonb, text, text, text, text, text, boolean, jsonb) to authenticated;

/* EL CANDADO: se revisa al FINAL de la operación (deferred), cuando el viaje y su PET ya entraron juntos. */
create or replace function public.traspasos_pet_exige_sku() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v public.traspasos_viajes%rowtype;
begin
  select * into v from public.traspasos_viajes where id = new.viaje_id;
  if not found or v.estado <> 'registrado' or coalesce(v.vacio, false) then return null; end if;
  /* Los viajes de antes (más de un día atrás) no se tocan aunque se editen. */
  if v.fecha < (now() at time zone 'America/Bogota')::date - 1 then return null; end if;
  if not public.traspaso_es_pet(new.tipo) then return null; end if;
  if not exists (select 1 from public.traspasos_viaje_pet x where x.viaje = new.viaje_id) then
    raise exception 'El Vh de PET va con su SKU: escoge qué SKU lleva y cuántas estibas (actualiza la pantalla si no te sale).'
      using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists traspasos_pet_exige_sku on public.traspasos_viaje_tipos;
create constraint trigger traspasos_pet_exige_sku
  after insert on public.traspasos_viaje_tipos
  deferrable initially deferred
  for each row execute function public.traspasos_pet_exige_sku();

commit;
select 'OK · el Vh de PET ya no se registra sin su SKU' as resultado;
