-- =====================================================================
-- CONTROL · Utilidades de usuarios
-- Pegar en Supabase → SQL Editor. Cada bloque se corre por separado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. VER EL ESTADO — corre esto primero para saber qué tienes
-- ---------------------------------------------------------------------
select
  p.usuario,
  p.nombre,
  p.rol,
  p.activo,
  u.email                              as correo_interno,
  (u.email_confirmed_at is not null)   as confirmado,
  p.creado_en
from public.perfiles p
join auth.users u on u.id = p.id
order by p.creado_en;

-- Si NO devuelve filas pero sí creaste usuarios en Authentication → Users,
-- significa que falta correr supabase/00-nucleo.sql. Córrelo y luego el bloque 2.


-- ---------------------------------------------------------------------
-- 2. REPARAR PERFILES HUÉRFANOS
-- Crea el perfil de cualquier usuario de auth que se haya quedado sin él
-- (pasa cuando el usuario se creó antes de instalar el trigger).
-- ---------------------------------------------------------------------
insert into public.perfiles (id, usuario, nombre, rol)
select
  u.id,
  lower(coalesce(nullif(u.raw_user_meta_data->>'usuario', ''),
                 split_part(u.email, '@', 1))),
  coalesce(nullif(u.raw_user_meta_data->>'nombre', ''),
           split_part(u.email, '@', 1)),
  'operador'::rol_usuario
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3. NOMBRAR ADMINISTRADOR
-- Cambia 'admin' por el usuario que quieras promover.
-- ---------------------------------------------------------------------
update public.perfiles
   set rol = 'admin'
 where lower(usuario) = lower('admin');


-- ---------------------------------------------------------------------
-- 4. CAMBIAR EL ROL DE ALGUIEN
-- Roles válidos: 'admin', 'supervisor', 'operador'
-- ---------------------------------------------------------------------
-- update public.perfiles set rol = 'supervisor' where lower(usuario) = 'gvisbal';


-- ---------------------------------------------------------------------
-- 5. DESACTIVAR A ALGUIEN SIN BORRARLO
-- Conserva su historial en el kardex y en los conteos.
-- ---------------------------------------------------------------------
-- update public.perfiles set activo = false where lower(usuario) = 'gvisbal';
