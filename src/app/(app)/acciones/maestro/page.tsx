import { misPermisos } from "@/lib/permisos";
import {
  zonas, motivosTodos, areasTodas, equipos, usoDelMaestro, acciones as leerAcciones,
} from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroPage() {
  const [permisos, zs, ms, as, eqs, uso, datos] = await Promise.all([
    misPermisos(),
    zonas(),
    /* Los DESACTIVADOS también: si no, al desactivar uno desaparecería de
       la única pantalla donde se puede volver a activar. */
    motivosTodos(),
    areasTodas(),
    /* También los desactivados, por lo mismo. */
    equipos(false),
    usoDelMaestro(),
    /* Solo para saber si el módulo existe: si falta el SQL, la pantalla
       lo dice en vez de mostrar dos listas vacías que parecen un error
       de datos y no de instalación. */
    leerAcciones(1),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Maestro</h1>
          <p className="sub">
            Las zonas y los motivos son datos, no código: el día que abran el pasillo 5 nadie
            debería esperar un despliegue. El código de la zona es el que va pegado en la pared y
            el que lee la cámara.
          </p>
        </div>
      </section>

      <Maestro
        zonas={zs}
        motivos={ms}
        areas={as}
        equipos={eqs}
        uso={uso}
        puedeEditar={permisos.puedeEditar("/acciones/maestro")}
      />
    </div>
  );
}
