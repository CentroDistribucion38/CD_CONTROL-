/**
 * LOS SQL QUE LA APP NECESITA, y cómo se sabe si ya se corrieron.
 *
 * Cada archivo deja algo nuevo en la base —una tabla, una función—; si
 * ese algo está, el archivo se corrió. La portada de Administración lo
 * pregunta y dice cuáles faltan, en vez de que cada pantalla avise por
 * su cuenta y haya que llevar la cuenta a mano.
 *
 * Al agregar un SQL con algo nuevo, se agrega aquí su renglón.
 */
export const SQL_REVISAR: { archivo: string; objeto: string; para: string }[] = [
  { archivo: "2026-09-admin-historial.sql", objeto: "tabla:public.usuarios_historial", para: "Historial de usuarios y esta revisión" },
  { archivo: "2026-09-acciones-programadas.sql", objeto: "tabla:public.acciones_programadas", para: "Acciones · preventivas programadas" },
  { archivo: "2026-09-admin-usuarios.sql", objeto: "fn:public.usuarios_rastro", para: "Usuarios · último ingreso, registros y cambios de a varios" },
  { archivo: "2026-09-admin-roles.sql", objeto: "tabla:public.roles_historial", para: "Roles · duplicar, borrar e historial" },
  { archivo: "2026-09-admin-borrar-datos.sql", objeto: "tabla:public.admin_borrados", para: "Administración · borrar datos" },
  { archivo: "2026-09-roles-supervisor-borrable.sql", objeto: "fn:public.mi_nivel_pantalla", para: "Roles · Supervisor borrable y firmas por permiso" },
  { archivo: "2026-09-rotura-linea-hojas.sql", objeto: "tabla:public.rotlinea_hojas", para: "Rotura de línea · hojas firmadas" },
  { archivo: "2026-09-rotura-linea-sumar-maquinas.sql", objeto: "fn:public.rotlinea_maquinas_un_salto", para: "Rotura de línea · máquinas que suman en otra" },
  { archivo: "2026-09-conteo-preanotacion.sql", objeto: "fn:public.conteo_ubicacion_asegurar", para: "Conteo · pre-anotación D-1" },
  { archivo: "2026-09-traspasos-cruce-sap.sql", objeto: "tabla:public.traspasos_sap", para: "Traspasos · cruce con SAP" },
  { archivo: "2026-09-traspasos-sap-movimientos.sql", objeto: "tabla:public.traspasos_sap_mov", para: "Traspasos · movimientos SAP" },
  { archivo: "2026-09-traspasos-varios-tipos.sql", objeto: "tabla:public.traspasos_viaje_tipos", para: "Traspasos · varios tipos por viaje" },
  { archivo: "2026-09-traspasos-dia-cerrado.sql", objeto: "fn:public.traspaso_dia_abierto", para: "Traspasos · día cerrado" },
  { archivo: "2026-09-traspasos-documento.sql", objeto: "fn:public.traspaso_documento_donde", para: "Traspasos · documento" },
  { archivo: "2026-09-permiso-sin-acceso-por-persona.sql", objeto: "fn:public.permisos_extra_validos", para: "Usuarios · quitar una pantalla a una persona" },
];
