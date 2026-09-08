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
  ruta: string;
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

/** Módulos que se pueden usar. */
export const modulosActivos = () => MODULOS.filter((m) => m.activo);

/** Módulos que se muestran en portada y menú. */
export function modulosVisibles(rol: string): Modulo[] {
  return MODULOS.filter((m) => !m.oculto && puedeVer(m, rol));
}

/** Encuentra el módulo al que pertenece una ruta (incluidos los ocultos). */
export function moduloPorRuta(pathname: string): Modulo | undefined {
  return MODULOS.filter((m) => m.activo)
    .filter((m) => pathname === m.ruta || pathname.startsWith(`${m.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
}

export function puedeVer(modulo: Modulo, rol: string): boolean {
  if (!modulo.roles || modulo.roles.length === 0) return true;
  return modulo.roles.includes(rol as Rol);
}
