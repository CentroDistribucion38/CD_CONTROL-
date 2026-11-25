-- =====================================================================
-- CASCO · BAJAS: LAS REGLAS DE TEXTOS, PARAMETRIZABLES
--
-- «Que me aparezcan qué textos suman o no al casco y a qué, y que pueda agregar otro texto, editar o modificar.»
-- Antes las reglas (LAVADO, EXTRASUCIO, ROTURA DE MÁQUINA, AJUSTE INV, OBSOLETO, ESTIBAS TIPO C) estaban fijas en el
-- código. Ahora viven aquí y se editan en Registrar › Baja › «Reglas de textos». La pantalla decide con ellas el destino
-- de cada fila y se lo manda a casco_registrar_bajas, que ahora lo respeta (inventario o baja); «solo registro» ya
-- llegaba con su nota. Si una fila no trae destino (versión vieja de la pantalla), la base sigue con su regla de siempre.
-- Se puede correr varias veces.
-- =====================================================================
begin;

create table if not exists public.casco_reglas_texto (
  id             uuid primary key default gen_random_uuid(),
  patron         text not null check (length(btrim(patron)) > 0),
  busca          text not null default 'texto' check (busca in ('texto', 'texto_desc')),
  destino        text not null check (destino in ('inventario', 'baja', 'registro')),
  orden          integer not null default 0,
  activo         boolean not null default true,
  nota           text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

alter table public.casco_reglas_texto enable row level security;
drop policy if exists casco_reglas_ver on public.casco_reglas_texto;
create policy casco_reglas_ver on public.casco_reglas_texto for select to authenticated using (true);
drop policy if exists casco_reglas_ins on public.casco_reglas_texto;
create policy casco_reglas_ins on public.casco_reglas_texto for insert to authenticated with check (public.casco_registrar_puede_editar());
drop policy if exists casco_reglas_upd on public.casco_reglas_texto;
create policy casco_reglas_upd on public.casco_reglas_texto for update to authenticated using (public.casco_registrar_puede_editar()) with check (public.casco_registrar_puede_editar());
drop policy if exists casco_reglas_del on public.casco_reglas_texto;
create policy casco_reglas_del on public.casco_reglas_texto for delete to authenticated using (public.casco_registrar_puede_editar());
grant select, insert, update, delete on public.casco_reglas_texto to authenticated;

-- Las de siempre, solo si la tabla está vacía.
insert into public.casco_reglas_texto (patron, busca, destino, orden, nota)
select * from (values
  ('ROTURA MAQUINA', 'texto',      'registro', 10, 'La rotura de máquina no suma ni resta en ningún almacén'),
  ('AJUSTE INV',     'texto',      'registro', 20, 'Ajuste de inventario: queda para que conste'),
  ('OBSOLET',        'texto_desc', 'registro', 30, 'Obsoleto (en el texto o en la descripción)'),
  ('ESTIBA TIPO C',  'texto_desc', 'registro', 40, 'Estibas tipo C'),
  ('LAVADO',         'texto',      'baja',     50, 'Se resta en «Lavado con baja»'),
  ('EXTRASUCIO',     'texto',      'baja',     60, 'Se resta en «Extrasucio con baja»')
) v(patron, busca, destino, orden, nota)
where not exists (select 1 from public.casco_reglas_texto);

-- casco_registrar_bajas: el destino que manda la pantalla (inventario o baja) gana sobre la regla fija.
do $$
declare v_src text; v_nuevo text;
begin
  select pg_get_functiondef(to_regprocedure('public.casco_registrar_bajas(jsonb,date,text,text,integer)')) into v_src;
  if v_src is null then raise exception 'No existe casco_registrar_bajas: corre primero las migraciones de casco.'; end if;
  if v_src like '%r.fila->>''destino''%' then raise notice 'casco_registrar_bajas ya respetaba el destino.'; return; end if;
  v_nuevo := regexp_replace(v_src,
    'v_dest := case when translate\(upper\(v_texto\)[^;]*?else ''inventario'' end;',
    'v_dest := case when r.fila->>''destino'' in (''inventario'', ''baja'') then r.fila->>''destino''
                   when translate(upper(v_texto), ''ÁÉÍÓÚ'', ''AEIOU'') ~ ''(LAVADO|EXTRASUCIO)'' then ''baja'' else ''inventario'' end;');
  if v_nuevo = v_src then raise exception 'No encontré en casco_registrar_bajas la línea del destino: no se cambió nada.'; end if;
  execute v_nuevo;
  raise notice 'Listo: casco_registrar_bajas respeta el destino de las reglas de textos.';
end $$;

commit;
notify pgrst, 'reload schema';
