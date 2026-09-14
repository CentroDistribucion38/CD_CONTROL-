-- =====================================================================
-- TRASPASOS · MAESTRO DE PLACAS
--
-- Requiere: supabase/modulos/traspasos.sql
--           supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
--           supabase/migraciones/2026-09-traspasos-maestro.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- La placa se escribía a mano. La lista de "placas recientes" ayudaba,
-- pero salía de lo que ya estaba registrado: si alguien tecleó mal una
-- vez, la equivocación entra en la lista y se vuelve a ofrecer para
-- siempre. Un maestro corta ese círculo.
--
-- REEMPLAZA A 2026-09-traspasos-placas-rutas.sql, que llegó a tener
-- también un maestro de RUTAS. Esa parte estaba mal pensada y se va:
-- una ruta no es una cosa que exista por sí sola, son DOS BODEGAS. La
-- misma bodega es origen unas veces y destino otras, así que mantener
-- una lista de pares además de la lista de bodegas era mantener dos
-- listas donde hay una. Al registrar se escoge la bodega de origen y la
-- de destino, las dos de la misma lista.
--
-- Si alcanzaste a correr el archivo viejo, este borra la tabla de rutas
-- y sus funciones. Si no, no hace nada con ellas.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. SE DESHACE EL MAESTRO DE RUTAS
--
-- Se borra en vez de dejarlo vacío: una tabla que nadie escribe ni lee
-- es lo que el mes que viene alguien "arregla" sin saber para qué era.
-- Ningún viaje la referencia —los viajes guardan origen y destino
-- directo—, así que no se pierde un solo dato.
-- ---------------------------------------------------------------------
drop view     if exists public.v_traspasos_rutas_maestro;
drop function if exists public.traspaso_agregar_ruta(text, text);
drop function if exists public.traspaso_ordenar_rutas(uuid[]);
drop table    if exists public.traspasos_rutas;


