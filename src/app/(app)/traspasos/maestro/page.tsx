import { misPermisos } from "@/lib/permisos";
import {
  tipos as leerTipos, puntos as leerPuntos, puntosFaltantes, usoDelMaestro,
  placasMaestro, rutasMaestro,
} from "@/modulos/traspasos/datos";
import "../traspasos.css";
import { SinTablas } from "../comunes";
import { Maestro } from "./Maestro";

export const dynamic = "force-dynamic";

export default async function MaestroPage() {
  const [permisos, t, pts, falt, uso, pl, ru] = await Promise.all([
    misPermisos(),
    /* Los APAGADOS también: si no, al apagar uno desaparecería de la
       única pantalla donde se puede volver a prender. */
    leerTipos(false), leerPuntos(false), puntosFaltantes(), usoDelMaestro(),
    placasMaestro(false), rutasMaestro(false),
  ]);

  if (t.falta) return <div className="tp"><SinTablas /></div>;

  /* LA CIFRA DE ARRIBA ES LA QUE MUEVE A ALGUIEN. No "6 puntos" —eso
     ya se ve en la lista— sino cuántos sitios se están escribiendo a
     mano sin estar en el maestro, que es trabajo que se está haciendo
     de más y un informe que no va a cuadrar. */
  const nuevos = falt.filter((f) => !f.parecido);
  const semana = nuevos.reduce((a, f) => a + f.veces_semana, 0);

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · MAESTRO · CD38 AG01</p>
          <h1>Maestro</h1>
          <p className="sub">
            Los puntos y los tipos de viaje son datos de este centro, no código: el día que
            abran una bodega nueva nadie debería esperar un despliegue. Lo que alguien escribe
            a mano en el registro aparece aquí para agregarlo de un toque.
          </p>
        </div>

        {nuevos.length > 0 && (
          <div className="panel-ojo">
            <div className="corte" />
            <div className="rot">SITIOS DETECTADOS SIN AGREGAR</div>
            <div className="num">{nuevos.length}</div>
            <div className="pie">
              {semana > 0
                ? <>escritos a mano <b>{semana} {semana === 1 ? "vez" : "veces"}</b> esta semana</>
                : <>ninguno se escribió esta semana</>}
            </div>
          </div>
        )}
      </section>

      <Maestro tipos={t.tipos} puntos={pts} placas={pl.placas} rutas={ru.rutas}
               faltantes={falt} uso={uso}
               puedeEditar={permisos.puedeEditar("/traspasos/maestro")} />
    </div>
  );
}
