-- =====================================================================
-- CARNAVAL AG07 · ELIMINAR UN MOVIMIENTO (con huella)
--
-- Hasta ahora los movimientos solo se anulaban. Quien puede editar el Cuadre SAP también puede ELIMINAR uno (Trasiego, Ingreso o Ajuste;
-- el saldo inicial nunca). Se pide el motivo y, ANTES de borrar, la fila completa queda guardada en carnaval_mov_borrados: quién, cuándo y por qué.
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.carnaval_mov_borrados (
  id          uuid primary key default gen_random_uuid(),
  movimiento  jsonb not null,                       -- la fila tal como estaba
  motivo      text  not null,
  borrado_por uuid default auth.uid(),
  borrado_en  timestamptz not null default now()
);
alter table public.carnaval_mov_borrados enable row level security;

drop policy if exists carnaval_mov_borrados_ver on public.carnaval_mov_borrados;
create policy carnaval_mov_borrados_ver on public.carnaval_mov_borrados for select
  using (public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'ninguno');
grant select on public.carnaval_mov_borrados to authenticated;

create or replace function public.carnaval_mov_eliminar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v public.carnaval_movimientos;
begin
  if public.mi_nivel_pantalla('/inventario/balance/cuadre') <> 'editar' then
    raise exception 'No tienes permiso para eliminar movimientos de Carnaval (Admin → Roles → Cuadre SAP)';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Escribe el motivo de la eliminación'; end if;
  select * into v from public.carnaval_movimientos where id = p_id;
  if not found then raise exception 'Ese movimiento ya no está'; end if;
  if v.tipo = 'INICIAL' then raise exception 'El saldo inicial no se elimina: corrígelo con un ajuste'; end if;
  insert into public.carnaval_mov_borrados (movimiento, motivo) values (to_jsonb(v), btrim(p_motivo));
  delete from public.carnaval_movimientos where id = p_id;
end $$;
revoke all on function public.carnaval_mov_eliminar(uuid, text) from public;
grant execute on function public.carnaval_mov_eliminar(uuid, text) to authenticated;

commit;

-- Comprobación: tiene que decir ok
do $$ begin
  raise notice 'carnaval_mov_eliminar ... %', case when exists (select 1 from pg_proc where proname = 'carnaval_mov_eliminar') then 'ok' else 'MAL' end;
  raise notice 'carnaval_mov_borrados ... %', case when to_regclass('public.carnaval_mov_borrados') is not null then 'ok' else 'MAL' end;
end $$;
