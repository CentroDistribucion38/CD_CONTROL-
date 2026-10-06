-- =====================================================================
-- INVENTARIO · CONTEO · ESTADO DEL MÓDULO Y ESTADO DEL ENVASE
--
-- Al escoger el módulo, antes del código, el conteo pregunta:
--   · ¿el módulo está MEZCLADO?       (casilla)
--   · ¿se tiene ACCESO al módulo?     (sí / no)
--   · ESTADO DEL ENVASE               (retorno, lavado, nuevo, baja, extrasucio)
-- Mezclado o sin acceso piden una FOTO de evidencia.
--
-- Mezclado / sin acceso son del MÓDULO dentro de un recorrido, no de un
-- renglón: se guardan aparte, una fila por recorrido + ubicación, con su
-- foto. Un módulo SIN ACCESO no lleva renglones: no se pudo contar.
--
-- El estado del envase sigue siendo la columna de siempre del renglón
-- (`estado_envase`), que apunta a `envase_estados`: aquí se agregan las
-- cinco claves nuevas. Las claves viejas se quedan.
--
-- Se puede correr dos veces.
-- =====================================================================
begin;

insert into public.envase_estados (clave, orden, activo) values
  ('RETORNO', 1, true), ('LAVADO', 2, true), ('NUEVO', 3, true), ('BAJA', 4, true), ('EXTRASUCIO', 5, true)
on conflict (clave) do update set activo = true;

create table if not exists public.conteo_modulos (
  conteo_id    uuid not null references public.conteos(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  mezclado     boolean not null default false,
  sin_acceso   boolean not null default false,
  ruta         text,
  bytes        integer,
  ancho        integer,
  alto         integer,
  tomada_en    timestamptz,
  lat          numeric(10,7),
  lng          numeric(10,7),
  precision_m  numeric(8,2),
  marcado_por  uuid references public.perfiles(id) on delete set null default auth.uid(),
  marcado_en   timestamptz not null default now(),
  primary key (conteo_id, ubicacion_id)
);
create index if not exists conteo_modulos_conteo_idx on public.conteo_modulos (conteo_id);

alter table public.conteo_modulos enable row level security;
drop policy if exists conteo_modulos_ver on public.conteo_modulos;
create policy conteo_modulos_ver on public.conteo_modulos for select to authenticated using (true);
drop policy if exists conteo_modulos_poner on public.conteo_modulos;
create policy conteo_modulos_poner on public.conteo_modulos for insert to authenticated with check (true);
drop policy if exists conteo_modulos_cambiar on public.conteo_modulos;
create policy conteo_modulos_cambiar on public.conteo_modulos for update to authenticated using (true) with check (true);
drop policy if exists conteo_modulos_quitar on public.conteo_modulos;
create policy conteo_modulos_quitar on public.conteo_modulos for delete to authenticated using (true);

revoke all on public.conteo_modulos from public, anon;
grant select, insert, update, delete on public.conteo_modulos to authenticated;

commit;
-- LISTO · estado del módulo y del envase
