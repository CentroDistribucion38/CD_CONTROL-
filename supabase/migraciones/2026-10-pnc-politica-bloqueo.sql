-- =====================================================================
-- INVENTARIO · CONTEO · PNC: ¿CUMPLE LA POLÍTICA DE BLOQUEO?
--
-- «En PNC, si selecciono, debo desplegar 2 preguntas para ver si cumplen con la
--  política de bloqueo: la primera es si tiene RÓTULO, la segunda BLOQUEO MECÁNICO.»
--
-- QUÉ HACE
--   · Dos columnas en el renglón: `pnc_rotulo` y `pnc_bloqueo_mecanico` (true = sí tiene).
--     Solo se llenan cuando el renglón es PNC; en los demás quedan vacías (null).
--   · `conteo_fefo_pnc_politica(p_linea, p_rotulo, p_bloqueo)`: la pantalla la llama
--     justo después de guardar el renglón. Solo el dueño del recorrido abierto.
--       - Si el renglón es PNC, las dos respuestas son obligatorias.
--       - Si NO es PNC, las deja en null (por si se corrigió y se quitó el PNC).
--   · Cumple la política = rótulo Y bloqueo mecánico en «sí» (los dos).
--
-- Se puede correr dos veces. No toca renglones viejos (quedan sin respuesta).
-- =====================================================================
begin;

alter table public.conteo_lineas add column if not exists pnc_rotulo boolean;
alter table public.conteo_lineas add column if not exists pnc_bloqueo_mecanico boolean;

comment on column public.conteo_lineas.pnc_rotulo is
  'Solo PNC: ¿la estiba tiene rótulo? true = sí (cumple). null = no es PNC o es un renglón anterior a esta pregunta.';
comment on column public.conteo_lineas.pnc_bloqueo_mecanico is
  'Solo PNC: ¿la estiba tiene bloqueo mecánico? true = sí (cumple). null = no es PNC o es un renglón anterior a esta pregunta.';

create or replace function public.conteo_fefo_pnc_politica(
  p_linea   uuid,
  p_rotulo  boolean,
  p_bloqueo boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pnc boolean; v_conteo uuid; v_dueno uuid; v_estado estado_conteo;
begin
  select l.pnc, l.conteo_id into v_pnc, v_conteo from public.conteo_lineas l where l.id = p_linea;
  if v_conteo is null then raise exception 'Ese renglón no existe.'; end if;
  select responsable_id, estado into v_dueno, v_estado from public.conteos where id = v_conteo;
  if v_dueno is distinct from auth.uid() then raise exception 'Ese conteo es de otra persona.'; end if;
  if v_estado <> 'en_proceso' then raise exception 'El conteo ya está cerrado.'; end if;

  if coalesce(v_pnc, false) then
    if p_rotulo is null or p_bloqueo is null then
      raise exception 'PNC: falta contestar si tiene rótulo y si tiene bloqueo mecánico.';
    end if;
    update public.conteo_lineas set pnc_rotulo = p_rotulo, pnc_bloqueo_mecanico = p_bloqueo where id = p_linea;
  else
    update public.conteo_lineas set pnc_rotulo = null, pnc_bloqueo_mecanico = null where id = p_linea;
  end if;
end;
$$;

revoke all on function public.conteo_fefo_pnc_politica(uuid, boolean, boolean) from public;
grant execute on function public.conteo_fefo_pnc_politica(uuid, boolean, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'conteo_lineas' and column_name = 'pnc_bloqueo_mecanico') then
    raise exception 'No quedaron las columnas del PNC.';
  end if;
end $$;

commit;
