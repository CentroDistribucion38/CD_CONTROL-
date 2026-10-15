import "../../inventario/fefo.css";
import "../gestion.css";
import { misPermisos } from "@/lib/permisos";
import { leerGestion } from "@/modulos/gestion/datos";
import { hoyBogota } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · MAESTRO — donde se parametriza todo: los turnos, los procesos y los indicadores
 * (KPI y PI, su meta, su frecuencia, su captura y la regla de su disparador).
 */
export default async function MaestroPage() {
  const hoy = hoyBogota();
  const [datos, permisos] = await Promise.all([leerGestion(hoy, hoy), misPermisos()]);
  if (datos.error) return <Falta ojo="GESTIÓN · MAESTRO" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Maestro
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores}
        puedeEditar={permisos.puedeEditar("/gestion/maestro")}
      />
    </div>
  );
}
