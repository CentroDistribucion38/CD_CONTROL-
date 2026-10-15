import "../../inventario/fefo.css";
import "../gestion.css";
import { misPermisos } from "@/lib/permisos";
import { leerGestion } from "@/modulos/gestion/datos";
import { hoyBogota } from "@/modulos/gestion/semaforo";
import { Falta } from "../comunes";
import { Importar } from "./Importar";

export const dynamic = "force-dynamic";

/**
 * GESTIÓN · IMPORTAR — la carga masiva: se baja la plantilla, se llena (procesos, indicadores con su meta y su
 * disparador, y los resultados) y se sube aquí. Antes de guardar se ve qué se crea, qué se actualiza y los errores.
 */
export default async function ImportarPage() {
  const hoy = hoyBogota();
  const [datos, permisos] = await Promise.all([leerGestion(hoy, hoy), misPermisos()]);
  if (datos.error) return <Falta ojo="GESTIÓN · IMPORTAR" falta={datos.falta} error={datos.error} />;

  return (
    <div className="fe gs">
      <Importar
        hoy={hoy}
        existentes={{
          turnos: datos.turnos,
          procesos: datos.procesos.map((p) => ({ nombre: p.nombre })),
          indicadores: datos.indicadores,
        }}
        puedeEditar={permisos.puedeEditar("/gestion/importar") && permisos.puedeEditar("/gestion/maestro")}
        puedeResultados={permisos.puedeEditar("/gestion/resultados")}
      />
    </div>
  );
}
