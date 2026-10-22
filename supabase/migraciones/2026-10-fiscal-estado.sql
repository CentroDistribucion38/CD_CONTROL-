-- =====================================================================
-- INVENTARIO FISCAL · ESTADO DEL ENVASE EN EL CONTEO (el conteo fiscal es gemelo del normal)
--
-- En el conteo normal el envase se cuenta con su estado (RETORNO, LAVADO, NUEVO, BAJA, EXTRASUCIO,
-- OTROS, MAL ESTADO; el cilindro, LLENO o VACÍO). El fiscal ahora también lo pide:
--   · el mismo material, sitio y vencimiento con otro estado es OTRO renglón;
--   · el cruce y la validación comparan también el estado;
--   · al mandar a La base el estado va con el renglón.
--
-- Orden: correr DESPUÉS de 2026-10-fiscal-consolidar.sql y ANTES de 2026-10-fiscal-modulo.sql.
-- Se puede correr dos veces. No borra conteos.
-- =====================================================================
begin;

alter table public.inv_fiscal_conteos add column if not exists estado_envase text;
drop index if exists public.inv_fiscal_conteos_unico;
create unique index inv_fiscal_conteos_unico on public.inv_fiscal_conteos
  (hoja_id, contado_por, ubicacion_id, producto_id, venc_dia, venc_mes, venc_anio, estado_envase) nulls not distinct;

drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text);
drop function if exists public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text);
create function public.inv_fiscal_contar_agregar(
  p_hoja uuid, p_ubicacion uuid, p_producto uuid,
  p_estibas integer, p_saldo integer, p_cajas integer,
  p_dia smallint, p_mes smallint, p_anio smallint, p_nota text, p_estado text default null
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
  if num_nonnulls(p_dia, p_mes, p_anio) not in (0, 3) then raise exception 'La fecha de vencimiento va completa (día, mes y año) o vacía.'; end if;
  if p_dia is not null and not (p_dia between 1 and 31 and p_mes between 1 and 12 and p_anio between 0 and 99) then
    raise exception 'La fecha de vencimiento no es válida.';
  end if;

  begin
    insert into public.inv_fiscal_conteos
      (fiscal_id, hoja_id, equipo, contado_por, ubicacion_id, producto_id, estibas, saldo, cajas, venc_dia, venc_mes, venc_anio, nota, estado_envase)
    values
      (v_fiscal, p_hoja, v_equipo, v_yo, p_ubicacion, p_producto, p_estibas, p_saldo, p_cajas, p_dia, p_mes, p_anio,
       nullif(btrim(coalesce(p_nota, '')), ''), nullif(btrim(coalesce(p_estado, '')), ''))
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ya anotaste ese material en ese sitio con ese vencimiento y estado. Quita el renglón anterior y vuelve a anotarlo.';
    when foreign_key_violation then
      raise exception 'Ese sitio o ese material no existe.';
  end;
  return v_id;
end $$;
revoke all on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text) from public, anon;
grant execute on function public.inv_fiscal_contar_agregar(uuid, uuid, uuid, integer, integer, integer, smallint, smallint, smallint, text, text) to authenticated;

drop function if exists public.inv_fiscal_contar_mios(uuid);
create function public.inv_fiscal_contar_mios(p_hoja uuid)
returns table (
  id uuid, ubicacion_id uuid, ubicacion text, producto_id uuid, sku text, material text,
  estibas integer, saldo integer, cajas integer, total_cajas bigint,
  venc_dia smallint, venc_mes smallint, venc_anio smallint, nota text, contado_en timestamptz, estado_envase text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.ubicacion_id, u.clave, c.producto_id, p.sku, p.nombre,
         c.estibas, c.saldo, c.cajas,
         (coalesce(p.cajas_por_estiba, 0) * coalesce(c.estibas, 0) + coalesce(c.saldo, 0) + coalesce(c.cajas, 0))::bigint,
         c.venc_dia, c.venc_mes, c.venc_anio, c.nota, c.contado_en, c.estado_envase
    from public.inv_fiscal_conteos c
    join public.ubicaciones u on u.id = c.ubicacion_id
    join public.productos p on p.id = c.producto_id
   where c.hoja_id = p_hoja and c.contado_por = auth.uid()
   order by c.contado_en desc
$$;
revoke all on function public.inv_fiscal_contar_mios(uuid) from public, anon;
grant execute on function public.inv_fiscal_contar_mios(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_fiscal_contar_agregar(uuid,uuid,uuid,integer,integer,integer,smallint,smallint,smallint,text,text)') is null
     or to_regprocedure('public.inv_fiscal_contar_mios(uuid)') is null then
    raise exception 'No quedaron las funciones de contar con estado.';
  end if;
end $$;

commit;
select 'OK · estado del envase en el conteo fiscal' as resultado;
