import "../../inventario/fefo.css";
import "../gestion.css";
import "./disparadores.css";
import { misPermisos } from "@/lib/permisos";
import { leerAnalisis, leerGestion } from "@/modulos/gestion/datos";
import { hoyBogota } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { Disparadores } from "./Disparadores";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · DISPARADORES — del disparador al cierre.
 *
 * Lo que saltó porque un indicador no cumplió la meta según SU regla queda PENDIENTE. De ahí: se toma (EN ANÁLISIS),
 * se hace el 5 Why hasta la causa raíz, se arma el plan de acción y se CIERRA cuando todas las acciones están hechas.
 * Si no procede, se descarta con su motivo.
 */
export default async function DisparadoresPage() {
  const hoy = hoyBogota();
  const [datos, permisos, an] = await Promise.all([leerGestion(hoy, hoy), misPermisos(), leerAnalisis()]);
  if (datos.error) return <Falta ojo="GESTIÓN · DISPARADORES" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Disparadores
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores} disparadores={datos.disparadores}
        analisis={an.analisis} acciones={an.acciones} faltaSql={an.falta} hoy={hoy}
        puedeEditar={permisos.puedeEditar("/gestion/disparadores")}
      />
    </div>
  );
}
