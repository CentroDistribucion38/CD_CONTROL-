import { misPermisos } from "@/lib/permisos";
import {
  tipos as leerTipos, puntos as leerPuntos, puntosFaltantes, usoDelMaestro,
  placasMaestro,
} from "@/modulos/traspasos/datos";
import "../traspasos.css";
import { SinTablas } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroPage() {
  const [permisos, t, pts, falt, uso, pl] = await Promise.all([
    misPermisos(),
    /* Los APAGADOS también: si no, al apagar uno desaparecería de la
       única pantalla donde se puede volver a prender. */
    leerTipos(false), leerPuntos(false), puntosFaltantes(), usoDelMaestro(),
    placasMaestro(false),
  ]);

  if (t.falta) return <div className="tp"><SinTablas /></div>;

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · MAESTRO · CD38 AG01</p>
          <h1>Maestro</h1>
          <p className="sub">
            Las bodegas, los tipos y las placas son datos de este centro, no
            código: el día que abran una bodega nueva o entre un vehículo nuevo, nadie
            debería esperar un despliegue. Lo que se agrega aquí es lo que se puede escoger
            al registrar.
          </p>
        </div>
      </section>

      <Maestro tipos={t.tipos} puntos={pts} placas={pl.placas}
               faltantes={falt} uso={uso}
               puedeEditar={permisos.puedeEditar("/traspasos/maestro")} />
    </div>
  );
}
