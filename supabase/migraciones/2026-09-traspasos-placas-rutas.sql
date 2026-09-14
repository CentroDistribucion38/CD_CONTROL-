-- =====================================================================
-- TRASPASOS · MAESTRO DE PLACAS Y DE RUTAS
--
-- Requiere: supabase/modulos/traspasos.sql
--           supabase/migraciones/2026-09-traspasos-plan-rejilla.sql
--           supabase/migraciones/2026-09-traspasos-maestro.sql
--
-- QUÉ PROBLEMA RESUELVE.
--
-- La placa y la ruta se escribían a mano. Las listas de "placas
-- recientes" y "rutas frecuentes" ayudaban, pero salían de lo que ya
-- estaba registrado: si alguien tecleó mal una vez, la equivocación
-- entra en la lista y se vuelve a ofrecer. Un maestro es lo que corta
-- ese círculo.
--
-- UNA RUTA ES UN PAR DE PUNTOS DEL MAESTRO, no un texto aparte. Con
-- texto libre serían dos listas que hay que mantener parejas, y el día
-- que no lo estén el informe por punto y el informe por ruta dan
-- distinto sin que nadie sepa cuál creer. Atadas por llave foránea eso
-- no puede pasar.
--
-- LOS DOS MAESTROS NACEN LLENOS, con lo que ya se venía usando. Un
-- maestro vacío el primer día es un maestro que nadie llena: la persona
-- que llega a registrar a las cinco de la mañana no va a cargar
-- cuarenta placas antes de mover el primer camión.
--
-- Se puede correr dos veces seguidas sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PLACAS
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
-- 2. RUTAS
--
-- Origen y destino son claves de traspasos_puntos. La llave foránea es
-- la que garantiza que una ruta no pueda nombrar un punto que no
-- existe, y `on delete cascade` que borrar un punto no deje rutas
-- huérfanas apuntando al vacío.
-- ---------------------------------------------------------------------
create table if not exists public.traspasos_rutas (
  id       uuid primary key default gen_random_uuid(),
  origen   text not null references public.traspasos_puntos(clave) on delete cascade,
  destino  text not null references public.traspasos_puntos(clave) on delete cascade,
  activo   boolean not null default true,
  orden    smallint,
  creado_en timestamptz not null default now(),
  /* Una ruta que sale y llega al mismo sitio no es un viaje. */
  constraint traspasos_rutas_distintos check (origen <> destino)
);

create unique index if not exists traspasos_rutas_unica
  on public.traspasos_rutas (origen, destino);


-- ---------------------------------------------------------------------
-- 3. NACEN LLENOS
--
-- Se siembran con lo que ya está registrado. Solo la primera vez: el
-- `not exists` de arriba impide que una segunda corrida resucite placas
-- o rutas que alguien borró a propósito — que es justo lo que haría un
-- `on conflict do nothing` a secas.
-- ---------------------------------------------------------------------
do $$
declare v_p int; v_r int;
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

  if not exists (select 1 from public.traspasos_rutas) then
    insert into public.traspasos_rutas (origen, destino)
    select distinct v.origen, v.destino
      from public.traspasos_viajes v
     where v.origen is not null and v.destino is not null
       and v.origen <> v.destino
    on conflict do nothing;
    get diagnostics v_r = row_count;
    raise notice 'rutas sembradas desde los viajes:  %', v_r;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 4. AGREGAR SOBRE LA MARCHA
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


drop function if exists public.traspaso_agregar_ruta(text, text);

