-- =====================================================================
-- ROTURAS EN SITIO · CORREGIR LAS CIFRAS DE UNA ROTURA
--
-- «Sumar le pone rotas y contaminadas, y está bien, pero a veces se
--  equivocan en el dato: hay que poder revisar cada caso y modificar esas
--  cantidades para poder cobrar bien.»
--
-- Solo el administrador. Corrige `unidades` (rotas) y `contaminadas` de UNA
-- rotura que no esté anulada, con motivo obligatorio. Lo que había antes NO
-- se pierde: queda una fila en `roturas_correcciones` (antes, después,
-- motivo, quién y cuándo). El cobro se recalcula solo, porque `v_roturas` lo
-- calcula de esas dos columnas.
--
--
-- Y EL MODO REVISIÓN: `roturas_revision` guarda qué casos el administrador ya miró (foto y cifras) antes
-- de cobrar. Corregir un caso lo deja revisado. Va en tabla aparte para no tocar `v_roturas`.
--
-- Se puede correr varias veces (si ya lo corriste, corre este archivo completo otra vez).
-- =====================================================================

create table if not exists public.roturas_correcciones (
  id                    uuid primary key default gen_random_uuid(),
  rotura_id             uuid not null,   -- sin FK a propósito: si la rotura se borra, la huella se queda
  codigo                text not null,
  antes_rotas           integer not null,
  antes_contaminadas    integer,
  despues_rotas         integer not null,
  despues_contaminadas  integer,
  motivo                text not null check (btrim(motivo) <> ''),
  corregida_por         uuid references public.perfiles(id) on delete set null,
  corregida_en          timestamptz not null default now()
);
create index if not exists roturas_correcciones_rotura on public.roturas_correcciones (rotura_id, corregida_en desc);

alter table public.roturas_correcciones enable row level security;
drop policy if exists roturas_correcciones_leer on public.roturas_correcciones;
create policy roturas_correcciones_leer on public.roturas_correcciones
  for select to authenticated using (public.manda());
-- Solo select: escribir lo hace `rotura_corregir`, que es security definer.
grant select on public.roturas_correcciones to authenticated;

-- ---------------------------------------------------------------------
-- LOS CASOS YA REVISADOS
-- ---------------------------------------------------------------------
create table if not exists public.roturas_revision (
  rotura_id    uuid primary key references public.roturas(id) on delete cascade,
  revisada_por uuid references public.perfiles(id) on delete set null,
  revisada_en  timestamptz not null default now()
);
alter table public.roturas_revision enable row level security;
drop policy if exists roturas_revision_leer on public.roturas_revision;
create policy roturas_revision_leer on public.roturas_revision
  for select to authenticated using (public.manda());
grant select on public.roturas_revision to authenticated;

create or replace function public.rotura_revisar(p_id uuid, p_ok boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.manda() then
    raise exception 'Revisar los casos es del administrador';
  end if;
  if not exists (select 1 from public.roturas where id = p_id) then
    raise exception 'Esa rotura no existe';
  end if;
  if p_ok then
    insert into public.roturas_revision (rotura_id, revisada_por, revisada_en)
    values (p_id, auth.uid(), now())
    on conflict (rotura_id) do update set revisada_por = excluded.revisada_por, revisada_en = excluded.revisada_en;
  else
    delete from public.roturas_revision where rotura_id = p_id;
  end if;
end $$;

grant execute on function public.rotura_revisar(uuid, boolean) to authenticated;

create or replace function public.rotura_corregir(
  p_id uuid, p_rotas integer, p_contaminadas integer, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v        public.roturas%rowtype;
  v_cont   integer;
  v_bxe    smallint;
  v_bot    integer;
begin
  if not public.manda() then
    raise exception 'Corregir las cifras de una rotura es del administrador';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Hay que decir por qué se corrige: queda escrito junto a la cifra anterior';
  end if;

  select * into v from public.roturas where id = p_id for update;
  if not found then raise exception 'Esa rotura no existe'; end if;
  if v.estado = 'anulada' then
    raise exception 'Esa rotura está anulada: no se corrige';
  end if;

  if p_rotas is null or p_rotas < 0 then raise exception 'Las rotas no pueden ser negativas'; end if;
  -- En EER no hay contaminadas (un envase vacío no tiene líquido que contaminar).
  v_cont := case when v.tipo = 'eer' then null else greatest(coalesce(p_contaminadas, 0), 0) end;
  if p_rotas + coalesce(v_cont, 0) <= 0 then
    raise exception 'Algo tiene que haber pasado: rotas y contaminadas no pueden quedar las dos en cero. Si no pasó nada, se anula';
  end if;
  if p_rotas = v.unidades and coalesce(v_cont, 0) = coalesce(v.contaminadas, 0) then
    raise exception 'No cambió nada: las cifras son las mismas';
  end if;

  -- Las botellas de adentro (producto terminado) acompañan a las rotas: si estaban
  -- «todas las que caben», siguen siendo todas las que caben; si eran menos, no pasan del nuevo tope.
  v_bot := v.botellas;
  if v.tipo = 'producto_terminado' and v.botellas is not null then
    select m.botellas_x_empaque into v_bxe from public.roturas_materiales m where m.clave = v.material;
    if v_bxe is not null then
      v_bot := case when v.botellas = v.unidades * v_bxe then p_rotas * v_bxe
                    else least(v.botellas, p_rotas * v_bxe) end;
    end if;
  end if;

  insert into public.roturas_correcciones
    (rotura_id, codigo, antes_rotas, antes_contaminadas, despues_rotas, despues_contaminadas, motivo, corregida_por)
  values
    (v.id, v.codigo, v.unidades, v.contaminadas, p_rotas, v_cont, btrim(p_motivo), auth.uid());

  update public.roturas
     set unidades = p_rotas, contaminadas = v_cont, botellas = v_bot
   where id = p_id;

  -- Un caso corregido es un caso revisado.
  insert into public.roturas_revision (rotura_id, revisada_por, revisada_en)
  values (p_id, auth.uid(), now())
  on conflict (rotura_id) do update set revisada_por = excluded.revisada_por, revisada_en = excluded.revisada_en;
end $$;

grant execute on function public.rotura_corregir(uuid, integer, integer, text) to authenticated;

-- PARA MIRARLO:
--   select codigo, antes_rotas, antes_contaminadas, despues_rotas, despues_contaminadas, motivo, corregida_en
--     from public.roturas_correcciones order by corregida_en desc;

--   -- cuántos casos quedan por revisar:
--   select count(*) filter (where r.estado <> 'anulada' and v.rotura_id is null) as pendientes,
--          count(*) filter (where v.rotura_id is not null) as revisadas
--     from public.roturas r left join public.roturas_revision v on v.rotura_id = r.id;
