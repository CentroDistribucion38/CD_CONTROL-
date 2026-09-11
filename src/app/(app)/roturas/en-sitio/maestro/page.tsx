import { misPermisos } from "@/lib/permisos";
import {
  materiales, procesos, causas, usoDeMaestros,
} from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";
import { Maestro } from "../../Maestro";

export const dynamic = "force-dynamic";

/**
 * EL MAESTRO DE EN SITIO. Las tolvas NO están aquí: son de la salida y
 * viven en su propia pantalla. Un maestro con las cuatro hojas volvería
 * a juntar en un solo sitio lo que las dos ramas existen para separar.
 */
export default async function MaestroEnSitioPage() {
  /* Aquí se piden TODOS, activos y desactivados: el maestro es
     justamente donde se vuelve a activar lo que alguien apagó. */
  const [permisos, mats, pros, cas, uso] = await Promise.all([
    misPermisos(), materiales(false), procesos(false), causas(false), usoDeMaestros(),
  ]);

  if (!mats.length && !pros.length && !cas.length) {
    return <div className="rt"><SinTablas /></div>;
  }

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · MAESTRO</p>
          <h1>Lo que se puede escoger</h1>
          <p className="sub">
            Los materiales, los procesos y las causas del registro en sitio. Son datos y no
            código: el día que Bavaria agregue un formato o aparezca una causa nueva, se arregla
            aquí y no esperando un despliegue.
          </p>
        </div>
      </section>

      <Maestro
        hojas={["materiales", "procesos", "causas"]}
        materiales={mats} procesos={pros} causas={cas} tolvas={[]}
        uso={uso} puedeEditar={permisos.puedeEditar("/roturas/en-sitio/maestro")}
      />
    </div>
  );
}
