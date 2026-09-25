-- =====================================================================
-- CONTROL · ROLES Y PERMISOS
-- Requiere: supabase/00-nucleo.sql
-- Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
--
-- QUÉ CAMBIA
-- Hasta ahora los roles eran un enum escrito en el código —admin,
-- supervisor, operador— y cada módulo preguntaba "¿es editor?" en
-- general. Eso obliga a tocar código y volver a desplegar cada vez que
-- alguien necesita ver una pantalla y no otra.
--
-- Ahora los roles son DATOS: se crean, se nombran y se les marca qué
-- puede hacer cada uno en cada SECCIÓN, con tres niveles:
--
--   ninguno → ni siquiera aparece en el menú
--   ver     → entra y mira, sin botones de guardar
--   editar  → entra y modifica
--
-- LA SECCIÓN ES LA RUTA (/sider/transito). Se usa la ruta y no un código
-- inventado porque la ruta ya existe, ya es única y ya está en
-- src/modulos/registro.ts: un segundo identificador en paralelo es un
-- segundo sitio donde equivocarse.
--
-- EL CANDADO
-- Un rol con "manda" puede todo y es el único que administra roles y
-- usuarios. Siempre tiene que quedar al menos uno, y al menos un usuario
-- activo con él. Sin esa regla, un clic desafortunado deja la app sin
-- nadie que pueda entrar a arreglarla — y no habría desde dónde.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Los roles
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  clave       text primary key,
  nombre      text not null,
  descripcion text,
  -- Puede todo y administra roles y usuarios.
  manda       boolean not null default false,
  -- Un rol de sistema no se puede borrar. Los tres que ya existían lo
  -- son porque hay perfiles apuntando a ellos desde antes.
  sistema     boolean not null default false,
  orden       smallint,
  creado_en   timestamptz not null default now()
);

insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
  ('admin',      'Administrador', 'Puede todo y administra roles y usuarios.', true,  true, 1),
  ('supervisor', 'Supervisor',    'Certifica, importa y edita los maestros.',  false, true, 2),
  ('operador',   'Operador',      'Consulta lo que le habiliten.',             false, true, 3)
-- Semilla, no verdad: re-correr el archivo no pisa lo que se haya
-- cambiado desde la app.
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 2. Qué puede hacer cada rol en cada sección
-- ---------------------------------------------------------------------
do $$ begin
  create type nivel_permiso as enum ('ninguno', 'ver', 'editar');
exception when duplicate_object then null; end $$;

create table if not exists public.rol_permisos (
  rol     text not null references public.roles(clave) on delete cascade,
  -- La ruta de la sección tal como está en src/modulos/registro.ts.
  seccion text not null,
  nivel   nivel_permiso not null default 'ninguno',
  primary key (rol, seccion)
);

-- Lo que NO está escrito es 'ninguno'. Se guarda solo lo concedido: así
-- una sección nueva nace cerrada para todos menos para quien manda, que
-- es el lado seguro por el que equivocarse.
insert into public.rol_permisos (rol, seccion, nivel) values
  -- Supervisor: todo lo operativo, sin administrar
  ('supervisor', '/quiebra',            'ver'),
  ('supervisor', '/quiebra/diario',     'editar'),
  ('supervisor', '/quiebra/importar',   'editar'),
  ('supervisor', '/sider',              'ver'),
  ('supervisor', '/sider/certificar',   'editar'),
  ('supervisor', '/sider/transito',     'editar'),
  ('supervisor', '/sider/seguimiento',  'ver'),
  ('supervisor', '/sider/zlde',         'editar'),
  ('supervisor', '/sider/maestro',      'editar'),
  ('supervisor', '/inventario',         'ver'),
  ('supervisor', '/inventario/productos',    'editar'),
  ('supervisor', '/inventario/bodegas',      'editar'),
  ('supervisor', '/inventario/movimientos',  'editar'),
  ('supervisor', '/inventario/conteos',      'editar'),
  -- Operador: mira, no toca. Es lo que hacía antes es_editor() = false.
  ('operador', '/quiebra',           'ver'),
  ('operador', '/quiebra/diario',    'ver'),
  ('operador', '/sider',             'ver'),
  ('operador', '/sider/transito',    'ver'),
  ('operador', '/sider/seguimiento', 'ver'),
  ('operador', '/inventario',        'ver')
