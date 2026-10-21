import { misPermisos } from "@/lib/permisos";
import { cargarFiscales } from "../fiscal/datos";
import "../fefo.css";
import "../corte/corte.css";
import "../fiscal/fiscal.css";
import "../fiscal/torre.css";
import { Control } from "./Control";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · CONTROL FISCAL.
 *
 * La otra mitad del inventario fiscal: el Plan fiscal arma la fecha, las hojas y
 * las parejas; aquí se ve y se ejecuta el control — la torre en vivo, la revisión
 * de las diferencias del cruce y el Excel con todo. Es de lectura: no arma nada.
 */
export default async function ControlFiscalPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarFiscales()]);
  if ("fallo" in r) return r.fallo;
  const { personas, fiscales, conCruce } = r.datos;
  return (
    <div className="fe">
      <Control personas={personas} fiscales={fiscales} conCruce={conCruce} ahora={new Date().toISOString()} puedeEditar={permisos.puedeEditar("/inventario/fiscal")} />
    </div>
  );
}
