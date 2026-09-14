import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  tipos as leerTipos, puntos as leerPuntos, viajesDelDia, seguimiento, hoyLocal,
} from "@/modulos/traspasos/datos";
import "./traspasos.css";
import { SinTablas } from "./comunes";
import { Registrar } from "./Registrar";
import { Viajes } from "./Viajes";

export const dynamic = "force-dynamic";

/** Qué turno va según la hora de Colombia. Se PROPONE, no se impone:
 *  quien registra a las 6:05 casi siempre está cerrando el anterior. */
function turnoDeAhora() {
  const h = new Date(Date.now() - 5 * 3600_000).getUTCHours();
  if (h >= 6 && h < 14) return 1;
  if (h >= 14 && h < 22) return 2;
  return 3;
}

export default async function TraspasosPage() {
  const fecha = hoyLocal();

  /* Las cinco consultas en una sola tanda: en serie la pantalla
     tardaría lo que suman y aquí ninguna depende de otra. */
  const [permisos, t, pts, dia, seg, nombres] = await Promise.all([
    misPermisos(), leerTipos(), leerPuntos(), viajesDelDia(fecha),
    seguimiento(fecha), nombresTodos(),
  ]);

  if (t.falta || dia.falta) return <div className="tp"><SinTablas /></div>;

  const vivos = dia.viajes.filter((v) => v.vale);
  const cargados = vivos.filter((v) => !v.vacio).length;
  const vacios = vivos.filter((v) => v.vacio).length;
  const planeado = seg.filas.reduce((a, f) => a + f.planeado, 0);
  const faltan = seg.filas.reduce((a, f) => a + f.faltan, 0);

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · CD38 AG01</p>
          <h1>Viajes de hoy</h1>
          <p className="sub">
            Cada viaje que sale, con su placa y su ruta. El cumplido del plan no se escribe:
            sube solo con cada viaje que se registra aquí, así que nunca hay dos números que
            digan cosas distintas del mismo turno.
          </p>
        </div>
        <div className="kpi">
          <div className="rot">VIAJES REGISTRADOS HOY</div>
          <div className="num">{cargados}<span className="u">con carga</span></div>
          <div className="pie">
            {vacios > 0 ? `y ${vacios} vacío${vacios === 1 ? "" : "s"}` : "sin viajes vacíos"}
          </div>
        </div>
      </section>

      <div className="cifras">
        <div className="cifra">
          <div className="rot">PLANEADO HOY</div>
          <div className="n">{planeado}</div>
          <div className="u">viajes con carga en los tres turnos</div>
        </div>
        <div className="cifra">
          <div className="rot">CUMPLIDO</div>
          <div className="n">{cargados}</div>
          <div className="u">contado sobre los viajes registrados</div>
        </div>
        <div className={"cifra" + (faltan > 0 ? " mal" : "")}>
          <div className="rot">FALTAN</div>
          <div className="n">{faltan}</div>
          <div className="u">de lo que se planeó y no se ha movido</div>
        </div>
        <div className="cifra ojo">
          <div className="rot">VIAJES VACÍOS</div>
          <div className="n">{vacios}</div>
          <div className="u">cuestan igual y no mueven producto</div>
        </div>
      </div>

      {permisos.puedeEditar("/traspasos") && (
        <Registrar tipos={t.tipos} puntos={pts} fecha={fecha}
                   turnoSugerido={turnoDeAhora()} />
      )}

      <Viajes viajes={dia.viajes} nombres={nombres}
              puedeEditar={permisos.puedeEditar("/traspasos")} />
    </div>
  );
}
