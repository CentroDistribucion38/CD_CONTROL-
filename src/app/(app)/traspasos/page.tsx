import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  tipos as leerTipos, puntos as leerPuntos, viajesDelDia, control,
  placasRecientes, rutasFrecuentes, hoyLocal,
} from "@/modulos/traspasos/datos";
import { turnoDeAhora, TURNOS } from "@/modulos/traspasos/formato";
import "./traspasos.css";
import { SinTablas } from "./comunes";
import { Registrar } from "./Registrar";
import { Viajes } from "./Viajes";

export const dynamic = "force-dynamic";

export default async function TraspasosPage() {
  const fecha = hoyLocal();

  /* Las siete consultas en una sola tanda: en serie la pantalla
     tardaría lo que suman y aquí ninguna depende de otra. */
  const [permisos, t, pts, dia, ctl, placas, rutas, nombres] = await Promise.all([
    misPermisos(), leerTipos(), leerPuntos(), viajesDelDia(fecha),
    control(fecha), placasRecientes(), rutasFrecuentes(), nombresTodos(),
  ]);

  if (t.falta || dia.falta) return <div className="tp"><SinTablas /></div>;

  const vivos = dia.viajes.filter((v) => v.vale);
  const cumplido = vivos.filter((v) => !v.vacio).reduce((a, v) => a + v.viajes, 0);
  const vacios = vivos.filter((v) => v.vacio).reduce((a, v) => a + v.viajes, 0);
  const planeado = ctl.filas.reduce((a, f) => a + f.planeado, 0);

  /* Por turno, para los cuadritos del panel de la derecha. */
  const planTurno: Record<string, number> = {};
  const hechosTurno: Record<string, number> = {};
  for (const tu of TURNOS) {
    planTurno[tu] = ctl.filas.filter((f) => f.turno === tu)
      .reduce((a, f) => a + f.planeado, 0);
    hechosTurno[tu] = ctl.filas.filter((f) => f.turno === tu)
      .reduce((a, f) => a + f.cumplido, 0);
  }

  const turno = turnoDeAhora();

  return (
    <div className="tp">
      <section className="cabeza-ctl">
        <div>
          <p className="ojo">TRASPASOS · CD38 AG01 · TURNO {turno}</p>
          <h1>Registrar viaje</h1>
          <p className="sub">
            Cada viaje que sale, con su placa y su ruta. El cumplido del plan no se escribe:
            sube solo con lo que se registra aquí.
          </p>
        </div>
        <div className="der-ctl">
          <div className="panel-ojo">
            <div className="corte" aria-hidden />
            <div className="rot">REGISTRADOS HOY</div>
            <div className="num">{cumplido}</div>
            <div className="pie">
              de <b>{planeado} planeados</b>
              {vacios > 0 && ` · y ${vacios} vacío${vacios === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
      </section>

      {permisos.puedeEditar("/traspasos") ? (
        <Registrar tipos={t.tipos} puntos={pts} placas={placas} rutas={rutas}
                   fecha={fecha} turnoSugerido={turno}
                   planTurno={planTurno} hechosTurno={hechosTurno}
                   viajes={dia.viajes} nombres={nombres} />
      ) : (
        <Viajes viajes={dia.viajes} nombres={nombres} puedeEditar={false} />
      )}

      {permisos.puedeEditar("/traspasos") && (
        <Viajes viajes={dia.viajes} nombres={nombres} puedeEditar />
      )}
    </div>
  );
}
