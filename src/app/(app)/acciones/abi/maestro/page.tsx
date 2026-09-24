import { misPermisos } from "@/lib/permisos";
import {
  temasHallazgo, usoDeTemas, hallazgos as leerHallazgos,
} from "@/modulos/acciones/hallazgos";
import "../../acciones.css";
import "../abi.css";
import { SinAbi } from "../SinAbi";
import { Temas } from "./Temas";

export const dynamic = "force-dynamic";

export default async function AbiMaestroPage() {
  const [permisos, temas, uso, hz] = await Promise.all([
    misPermisos(),
    /* TAMBIÉN LOS DESACTIVADOS: si no, apagar un tema lo haría
       desaparecer de la única pantalla donde se puede volver a
       prender. */
    temasHallazgo(false),
    usoDeTemas(),
    /* Solo para saber si la rama existe. Sin esto, faltando el SQL
       esta pantalla mostraría una lista vacía, que parece un maestro
       sin datos y no una instalación a medias. */
    leerHallazgos(1),
  ]);

  if (hz.falta) return <div className="ac"><SinAbi /></div>;

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES · ABI · MAESTRO</p>
          <h1>Maestro de ABI</h1>
          <p className="sub">
            Los temas son datos, no código. <b>Las áreas y las zonas no se repiten aquí</b>: ABI
            usa las mismas de Acciones, en <b>Acciones → OL → Maestro</b>. Dos maestros para el
            mismo sitio es como una calle termina llamándose de dos formas y los informes dejan
            de cuadrar.
          </p>
        </div>
      </section>

      <Temas
        temas={temas}
        uso={uso}
        puedeEditar={permisos.puedeEditar("/acciones/abi/maestro")}
      />
    </div>
  );
}
