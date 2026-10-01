-- =====================================================================
-- LA BASE · QUÉ RENGLONES YA SE PASARON AL SISTEMA OFICIAL
--
-- En La base cada renglón dice PASADO o POR PASAR:
--   PASADO    ya lo pasaste al sistema oficial (Bavaria / el Excel oficial).
--   POR PASAR todavía no.
--
-- Se marca a mano, de a uno o varios. Lo que se marca es EL RENGLÓN, no la
-- ubicación: si un conteo más nuevo vuelve a contar ese sitio, el renglón
-- nuevo es otro (otro id) y nace POR PASAR solo. Así lo que cambió después
-- de pasar no se queda dado por bueno.
--
-- QUIÉN: quien pueda editar «La base» (Roles) o administre. QUÉ: solo
-- renglones de FEFO de recorridos ENVIADOS (lo borrador no se pasa). Todo o
-- nada: si alguno no vale, no se marca ninguno. Marcar dos veces no cambia
-- nada (queda quién y cuándo lo marcó la primera vez); desmarcar lo que no
-- estaba marcado tampoco.
--
-- La tabla no se escribe directamente: solo por la función. Se lee con el
-- permiso de ver La base.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

create table if not exists public.conteo_lineas_pasadas (
  linea_id  uuid primary key references public.conteo_lineas(id) on delete cascade,
  pasado_por uuid references public.perfiles(id) on delete set null,
  pasado_en timestamptz not null default now()
);

alter table public.conteo_lineas_pasadas enable row level security;
drop policy if exists conteo_lineas_pasadas_ver on public.conteo_lineas_pasadas;
create policy conteo_lineas_pasadas_ver on public.conteo_lineas_pasadas
  for select to authenticated using (public.puede_ver('/inventario/base') or public.manda());
revoke all on public.conteo_lineas_pasadas from public, anon, authenticated;
grant select on public.conteo_lineas_pasadas to authenticated;

drop function if exists public.conteo_fefo_marcar_pasado(uuid[], boolean);
create function public.conteo_fefo_marcar_pasado(p_lineas uuid[], p_pasado boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedidas uuid[];
  v_n int;
  v_cambian int;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para marcar renglones.'; end if;
  if not (public.puede_editar('/inventario/base') or public.manda()) then
    raise exception 'Marcar renglones como pasados requiere el permiso de editar «La base» (Roles).';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_pedidas from unnest(coalesce(p_lineas, '{}')) x;
  if cardinality(v_pedidas) = 0 then raise exception 'No marcaste ningún renglón.'; end if;

  /* Todos tienen que existir, ser de un FEFO y de un recorrido ENVIADO. */
  select count(*) into v_n
    from public.conteo_lineas cl join public.conteos c on c.id = cl.conteo_id
   where cl.id = any (v_pedidas) and c.tipo = 'fefo' and c.estado = 'cerrado';
  if v_n <> cardinality(v_pedidas) then
    raise exception 'Alguno de esos renglones ya no existe, no es de un FEFO o su recorrido todavía no se envió. No se marcó ninguno.';
  end if;

  if coalesce(p_pasado, true) then
    insert into public.conteo_lineas_pasadas (linea_id, pasado_por)
    select x, auth.uid() from unnest(v_pedidas) x
    on conflict (linea_id) do nothing;
  else
    delete from public.conteo_lineas_pasadas where linea_id = any (v_pedidas);
  end if;
  get diagnostics v_cambian = row_count;
  return v_cambian;
end $$;
revoke all on function public.conteo_fefo_marcar_pasado(uuid[], boolean) from public, anon;
grant execute on function public.conteo_fefo_marcar_pasado(uuid[], boolean) to authenticated;

do $$
begin
  if to_regprocedure('public.conteo_fefo_marcar_pasado(uuid[],boolean)') is null then
    raise exception 'No quedó la función de marcar renglones como pasados.';
  end if;
  raise notice 'Listo: La base ya puede marcar renglones como PASADOS.';
end $$;

commit;
