import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  acciones as leerAcciones, zonas, motivos, areas, parametros,
} from "@/modulos/acciones/datos";
import "./acciones.css";
import { SinTablas } from "./comunes";
import { Todas } from "./Todas";

export const dynamic = "force-dynamic";

/**
 * TODAS LAS ACCIONES. Las siete consultas van en una sola tanda: en serie
 * la pantalla tardaría lo que suman, y aquí ninguna depende de otra.
 */
export default async function AccionesPage() {
  const [permisos, datos, zs, ms, as, par, nombres] = await Promise.all([
    misPermisos(),
    leerAcciones(),
    zonas(),
    motivos(),
    areas(),
    parametros(),
    nombresTodos(),
  ]);

  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Todas las acciones</h1>
          <p className="sub">
            Lo que se encontró mal en la bodega, con su plazo y su dueño. El plazo lo pone la
            prioridad y no la persona; cerrar no es resolver —después alguien verifica si de
            verdad sirvió—; y a la tercera vez del mismo motivo en el mismo sitio el sistema deja
            de aceptar otra corrección y pide una preventiva.
          </p>
        </div>
      </section>

      <Todas
        acciones={datos.acciones}
        nombres={nombres}
        zonas={zs}
        motivos={ms}
        areas={as}
        plazos={par.plazos}
        puedeEditar={permisos.puedeEditar("/acciones")}
      />
    </div>
  );
}
