
import { createRoot } from "react-dom/client";
import { BorrarDatos } from "../src/app/(app)/admin/datos/BorrarDatos";
const P = (clave: string, modulo: string, nombre: string) => ({ clave, modulo, nombre, detalle: "Detalle de " + nombre + " para ver cómo se parte en dos renglones en el celular.", bucket: null });
createRoot(document.getElementById("r")!).render(<BorrarDatos hoy="2026-09-21" hayLlave={true}
  puntos={[P("traspasos.plan","Traspasos","Plan de viajes"), P("traspasos.viajes","Traspasos","Viajes registrados"),
           P("rotlinea.registro","Rotura de línea","Pesadas registradas"), P("rotlinea.hojas","Rotura de línea","Hojas del día generadas")]}
  historial={[{ id: 1, nombre: "Traspasos · Viajes registrados", desde: "2026-09-01", hasta: "2026-09-10", filas: 1234, archivos: 0, borrado_nombre: "Cristian Padilla", borrado_en: "2026-09-20T15:00:00Z" }]} />);
