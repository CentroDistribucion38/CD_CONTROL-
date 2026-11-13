import { misPermisos } from "@/lib/permisos";
import "../../fefo.css";
import "../../corte/corte.css";
import "../../fiscal/fiscal.css";
import "../../fiscal/torre.css";
import "../../conteo/cruce-ciclico.css";
import "../control/control-ciclico.css";
import { ControlCiclico } from "../control/ControlCiclico";
import { cargarControlCiclico } from "../control/datos";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PRODUCTO · HISTORIAL CÍCLICO.
 *
 * Los cíclicos que ya pasaron. El Control cíclico solo muestra lo vigente; aquí se buscan y se abren los
 * anteriores, con el mismo detalle (cada hoja, su cruce y el Excel de los conteos).
 */
export default async function HistorialCiclicoPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarControlCiclico()]);
  if ("fallo" in r) return r.fallo;
  const { personas, fiscales, cerradas } = r.datos;
  return (
    <div className="fe">
      <ControlCiclico modo="historial" personas={personas} ciclicos={fiscales} cerradasIniciales={cerradas} ahora={new Date().toISOString()}
                      puedeEditar={permisos.puedeEditar("/inventario/producto/control") || permisos.puedeEditar("/inventario/producto/ciclico")} />
    </div>
  );
}
