-- =====================================================================
-- SEGURIDAD · CERTIFICACIONES — LECTURA RÁPIDA (arregla «statement timeout»)
-- Las políticas llamaban seg_ve() FILA POR FILA (y seg_ve pregunta 5 permisos cada vez): con ~500 personas
-- y sus validaciones eran miles de consultas de permisos por pantalla. Envuelto en (select …) Postgres lo
-- calcula UNA vez por consulta. Mismo permiso, mismo resultado. Se puede correr varias veces.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['seg_reglas','seg_responsables','seg_validadores','seg_empresas','seg_grupos','seg_personas','seg_validaciones','seg_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.seg_ve()))', t || '_ver', t);
  end loop;
  -- El Maestro configura
  foreach t in array array['seg_reglas','seg_responsables','seg_validadores','seg_empresas','seg_grupos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.seg_edita(''/seguridad/certificaciones/maestro''))) with check ((select public.seg_edita(''/seguridad/certificaciones/maestro'')))', t || '_editar', t);
  end loop;
end $$;
drop policy if exists seg_personas_grupo on public.seg_personas;
create policy seg_personas_grupo on public.seg_personas for update to authenticated
  using ((select public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro')))
  with check ((select public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro')));

drop policy if exists seg_eventos_anotar on public.seg_eventos;
create policy seg_eventos_anotar on public.seg_eventos for insert to authenticated
  with check ((select public.seg_edita('/seguridad/certificaciones/personas') or public.seg_edita('/seguridad/certificaciones/maestro')));

notify pgrst, 'reload schema';
