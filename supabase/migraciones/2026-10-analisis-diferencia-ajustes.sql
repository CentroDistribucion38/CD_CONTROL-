-- =====================================================================
-- BALANCE · ANÁLISIS DE DIFERENCIA · PASO 2: AJUSTES
--
-- «¿Cómo lo guardo y le doy para el siguiente paso, para ver cuáles serían los ajustes?»
--   analisis_dif_guardado  la foto del análisis de un día (SAP, CONTEO y diferencia por código) tal como
--                          estaba al darle «Guardar»: los ajustes salen de ahí, no de algo que se mueve.
--   analisis_dif_obs       la observación de cada código ese día (la columna para escribir).
--
-- Mismo permiso que la pantalla del análisis. Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.analisis_dif_guardado (
  fecha        date primary key,
  filas        jsonb not null,
  sap          numeric(16,2) not null default 0,
  conteo       numeric(16,2) not null default 0,
  guardado_por uuid default auth.uid(),
  guardado_en  timestamptz not null default now()
);

create table if not exists public.analisis_dif_obs (
  fecha           date not null,
  codigo          text not null,
  observacion     text not null default '',
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now(),
  primary key (fecha, codigo)
);

do $$
declare t text;
begin
  foreach t in array array['analisis_dif_guardado', 'analisis_dif_obs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select using (public.mi_nivel_pantalla(''/inventario/balance/analisis'') <> ''ninguno'')', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('create policy %I on public.%I for insert with check (public.mi_nivel_pantalla(''/inventario/balance/analisis'') = ''editar'')', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('create policy %I on public.%I for update using (public.mi_nivel_pantalla(''/inventario/balance/analisis'') = ''editar'')', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for delete using (public.mi_nivel_pantalla(''/inventario/balance/analisis'') = ''editar'')', t || '_del', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

commit;
