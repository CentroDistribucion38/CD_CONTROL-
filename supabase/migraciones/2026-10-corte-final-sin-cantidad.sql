-- =====================================================================
-- INVENTARIO · CORTE FINAL: SIN «CUÁNTAS ESTIBAS» EN EL MÓDULO DE DONDE SE TOMA
--
-- «En el corte final yo no voy a poner cuánto quedó en ese módulo: esa
-- información la debes tomar del inventario del día, revisando la ubicación.»
--
-- En el corte final solo se dice DE DÓNDE tomaba la línea (calle · módulo ·
-- lado). La cantidad la lee la pantalla del inventario del día (el
-- recorrido enviado de esa fecha): cajas buenas del envase en ese módulo.
--
-- QUÉ CAMBIA EN LA BASE
--   · inv_corte_sitios.cant y .unidad pueden quedar VACÍAS (null). Vacía
--     significa «se lee del inventario», NO cero. Van las dos o ninguna.
--   · inv_corte_guardar acepta un módulo SIN cantidad solo en el ORIGEN de un
--     corte FINAL. En el inicial y en cualquier destino la cantidad sigue
--     siendo obligatoria. Lo demás de la función no cambia.
--
-- Los cortes que ya existen no se tocan. Se puede correr dos veces.
-- =====================================================================
begin;

alter table public.inv_corte_sitios alter column cant drop not null;
alter table public.inv_corte_sitios alter column unidad drop not null;
alter table public.inv_corte_sitios drop constraint if exists inv_corte_sitios_cant_y_unidad;
alter table public.inv_corte_sitios add constraint inv_corte_sitios_cant_y_unidad
  check ((cant is null) = (unidad is null));

