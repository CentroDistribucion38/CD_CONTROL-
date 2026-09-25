-- =====================================================================
-- ARREGLAR EL USUARIO Y LA CLAVE DE UNA CUENTA, A MANO
--
-- ESTO ES LA SALIDA DE EMERGENCIA, NO LA FORMA NORMAL.
-- Lo normal es la pantalla Administración → Usuarios: el botón "Editar"
-- cambia el nombre y el usuario, y "Nueva clave" genera una. Los dos
-- hacen exactamente lo mismo que esto pero sin que nadie escriba SQL a
-- mano contra auth.users, que es donde se rompen las cuentas.
--
-- POR QUÉ HACEN FALTA DOS SITIOS.
-- CONTROL entra por USUARIO. Supabase Auth necesita un correo, así que
-- la aplicación arma uno sintético —<usuario>@cdcontrol.co— que nadie
-- ve. El usuario vive entonces en dos sitios:
--
--     public.perfiles.usuario   lo que se MUESTRA en la lista
--     auth.users.email          con lo que de verdad se ENTRA
--
-- Si los dos no dicen lo mismo, pasa justo lo que estás viendo: la lista
-- dice "arenosa", escribes "arenosa" y no entra, porque el correo de
-- auth dice otra cosa. Los pasos de abajo los vuelven a dejar iguales.
--
-- Correr en el editor SQL de Supabase, UN PASO A LA VEZ, mirando lo que
-- devuelve cada uno antes de seguir al siguiente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 · ¿QUÉ HAY HOY? (no cambia nada, solo mira)
--
-- Cambia 'arenosa' por lo que sea que estés buscando: sirve el usuario
-- de la lista o parte del nombre. Mira la columna "cuadran": si dice
-- false, ese es el problema.
-- ---------------------------------------------------------------------
select
  p.id,
  p.nombre,
  p.usuario                          as usuario_en_la_lista,
  u.email                            as correo_con_el_que_entra,
  split_part(u.email, '@', 1)        as usuario_de_verdad,
  lower(p.usuario) = lower(split_part(u.email, '@', 1)) as cuadran,
  p.rol,
  p.activo,
  p.clave_provisional,
  (u.email_confirmed_at is not null)  as correo_confirmado
from public.perfiles p
join auth.users u on u.id = p.id
where p.usuario ilike '%arenosa%'
   or p.nombre  ilike '%arenosa%';


-- ---------------------------------------------------------------------
-- PASO 2 · DEJAR EL USUARIO COMO QUIERES QUE SEA
--
-- Cambia las dos primeras líneas del bloque y nada más:
--   quien  = el id que salió en el paso 1 (cópialo tal cual)
--   nuevo  = el usuario que quieres, en MINÚSCULA y sin espacios.
--            Se permiten letras, números, punto, guion y guion bajo.
--            "cd-arenosa" está bien; "CD Arenosa" no.
--
-- Cambia LAS DOS TABLAS de un solo golpe, dentro de la misma
-- transacción: si solo cambiara una, la cuenta quedaría otra vez
-- diciendo una cosa y entrando con otra, que es de donde venimos.
-- ---------------------------------------------------------------------
do $$
declare
  quien uuid := '00000000-0000-0000-0000-000000000000';  -- <<< el id del paso 1
  nuevo text := 'cd-arenosa';                            -- <<< el usuario que quieres
  ocupado uuid;
begin
  -- Que no se lo estés quitando a otra persona. El índice único lo
  -- impediría igual, pero con un error de Postgres que no dice quién.
  select id into ocupado from public.perfiles
   where lower(btrim(usuario)) = lower(btrim(nuevo)) and id <> quien;
  if ocupado is not null then
    raise exception 'Ese usuario ya lo tiene otra persona (id %). Escoge otro.', ocupado;
  end if;

  update auth.users
     set email = lower(btrim(nuevo)) || '@cdcontrol.co',
         email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = quien;
  if not found then
    raise exception 'No hay ninguna cuenta con ese id en auth.users. ¿Copiaste bien el id del paso 1?';
  end if;

  update public.perfiles
     set usuario = lower(btrim(nuevo))
   where id = quien;

  raise notice 'Listo: ahora entra como "%"', lower(btrim(nuevo));
end $$;


-- ---------------------------------------------------------------------
-- PASO 3 · PONERLE UNA CLAVE QUE TÚ ESCOJAS
--
-- ESTO SOLO SI DE VERDAD HACE FALTA. El botón "Nueva clave" de la
-- pantalla de Usuarios genera una de seis dígitos, la muestra una vez
-- para dictarla y deja la cuenta marcada como provisional, que es lo
-- correcto. Esto de aquí es para cuando necesitas una clave concreta.
--
-- Reglas que NO son mías, son de Supabase: mínimo 6 caracteres.
--
-- La clave se guarda cifrada con bcrypt, igual que las que crea la
-- aplicación: aquí no queda escrita en ninguna parte legible. Pero SÍ
-- queda en el historial del editor SQL de tu navegador, así que después
-- de correrlo borra el texto de la ventana.
-- ---------------------------------------------------------------------
do $$
declare
  quien uuid := '00000000-0000-0000-0000-000000000000';  -- <<< el mismo id
  clave text := 'CAMBIA-ESTA-CLAVE';                     -- <<< la clave que vas a dictar
  -- true  = la persona tiene que cambiarla la primera vez que entre
  -- false = se queda con esta
  provisional boolean := true;
begin
  if length(clave) < 6 then
    raise exception 'Supabase no acepta claves de menos de 6 caracteres.';
  end if;

  /* crypt() y gen_salt() son de pgcrypto, y pgcrypto no vive en el mismo
     sitio en todos los proyectos: en Supabase está en "extensions" y en
     una base montada a mano suele estar en "public". Escribir
     extensions.crypt(...) revienta en la segunda; escribir crypt(...) a
     secas revienta en la primera si el search_path no la trae. Con esto
     se buscan en los dos, y el "true" hace que el cambio de search_path
     dure solo esta transacción. */
  perform set_config('search_path', 'public, extensions, auth', true);

  update auth.users
     set encrypted_password = crypt(clave, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = quien;
  if not found then
    raise exception 'No hay ninguna cuenta con ese id.';
  end if;

  update public.perfiles set clave_provisional = provisional where id = quien;

  raise notice 'Clave cambiada. Provisional: %', provisional;
end $$;


-- ---------------------------------------------------------------------
-- PASO 4 · COMPROBAR
--
-- "cuadran" tiene que decir true. Si dice false, el paso 2 no corrió.
-- ---------------------------------------------------------------------
select
  p.nombre,
  p.usuario                    as entra_como,
  u.email,
  lower(p.usuario) = lower(split_part(u.email, '@', 1)) as cuadran,
  p.clave_provisional,
  (u.email_confirmed_at is not null) as correo_confirmado
from public.perfiles p
join auth.users u on u.id = p.id
where p.usuario ilike '%arenosa%'
   or p.nombre  ilike '%arenosa%';
