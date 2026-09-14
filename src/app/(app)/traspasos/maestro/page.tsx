import { misPermisos } from "@/lib/permisos";
import {
  tipos as leerTipos, puntos as leerPuntos, puntosFaltantes, usoDelMaestro,
} from "@/modulos/traspasos/datos";
import "../traspasos.css";
import { SinTablas } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroPage() {
  const [permisos, t, pts, falt, uso] = await Promise.all([
    misPermisos(),
    /* Los DESACTIVADOS también: si no, al desactivar uno desaparecería
       de la única pantalla donde se puede volver a activar. */
    leerTipos(false), leerPuntos(false), puntosFaltantes(), usoDelMaestro(),
  ]);

  if (t.falta) return <div className="tp"><SinTablas /></div>;

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · MAESTRO · CD38 AG01</p>
          <h1>Maestro</h1>
          <p className="sub">
            Los tipos de viaje y los puntos son datos, no código: el día que abran una bodega
            nueva nadie debería esperar un despliegue. Lo que se escribió a mano en el registro
            aparece arriba para agregarlo de un toque — es lo que impide que «Ag01», «AG-01» y
            «ag 01» terminen siendo tres sitios distintos.
          </p>
        </div>
      </section>

      <Maestro tipos={t.tipos} puntos={pts} faltantes={falt} uso={uso}
               puedeEditar={permisos.puedeEditar("/traspasos/maestro")} />
    </div>
  );
}
