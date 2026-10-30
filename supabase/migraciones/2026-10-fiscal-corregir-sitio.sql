-- Inventario fiscal: al corregir un renglón que el fiscal mandó a validar, SE PUEDE CAMBIAR EL SITIO (por si se equivocó de módulo o de lado).
-- Antes, con la hoja terminada, la base lo rechazaba con «no se puede cambiar el sitio del renglón». Seguro de correr más de una vez.

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