on conflict (rol, seccion) do nothing;

-- ---------------------------------------------------------------------
-- 3. perfiles.rol deja de ser un enum y pasa a apuntar a la tabla
--    Se hace en un bloque condicional para poder correr el archivo
--    muchas veces: la segunda vez ya no hay nada que convertir.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfiles'
       and column_name = 'rol' and udt_name = 'rol_usuario'
  ) then
    -- El valor por defecto está tipado con el enum y hay que soltarlo
    -- antes de cambiar el tipo de la columna.
    alter table public.perfiles alter column rol drop default;
    alter table public.perfiles alter column rol type text using rol::text;
    alter table public.perfiles alter column rol set default 'operador';
  end if;
end $$;

-- Cualquier rol que estuviera en perfiles y no en la tabla se crea, en
-- vez de que la llave ajena reviente y deje al usuario sin poder entrar.
insert into public.roles (clave, nombre, descripcion, sistema)
select distinct p.rol, initcap(p.rol), 'Creado al migrar: ya había perfiles con este rol.', true
  from public.perfiles p
 where p.rol is not null
   and not exists (select 1 from public.roles r where r.clave = p.rol)
on conflict (clave) do nothing;

do $$ begin
  alter table public.perfiles
    add constraint perfiles_rol_fk foreign key (rol) references public.roles(clave);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4. Los helpers que usan las políticas de TODOS los módulos
--
-- mi_rol() tiene que cambiar de tipo: devolvía el enum rol_usuario y
-- ahora devuelve texto, porque un rol inventado desde la app —"Portería"—
-- no es un valor del enum. Postgres no deja cambiarle el tipo de retorno
-- a una función con "create or replace": hay que botarla y volverla a
-- crear.
--
-- Y botarla no se puede mientras algo dependa de ella. De ella cuelgan
-- políticas RLS que están escritas en OTROS archivos —una de perfiles en
-- 00-nucleo.sql, una de storage.objects en modulos/sider.sql— y este
-- archivo no puede saber cuáles son ni cuántas van a ser mañana.
--
-- Así que se leen del catálogo, se guardan tal como están, se botan, se
-- cambia la función y se vuelven a poner. No se usa "cascade": cascade
-- se las lleva por delante y NO las repone, que en una tabla con RLS
-- prendida significa dejarla sin ninguna política — es decir, sin que
-- nadie pueda leerla. Se ve como un permiso perdido y es un dato mudo.
-- ---------------------------------------------------------------------

-- es_editor() se REEMPLAZA antes que nada, con un cuerpo que ya no llama
-- a mi_rol(). Así deja de depender de ella y no hay que botarla —cosa
-- imposible sin botar también todas las políticas de los módulos.
create or replace function public.es_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfiles yo
      join public.roles r on r.clave = yo.rol
     where yo.id = auth.uid() and yo.activo
       and (r.manda or exists (
             select 1 from public.rol_permisos p
              where p.rol = yo.rol and p.nivel = 'editar'))
  )
$$;

/* TODO EL CAMBIO DE mi_rol() VA EN UN SOLO BLOQUE, a propósito.
   Un bloque DO es una sola sentencia: o pasa entero o no pasa nada. La
   primera versión lo hacía en tres sentencias sueltas —guardar y botar,
   cambiar la función, reponer— y cuando la de reponer falló, las tablas
   se quedaron SIN NINGUNA política, con RLS prendida. Eso no se ve como
   un error: se ve como que la app dejó de traer datos. Así no puede
   quedar ni un instante. */
do $$
declare
  v_tipo   text;
  v_poner  text[] := '{}';
  v_quitar text[] := '{}';
  v_sql    text;
  pol      record;
