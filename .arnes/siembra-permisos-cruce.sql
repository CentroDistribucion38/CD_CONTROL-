\set ON_ERROR_STOP on
set client_min_messages = warning;

-- =====================================================================
-- LOS CASOS QUE EL ARCHIVO DE ROLES NO TRAE.
--
--   · UN ROL CON 'editar' EN TRASPASOS. Aquí el nivel SÍ se copia tal
--     cual —subir el corte es escribir—, así que este es el que delata
--     si alguien lo recorta a 'ver' por error.
--   · UN ROL CON TRASPASOS CERRADO. No puede acabar viendo el cruce.
--   · UN ROL QUE YA TIENE EL CRUCE PUESTO a mano, con otro nivel.
--   · UNA PERSONA CON /traspasos CERRADO a mano por encima de su rol.
--   · UNA PERSONA CON /traspasos ABIERTO por encima de su rol.
--   · Y UN ROL SIN TRASPASOS: no tiene por qué acabar con el cruce.
-- =====================================================================

insert into public.roles (clave, nombre, descripcion, manda, sistema, orden) values
  ('jefepatio',  'Jefe de patio', 'Prueba: edita Traspasos.',   false, false, 10),
  ('porteria',   'Portería',      'Prueba: no ve Traspasos.',   false, false, 11),
  ('cerradorol', 'Cerrado',       'Prueba: Traspasos en ninguno.', false, false, 12),
  ('yatiene',    'Ya lo tiene',   'Prueba: ya tenía el cruce.', false, false, 13)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, seccion, nivel) values
  ('jefepatio',  '/traspasos',        'editar'),
  ('porteria',   '/sider/certificar', 'editar'),
  ('cerradorol', '/traspasos',        'ninguno'),
  ('yatiene',    '/traspasos',        'ver'),
  ('yatiene',    '/traspasos/cruce',  'editar')
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

update public.perfiles set permisos_extra = '{"/traspasos": "ninguno"}'::jsonb
 where usuario = 'cerrado';
update public.perfiles set permisos_extra = '{"/traspasos": "editar"}'::jsonb
 where usuario = 'abierto';
