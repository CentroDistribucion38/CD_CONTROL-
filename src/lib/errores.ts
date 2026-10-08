/**
 * LOS ERRORES, EN CASTELLANO Y CON SALIDA.
 *
 * Postgres y PostgREST contestan cosas como:
 *
 *   new row violates row-level security policy for table "acciones_zonas"
 *   duplicate key value violates unique constraint "acciones_zonas_pkey"
 *   Could not find the function public.accion_reportar in the schema cache
 *
 * Eso, puesto tal cual en la pantalla, hace dos daños a la vez: no le
 * dice a quien está en la bodega qué hacer, y cuando alguien lo enseña
 * en una reunión parece que la aplicación se rompió. Un error bien
 * escrito dice QUÉ PASÓ y QUÉ HACER, en ese orden.
 *
 * Lo que NO se traduce son los mensajes que escribimos nosotros en las
 * funciones de la base —"Este motivo ya va 3 veces en esta zona"—: esos
 * ya están en español y ya explican la salida. Se reconocen porque no
 * traen jerga de Postgres, así que el que no coincide con ningún patrón
 * se devuelve igual.
 */

/**
 * DE QUÉ MÓDULO ES LO QUE FALTA.
 *
 * Postgres nombra lo que no encontró —"salida_abrir", "acciones_zonas",
 * "v_sider_viajes"— y ese nombre lleva el prefijo del módulo adentro.
 * Con eso alcanza para decir qué archivo correr en vez de mandar a
 * alguien a abrir cinco.
 *
 * Cada módulo puede tener más de un prefijo: Roturas escribe tanto
 * "rotura_" como "salida_", porque son sus dos submódulos.
 *
 * EL ORDEN IMPORTA: gana el primero que case, así que lo específico va
 * ANTES que lo general. `rotlinea_firmar` tiene que dar la migración de
 * la firma, no el archivo del módulo entero — mandar a correr un
 * archivo de setecientas líneas para que falta una función de veinte es
 * hacer perder el tiempo con cara de estar ayudando.
 */
