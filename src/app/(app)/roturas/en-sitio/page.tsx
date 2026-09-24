import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  roturas as leerRoturas, materialesMaestro, procesos, areas, causas,
} from "@/modulos/roturas/datos";
import "../roturas.css";
import { SinTablas } from "../comunes";
import { EnSitio } from "./EnSitio";

export const dynamic = "force-dynamic";

/**
 * EN SITIO. Las siete consultas van en una sola tanda: en serie la
 * pantalla tardaría lo que suman, y aquí ninguna depende de otra.
 */
export default async function RoturasPage() {
  const [permisos, datos, mats, pros, ars, cas, nombres] = await Promise.all([
    misPermisos(), leerRoturas(), materialesMaestro(), procesos(), areas(), causas(),
    nombresTodos(),
  ]);

  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const esperando = datos.roturas.filter((r) => r.esperando).length;

  /* LA CABECERA SE LA LLEVA EnSitio, no se pinta aquí.

     «El registro debe ser un solo módulo, no puede haber más cosas.»
     Mientras se está registrando, la pantalla es EL FORMULARIO Y NADA
     MÁS: ni el titular, ni el párrafo, ni el contador de lo que espera
     visto bueno. Y eso solo se puede decidir donde se sabe si el
     formulario está abierto, que es adentro. Dejada aquí, la cabecera
     se pintaría siempre —es del servidor— y volvería a salir debajo
     del formulario. */
  return (
    <div className="rt">
      <EnSitio
        esperando={esperando}
        roturas={datos.roturas}
        nombres={nombres}
        materiales={mats.materiales}
        materialesDe={mats.de}
        procesos={pros}
        areas={ars}
        causas={cas}
        puedeEditar={permisos.puedeEditar("/roturas/en-sitio")}
      />
    </div>
  );
}
