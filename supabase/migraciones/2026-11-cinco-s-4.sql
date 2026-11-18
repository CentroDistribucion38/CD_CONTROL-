-- =====================================================================
-- 5S · PASO 4 — LA FIRMA DE SUPERVISOR OL SE ESCRIBE
--
-- Va DESPUÉS de 2026-11-cinco-s-3.sql. En el informe:
--   · Warehouse Supervisor ABI = el responsable del área (se escoge de la
--     lista de responsables 5S y arranca en él);
--   · Supervisor OL = se ESCRIBE (es del operador logístico, no está en el
--     maestro de responsables).
-- Cambia s5_firmas para recibir el nombre de OL como texto.
-- Se puede correr varias veces.
-- =====================================================================
begin;

drop function if exists public.s5_firmas(uuid, uuid, uuid);
create or replace function public.s5_firmas(p_insp uuid, p_ol text, p_abi uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_abi text;
begin
  if not (public.s5_edita('/5s') or public.s5_edita('/5s/historial')) then
    raise exception 'No tienes permiso para cambiar las firmas del informe.';
  end if;
  if p_abi is not null then
    select nombre into v_abi from public.s5_responsables where id = p_abi;
    if v_abi is null then raise exception 'Ese responsable ya no existe.'; end if;
  end if;
  update public.s5_inspecciones
     set firma_ol_id = null, firma_ol = nullif(left(trim(p_ol), 80), ''), firma_abi_id = p_abi, firma_abi = v_abi
   where id = p_insp;
  if not found then raise exception 'Esa inspección ya no existe.'; end if;
end $$;
revoke all on function public.s5_firmas(uuid, text, uuid) from public, anon;
grant execute on function public.s5_firmas(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

do $$
begin
  raise notice '----------------------------------------------------------';
  raise notice 'firmas ................. %', case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 's5_firmas'
       and pg_get_function_identity_arguments(p.oid) = 'p_insp uuid, p_ol text, p_abi uuid') then 'ok' else 'MAL' end;
  raise notice '----------------------------------------------------------';
end $$;
