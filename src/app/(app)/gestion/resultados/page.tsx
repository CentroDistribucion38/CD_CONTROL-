import "../../inventario/fefo.css";
import "../gestion.css";
import { misPermisos } from "@/lib/permisos";
import { leerGestion } from "@/modulos/gestion/datos";
import { horaBogota, hoyBogota, inicioPeriodo, turnoDeLaHora } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { Resultados } from "./Resultados";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · RESULTADO POR TURNO.
 *
 * Al cierre del turno se digita el número de cada indicador. La pantalla ya trae el turno que corre a esta hora,
 * muestra el semáforo mientras se escribe y, al guardar, revisa si saltó algún disparador.
 */
export default async function ResultadosPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyBogota();
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : hoy;
  /* Los resultados semanales y mensuales se guardan en el primer día de su periodo. */
  const desde = [inicioPeriodo(fecha, "semana"), inicioPeriodo(fecha, "mes")].sort()[0];
  const [datos, permisos] = await Promise.all([leerGestion(desde, fecha), misPermisos()]);
  if (datos.error) return <Falta ojo="GESTIÓN · RESULTADO POR TURNO" falta={datos.falta} error={datos.error} />;

  const turnoAhora = turnoDeLaHora(datos.turnos, horaBogota());

  return (
    <div className="fe gs">
      <Resultados
        fecha={fecha} hoy={hoy} turnoInicial={turnoAhora?.id ?? null}
        turnos={datos.turnos} procesos={datos.procesos} indicadores={datos.indicadores} resultados={datos.resultados}
        puedeEditar={permisos.puedeEditar("/gestion/resultados")}
      />
    </div>
  );
}
