import "../../inventario/fefo.css";
import "../gestion.css";
import { misPermisos } from "@/lib/permisos";
import { leerGestion } from "@/modulos/gestion/datos";
import { hoyBogota } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { Disparadores } from "./Disparadores";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · DISPARADORES.
 *
 * Lo que saltó porque un indicador se desvió según SU regla (la meta no se cumplió N resultados seguidos).
 * Un disparador activo es una pregunta abierta: de aquí se abre el 5 Why (siguiente entrega). Mientras tanto
 * se puede descartar con su motivo si no procede.
 */
export default async function DisparadoresPage() {
  const hoy = hoyBogota();
  const [datos, permisos] = await Promise.all([leerGestion(hoy, hoy), misPermisos()]);
  if (datos.error) return <Falta ojo="GESTIÓN · DISPARADORES" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Disparadores
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores} disparadores={datos.disparadores}
        puedeEditar={permisos.puedeEditar("/gestion/disparadores")}
      />
    </div>
  );
}
