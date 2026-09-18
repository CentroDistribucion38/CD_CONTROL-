\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- LOS CASOS QUE EL ARCHIVO DE ROLES NO TRAE.
--
-- 02-roles.sql siembra los roles normales sobre /inventario, y eso solo
-- prueba el caso fácil. Lo que de verdad puede salir mal está en las
-- excepciones:
--
--   · UN ROL CON 'editar' EN EL TABLERO. Si la migración copiara el
--     nivel del tablero en vez de dar 'ver', este es el que lo delata:
--     la base no escribe nada y ofrecer 'editar' se lee como que desde
--     ahí se puede arreglar un renglón.
--   · UN ROL CON EL TABLERO CERRADO. No puede acabar viendo la base.
--   · UN ROL QUE YA TIENE LA BASE PUESTA, y con OTRO nivel. No se le
--     puede pisar: alguien lo decidió a mano entre dos vueltas.
--   · UNA PERSONA CON /inventario CERRADO a mano por encima de su rol.
--     Si solo se copiaran los roles, recuperaría por la puerta de atrás
--     —y con MÁS detalle— lo que alguien le cerró a propósito.
--   · UNA PERSONA CON /inventario ABIERTO por encima de su rol.
--   · Y UN ROL SIN /inventario: no tiene por qué acabar con la base.
-- =====================================================================

insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
  ('jefebodega', 'Jefe de bodega', 'Prueba: edita el tablero.', false, false, 10),
  ('porteria',   'Portería',       'Prueba: no ve Inventario.', false, false, 11),
  ('cerradorol', 'Cerrado',        'Prueba: tiene el tablero en ninguno.', false, false, 12),
  ('yatiene',    'Ya la tiene',    'Prueba: ya tenía la base puesta a mano.', false, false, 13)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('jefebodega', '/inventario',         'editar'),
  ('porteria',   '/sider/certificar',   'editar'),
  ('cerradorol', '/inventario',         'ninguno'),
  ('yatiene',    '/inventario',         'ver'),
  /* Puesta a mano y DISTINTA de lo que daría la migración: no se puede
     pisar. Una migración que se puede correr varias veces no puede
     deshacer en la segunda vuelta lo que una persona decidió entre las
     dos. */
  ('yatiene',    '/inventario/base',    'editar')
on conflict (rol, seccion) do nothing;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jefe@x.local'),
  ('22222222-2222-2222-2222-222222222222','cerrado@x.local'),
  ('33333333-3333-3333-3333-333333333333','abierto@x.local'),
  ('44444444-4444-4444-4444-444444444444','normal@x.local')
on conflict do nothing;

insert into public.perfiles (id, usuario, nombre, rol, activo) values
  ('11111111-1111-1111-1111-111111111111','jefe',   'Jefe',    'admin',     true),
  ('22222222-2222-2222-2222-222222222222','cerrado','Cerrado', 'supervisor',true),
  ('33333333-3333-3333-3333-333333333333','abierto','Abierto', 'operador',  true),
  ('44444444-4444-4444-4444-444444444444','normal', 'Normal',  'operador',  true)
on conflict (id) do update set rol = excluded.rol, activo = true;

/* A ESTA PERSONA LE CERRARON /inventario EN PARTICULAR, aunque su rol lo
   da. Tiene que quedarse sin la base — y es el caso que más importa:
   la base trae MÁS detalle que el tablero, así que colársela por la
   puerta de atrás sería peor que devolverle el tablero. */
update public.perfiles
   set permisos_extra = '{"/inventario": "ninguno"}'::jsonb
 where usuario = 'cerrado';

/* Y A ESTA SE LO ABRIERON POR ENCIMA de su rol, con 'editar'. Tiene que
   recibir la base en 'ver': la pantalla no escribe nada. */
update public.perfiles
   set permisos_extra = '{"/inventario": "editar"}'::jsonb
 where usuario = 'abierto';
