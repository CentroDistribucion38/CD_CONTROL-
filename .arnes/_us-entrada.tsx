
import { createRoot } from "react-dom/client";
import { Usuarios } from "../src/app/(app)/admin/usuarios/Usuarios";
const roles = [{ clave: "admin", nombre: "Administrador", manda: true, descripcion: "Todo, incluido Usuarios" },
               { clave: "operador", nombre: "Operador", manda: false, descripcion: "Contar, registrar, roturas" },
               { clave: "portero", nombre: "Portero", manda: false, descripcion: null }];
const P = (id: string, nombre: string, usuario: string, rol: string, extra: any = {}) =>
  ({ id, nombre, usuario, rol, activo: true, clave_provisional: false, permisos_extra: {}, ...extra });
const gente = [
  P("00000000-0000-0000-0000-000000000001", "Cristian Padilla", "cpadilla", "admin"),
  P("00000000-0000-0000-0000-000000000002", "Génesis Visbal", "gvisbal", "operador"),
  P("00000000-0000-0000-0000-000000000003", "Santiago Leal", "sleal", "portero", { clave_provisional: true }),
  P("00000000-0000-0000-0000-000000000004", "Ana Pérez", "aperez", "operador", { activo: false }),
];
const hoy = new Date();
const ingresos = { "00000000-0000-0000-0000-000000000001": hoy.toISOString(),
  "00000000-0000-0000-0000-000000000002": new Date(hoy.getTime() - 5 * 864e5).toISOString(),
  "00000000-0000-0000-0000-000000000003": null, "00000000-0000-0000-0000-000000000004": null };
const registros = { "00000000-0000-0000-0000-000000000001": 900, "00000000-0000-0000-0000-000000000002": 12,
  "00000000-0000-0000-0000-000000000003": 0, "00000000-0000-0000-0000-000000000004": 0 };
const delRol = [{ rol: "operador", seccion: "/inventario/conteo", nivel: "editar" }, { rol: "operador", seccion: "/quiebra/rotura", nivel: "editar" },
                { rol: "portero", seccion: "/sider", nivel: "ver" }];
createRoot(document.getElementById("r")!).render(<Usuarios gente={gente as any} roles={roles} delRol={delRol as any} catalogo={[]}
  hayLlave={true} yo="00000000-0000-0000-0000-000000000001" ingresos={ingresos} registros={registros} buscar="" />);
