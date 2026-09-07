/**
 * REGISTRO DE MÓDULOS DE CONTROL
 * ------------------------------------------------------------------
 * Única fuente de verdad de la plataforma. El lanzador de /inicio y el
 * menú lateral se dibujan a partir de este archivo.
 *
 * Para agregar un módulo nuevo:
 *   1. Crea la carpeta  src/app/(app)/<ruta>/
 *   2. Crea la carpeta  src/modulos/<id>/  con sus acciones y lógica
 *   3. Agrega su SQL en supabase/modulos/<id>.sql
 *   4. Agrega una entrada aquí con activo: true
 *
 * Nada más. El menú, el lanzador y los permisos salen de acá.
 */

export type Rol = "admin" | "supervisor" | "operador";

export type Seccion = {
  nombre: string;
  ruta: string;
};

export type Modulo = {
  id: string;
  nombre: string;
  descripcion: string;
  /** Dos o tres letras para el mosaico de /inicio */
  sigla: string;
  /** Clase de color Tailwind para el mosaico */
  color: string;
  ruta: string;
  /** false = se muestra en gris como "próximamente" y no es navegable */
  activo: boolean;
  /** Roles que pueden verlo. Vacío = todos los autenticados. */
  roles?: Rol[];
  secciones: Seccion[];
};

export const MODULOS: Modulo[] = [
  {
    id: "inventario",
    nombre: "Inventario",
    descripcion:
      "Catálogo, kardex de movimientos, existencias por bodega y conteos físicos con ajuste automático.",
    sigla: "IN",
    color: "bg-acento-500",
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

  // --- Catálogo de módulos por construir ------------------------------
  // Están declarados para que se vean en el menú como "Próximamente".
  // Cuando construyas uno, cambia activo: true y llena sus secciones.
  // Borra sin miedo los que no vayas a usar.
  {
    id: "recibo",
    nombre: "Recibo",
    descripcion: "Recepción contra orden de compra, inspección y novedades.",
    sigla: "RC",
    color: "bg-sky-600",
    ruta: "/recibo",
    activo: false,
    secciones: [],
  },
  {
    id: "almacenamiento",
    nombre: "Almacenamiento",
    descripcion: "Ubicaciones, posiciones, reubicación y mapa de bodega.",
    sigla: "AL",
    color: "bg-violet-600",
    ruta: "/almacenamiento",
    activo: false,
    secciones: [],
  },
  {
    id: "picking",
    nombre: "Picking",
    descripcion: "Órdenes de separación, rutas de recolección y confirmación.",
    sigla: "PK",
    color: "bg-amber-600",
    ruta: "/picking",
    activo: false,
    secciones: [],
  },
  {
    id: "despacho",
    nombre: "Despacho",
    descripcion: "Consolidación, cargue, remisiones y entrega al transportador.",
    sigla: "DP",
    color: "bg-rose-600",
    ruta: "/despacho",
    activo: false,
    secciones: [],
  },
  {
    id: "compras",
    nombre: "Compras",
    descripcion: "Solicitudes, órdenes de compra y seguimiento a proveedores.",
    sigla: "CO",
    color: "bg-emerald-700",
    ruta: "/compras",
    activo: false,
    secciones: [],
  },
  {
    id: "mantenimiento",
    nombre: "Mantenimiento",
    descripcion: "Equipos, planes preventivos y órdenes de trabajo.",
    sigla: "MT",
    color: "bg-indigo-600",
    ruta: "/mantenimiento",
    activo: false,
    secciones: [],
  },
  {
    id: "usuarios",
    nombre: "Usuarios",
    descripcion: "Personas, roles y permisos de la plataforma.",
    sigla: "US",
    color: "bg-tinta-700",
    ruta: "/usuarios",
    activo: false,
    roles: ["admin"],
    secciones: [],
  },
];

export const modulosActivos = () => MODULOS.filter((m) => m.activo);

export function moduloPorRuta(pathname: string): Modulo | undefined {
  return MODULOS.filter((m) => m.activo)
    .filter((m) => pathname === m.ruta || pathname.startsWith(`${m.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
}

export function puedeVer(modulo: Modulo, rol: string): boolean {
  if (!modulo.roles || modulo.roles.length === 0) return true;
  return modulo.roles.includes(rol as Rol);
}
