import { misPermisos } from "@/lib/permisos";
import { leerMaestroPasivos } from "@/modulos/pasivos/datos";
import "../../../fefo.css";
import "../../balance.css";
import "../pasivos.css";
import { MaestroPasivos } from "./MaestroPasivos";

export const dynamic = "force-dynamic";

/**
 * INVENTARIO · BALANCE · PASIVOS · MAESTRO — la hoja MAESTRO de BLOQUEADOS.xlsx.
 * De aquí salen la descripción, la caja, las unidades por caja, el HL y el costo de la base de Pasivos.
 */
export default async function MaestroPasivosPage() {
  const [permisos, maestro] = await Promise.all([misPermisos(), leerMaestroPasivos()]);
  return (
    <div className="fe bal pas">
      <MaestroPasivos filas={maestro.data} error={maestro.error}
        puedeEditar={permisos.puedeEditar("/inventario/balance/pasivos/maestro")} />
    </div>
  );
}
