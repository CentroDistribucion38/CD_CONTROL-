
import { createRoot } from "react-dom/client";
import { Roles } from "../src/app/(app)/admin/roles/Roles";
const roles = [
  { clave: "admin", nombre: "Administrador", descripcion: null, manda: true, sistema: true, orden: 1 },
  { clave: "operador", nombre: "Operador", descripcion: "Consulta lo que le habiliten.", manda: false, sistema: true, orden: 2 },
  { clave: "portero", nombre: "Portero", descripcion: null, manda: false, sistema: false, orden: 3 },
  { clave: "vacio", nombre: "Sin nadie", descripcion: null, manda: false, sistema: false, orden: 4 },
];
const gente = [
  { id: "1", nombre: "Ana Pérez", usuario: "ana", activo: true, rol: "portero" },
  { id: "2", nombre: "Beto Díaz", usuario: "beto", activo: false, rol: "portero" },
  { id: "3", nombre: "Caro", usuario: "caro", activo: true, rol: "operador" },
];
const historial = [
  { id: 9, rol: "portero", rol_nombre: "Portero", accion: "permisos", detalle: { cambios: [
    { seccion: "/traspasos", antes: "editar", despues: "ver" }, { seccion: "/acciones", antes: "ninguno", despues: "editar" }] },
    hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-21T15:00:00Z" },
  { id: 8, rol: "portero", rol_nombre: "Portero", accion: "duplicado", detalle: { de_nombre: "Supervisor", pantallas: 12 }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-20T15:00:00Z" },
  { id: 7, rol: "viejo", rol_nombre: "Rol viejo", accion: "borrado", detalle: { usuarios: 1, quienes: ["Dani"], a_nombre: "Operador" }, hecho_nombre: "Cristian Padilla", hecho_en: "2026-09-19T15:00:00Z" },
];
const catalogo = [
  { id: "traspasos", nombre: "Traspasos", acento: "#0A7", secciones: Array.from({ length: 20 }, (_, i) => ({ nombre: "Pantalla " + i, ruta: i ? "/traspasos/p" + i : "/traspasos" })) },
  { id: "acciones", nombre: "Acciones", acento: "#C21", secciones: Array.from({ length: 23 }, (_, i) => ({ nombre: "Otra " + i, ruta: i ? "/acciones/p" + i : "/acciones" })) },
];
createRoot(document.getElementById("r")!).render(<Roles roles={roles} catalogo={catalogo} gente={gente} historial={historial as any}
  cuantos={{ portero: 2, operador: 1 }} permisos={[{ rol: "portero", seccion: "/traspasos", nivel: "ver" }, { rol: "operador", seccion: "/acciones", nivel: "ver" }]} />);
