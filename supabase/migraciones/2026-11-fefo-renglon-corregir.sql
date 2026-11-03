-- =====================================================================
-- LA BASE · EL ADMINISTRADOR CORRIGE LA CANTIDAD DE UN RENGLÓN
--
-- «Me colocaron 30 y son 25: quiero poder poner 25.»
--
-- conteo_fefo_linea_corregir(p_linea, p_estibas, p_saldo, p_cajas)
--   · Solo quien administra la plataforma (public.manda()).
--   · Solo renglones de un FEFO.
--   · Respeta la regla de la tabla: o «cajas» a secas, o «estibas + saldo».
--     Lo que no se manda queda en null. No se aceptan negativos.
--   · Deja constancia en conteo_lineas_correcciones (quién, antes, después).
--   · El total (cajas por estiba × estibas + saldo + cajas) lo calcula la vista.
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

drop function if exists public.conteo_fefo_linea_corregir(uuid, int, int, int);
create function public.conteo_fefo_linea_corregir(
  p_linea uuid, p_estibas int, p_saldo int, p_cajas int)
returns table (codigo text, antes bigint, despues bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_factor int;
  v_antes bigint;
  v_despues bigint;
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede corregir la cantidad de un renglón.';
  end if;
  if coalesce(p_estibas, 0) < 0 or coalesce(p_saldo, 0) < 0 or coalesce(p_cajas, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if p_cajas is not null and (p_estibas is not null or p_saldo is not null) then
    raise exception 'O cajas a secas, o estibas con saldo: no las dos formas juntas.';
  end if;
  if p_estibas is null and p_saldo is null and p_cajas is null then
    raise exception 'Escribe al menos una cantidad.';
  end if;

  select cl.*, c.tipo as c_tipo, c.codigo as c_codigo into l
    from public.conteo_lineas cl join public.conteos c on c.id = cl.conteo_id
   where cl.id = p_linea for update of cl;
  if not found or l.c_tipo <> 'fefo' then
    raise exception 'Ese renglón ya no existe o no es de un FEFO.';
  end if;

  select coalesce(cajas_por_estiba, 0) into v_factor from public.productos where id = l.producto_id;
  v_antes   := coalesce(v_factor,0) * coalesce(l.estibas,0) + coalesce(l.cajas,0) + coalesce(l.saldo,0);
  v_despues := coalesce(v_factor,0) * coalesce(p_estibas,0) + coalesce(p_cajas,0) + coalesce(p_saldo,0);

  update public.conteo_lineas set estibas = p_estibas, saldo = p_saldo, cajas = p_cajas where id = p_linea;

  insert into public.conteo_lineas_correcciones (linea_id, conteo_id, codigo, antes, despues)
  values (p_linea, l.conteo_id, l.c_codigo,
          jsonb_build_object('estibas', l.estibas, 'saldo', l.saldo, 'cajas', l.cajas, 'total', v_antes),
          jsonb_build_object('estibas', p_estibas, 'saldo', p_saldo, 'cajas', p_cajas, 'total', v_despues));

  codigo := l.c_codigo; antes := v_antes; despues := v_despues;
  return next;
end $$;
revoke all on function public.conteo_fefo_linea_corregir(uuid, int, int, int) from public, anon;
grant execute on function public.conteo_fefo_linea_corregir(uuid, int, int, int) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_linea_corregir(uuid,integer,integer,integer)') is null then
    raise exception 'No quedó la función de corregir renglones.';
  end if;
  raise notice 'Listo: el administrador puede corregir la cantidad de un renglón de La base.';
end $$;

commit;
