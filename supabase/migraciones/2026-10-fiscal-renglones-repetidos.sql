-- Inventario fiscal: el mismo material en el mismo sitio se puede anotar VARIAS veces (con o sin vencimiento): todos los renglones quedan y se suman.
-- Seguro de correr más de una vez.

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
    when unique_violation then  -- ya no hay llave única; queda por seguridad
      raise exception 'No se pudo anotar el renglón.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text, boolean, boolean, boolean, boolean) to authenticated;
