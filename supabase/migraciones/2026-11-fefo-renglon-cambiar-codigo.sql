-- =====================================================================
-- LA BASE · EL ADMINISTRADOR CAMBIA EL CÓDIGO DE UN RENGLÓN
--
-- «Que la super admin pueda reasignar un código»: un renglón se contó con un
-- código de material que no era; se le pone el correcto sin borrarlo ni volver
-- a contar. La cantidad, la ubicación, el vencimiento y la foto no cambian.
--
-- conteo_fefo_linea_cambiar_codigo(p_linea, p_codigo)
--   · Solo quien administra la plataforma (public.manda()).
--   · Solo renglones de un FEFO.
--   · El código nuevo tiene que existir, estar activo y ser del MISMO tipo
--     (producto con producto, envase con envase).
--   · Si en esa ubicación, con ese vencimiento y esas marcas ya hay un renglón
--     con el código nuevo, no lo junta: avisa (nada cambia).
--   · Si el renglón tiene cajas reasignadas en el Balance, no se toca (nada cambia).
--   · Deja constancia en conteo_lineas_correcciones (quién, código de antes y de después).
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.conteo_lineas_correcciones (
  id          bigserial primary key,
  linea_id    uuid not null,
  conteo_id   uuid,
  codigo      text,
  antes       jsonb not null,
  despues     jsonb not null,
  quien       uuid default auth.uid(),
  en          timestamptz not null default now()
);
alter table public.conteo_lineas_correcciones enable row level security;
drop policy if exists corr_ver on public.conteo_lineas_correcciones;
create policy corr_ver on public.conteo_lineas_correcciones
  for select to authenticated using (public.manda());

drop function if exists public.conteo_fefo_linea_cambiar_codigo(uuid, text);
create function public.conteo_fefo_linea_cambiar_codigo(p_linea uuid, p_codigo text)
returns table (fefo text, codigo_antes text, material_antes text, codigo_nuevo text, material_nuevo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  l  record;
  pa record;   -- producto de antes
  pn record;   -- producto nuevo
  v_cod text := upper(btrim(coalesce(p_codigo, '')));
  v_div bigint := 0;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede cambiar el código de un renglón.';
  end if;
  if v_cod = '' then
    raise exception 'Escribe el código nuevo.';
  end if;

  select cl.*, c.tipo as c_tipo, c.codigo as c_codigo into l
    from public.conteo_lineas cl join public.conteos c on c.id = cl.conteo_id
   where cl.id = p_linea for update of cl;
  if not found or l.c_tipo <> 'fefo' then
    raise exception 'Ese renglón ya no existe o no es de un FEFO.';
  end if;

  select * into pa from public.productos where id = l.producto_id;
  select * into pn from public.productos where upper(btrim(sku)) = v_cod;
  if pn.id is null then
    raise exception 'El código % no existe en el maestro de materiales.', v_cod;
  end if;
  if not pn.activo then
    raise exception 'El código % está inactivo en el maestro de materiales.', v_cod;
  end if;
  if pn.id = pa.id then
    raise exception 'El renglón ya tiene el código %.', v_cod;
  end if;
  if pn.tipo_material is distinct from pa.tipo_material then
    raise exception 'No se puede pasar de % a %: un código es % y el otro % (el cambio es solo entre códigos del mismo tipo).',
      pa.sku, pn.sku, lower(pa.tipo_material), lower(pn.tipo_material);
  end if;

  /* Cajas reasignadas en el Balance sobre este renglón: se pierden si cambia el material, así que no se toca. */
  if to_regclass('public.balance_divisiones') is not null then
    execute 'select count(*) from public.balance_divisiones where conteo_envase_id = $1' into v_div using p_linea;
  end if;
  if v_div = 0 and to_regclass('public.balance_reclasificaciones') is not null then
    execute 'select count(*) from public.balance_reclasificaciones where conteo_envase_id = $1' into v_div using p_linea;
  end if;
  if v_div > 0 then
    raise exception 'Este renglón tiene cajas reasignadas en el Balance: quita esa reasignación primero y vuelve a cambiar el código.';
  end if;

  begin
    update public.conteo_lineas set producto_id = pn.id where id = p_linea;
  exception when unique_violation then
    raise exception 'Ya hay un renglón con el código % en esa misma ubicación, vencimiento y marcas: corrige o elimina uno de los dos en vez de juntarlos.', pn.sku;
  end;

  insert into public.conteo_lineas_correcciones (linea_id, conteo_id, codigo, antes, despues)
  values (p_linea, l.conteo_id, l.c_codigo,
          jsonb_build_object('sku', pa.sku, 'material', pa.nombre),
          jsonb_build_object('sku', pn.sku, 'material', pn.nombre));

  fefo := l.c_codigo; codigo_antes := pa.sku; material_antes := pa.nombre; codigo_nuevo := pn.sku; material_nuevo := pn.nombre;
  return next;
end $$;
revoke all on function public.conteo_fefo_linea_cambiar_codigo(uuid, text) from public, anon;
grant execute on function public.conteo_fefo_linea_cambiar_codigo(uuid, text) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_linea_cambiar_codigo(uuid,text)') is null then
    raise exception 'No quedó la función de cambiar el código de un renglón.';
  end if;
  raise notice 'Listo: el administrador puede cambiar el código de un renglón de La base.';
end $$;

commit;
select 'OK · cambiar código de un renglón listo' as resultado;
