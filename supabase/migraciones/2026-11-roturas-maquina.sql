-- =====================================================================
-- QUIEBRA EN SITIO · LA MÁQUINA DE LA ROTURA
--
-- «Toca incluir en el reporte de rotura la máquina. Que los de SUMMAR puedan poner el número de máquina en el
--  registro: solo MÁQUINA, y que permita 3 dígitos, que son los de la máquina.» (Santiago L., Bavaria)
--
--   · roturas.maquina: el número de la máquina, solo dígitos, hasta 3 (se guarda como texto para no perder un 0 adelante).
--   · rotura_poner_maquina(id, maquina): la pone quien registró la rotura (o quien manda). Va en su propia función,
--     como el origen: rotura_registrar no se reescribe.
--   · v_roturas trae la columna «maquina» al final: sale en el tablero, en la ficha y en el Excel.
--
-- Se puede correr varias veces.
-- =====================================================================
begin;

alter table public.roturas add column if not exists maquina text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'roturas_maquina_ok') then
    alter table public.roturas add constraint roturas_maquina_ok check (maquina is null or maquina ~ '^[0-9]{1,3}$');
  end if;
end $$;

create or replace function public.rotura_poner_maquina(p_id uuid, p_maquina text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_m text := nullif(btrim(coalesce(p_maquina, '')), ''); v_por uuid;
begin
  if auth.uid() is null then raise exception 'Hay que entrar para registrar la máquina.'; end if;
  if v_m is not null and v_m !~ '^[0-9]{1,3}$' then raise exception 'La máquina es un número de hasta 3 dígitos.'; end if;
  select reportada_por into v_por from public.roturas where id = p_id;
  if not found then raise exception 'Esa rotura no existe.'; end if;
  if v_por is distinct from auth.uid() and not public.manda() then
    raise exception 'Solo quien registró la rotura puede poner la máquina.';
  end if;
  update public.roturas set maquina = v_m where id = p_id;
end $$;
revoke all on function public.rotura_poner_maquina(uuid, text) from public, anon;
grant execute on function public.rotura_poner_maquina(uuid, text) to authenticated;

/* LA VISTA: se le agrega «maquina» al final, sin tocar nada de lo que ya calcula (cobro, etapa…). */
do $bloque$
declare v_def text; v_ops text[]; v_com text;
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.v_roturas'::regclass and attname = 'maquina' and not attisdropped) then
    raise notice 'v_roturas ya trae la máquina.';
    return;
  end if;
  v_def := rtrim(btrim(pg_get_viewdef('public.v_roturas'::regclass, true)), ';');
  select reloptions into v_ops from pg_class where oid = 'public.v_roturas'::regclass;
  v_com := obj_description('public.v_roturas'::regclass, 'pg_class');
  execute format('create or replace view public.v_roturas as select b.*, r.maquina from ( %s ) b left join public.roturas r on r.id = b.id', v_def);
  if v_ops is not null then execute format('alter view public.v_roturas set (%s)', array_to_string(v_ops, ', ')); end if;
  if v_com is not null then execute format('comment on view public.v_roturas is %L', v_com); end if;
end $bloque$;
grant select on public.v_roturas to authenticated;

notify pgrst, 'reload schema';
commit;