begin
  select pg_get_function_result(p.oid) into v_tipo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mi_rol';

  -- Si ya devuelve text, este archivo ya corrió: no hay nada que migrar.
  if v_tipo is distinct from 'rol_usuario' then return; end if;

  for pol in
    select * from pg_policies
     where coalesce(qual, '') || coalesce(with_check, '') like '%mi_rol()%'
  loop
    /* Se le quita el ::rol_usuario a los literales. El catálogo devuelve
       la política como Postgres la entendió —'admin'::rol_usuario— y con
       mi_rol() ya devolviendo texto eso sería comparar text con el enum:
       "operator does not exist: text = rol_usuario". El enum se está
       yendo; su cast se va con él. */
    v_poner := v_poner || format(
      'create policy %I on %I.%I for %s to %s%s%s',
      pol.policyname, pol.schemaname, pol.tablename,
      case pol.cmd when 'ALL' then 'all' else lower(pol.cmd) end,
      array_to_string(pol.roles, ', '),
      case when pol.qual is not null
           then ' using (' || replace(pol.qual, '::rol_usuario', '') || ')' else '' end,
      case when pol.with_check is not null
           then ' with check (' || replace(pol.with_check, '::rol_usuario', '') || ')' else '' end);
    v_quitar := v_quitar || format('drop policy if exists %I on %I.%I',
                                   pol.policyname, pol.schemaname, pol.tablename);
  end loop;

  foreach v_sql in array v_quitar loop execute v_sql; end loop;

  execute 'drop function if exists public.mi_rol()';
  execute $f$
    create function public.mi_rol()
    returns text
    language sql
    stable
    security definer
    set search_path = public
    as 'select rol from public.perfiles where id = auth.uid() and activo'
  $f$;

  foreach v_sql in array v_poner loop execute v_sql; end loop;
end $$;

/** ¿El rol de quien está entrando manda? */
create or replace function public.manda()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select r.manda from public.roles r where r.clave = public.mi_rol()), false)
$$;

/** El nivel de esta persona en una sección. Quien manda, siempre edita. */
create or replace function public.mi_nivel(p_seccion text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.manda() then 'editar'
    else coalesce(
      (select p.nivel::text from public.rol_permisos p
        where p.rol = public.mi_rol() and p.seccion = p_seccion),
      'ninguno')
  end
$$;

create or replace function public.puede_ver(p_seccion text)
returns boolean language sql stable
as $$ select public.mi_nivel(p_seccion) in ('ver', 'editar') $$;

create or replace function public.puede_editar(p_seccion text)
returns boolean language sql stable
as $$ select public.mi_nivel(p_seccion) = 'editar' $$;

/**
 * ¿Puede editar ALGO dentro de un módulo?
 *
 * Las políticas RLS protegen TABLAS, y una tabla es del módulo, no de una
 * pantalla: sider_viajes lo escriben tanto Certificar como En tránsito.
 * Por eso el permiso fino —el de la sección— vive en las funciones que
 * guardan y en las pantallas, y la tabla se protege por módulo. Dicho
 * claro: alguien con "editar" en una sección de Sider queda con permiso
 * de escritura sobre las tablas de Sider si llama la API a mano. Para una
 * herramienta interna con usuarios con nombre y apellido es un trato
 * razonable, pero es un trato y no una promesa de hermetismo.
 */
create or replace function public.puede_editar_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.manda() or exists (
    select 1 from public.rol_permisos p
     where p.rol = public.mi_rol()
       and p.nivel = 'editar'
       and (p.seccion = '/' || p_modulo or p.seccion like '/' || p_modulo || '/%')
  )
$$;

-- La de perfiles se rehace apuntando al concepto nuevo: administra quien
-- MANDA, no quien se llame "admin".
drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles
  for update to authenticated
  using (id = auth.uid() or public.manda())
  with check (id = auth.uid() or public.manda());

-- ---------------------------------------------------------------------
-- 5. EL CANDADO — que nadie se quede por fuera
-- ---------------------------------------------------------------------
create or replace function public.roles_candado()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception 'El rol "%" es de sistema y no se puede borrar. Si no lo usas, quítale los permisos.', old.nombre;
    end if;
    if exists (select 1 from public.perfiles where rol = old.clave) then
      raise exception 'Hay usuarios con el rol "%". Cámbialos de rol antes de borrarlo.', old.nombre;
    end if;
    return old;
  end if;

  -- Quitarle el mando al último que manda deja la app sin administrador.
  if tg_op = 'UPDATE' and old.manda and not new.manda then
    if not exists (select 1 from public.roles where manda and clave <> old.clave) then
      raise exception 'Este es el único rol que administra la plataforma. Marca otro antes de quitarle el mando a este.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists roles_candado_trg on public.roles;
create trigger roles_candado_trg
  before update or delete on public.roles
  for each row execute function public.roles_candado();

-- Y el mismo candado del lado de los usuarios: siempre tiene que quedar
-- alguien ACTIVO con un rol que mande.
create or replace function public.perfiles_candado()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.perfiles p join public.roles r on r.clave = p.rol
     where r.manda and p.activo
  ) then
    return new;
  end if;
  raise exception 'Quedaría nadie activo que administre la plataforma. Dale un rol que mande a otro usuario antes de este cambio.';
