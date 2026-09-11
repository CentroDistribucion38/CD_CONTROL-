/**
 * REGISTRO DE MÓDULOS DE CONTROL
 * ------------------------------------------------------------------
 * Única fuente de verdad de la plataforma. La portada (/inicio) y el menú
 * lateral se dibujan a partir de este archivo. No hay lista de módulos
 * escrita a mano en ningún componente.
 *
 * Para agregar un módulo:
 *   1. Agrega su entrada aquí con activo: true
 *   2. Crea las rutas en   src/app/(app)/<ruta>/
 *   3. Crea la lógica en   src/modulos/<id>/acciones.ts
 *   4. Crea el SQL en      supabase/modulos/<id>.sql
 *
 * activo  → el módulo existe y se puede entrar
 * oculto  → existe y funciona, pero no aparece en la portada ni en el menú
 *           (sigue accesible por URL; útil para módulos de soporte)
 */

export type Rol = "admin" | "supervisor" | "operador";

export type Seccion = {
  nombre: string;
  ruta: string;
  /**
   * Existe, funciona y SIGUE teniendo permiso propio en /admin/roles,
   * pero no se lista en el menú lateral. Es para las pantallas a las que
   * se entra desde otra pantalla y no por el menú: repetirlas arriba las
   * hace parecer dos cosas distintas.
   * OJO: quitarla del registro en vez de ocultarla sería otra cosa —
   * perdería su casilla de permisos y nadie podría volver a darla.
   */
  oculto?: boolean;
};

export type Modulo = {
  id: string;
  nombre: string;
  /** Etiqueta corta en mayúsculas sobre el nombre */
  eyebrow: string;
  descripcion: string;
  /** Color de acento: etiqueta y círculo de la flecha */
  acento: string;
  /** Color de respaldo y mezcla de la zona de imagen */
  fondo: string;
  /**
   * Dos o tres palabras que digan qué hay adentro. Si no se ponen, la
   * portada usa los nombres de las primeras secciones.
   */
  etiquetas?: string[];
  /** Ruta de la foto en /public. Si no existe, se ve solo el fondo. */
  imagen: string;
  /** La base del módulo. Es lo que se compara para saber "en qué módulo
   *  estoy" y lo que se pide como permiso, NO necesariamente adonde
   *  lleva la tarjeta. Para eso está `entrada`. */
  ruta: string;
  /**
   * Con qué pantalla se abre el módulo al entrar por la tarjeta.
   *
   * Sin esto, la tarjeta llevaba siempre a `ruta`, que en Sider es la
   * Fuente principal —una tabla para revisar—, cuando quien entra al
   * módulo casi siempre va a CERTIFICAR un vehículo que tiene enfrente.
   * Se resuelve con entradaDe() y no aquí a secas porque hay que
   * comprobar que la persona pueda ver esa pantalla: mandarla a una que
   * su rol no incluye sería cambiar la puerta por un letrero de "no
   * tienes permiso".
   */
  entrada?: string;
  activo: boolean;
  oculto?: boolean;
  roles?: Rol[];
  secciones: Seccion[];
};

