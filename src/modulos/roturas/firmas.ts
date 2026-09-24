/**
 * DÓNDE SE PONE CADA FIRMA DE ROTURAS.
 *
 * Firmar es de quien tiene EDITAR en esa pantalla (o administra), no de
 * un rol con cierto nombre: así los roles se pueden renombrar, duplicar
 * o borrar sin que la cadena se quede sin quién firme. Es la misma regla
 * que rotura_puede en la base, que es la que protege: la pantalla solo
 * decide si enseña los botones.
 *
 * Va en un archivo aparte, sin "use client": las páginas del servidor lo
 * leen para decidir, y un valor que sale de un archivo de cliente les
 * llega como una referencia, no como el objeto.
 */
export const RUTA_FIRMA = {
  /* El visto bueno CAMBIÓ DE DUEÑO: era de ABI y ahora es del operador
     logístico. La ruta es la misma —la pantalla sigue donde estaba— y
     lo que cambia es quién tiene «Editar» en ella, que se reparte en
     Roles y no aquí. */
  visto_bueno: "/roturas/en-sitio/visto-bueno",
  /* Y lo que Easy objeta lo resuelve ABI, en su propia pantalla: es la
     única donde ABI decide, y por eso es la única que tiene que poder
     darse por separado. */
  desacuerdos: "/roturas/en-sitio/desacuerdos",
  supervisora: "/roturas/salida",
  /* Verificación se quitó: la salida va de Pesar a Validación, con dos
     firmas y dos personas. El renglón se borra en vez de quedarse
     apuntando a una pantalla que ya no existe. */
  validador: "/roturas/salida/validacion",
} as const;