end $$;

drop trigger if exists perfiles_candado_trg on public.perfiles;
create constraint trigger perfiles_candado_trg
  after update or delete on public.perfiles
  deferrable initially deferred
  for each row execute function public.perfiles_candado();

-- ---------------------------------------------------------------------
-- 6. Guardar los permisos de un rol, todo o nada
-- ---------------------------------------------------------------------
create or replace function public.rol_permisos_guardar(p_rol text, p_permisos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  n integer := 0;
begin
  if not public.manda() then
    raise exception 'Solo un rol que administre la plataforma puede cambiar permisos';
  end if;
  if not exists (select 1 from public.roles where clave = p_rol) then
    raise exception 'Ese rol no existe';
  end if;

  delete from public.rol_permisos where rol = p_rol;

  for v in select * from jsonb_array_elements(coalesce(p_permisos, '[]'::jsonb)) loop
    -- 'ninguno' no se guarda: la ausencia YA significa eso, y guardarlo
    -- llenaría la tabla de filas que no dicen nada.
    if coalesce(v->>'nivel', 'ninguno') = 'ninguno' then continue; end if;
    insert into public.rol_permisos (rol, seccion, nivel)
    values (p_rol, btrim(v->>'seccion'), (v->>'nivel')::nivel_permiso)
    on conflict (rol, seccion) do update set nivel = excluded.nivel;
    n := n + 1;
  end loop;

  return n;
end $$;

-- ---------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------
alter table public.roles        enable row level security;
alter table public.rol_permisos enable row level security;

-- Todos LEEN: la app necesita saber qué puede hacer quien entró, y
-- esconder la lista de roles no esconde nada que importe.
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (true);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
  using (public.manda()) with check (public.manda());

drop policy if exists rol_permisos_select on public.rol_permisos;
create policy rol_permisos_select on public.rol_permisos for select to authenticated using (true);
drop policy if exists rol_permisos_write on public.rol_permisos;
create policy rol_permisos_write on public.rol_permisos for all to authenticated
  using (public.manda()) with check (public.manda());

grant execute on function public.mi_rol()                        to authenticated;
grant execute on function public.manda()                         to authenticated;
grant execute on function public.mi_nivel(text)                  to authenticated;
grant execute on function public.puede_ver(text)                 to authenticated;
grant execute on function public.puede_editar(text)              to authenticated;
grant execute on function public.puede_editar_modulo(text)       to authenticated;
grant execute on function public.es_editor()                     to authenticated;
grant execute on function public.rol_permisos_guardar(text, jsonb) to authenticated;
