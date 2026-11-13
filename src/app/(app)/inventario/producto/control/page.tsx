import { misPermisos } from "@/lib/permisos";
import { cargarControlCiclico } from "./datos";
import "../../fefo.css";
import "../../corte/corte.css";
import "../../fiscal/fiscal.css";
import "../../fiscal/torre.css";
import "../../conteo/cruce-ciclico.css";
import "./control-ciclico.css";
import { ControlCiclico } from "./ControlCiclico";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · PRODUCTO · CONTROL CÍCLICO.
 *
 * La otra mitad del cíclico, como el Control fiscal: el Plan cíclico arma la fecha, las hojas y las parejas; aquí
 * se sigue cada hoja (lo que lleva cada uno, si el cruce coincide, si ya enviaron el conteo), se reabre una hoja
 * enviada y se exportan los conteos a Excel. No arma nada.
 */
export default async function ControlCiclicoPage() {
  const [permisos, r] = await Promise.all([misPermisos(), cargarControlCiclico()]);
  if ("fallo" in r) return r.fallo;
  const { personas, fiscales, cerradas } = r.datos;
  return (
    <div className="fe">
      <ControlCiclico personas={personas} ciclicos={fiscales} cerradasIniciales={cerradas} ahora={new Date().toISOString()}
                      puedeEditar={permisos.puedeEditar("/inventario/producto/control") || permisos.puedeEditar("/inventario/producto/ciclico")} />
    </div>
  );
}