-- ---------------------------------------------------------------------
-- 1. LAS PLACAS
--
-- La clave es la placa normalizada —sin espacios ni guiones, en
-- mayúsculas—, la misma regla con la que traspaso_registrar la guarda
-- desde el primer día. Así "abc 123", "ABC-123" y "abc123" son un solo
-- vehículo aquí y allá.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_placas (
  placa  text primary key,
  /* El subtítulo: "Tractomula de Summar", "Turbo propio". En una lista
     de cuarenta placas es lo que distingue una de otra sin abrir nada. */
  nota   text,
  activo boolean not null default true,
  orden  smallint,
  creado_en timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. NACE LLENO
--
-- Sembrado con las placas que ya se venían registrando. Un maestro
-- vacío el primer día es un maestro que nadie llena: quien llega a
-- registrar a las cinco de la mañana no va a cargar cuarenta placas
-- antes de mover el primer camión.
--
-- SOLO LA PRIMERA VEZ. El `not exists` impide que una segunda corrida
-- resucite placas que alguien borró a propósito — que es justo lo que
-- haría un `on conflict do nothing` a secas.
-- ---------------------------------------------------------------------
do $$
declare v_p int;
begin
  if not exists (select 1 from public.traspasos_placas) then
    insert into public.traspasos_placas (placa)
    select distinct v.placa
      from public.traspasos_viajes v
     where v.placa is not null and btrim(v.placa) <> ''
    on conflict (placa) do nothing;
    get diagnostics v_p = row_count;
    raise notice 'placas sembradas desde los viajes: %', v_p;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. AGREGAR SOBRE LA MARCHA
--
-- El desplegable de Registrar trae un «+». Nadie se queda parado en el
-- muelle esperando a que alguien con permiso entre al Maestro — y lo
-- que se agrega así es exactamente lo que de verdad se usa.
--
-- Pide el mismo rol que registrar un viaje: quien puede registrar puede
-- agregar. Exigir más sería devolver el problema que esto resuelve.
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_agregar_placa(text, text);

create function public.traspaso_agregar_placa(p_placa text, p_nota text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_placa text;
begin
  if not public.es_editor() then
    raise exception 'Agregar una placa requiere rol de supervisor o administrador';
  end if;

  /* La MISMA regla con la que traspaso_registrar guarda la placa. Si
     fueran dos reglas, el maestro y los viajes se irían separando de a
     una placa por vez. */
  v_placa := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_placa) < 5 then
    raise exception 'La placa % es muy corta. Se esperan al menos 5 caracteres', p_placa;
  end if;

  insert into public.traspasos_placas (placa, nota, orden)
  values (v_placa, nullif(btrim(coalesce(p_nota, '')), ''),
          (select coalesce(max(orden), 0) + 1 from public.traspasos_placas))
  on conflict (placa) do update
    set activo = true,
        nota = coalesce(excluded.nota, public.traspasos_placas.nota);

  return v_placa;
end $$;

revoke all on function public.traspaso_agregar_placa(text, text) from public;
grant execute on function public.traspaso_agregar_placa(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. ORDENAR, como los otros maestros
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_ordenar_placas(text[]);

create function public.traspaso_ordenar_placas(p_claves text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer; v_total integer;
begin
  if not public.es_editor() then
    raise exception 'Reordenar el maestro requiere rol de supervisor o administrador';
  end if;
  select count(*) into v_total from public.traspasos_placas;
  if coalesce(array_length(p_claves, 1), 0) <> v_total
     or exists (select 1 from public.traspasos_placas p where p.placa <> all (p_claves)) then
    raise exception 'Para reordenar hay que mandar las % placas, no una parte', v_total;
  end if;
  update public.traspasos_placas p set orden = x.n
    from (select c, ord::smallint as n from unnest(p_claves) with ordinality as t(c, ord)) x
   where p.placa = x.c;
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.traspaso_ordenar_placas(text[]) from public;
grant execute on function public.traspaso_ordenar_placas(text[]) to authenticated;


-- ---------------------------------------------------------------------
-- 5. CUÁNTO SE USA CADA COSA
--
-- La misma vista que ya contaba tipos y bodegas gana las placas. La
-- clase `ruta` se queda aunque el maestro de rutas se haya ido: cuenta
-- los PARES que de verdad se movieron, y de ahí salen las rutas
-- frecuentes que Registrar ofrece de un toque. Eso es una cuenta sobre
-- los viajes, no una lista que alguien tenga que mantener — que es
-- justamente la diferencia.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_uso as
select clase, clave, sum(viajes)::int as viajes, max(ultima) as ultima
from (
  select 'tipo'::text as clase, v.tipo as clave, count(*)::bigint as viajes,
         max(v.fecha) as ultima
    from public.traspasos_viajes v
   where v.tipo is not null and v.estado = 'registrado'
   group by v.tipo
  union all
  select 'punto', v.origen, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.origen is not null and v.estado = 'registrado'
   group by v.origen
  union all
  select 'punto', v.destino, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.destino is not null and v.estado = 'registrado'
   group by v.destino
  union all
  select 'placa', v.placa, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.placa is not null and v.estado = 'registrado'
   group by v.placa
  union all
  select 'ruta', v.origen || '>' || v.destino, count(*), max(v.fecha)
    from public.traspasos_viajes v
   where v.origen is not null and v.destino is not null and v.estado = 'registrado'
   group by v.origen, v.destino
) z
group by clase, clave;

grant select on public.v_traspasos_uso to authenticated;


-- ---------------------------------------------------------------------
-- 6. LA SEGURIDAD
--
-- Mismo criterio que los otros maestros: todos leen, solo editores
-- escriben. Sin política de escritura, un insert suelto desde el
-- navegador se rechaza.
-- ---------------------------------------------------------------------
alter table public.traspasos_placas enable row level security;

drop policy if exists traspasos_placas_select on public.traspasos_placas;
create policy traspasos_placas_select on public.traspasos_placas
  for select to authenticated using (true);

drop policy if exists traspasos_placas_write on public.traspasos_placas;
create policy traspasos_placas_write on public.traspasos_placas
  for all to authenticated
  using (public.es_editor()) with check (public.es_editor());

grant select, insert, update, delete on public.traspasos_placas to authenticated;


-- ---------------------------------------------------------------------
-- 7. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_p int;
begin
  if to_regclass('public.traspasos_placas') is null then
    v_falta := v_falta || ' traspasos_placas'; end if;
  if to_regprocedure('public.traspaso_agregar_placa(text, text)') is null then
    v_falta := v_falta || ' traspaso_agregar_placa'; end if;
  if to_regclass('public.traspasos_rutas') is not null then
    v_falta := v_falta || ' (traspasos_rutas seguía existiendo)'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  select count(*) into v_p from public.traspasos_placas;
  raise notice 'Maestro de placas listo. placas: %', v_p;
end $$;