create function public.traspaso_agregar_ruta(p_origen text, p_destino text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_o text; v_d text; v_id uuid;
begin
  if not public.es_editor() then
    raise exception 'Agregar una ruta requiere rol de supervisor o administrador';
  end if;

  /* Se acepta la clave o el nombre del punto: quien llama desde la
     pantalla manda la clave, pero traspaso_punto también resuelve lo
     que alguien escriba. */
  v_o := coalesce(public.traspaso_punto(p_origen), p_origen);
  v_d := coalesce(public.traspaso_punto(p_destino), p_destino);

  if not exists (select 1 from public.traspasos_puntos where clave = v_o) then
    raise exception 'El punto de origen % no está en el maestro', p_origen;
  end if;
  if not exists (select 1 from public.traspasos_puntos where clave = v_d) then
    raise exception 'El punto de destino % no está en el maestro', p_destino;
  end if;
  if v_o = v_d then
    raise exception 'La ruta sale y llega al mismo sitio';
  end if;

  insert into public.traspasos_rutas (origen, destino, orden)
  values (v_o, v_d, (select coalesce(max(orden), 0) + 1 from public.traspasos_rutas))
  on conflict (origen, destino) do update set activo = true
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.traspaso_agregar_ruta(text, text) from public;
grant execute on function public.traspaso_agregar_ruta(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. ORDENAR, como los otros dos maestros
-- ---------------------------------------------------------------------
drop function if exists public.traspaso_ordenar_placas(text[]);
drop function if exists public.traspaso_ordenar_rutas(uuid[]);

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

create function public.traspaso_ordenar_rutas(p_ids uuid[])
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
  select count(*) into v_total from public.traspasos_rutas;
  if coalesce(array_length(p_ids, 1), 0) <> v_total
     or exists (select 1 from public.traspasos_rutas r where r.id <> all (p_ids)) then
    raise exception 'Para reordenar hay que mandar las % rutas, no una parte', v_total;
  end if;
  update public.traspasos_rutas r set orden = x.n
    from (select c, ord::smallint as n from unnest(p_ids) with ordinality as t(c, ord)) x
   where r.id = x.c;
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.traspaso_ordenar_placas(text[]) from public;
revoke all on function public.traspaso_ordenar_rutas(uuid[])  from public;
grant execute on function public.traspaso_ordenar_placas(text[]) to authenticated;
grant execute on function public.traspaso_ordenar_rutas(uuid[])  to authenticated;


-- ---------------------------------------------------------------------
-- 6. CUÁNTO SE USA CADA UNA
--
-- La misma vista que ya contaba tipos y puntos gana dos clases más, así
-- el Maestro sigue leyendo de un solo sitio. La ruta se cuenta por el
-- par 'ORIGEN>DESTINO', que es su identidad.
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
-- 7. LAS RUTAS CON SUS NOMBRES
--
-- La pantalla necesita el nombre del punto, no su clave. Se resuelve
-- aquí y no en el navegador para no mandar dos listas y cruzarlas allá.
-- ---------------------------------------------------------------------
create or replace view public.v_traspasos_rutas_maestro as
select r.id, r.origen, r.destino, r.activo, r.orden,
       po.nombre as origen_nombre,
       pd.nombre as destino_nombre,
       coalesce(u.viajes, 0) as viajes
  from public.traspasos_rutas r
  join public.traspasos_puntos po on po.clave = r.origen
  join public.traspasos_puntos pd on pd.clave = r.destino
  left join public.v_traspasos_uso u
    on u.clase = 'ruta' and u.clave = r.origen || '>' || r.destino;

grant select on public.v_traspasos_rutas_maestro to authenticated;


-- ---------------------------------------------------------------------
-- 8. LA SEGURIDAD
--
-- Mismo criterio que los otros maestros: todos leen, solo editores
-- escriben. Sin política de escritura, un insert suelto desde el
-- navegador se rechaza.
-- ---------------------------------------------------------------------
alter table public.traspasos_placas enable row level security;
alter table public.traspasos_rutas  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['traspasos_placas','traspasos_rutas']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      'using (public.es_editor()) with check (public.es_editor())', t, t);
  end loop;
end $$;

grant select on public.traspasos_placas to authenticated;
grant select on public.traspasos_rutas  to authenticated;
grant insert, update, delete on public.traspasos_placas to authenticated;
grant insert, update, delete on public.traspasos_rutas  to authenticated;


-- ---------------------------------------------------------------------
-- 9. QUEDÓ ASÍ
-- ---------------------------------------------------------------------
do $$
declare v_falta text := ''; v_p int; v_r int;
begin
  if to_regclass('public.traspasos_placas') is null then v_falta := v_falta || ' traspasos_placas'; end if;
  if to_regclass('public.traspasos_rutas')  is null then v_falta := v_falta || ' traspasos_rutas';  end if;
  if to_regclass('public.v_traspasos_rutas_maestro') is null then
    v_falta := v_falta || ' v_traspasos_rutas_maestro'; end if;
  if to_regprocedure('public.traspaso_agregar_placa(text, text)') is null then
    v_falta := v_falta || ' traspaso_agregar_placa'; end if;
  if to_regprocedure('public.traspaso_agregar_ruta(text, text)') is null then
    v_falta := v_falta || ' traspaso_agregar_ruta'; end if;
  if v_falta <> '' then raise exception 'FALTÓ:%', v_falta; end if;

  select count(*) into v_p from public.traspasos_placas;
  select count(*) into v_r from public.traspasos_rutas;
  raise notice 'Maestro de placas y rutas listo. placas: % · rutas: %', v_p, v_r;
end $$;
