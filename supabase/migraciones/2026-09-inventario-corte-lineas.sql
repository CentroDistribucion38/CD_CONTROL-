-- =====================================================================
-- INVENTARIO · CORTE DE LÍNEAS (ANTES DEL CONTEO)
--
-- «Antes del conteo se requiere el corte de las líneas: L1, L2, L4, L6, y de
--  cada una el corte por DEPA en cajas. Ejemplo: a las 06:00 del 30/09/2026
--  han pasado 18801, y estaban tomando de tal módulo (calle · módulo · lado)
--  con tantas estibas o cajas, y estaban ubicados en tal otro con tantas.
--  Ese sería el inicio; luego el final, y se hace el análisis para conocer
--  la diferencia.»
--
-- QUÉ SE GUARDA
--   inv_lineas           las líneas de producción (L1, L2, L4, L6). Es una
--                        tabla y no un `check`: si abren la L3, se agrega
--                        una fila, no se corre otra migración.
--   inv_cortes           la CABECERA de un corte: inicial o final, a qué hora
--                        se hizo, quién y en qué bodega. Un corte FINAL
--                        apunta al INICIAL que cierra (inicial_id) y cada
--                        inicial admite un solo final.
--   inv_corte_renglones  una fila por línea: las cajas que han pasado por la
--                        depaletizadora (el contador), de dónde tomaban y
--                        dónde estaban ubicados, cada uno con su calle ·
--                        módulo · lado (una fila de `ubicaciones`) y su
--                        cantidad en estibas o en cajas.
--                        LO QUE SE TOMA ES ENVASE: lo que entra a la línea
--                        son envases (botella, caja, lata…), así que «de
--                        dónde tomaban» lleva el ENVASE (envase_id, solo
--                        materiales tipo ENVASE). Lo que queda ubicado es el
--                        PRODUCTO que sale (material_id).
--
--   inv_corte_sitios     VARIOS MÓDULOS POR LADO: de dónde tomaban y dónde
--                        estaban ubicados pueden ser varios módulos (calle ·
--                        módulo · lado), cada uno con su cantidad y su
--                        unidad. Una fila por módulo y por lado («origen» o
--                        «destino»). Los cortes hechos cuando solo cabía UN
--                        módulo siguen en las columnas viejas del renglón y
--                        la pantalla los lee de ahí: no hubo que migrarlos.
--
-- EL ANÁLISIS NO SE GUARDA: es una resta entre el final y el inicial y se
-- hace al mirar (src/modulos/inventario/corte.ts), como el resto de cifras
-- calculadas del módulo. Guardarlo dejaría dos versiones de la misma cuenta.
--
-- UN CORTE ES UN DOCUMENTO: se guarda completo o no se guarda (una sola
-- llamada, una transacción), y solo lo borra quien administra la plataforma.
-- Quien corta necesita editar «/inventario/corte» (Roles).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.inv_lineas (
  clave   text primary key,
  nombre  text not null,
  activa  boolean not null default true,
  orden   integer not null default 0
);
insert into public.inv_lineas (clave, nombre, orden) values
  ('L1', 'Línea 1', 1), ('L2', 'Línea 2', 2), ('L4', 'Línea 4', 4), ('L6', 'Línea 6', 6)
on conflict (clave) do nothing;

create table if not exists public.inv_cortes (
  id          uuid primary key default gen_random_uuid(),
  bodega_id   uuid not null references public.bodegas(id) on delete restrict,
  tipo        text not null check (tipo in ('inicial', 'final')),
  inicial_id  uuid references public.inv_cortes(id) on delete cascade,
  cortado_en  timestamptz not null,
  nota        text,
  creado_por  uuid default auth.uid() references public.perfiles(id) on delete set null,
  creado_en   timestamptz not null default now(),
  /* Un final siempre cierra un inicial; un inicial no cierra nada. */
  constraint inv_corte_par check (
    (tipo = 'inicial' and inicial_id is null) or (tipo = 'final' and inicial_id is not null))
);
/* UN INICIAL, UN SOLO FINAL. */
create unique index if not exists inv_cortes_un_final on public.inv_cortes (inicial_id) where inicial_id is not null;
create index if not exists inv_cortes_hora_idx on public.inv_cortes (bodega_id, cortado_en desc);

