import { misPermisos } from "@/lib/permisos";
import {
  materiales, procesos, areas, causas, usoDeMaestros,
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
  const [permisos, mats, pros, ars, cas, uso] = await Promise.all([
    misPermisos(), materiales(false), procesos(false), areas(false), causas(false),
    usoDeMaestros(),
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
            Los procesos, las áreas y las causas del registro en sitio. Son datos y no
            código: el día que se abra una calle nueva o aparezca una causa que no estaba, se
            arregla aquí y no esperando un despliegue. <b>Los materiales no están aquí</b>:
            salen del maestro de Inventario, que es donde viven los 494.
          </p>
        </div>
      </section>

      <Maestro
        /* SIN «MATERIALES». Los materiales del registro en sitio salen
           del MAESTRO DE INVENTARIO desde que el desplegable pasó de
           siete a 494: esta hoja quedó apuntando a `roturas_materiales`,
           que ya nadie llena, y salía en cero. Una pestaña que siempre
           dice «0 materiales» no es una pestaña vacía — es una pestaña
           que MIENTE sobre dónde se agregan. */
        hojas={["procesos", "areas", "causas"]}
        materiales={mats} procesos={pros} areas={ars} causas={cas} tolvas={[]}
        uso={uso} puedeEditar={permisos.puedeEditar("/roturas/en-sitio/maestro")}
      />
    </div>
  );
}