drop function if exists public.inv_corte_guardar(uuid, text, uuid, timestamptz, text, jsonb);
create function public.inv_corte_guardar(
  p_bodega    uuid,
  p_tipo      text,
  p_inicial   uuid,
  p_cortado   timestamptz,
  p_nota      text,
  p_renglones jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_ini    public.inv_cortes;
  v_r      jsonb;
  v_linea  text;
  v_vistas text[] := '{}';
  v_cajas  numeric;
  v_mat    uuid;
  v_env    uuid;
  v_rid    uuid;
  v_rol    text;
  v_que    text;
  v_arr    jsonb;
  v_s      jsonb;
  v_ub     uuid;
  v_c      numeric;
  v_un     text;
  v_orden  integer;
  v_vistos uuid[];
begin
  if not public.puede_editar('/inventario/corte') then
    raise exception 'Hacer un corte de líneas requiere el permiso «Corte de líneas» (Roles)';
  end if;
  if p_tipo not in ('inicial', 'final') then
    raise exception 'El corte es inicial o final';
  end if;
  if p_cortado is null then
    raise exception 'Falta la fecha y hora del corte';
  end if;
  if p_cortado > now() + interval '10 minutes' then
    raise exception 'La hora del corte no puede ser del futuro';
  end if;
  if not exists (select 1 from public.bodegas where id = p_bodega) then
    raise exception 'Esa bodega no existe';
  end if;

  if p_tipo = 'final' then
    select * into v_ini from public.inv_cortes where id = p_inicial;
    if v_ini.id is null or v_ini.tipo <> 'inicial' then
      raise exception 'El corte final necesita su corte inicial';
    end if;
    if v_ini.bodega_id <> p_bodega then
      raise exception 'El corte final tiene que ser de la misma bodega que el inicial';
    end if;
    if exists (select 1 from public.inv_cortes where inicial_id = p_inicial) then
      raise exception 'Ese corte inicial ya tiene su corte final';
    end if;
    if p_cortado <= v_ini.cortado_en then
      raise exception 'El corte final tiene que ser DESPUÉS del inicial (%)', to_char(v_ini.cortado_en at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI');
    end if;
  elsif p_inicial is not null then
    raise exception 'Un corte inicial no cierra otro';
  end if;

  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Falta al menos una línea con sus cajas';
  end if;

  insert into public.inv_cortes (bodega_id, tipo, inicial_id, cortado_en, nota)
  values (p_bodega, p_tipo, case when p_tipo = 'final' then p_inicial end, p_cortado,
          nullif(btrim(coalesce(p_nota, '')), ''))
  returning id into v_id;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    if jsonb_typeof(v_r) <> 'object' then
      raise exception 'Cada línea debe traer su clave y sus cajas';
    end if;
    v_linea := btrim(coalesce(v_r ->> 'linea', ''));
    if not exists (select 1 from public.inv_lineas where clave = v_linea and activa) then
      raise exception 'La línea «%» no existe o está apagada', v_linea;
    end if;
    if v_linea = any (v_vistas) then
      raise exception 'La línea % está repetida', v_linea;
    end if;
    v_vistas := v_vistas || v_linea;

    begin
      v_cajas := (v_r ->> 'cajas_depa')::numeric;
    exception when others then
      raise exception 'Las cajas de la depa de % no son un número', v_linea;
    end;
    if v_cajas is null or v_cajas < 0 or v_cajas <> trunc(v_cajas) then
      raise exception 'Las cajas de la depa de % tienen que ser un número entero, cero o más', v_linea;
    end if;

    v_mat := nullif(v_r ->> 'material_id', '')::uuid;
    if v_mat is not null and not exists (select 1 from public.productos where id = v_mat) then
      raise exception 'El material de % no existe', v_linea;
    end if;

    v_env := nullif(v_r ->> 'envase_id', '')::uuid;
    if v_env is not null and not exists (
         select 1 from public.productos where id = v_env and tipo_material = 'ENVASE') then
      raise exception 'El envase de % no existe o no es un envase', v_linea;
    end if;

    insert into public.inv_corte_renglones (corte_id, linea, cajas_depa, material_id, envase_id, nota)
    values (v_id, v_linea, v_cajas, v_mat, v_env, nullif(btrim(coalesce(v_r ->> 'nota', '')), ''))
    returning id into v_rid;

    /* LOS MÓDULOS de cada lado. Llegan como lista; si llega la forma vieja
       (un solo módulo) se vuelve una lista de uno. */
    foreach v_rol in array array['origen', 'destino'] loop
      v_que := case v_rol when 'origen' then 'De dónde tomaba' else 'Dónde estaba ubicado' end;
      v_arr := v_r -> (case v_rol when 'origen' then 'origenes' else 'destinos' end);
      if v_arr is null or jsonb_typeof(v_arr) <> 'array' then
        v_s := v_r -> v_rol;
        v_arr := case when v_s is not null and jsonb_typeof(v_s) = 'object'
                      then jsonb_build_array(v_s) else '[]'::jsonb end;
      end if;
      v_vistos := '{}';
      v_orden := 0;
      for v_s in select * from jsonb_array_elements(v_arr) loop
        if jsonb_typeof(v_s) <> 'object' then
          raise exception '% % está incompleto: falta la ubicación, la cantidad o si son estibas o cajas', v_que, v_linea;
        end if;
        v_ub := nullif(v_s ->> 'ubicacion_id', '')::uuid;
        v_un := v_s ->> 'unidad';
        begin v_c := (v_s ->> 'cant')::numeric; exception when others then v_c := null; end;
        /* EL CORTE FINAL NO PIDE CUÁNTO QUEDÓ en el módulo de donde se tomaba:
           solo el módulo. La cantidad sale del inventario del día, y aquí se
           guarda VACÍA (no cero). Solo el origen del final; en el inicial, y en
           cualquier destino, la cantidad sigue siendo obligatoria. */
        if p_tipo = 'final' and v_rol = 'origen'
           and (v_s -> 'cant' is null or jsonb_typeof(v_s -> 'cant') = 'null')
           and (v_s -> 'unidad' is null or jsonb_typeof(v_s -> 'unidad') = 'null') then
          if v_ub is null then
            raise exception '% % está incompleto: falta la ubicación', v_que, v_linea;
          end if;
          v_c := null; v_un := null;
        elsif v_ub is null or v_c is null or v_c < 0 or coalesce(v_un, '') not in ('estibas', 'cajas') then
          raise exception '% % está incompleto: falta la ubicación, la cantidad o si son estibas o cajas', v_que, v_linea;
        end if;
        if not exists (select 1 from public.ubicaciones where id = v_ub and bodega_id = p_bodega) then
          raise exception 'La ubicación de % de % no es de esta bodega', v_rol, v_linea;
        end if;
        if v_ub = any (v_vistos) then
          raise exception '%: el mismo módulo está repetido en %', v_que, v_linea;
        end if;
        v_vistos := v_vistos || v_ub;
        insert into public.inv_corte_sitios (renglon_id, rol, orden, ubicacion_id, cant, unidad)
        values (v_rid, v_rol, v_orden, v_ub, v_c, v_un);
        v_orden := v_orden + 1;
      end loop;
    end loop;
  end loop;

  return v_id;
end $$;

revoke all on function public.inv_corte_guardar(uuid, text, uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function public.inv_corte_guardar(uuid, text, uuid, timestamptz, text, jsonb) to authenticated;

/* COMPROBACIÓN: la función quedó aceptando el módulo sin cantidad, y la columna lo permite. */
do $$
begin
  if pg_get_functiondef(to_regprocedure('public.inv_corte_guardar(uuid,text,uuid,timestamptz,text,jsonb)')) not like '%inventario del día%' then
    raise exception 'inv_corte_guardar no quedó con el origen del final sin cantidad.';
  end if;
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'inv_corte_sitios' and column_name = 'cant') <> 'YES' then
    raise exception 'inv_corte_sitios.cant sigue sin aceptar vacío.';
  end if;
end $$;

commit;