export const MODULOS: Modulo[] = [
  {
    id: "quiebra",
    nombre: "Quiebra",
    eyebrow: "AVERÍAS",
    descripcion:
      "Rotura de envase retornable medida contra producción, importada del maestro de SAP.",
    acento: "#E4002B",
    fondo: "#FBEFD6",
    etiquetas: ["Meta mensual 1,6%", "Cierre diario editable"],
    imagen: "/modulos/quiebra.jpg",
    ruta: "/quiebra",
    activo: true,
    secciones: [
      { nombre: "Tablero", ruta: "/quiebra" },
      { nombre: "Quiebra diaria", ruta: "/quiebra/diario" },
      { nombre: "Importar", ruta: "/quiebra/importar" },
    ],
  },
  {
    id: "sider",
    /* El nombre es literal: así se llama el módulo en el CD. La RUTA
       sigue siendo /sider y no se toca — las direcciones están guardadas
       como texto en rol_permisos y en los permisos extra de cada persona
       ("/sider", "/sider/certificar", …), así que cambiarlas dejaría esas
       filas apuntando a algo que ya no existe y todo el mundo perdería el
       permiso EN SILENCIO: la pantalla no da error, simplemente deja de
       verse. Lo que lee la gente y lo que identifica la pantalla son dos
       cosas distintas y aquí se separan. */
    nombre: "T1 / T2",
    eyebrow: "ENVASE EN TRÁNSITO",
    descripcion:
      "Certificación de vehículos con ubicación y evidencia fotográfica, en la salida del CD origen y en la llegada a Barranquilla.",
    acento: "#0B7285",
    fondo: "#DFF1F3",
    etiquetas: ["Certificación en dos puntas", "% de certificación"],
    imagen: "/modulos/sider.jpg",
    ruta: "/sider",
    /* Quien abre Sider está casi siempre al lado de un vehículo, no
       revisando la tabla. */
    entrada: "/sider/certificar",
    activo: true,
    // OJO: aquí solo van secciones que YA tienen su página. Registrar una
    // ruta que no existe pone un enlace en el menú que lleva a un 404, y
    // quien lo toca no tiene forma de saber que es una pantalla pendiente
    // y no una app rota. scripts/rutas.mjs revienta el build si pasa.
    // EL MENÚ VA EN EL ORDEN DEL PROCESO, no en el orden en que se fueron
    // construyendo las pantallas. De arriba abajo es lo que pasa de
    // verdad con un vehículo:
    //
    //   Certificar        sale del CD origen
    //   En tránsito       llega a Barranquilla
    //   Fuente principal  ahí queda el viaje, ya completo
    //   Seguimiento       el informe de todos
    //   Novedades         lo que salió mal, que solo se sabe al final
    //
    // Maestro cierra porque no es un paso: es la configuración —los
    // orígenes y los materiales— y se toca una vez cada mucho.
    secciones: [
      { nombre: "Certificar", ruta: "/sider/certificar" },
      { nombre: "En tránsito", ruta: "/sider/transito" },
      { nombre: "Fuente principal", ruta: "/sider" },
      { nombre: "Seguimiento", ruta: "/sider/seguimiento" },
      /* Se entra por el botón Importar de Seguimiento, que es donde se
         necesita. En el menú era el mismo destino dicho dos veces. */
      { nombre: "Importar", ruta: "/sider/importar", oculto: true },
      { nombre: "Novedades", ruta: "/sider/novedades" },
      { nombre: "Maestro", ruta: "/sider/maestro" },
    ],
  },
  {
    id: "acciones",
    nombre: "Acciones",
    eyebrow: "CORRECTIVAS Y PREVENTIVAS",
    descripcion:
      "Lo que se encontró mal, con plazo según la prioridad, responsable con nombre y verificación de si de verdad sirvió.",
    /* Rojo de la casa: es el módulo que habla de lo que está mal, y el
       día que se abre no es para dar una buena noticia. */
    acento: "#E4002B",
    fondo: "#FDE8EC",
    etiquetas: ["Plazo por prioridad", "Se verifica, no se cierra y ya"],
    imagen: "/modulos/acciones.jpg",
    ruta: "/acciones",
    /* Quien abre Acciones casi siempre viene a ver LO SUYO, no el
       tablero de todos: el tablero es de la reunión de arranque de
       turno, y a esa se entra con la pantalla ya puesta en la TV. */
    entrada: "/acciones/mias",
    activo: true,
    // El orden del proceso, de arriba abajo: me toca → lo hice → alguien
    // verifica → así vamos → por qué se repite → la configuración.
    secciones: [
      { nombre: "Mis acciones", ruta: "/acciones/mias" },
      { nombre: "Por verificar", ruta: "/acciones/verificar" },
      { nombre: "Todas", ruta: "/acciones" },
      { nombre: "Tablero", ruta: "/acciones/tablero" },
      { nombre: "Análisis", ruta: "/acciones/analisis" },
      { nombre: "Maestro", ruta: "/acciones/maestro" },
    ],
  },
  {
    id: "admin",
    nombre: "Administración",
    eyebrow: "PLATAFORMA",
    descripcion:
      "Usuarios, roles y permisos: quién entra, quién ve qué pantalla y quién puede modificar. Los roles son datos, no código.",
    acento: "#4C3BCF",
    fondo: "#EDEBFA",
    etiquetas: ["Crear usuarios", "Roles por sección"],
    imagen: "/modulos/admin.jpg",
    ruta: "/admin/roles",
    activo: true,
    secciones: [
      { nombre: "Roles", ruta: "/admin/roles" },
      { nombre: "Usuarios", ruta: "/admin/usuarios" },
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario",
    eyebrow: "STOCK",
    descripcion:
      "Catálogo, kardex de movimientos, existencias por bodega y conteos físicos.",
    acento: "#E9A81F",
    fondo: "#E2EDF9",
    etiquetas: ["Kardex", "Conteos físicos"],
    imagen: "/modulos/inventario.jpg",
    ruta: "/inventario",
    activo: true,
    secciones: [
      { nombre: "Resumen", ruta: "/inventario" },
      { nombre: "Productos", ruta: "/inventario/productos" },
      { nombre: "Bodegas", ruta: "/inventario/bodegas" },
      { nombre: "Movimientos", ruta: "/inventario/movimientos" },
      { nombre: "Conteos físicos", ruta: "/inventario/conteos" },
    ],
  },

];

/**
 * Todas las rutas que el registro promete. El chequeo de que existan vive
 * en scripts/rutas.mjs y corre en cada build: una sección registrada sin
 * su carpeta en src/app/(app)/ es un enlace a un 404, y el que lo toca no
 * puede distinguir "pantalla pendiente" de "app rota".
 */
export function rutasRegistradas(): string[] {
  const out: string[] = [];
  for (const m of MODULOS) {
    if (!m.activo) continue;
    out.push(m.ruta);
    for (const s of m.secciones) out.push(s.ruta);
  }
  return [...new Set(out)];
}

/** Módulos que se pueden usar. */
export const modulosActivos = () => MODULOS.filter((m) => m.activo);

/** Módulos que se muestran en portada y menú. */
export function modulosVisibles(rol: string): Modulo[] {
  return MODULOS.filter((m) => !m.oculto && puedeVer(m, rol));
}

/**
 * Encuentra el módulo al que pertenece una ruta (incluidos los ocultos).
 *
 * Mira la ruta del módulo Y LA DE SUS SECCIONES. Antes solo miraba la del
 * módulo, y eso dejaba pantallas huérfanas: Administración entra por
 * /admin/roles, que NO es prefijo de /admin/usuarios, así que Usuarios se
 * quedaba sin módulo. Sin módulo no hay migas de pan y —peor— Marco no
 * dibuja el riel: la pantalla quedaba sin ninguna forma de salir, y en la
 * app instalada no hay botón de atrás del navegador que te salve.
 *
 * Gana la coincidencia MÁS LARGA, para que un módulo que cuelgue de otro
 * no se lo robe.
 */
export function moduloPorRuta(pathname: string): Modulo | undefined {
  let mejor: Modulo | undefined;
  let largo = -1;
  for (const m of MODULOS) {
    if (!m.activo) continue;
    for (const r of [m.ruta, ...m.secciones.map((s) => s.ruta)]) {
      if (pathname !== r && !pathname.startsWith(`${r}/`)) continue;
      if (r.length > largo) { largo = r.length; mejor = m }
    }
  }
  return mejor;
}

export function puedeVer(modulo: Modulo, rol: string): boolean {
  if (!modulo.roles || modulo.roles.length === 0) return true;
  return modulo.roles.includes(rol as Rol);
}