create table if not exists public.inv_corte_renglones (
  id                   uuid primary key default gen_random_uuid(),
  corte_id             uuid not null references public.inv_cortes(id) on delete cascade,
  linea                text not null references public.inv_lineas(clave),
  /* EL CONTADOR DE LA DEPA: cajas que han pasado hasta ese momento. */
  cajas_depa           numeric(14,0) not null check (cajas_depa >= 0),
  /* El PRODUCTO que sale de la línea: sirve para pasar a cajas lo que está
     ubicado («Ubicados en»). */
  material_id          uuid references public.productos(id) on delete restrict,
  /* El ENVASE que entra a la línea (solo tipo ENVASE): sirve para pasar a
     cajas lo que se toma («Tomando de»). */
  envase_id            uuid references public.productos(id) on delete restrict,
  /* DE DÓNDE ESTABAN TOMANDO */
  origen_ubicacion_id  uuid references public.ubicaciones(id) on delete restrict,
  origen_cant          numeric(14,3) check (origen_cant >= 0),
  origen_unidad        text check (origen_unidad in ('estibas', 'cajas')),
  /* DÓNDE ESTABAN UBICADOS */
  destino_ubicacion_id uuid references public.ubicaciones(id) on delete restrict,
  destino_cant         numeric(14,3) check (destino_cant >= 0),
  destino_unidad       text check (destino_unidad in ('estibas', 'cajas')),
  nota                 text,
  unique (corte_id, linea),
  /* Una ubicación viene con su cantidad y su unidad, o sin nada. */
  constraint inv_renglon_origen check (
    (origen_ubicacion_id is null and origen_cant is null and origen_unidad is null)
    or (origen_ubicacion_id is not null and origen_cant is not null and origen_unidad is not null)),
  constraint inv_renglon_destino check (
    (destino_ubicacion_id is null and destino_cant is null and destino_unidad is null)
    or (destino_ubicacion_id is not null and destino_cant is not null and destino_unidad is not null))
);
/* Si la migración ya se había corrido sin el envase. */
alter table public.inv_corte_renglones
  add column if not exists envase_id uuid references public.productos(id) on delete restrict;
create index if not exists inv_corte_renglones_corte_idx on public.inv_corte_renglones (corte_id);

/* LOS MÓDULOS DE CADA LADO. `orden` es el orden en que se anotaron; el mismo
   módulo no se repite dentro del mismo lado de la misma línea. */
create table if not exists public.inv_corte_sitios (
  id           uuid primary key default gen_random_uuid(),
  renglon_id   uuid not null references public.inv_corte_renglones(id) on delete cascade,
  rol          text not null check (rol in ('origen', 'destino')),
  orden        integer not null default 0,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete restrict,
  cant         numeric(14,3) not null check (cant >= 0),
  unidad       text not null check (unidad in ('estibas', 'cajas')),
  unique (renglon_id, rol, ubicacion_id)
);
create index if not exists inv_corte_sitios_renglon_idx on public.inv_corte_sitios (renglon_id);

-- ---------------------------------------------------------------------
-- QUIÉN LEE. Escribir solo se puede por inv_corte_guardar (security definer).
-- ---------------------------------------------------------------------
alter table public.inv_lineas          enable row level security;
alter table public.inv_cortes          enable row level security;
alter table public.inv_corte_renglones enable row level security;
alter table public.inv_corte_sitios    enable row level security;

drop policy if exists inv_lineas_ver on public.inv_lineas;
create policy inv_lineas_ver on public.inv_lineas
  for select to authenticated using (public.puede_ver('/inventario/corte'));
drop policy if exists inv_cortes_ver on public.inv_cortes;
create policy inv_cortes_ver on public.inv_cortes
  for select to authenticated using (public.puede_ver('/inventario/corte'));
drop policy if exists inv_corte_renglones_ver on public.inv_corte_renglones;
create policy inv_corte_renglones_ver on public.inv_corte_renglones
  for select to authenticated using (public.puede_ver('/inventario/corte'));

drop policy if exists inv_corte_sitios_ver on public.inv_corte_sitios;
create policy inv_corte_sitios_ver on public.inv_corte_sitios
  for select to authenticated using (public.puede_ver('/inventario/corte'));

grant select on public.inv_lineas, public.inv_cortes, public.inv_corte_renglones, public.inv_corte_sitios to authenticated;

-- ---------------------------------------------------------------------
-- GUARDAR UN CORTE COMPLETO
--   p_renglones: [{"linea":"L1","cajas_depa":18801,"material_id":"…" (producto),
--                  "envase_id":"…" (solo tipo ENVASE),
--                  "origenes":[{"ubicacion_id":"…","cant":12,"unidad":"estibas"}, …],
--                  "destinos":[{"ubicacion_id":"…","cant":300,"unidad":"cajas"}, …],
--                  "nota":"…"}, …]
--   (Se sigue aceptando la forma de UN solo módulo —"origen":{…}, "destino":{…}—
--    porque un corte pendiente en un teléfono puede haberse anotado con ella.)
--   Devuelve el id del corte.
-- ---------------------------------------------------------------------
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
        if v_ub is null or v_c is null or v_c < 0 or coalesce(v_un, '') not in ('estibas', 'cajas') then
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

-- ---------------------------------------------------------------------
-- ELIMINAR UN CORTE (solo quien administra). Borrar un inicial se lleva su
-- final; borrar un final deja el inicial abierto.
-- ---------------------------------------------------------------------
drop function if exists public.inv_corte_eliminar(uuid);
create function public.inv_corte_eliminar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede eliminar un corte.';
  end if;
  if not exists (select 1 from public.inv_cortes where id = p_id) then
    raise exception 'Ese corte ya no existe.';
  end if;
  delete from public.inv_cortes where id = p_id;
end $$;

revoke all on function public.inv_corte_eliminar(uuid) from public, anon;
grant execute on function public.inv_corte_eliminar(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.inv_corte_guardar(uuid,text,uuid,timestamptz,text,jsonb)') is null then
    raise exception 'No quedó la función de guardar el corte.';
  end if;
  if to_regclass('public.ubicaciones') is null then
    raise exception 'Falta 2026-09-inventario-fefo.sql: córrelo primero.';
  end if;
  raise notice 'Listo: el corte de líneas quedó puesto.';
end $$;

commit;
