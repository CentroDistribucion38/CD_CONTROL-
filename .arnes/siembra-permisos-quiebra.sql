\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- LOS CASOS QUE EL ARCHIVO DE ROLES NO TRAE.
--
-- 02-roles.sql siembra supervisor y operador con 'ver' sobre /quiebra, y
-- eso solo prueba el caso fácil. Lo que de verdad puede salir mal está
-- en las excepciones:
--
--   · UN ROL CON 'editar'. Si la migración copiara un nivel fijo en vez
--     del que cada rol tiene, este es el que lo delata.
--   · UN ROL QUE YA TIENE EL TABLERO PUESTO, y con OTRO nivel. No se le
--     puede pisar: alguien lo decidió a mano entre dos vueltas.
--   · UNA PERSONA CON /quiebra CERRADO a mano por encima de su rol. Si
--     solo se copiaran los roles, recuperaría el tablero por la puerta
--     de atrás — la clase de permiso que nadie vuelve a revisar.
--   · UNA PERSONA CON /quiebra ABIERTO por encima de su rol.
--   · Y UN ROL SIN /quiebra: no tiene por qué acabar con el tablero.
-- =====================================================================

insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
  ('jefeplanta', 'Jefe de planta', 'Prueba: edita el tablero.', false, false, 10),
  ('porteria',   'Portería',       'Prueba: no ve Quiebra.',    false, false, 11),
  ('yatiene',    'Ya lo tiene',    'Prueba: ya tenía el tablero puesto a mano.', false, false, 12)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('jefeplanta', '/quiebra',          'editar'),
  ('porteria',   '/sider/certificar', 'editar'),
  ('yatiene',    '/quiebra',          'ver'),
  /* Puesto a mano y DISTINTO del de /quiebra: la migración no lo puede
     pisar. Una migración que se puede correr varias veces no puede
     deshacer en la segunda vuelta lo que una persona decidió entre las
     dos. */
  ('yatiene',    '/quiebra/tablero',  'editar')
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

/* A ESTA PERSONA LE CERRARON /quiebra EN PARTICULAR, aunque su rol lo
   da. Tiene que quedarse sin el tablero. */
update public.perfiles
   set permisos_extra = '{"/quiebra": "ninguno"}'::jsonb
 where usuario = 'cerrado';

/* Y A ESTA SE LO ABRIERON POR ENCIMA de su rol, con 'editar'. */
update public.perfiles
   set permisos_extra = '{"/quiebra": "editar"}'::jsonb
 where usuario = 'abierto';
