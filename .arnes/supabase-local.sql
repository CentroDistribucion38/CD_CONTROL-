-- =====================================================================
-- LO MÍNIMO DE SUPABASE, PARA PROBAR CONTRA POSTGRES DE VERDAD.
--
-- POR QUÉ EXISTE ESTE ARCHIVO. Las pruebas de SQL de este proyecto se
-- corren contra un Postgres 16 local, no contra el Supabase de
-- producción: una prueba que borra y reconstruye tablas no puede tocar
-- la base donde están los conteos de la bodega. Pero el código del
-- proyecto habla Supabase —`auth.uid()`, el rol `authenticated`, la
-- tabla `auth.users`— y nada de eso viene con Postgres.
--
-- Hasta hoy este andamio se escribía a mano en cada sesión, y eso es
-- justo como una prueba termina midiendo algo distinto cada vez.
--
-- LO QUE NO HACE: no imita RLS ni los permisos de Supabase. Las crea el
-- propio proyecto en `02-roles.sql`. Aquí solo están las piezas que
-- Supabase da por sentadas.
-- =====================================================================

create schema if not exists auth;

/* auth.users. Solo las dos columnas que el proyecto lee; el resto de lo
   que Supabase guarda ahí —contraseñas, tokens— no se prueba y no debe
   existir en una base de juguete. */
create table if not exists auth.users (
  id    uuid primary key,
  email text unique,
  /* HACE FALTA AUNQUE EL PROYECTO NO LA ESCRIBA. El disparador de
     `00-nucleo.sql` que crea el perfil al darse de alta un usuario lee
     `new.raw_user_meta_data->>'usuario'`, y un disparador que nombra una
     columna que no existe revienta con «record "new" has no field»
     —en el INSERT, no al crearse—. Sin esta columna no se puede sembrar
     ni un solo usuario de prueba. */
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

/* EL CANDADO DE TODO EL PROYECTO. Cada política de RLS pregunta quién
   está hablando, y la respuesta sale de aquí. En Supabase viene del
   JWT; en local, de una variable de sesión que la prueba pone antes de
   cada bloque con `set request.jwt.claim.sub = '...'`.

   Devuelve null si no hay nadie, que es lo mismo que hace Supabase con
   una petición anónima — y es el caso que más importa probar. */
create or replace function auth.uid() returns uuid
language sql stable as $$
  /* LAS DOS FORMAS, y hacen falta las dos. PostgREST deja la identidad
     en `request.jwt.claims` —un JSON entero— y también en
     `request.jwt.claim.<campo>`, una variable por campo. Los arneses de
     este proyecto usan una u otra según quién los escribió.

     La primera versión de este archivo leía solo la segunda, y el arnés
     de la plantilla de conteo —que pone el JSON— falló con «Hay que
     entrar para contar»: el candado funcionando perfecto sobre una
     identidad que el andamio no supo leer. Una hora buscando el error
     en el sitio equivocado. */
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'authenticated')
$$;

/* Los roles de Supabase. `nologin` porque nadie se conecta con ellos:
   se entra como postgres y se hace `set role`, que es como PostgREST
   los usa. */
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
    then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')
    then create role service_role nologin bypassrls; end if;

  /* EL ROL CON EL QUE SE PRUEBA. No se prueba como `postgres`: un
     superusuario se salta RLS sin avisar, así que una política mal
     escrita pasaría todas las pruebas y fallaría en producción el
     primer día. `probador` hereda de `authenticated` y nada más. */
  if not exists (select 1 from pg_roles where rolname = 'probador')
    then create role probador nologin; end if;
end $$;

grant anon, authenticated, service_role to postgres;
grant authenticated to probador;
grant usage on schema public to anon, authenticated, service_role, probador;
grant usage on schema auth   to anon, authenticated, service_role, probador;
grant select on auth.users   to authenticated, service_role;


/* ---------------------------------------------------------------------
   STORAGE. Los módulos que guardan fotos —Sider con las placas, Quiebra
   con las evidencias— declaran su bucket y sus políticas en el mismo
   archivo que sus tablas, que es lo correcto: quien lee el módulo ve
   dónde van las fotos y quién puede subirlas.

   Aquí se crean las dos tablas que esas líneas necesitan para no
   reventar. NO se imita el almacenamiento: no hay archivos, no hay URL
   firmadas, y las políticas que se creen encima no prueban nada. Lo
   único que se está comprobando es que el SQL del módulo CORRA — que es
   lo que falla cuando alguien escribe mal un nombre de bucket.
   --------------------------------------------------------------------- */
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role, probador;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
