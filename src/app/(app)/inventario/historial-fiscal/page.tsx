import { misPermisos } from "@/lib/permisos";
import { cargarFiscales } from "../fiscal/datos";
import "../fefo.css";
import "../corte/corte.css";
import "../fiscal/fiscal.css";
import "../fiscal/torre.css";
import { Control } from "../control-fiscal/Control";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · HISTORIAL FISCAL.
 *
 * Los inventarios fiscales que ya pasaron. El Control fiscal solo muestra lo vigente (hoy y los últimos días)
 * para no llenarse de pestañas; aquí se buscan y se abren los anteriores, con el mismo detalle (torre, cruce y Excel).
 */
export default async function HistorialFiscalPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarFiscales()]);
  if ("fallo" in r) return r.fallo;
  const { personas, fiscales, conCruce } = r.datos;
  return (
    <div className="fe">
      <Control modo="historial" personas={personas} fiscales={fiscales} conCruce={conCruce} ahora={new Date().toISOString()} puedeEditar={permisos.puedeEditar("/inventario/fiscal")} />
    </div>
  );
}
