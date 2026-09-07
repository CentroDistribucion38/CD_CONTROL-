-- =====================================================================
-- CONTROL · Poner contraseña al admin y dejarlo listo para entrar
-- Pegar TODO en Supabase → SQL Editor → Run
-- Cambia la contraseña de la línea 12 por la que quieras usar.
-- =====================================================================

create extension if not exists "pgcrypto";

do $$
declare
  v_correo text := 'admin@cdcontrol.co';
  v_clave  text := 'Tramo-Muelle-1699';   -- <<< cámbiala
  v_id     uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_correo);

  if v_id is null then
    raise exception 'No existe el usuario %. Créalo en Authentication → Users → Add user (con Auto Confirm User) y vuelve a correr esto.', v_correo;
  end if;

  -- Fija la contraseña y da por confirmado el correo
  update auth.users
     set encrypted_password = crypt(v_clave, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at         = now()
   where id = v_id;

  -- Asegura el perfil y lo deja como administrador
  insert into public.perfiles (id, usuario, nombre, rol, activo)
  values (v_id, split_part(v_correo, '@', 1), 'Administrador', 'admin', true)
  on conflict (id) do update
     set rol     = 'admin',
         activo  = true,
         usuario = coalesce(public.perfiles.usuario, split_part(v_correo, '@', 1));

  raise notice 'Listo. Entra con usuario "%" y la contraseña que pusiste.', split_part(v_correo, '@', 1);
end $$;

-- Verificación
select p.usuario, p.nombre, p.rol, p.activo,
       u.email as correo_interno,
       (u.email_confirmed_at is not null) as confirmado
from public.perfiles p
join auth.users u on u.id = p.id
order by p.creado_en;
