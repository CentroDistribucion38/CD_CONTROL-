import { misPermisos } from "@/lib/permisos";
import {
  materiales, procesos, causas, tolvas, usoDeMaestros,
} from "@/modulos/roturas/datos";
import "../roturas.css";
import { SinTablas } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroRoturasPage() {
  /* Aquí se piden TODOS, activos y desactivados: el maestro es
     justamente donde se vuelve a activar lo que alguien apagó. */
  const [permisos, mats, pros, cas, tols, uso] = await Promise.all([
    misPermisos(), materiales(false), procesos(false), causas(false), tolvas(false),
    usoDeMaestros(),
  ]);

  if (!mats.length && !pros.length && !cas.length && !tols.length) {
    return <div className="rt"><SinTablas /></div>;
  }

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · MAESTRO</p>
          <h1>Lo que se puede escoger</h1>
          <p className="sub">
            Los materiales, los procesos, las causas y las tolvas con su tara. Son datos y no
            código: el día que llegue una tolva nueva o Bavaria agregue un formato, se arregla
            aquí y no esperando un despliegue.
          </p>
        </div>
      </section>

      <Maestro
        materiales={mats} procesos={pros} causas={cas} tolvas={tols}
        uso={uso} puedeEditar={permisos.puedeEditar("/roturas/maestro")}
      />
    </div>
  );
}