const PREFIJOS: [RegExp, string][] = [
  /* Rotura de línea: el módulo y sus migraciones, de lo fino a lo grueso. */
  [/\b(rotlinea_firmas?|rotlinea_firmar|rotlinea_quitar_firma|v_rotlinea_firmas)/,
   "supabase/migraciones/2026-09-rotura-linea-firma.sql"],
  [/\bv_rotlinea_uso/, "supabase/migraciones/2026-09-rotura-linea-maestro.sql"],
  [/\b(rotlinea_|v_rotlinea)/, "supabase/modulos/rotura-linea.sql"],

  /* Casco de vidrio · Registrar (la baja de SAP). Lo nuevo antes que el módulo entero. */
  [/\b(casco_registrar_bajas|casco_quitar_baja|casco_bajas|v_casco_bajas|casco_botellas_estiba|casco_registrar_puede_editar|casco_archivos|v_casco_archivos|casco_quitar_bajas|casco_quitar_archivo)\b/,
   "supabase/migraciones/2026-10-casco-registrar-baja.sql"],
  [/\b(casco_movimiento_registrar|casco_movimiento_quitar|casco_movimientos|v_casco_movimientos|casco_mov_maestro\w*|casco_aplicar_delta|casco_asegurar_dia)\b/,
   "supabase/migraciones/2026-10-casco-movimientos.sql"],

  /* Traspasos, igual: lo fino antes que lo grueso. Este módulo faltaba
     entero en la lista y mandaba al mensaje genérico —el que dice "el
     archivo del módulo" y deja a quien lo lee con la mitad del trabajo.

     Y «adelantado» va ANTES que «atrasado» y que traspaso_hoy: las dos
     marcas son parientes y sus nombres se parecen, pero la de adelante
     la trae otra migración. Con el orden al revés, faltar
     `dias_adelante` mandaría a correr el archivo equivocado. */
  [/\b(adelantado|dias_adelante)/,
   "supabase/migraciones/2026-09-traspasos-registro-adelantado.sql"],
  [/\b(traspaso_hoy|traspaso_arranque_turno|dias_atras|atrasado)/,
   "supabase/migraciones/2026-09-traspasos-registro-atrasado.sql"],
  [/\b(traspaso_editar_viaje|traspasos_viajes_ediciones)/,
   "supabase/migraciones/2026-09-traspasos-editar-viaje.sql"],
  [/\btraspaso_borrar_plan/, "supabase/migraciones/2026-09-traspasos-borrar-plan.sql"],
  [/\b(traspasos_placas|traspaso_agregar_placa|traspaso_ordenar_placas)/,
   "supabase/migraciones/2026-09-traspasos-placas.sql"],
  [/\b(traspaso_plan_a_varios|traspaso_dias_con_plan)/,
   "supabase/migraciones/2026-09-traspasos-plan-varios-dias.sql"],
  [/\b(traspaso_parecido|traspaso_unir_punto|traspaso_agregar_punto|v_traspasos_uso)/,
   "supabase/migraciones/2026-09-traspasos-maestro.sql"],
  [/\b(traspasos_plan_vacios|traspaso_guardar_plan|traspaso_publicar_plan)/,
   "supabase/migraciones/2026-09-traspasos-plan-rejilla.sql"],
  [/\b(traspasos?_|v_traspasos)/, "supabase/modulos/traspasos.sql"],

  /* Lo fino antes que lo grueso, como en traspasos: el área y las
     causas nuevas las trae una migración, no el archivo del módulo. */
  [/\b(roturas_areas|p_area|area_nombre)/,
   "supabase/migraciones/2026-09-roturas-sitio-area-causas.sql"],
  [/\b(roturas?_|salida_|v_roturas)/, "supabase/modulos/roturas.sql"],
  [/\b(acciones?_|accion_)/, "supabase/modulos/acciones.sql"],
  /* SORTING VA ANTES QUE LA AI, y `p_tipo` antes que todo: si suben el
     código y no corren el SQL, Postgres dice «function sider_ai_guardar(
     …, p_tipo) does not exist», que empieza por `sider_ai_` y mandaría a
     correr `sider-ai.sql` — el archivo EQUIVOCADO, porque ese ya se
     corrió. Lo que falta es la migración de Sorting. */
  /* LA REVISIÓN AI INTERNA (el «+» de Vh Interno en Revisión AI y las dos clases de
     revisión) es la migración más nueva y va antes que la de Sorting:
     `interno` y las dos funciones y vistas nuevas salen de ahí. */
  /* EL CANAL Y EL SOCIO DEL VH INTERNO son de la migración más nueva: sin ella
     la base dice «could not find the function sider_viaje_interno_crear(… p_canal…)» o «column … ai_canal
     does not exist», y ninguna de las dos sabe de qué archivo habla. */
  /* El CORTE DE LÍNEAS de Inventario: sus funciones y sus tres tablas. */
  [/\binv_corte_(guardar|eliminar|renglones)\b|\binv_(cortes|lineas)\b/,
   "supabase/migraciones/2026-09-inventario-corte-lineas.sql"],
  /* MARCAR RENGLONES COMO PASADOS al sistema oficial (columna «Estado» de La base). */
  [/\bconteo_fefo_marcar_pasado\b|\bconteo_lineas_pasadas\b/,
   "supabase/migraciones/2026-10-base-pasados.sql"],
  /* TERMINAR LA HOJA DEL FISCAL, SU AVANCE Y EL CRUCE DE LA PAREJA. Va antes de contar la hoja. */
  [/\binv_fiscal_(terminar|avance|cruce|terminos|conteo_terminado)\b/,
   "supabase/migraciones/2026-10-fiscal-cruce.sql"],
  /* CONTAR LA HOJA DEL FISCAL. Va antes de «mostrar en Contar» y del fiscal a secas. */
  [/\binv_fiscal_(contar_\w+|conteos|hoja_con_conteos)\b/,
   "supabase/migraciones/2026-10-fiscal-contar.sql"],
  /* MOSTRAR EL FISCAL EN CONTAR: su botón, su consulta y la columna `publicado_en`. Va antes del fiscal a secas. */
  [/\binv_fiscal_(publicar|mis_hojas)\b|\binv_fiscales\.publicado/,
   "supabase/migraciones/2026-10-fiscal-publicar.sql"],
  /* El INVENTARIO FISCAL de Inventario: la función de guardar, la de eliminar y sus tres tablas. */
  [/\binv_fiscal_(guardar|eliminar|hojas|miembros)\b|\binv_fiscales\b/,
   "supabase/migraciones/2026-10-inventario-fiscal.sql"],
  /* ELIMINAR RENGLONES SUELTOS de un FEFO. Va antes que `conteo_` a secas. */
  [/\bconteo_fefo_lineas_eliminar\b/, "supabase/migraciones/2026-10-fefo-renglones-eliminar.sql"],
  /* ELIMINAR UN FEFO de Inventario: su función. Va antes que `conteo_` a secas. */
  [/\bconteo_fefo_eliminar\b/, "supabase/migraciones/2026-10-fefo-eliminar.sql"],
  [/\bconteo_fefo_cambiar_fecha\b/, "supabase/migraciones/2026-10-fefo-cambiar-fecha.sql"],
  /* ELIMINAR un camión anulado: la función `sider_viaje_eliminar` o la tabla de su registro. */
  [/\bsider_viaje_eliminar\b|\bsider_viajes_eliminados\b/,
   "supabase/migraciones/2026-09-sider-viaje-eliminar.sql"],
  [/\b(ai_canal|ai_socio|envase_ai)\b|v_sider_revision_pendientes\.(canal|socio|envase)\b|sider_viaje_interno_crear[\s\S]*\bp_(canal|socio)\b/,
   "supabase/migraciones/2026-09-sider-vh-interno-canal-socio.sql"],
  [/\b(sider_viaje_interno_crear|v_sider_revision_pendientes)\b|\bsider_viajes\.interno\b/,
   "supabase/migraciones/2026-09-sider-revision-ai-interna.sql"],
  [/\bp_tipo\b|\b(sider_sorting|v_sider_sorting|requiere_sorting)/,
   "supabase/migraciones/2026-09-sider-sorting.sql"],
  /* La revisión AI va ANTES que Sider a secas: sider_ai_guardar empieza
     por "sider_" y con el orden al revés mandaría al módulo grande. */
  [/\b(sider_ai_|v_sider_ai)/, "supabase/modulos/sider-ai.sql"],
  [/\b(sider_|v_sider)/, "supabase/modulos/sider.sql"],
  [/\b(inventario_|producto_|bodega_|conteo_|movimiento_)/, "supabase/modulos/inventario.sql"],
  [/\b(quiebra_|v_quiebra)/, "supabase/modulos/quiebra.sql"],
  [/\b(roles?_|rol_permisos|perfiles)\b/, "supabase/02-roles.sql"],
];

