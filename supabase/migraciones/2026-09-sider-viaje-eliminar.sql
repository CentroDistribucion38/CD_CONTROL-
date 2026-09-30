-- =====================================================================
-- SIDER · ELIMINAR DE VERDAD UN CAMIÓN YA ANULADO
--
-- «Y si los quiero eliminar?»  →  «Si lo elimino se elimina el registro.»
--
-- ANULAR deja el viaje en gris y se puede devolver. ELIMINAR lo borra
-- completo: el viaje, sus certificaciones (con sus fotos) y su revisión AI.
-- No se puede devolver.
--
-- DOS CANDADOS, para que un clic mal dado no borre un camión bueno:
--   1. solo se elimina lo que YA está anulado (primero Anular, con motivo);
--   2. hay que escribir ELIMINAR, en mayúsculas.
-- Solo quien administra la plataforma (manda()). TODO O NADA: si uno de los
-- ids no está anulado, no se borra ninguno.
--
-- QUEDA ESCRITO en sider_viajes_eliminados: quién, cuándo, placa, material,
-- estibas, planta y el motivo con el que se había anulado. Es lo único que
-- queda del camión: sirve para responder «¿y ese camión?» en tres meses.
--
-- Devuelve las rutas de las fotos: Supabase no deja borrar archivos desde
-- SQL, así que el servidor los quita de Storage después (api/sider/eliminar).
--
-- Se puede correr dos veces. Va después de 2026-09-corregir-viajes.sql.
-- =====================================================================
begin;

create table if not exists public.sider_viajes_eliminados (
  id           bigint generated always as identity primary key,
  viaje_id     uuid        not null,
  placa        text        not null,
  planta       text,
  sku          text,
  estibas      numeric,
  motivo       text,
  anulado_por  uuid,
  anulado_en   timestamptz,
  eliminado_por uuid       default auth.uid(),
  eliminado_en  timestamptz not null default now()
);
alter table public.sider_viajes_eliminados enable row level security;
drop policy if exists sider_viajes_eliminados_ver on public.sider_viajes_eliminados;
create policy sider_viajes_eliminados_ver on public.sider_viajes_eliminados
  for select to authenticated using (public.manda());
grant select on public.sider_viajes_eliminados to authenticated;

drop function if exists public.sider_viaje_eliminar(uuid[], text);
create function public.sider_viaje_eliminar(p_ids uuid[], p_confirmacion text)
returns table (filas integer, rutas text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   uuid[];
  v_n     integer;
  v_no    integer;
  v_rutas text[];
begin
  if not public.manda() then
    raise exception 'Solo quien administra la plataforma puede eliminar un viaje.';
  end if;
  if coalesce(p_confirmacion, '') <> 'ELIMINAR' then
    raise exception 'Para eliminar hay que escribir ELIMINAR, en mayúsculas.';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_ids, '{}')) x where x is not null;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No hay ningún viaje para eliminar.';
  end if;
  if array_length(v_ids, 1) > 200 then
    raise exception 'Son demasiados de una vez (máximo 200).';
  end if;

  select count(*) into v_n from public.sider_viajes where id = any (v_ids);
  if v_n <> array_length(v_ids, 1) then
    raise exception 'Alguno de esos viajes ya no existe. Recarga la pantalla.';
  end if;

  select count(*) into v_no from public.sider_viajes
   where id = any (v_ids) and estado <> 'anulado';
  if v_no > 0 then
    raise exception 'Solo se elimina lo que ya está anulado: % de esos viajes no lo están. Anúlalos primero.', v_no;
  end if;

  select coalesce(array_agg(f.ruta), '{}') into v_rutas
    from public.sider_fotos f
    join public.sider_certificaciones c on c.id = f.certificacion_id
   where c.viaje_id = any (v_ids);

  insert into public.sider_viajes_eliminados
         (viaje_id, placa, planta, sku, estibas, motivo, anulado_por, anulado_en)
  select v.id, v.placa, v.planta, v.sku, v.estibas, v.motivo_anulacion, v.anulado_por, v.anulado_en
    from public.sider_viajes v where v.id = any (v_ids);

  /* Lo que cuelga se va solo por las llaves (ON DELETE CASCADE):
     certificaciones, fotos y revisiones AI. Las novedades ligadas al viaje
     se quedan, sin viaje (ON DELETE SET NULL). */
  delete from public.sider_viajes where id = any (v_ids);
  get diagnostics v_n = row_count;

  filas := v_n; rutas := v_rutas;
  return next;
end $$;

revoke all on function public.sider_viaje_eliminar(uuid[], text) from public, anon;
grant execute on function public.sider_viaje_eliminar(uuid[], text) to authenticated;

do $$
begin
  if to_regprocedure('public.sider_viaje_eliminar(uuid[],text)') is null then
    raise exception 'No quedó la función de eliminar.';
  end if;
  if to_regprocedure('public.sider_viaje_anular(uuid,text)') is null then
    raise exception 'Falta 2026-09-corregir-viajes.sql: córrelo primero.';
  end if;
  raise notice 'Listo: un camión anulado se puede eliminar del todo.';
end $$;

commit;