function archivoDelModulo(t: string): string {
  for (const [patron, archivo] of PREFIJOS) if (patron.test(t)) return archivo;
  /* Sin pista, se dice lo genérico. Es peor que nombrar el archivo, pero
     mucho mejor que inventarse uno: mandar a correr el SQL equivocado
     cuesta más tiempo que no decir nada. */
  return "el archivo del módulo en supabase/modulos/";
}

export function traducirError(m: string | undefined | null): string {
  const t = (m ?? "").toLowerCase();
  if (!t) return "Algo falló y la base no dijo qué. Vuelve a intentarlo.";

  /* Falta correr el SQL. Es el único que nombra un archivo: es lo único
     que arregla el problema, y decirlo ahorra media hora de búsqueda.

     Y NOMBRA EL ARCHIVO EXACTO. La primera versión decía
     "supabase/modulos/…" con puntos suspensivos, y eso deja a quien lo
     lee con la mitad del trabajo: sabe que falta un SQL, no cuál de los
     cinco. El nombre de la tabla o de la función que Postgres no
     encontró ya lleva el prefijo del módulo adentro —salida_abrir,
     acciones_zonas, sider_viajes—, así que se saca de ahí. */
  if (t.includes("does not exist") || t.includes("schema cache") ||
      t.includes("could not find the function")) {
    return `Falta crear esta parte en Supabase. Abre el SQL Editor y ejecuta ${archivoDelModulo(t)}` +
           " — se puede correr varias veces sin romper nada.";
  }

  if (t.includes("duplicate key") || t.includes("already exists")) {
    return "Ya existe uno con esa clave o ese código. Escoge otro.";
  }

  /* EL ESTADO LLENO / VACÍO DEL CILINDRO: la pantalla lo ofrece, pero la clave tiene que estar en
     `envase_estados` para guardarse. Sin ella Postgres rechaza el INSERT con «violates foreign key
     constraint conteo_lineas_estado_envase_fkey», y antes eso se leía «No se puede borrar» — un aviso
     de borrar cuando lo que se hacía era anotar. */
  if (t.includes("conteo_lineas_estado_envase_fkey")) {
    return "El estado del envase (lleno / vacío) todavía no está creado en Supabase. Abre el SQL Editor y ejecuta " +
           "supabase/migraciones/2026-10-envase-estado-cilindro.sql — se puede correr varias veces sin romper nada.";
  }
  /* AL GUARDAR (insert/update), una llave foránea rota NO es «borrar»: es que lo escogido no existe en su lista. */
  if (t.includes("foreign key") && t.includes("insert or update")) {
    return "Algo de lo que escogiste no existe en la lista de la base (o está desactivado). Revisa lo escogido; " +
           "si no aparece donde debería, avisa a quien administra.";
  }

  if (t.includes("foreign key")) {
    return "No se puede borrar: hay cosas que apuntan a esto. Desactívalo en vez de borrarlo — " +
           "borrarlo se llevaría por delante el histórico.";
  }

  if (t.includes("row-level security") || t.includes("permission denied") ||
      t.includes("not authorized")) {
    return "Tu usuario no tiene permiso para esto. Se necesita rol de supervisor o administrador.";
  }

  if (t.includes("violates check constraint") || t.includes("invalid input value for enum")) {
    return "Ese valor no es válido para este campo. Revisa lo que escribiste y vuelve a intentar.";
  }

  if (t.includes("null value") && t.includes("not-null")) {
    return "Falta llenar un campo obligatorio.";
  }

  /* Sin red. Es el más común en la bodega y el que más se confunde con
     "la app está caída": no lo está, es el pasillo. */
  if (t.includes("failed to fetch") || t.includes("networkerror") ||
      t.includes("load failed") || t.includes("network request failed")) {
    return "No hay señal en este punto. Lo que escribiste no se perdió: vuelve a intentarlo donde " +
           "haya red.";
  }

  if (t.includes("jwt") || t.includes("token") || t.includes("session")) {
    return "Tu sesión se venció. Vuelve a entrar y repite lo que estabas haciendo.";
  }

  if (t.includes("timeout") || t.includes("statement canceled")) {
    return "La base tardó demasiado en contestar. Vuelve a intentarlo en un momento.";
  }

  /* Los nuestros, que ya vienen escritos para que se entiendan. */
  return m as string;
}
