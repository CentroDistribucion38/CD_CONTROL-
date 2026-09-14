import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  tipos as leerTipos, puntos as leerPuntos, viajesDelDia, control,
  placasRecientes, rutasFrecuentes, hoyLocal, placasMaestro, rutasMaestro,
} from "@/modulos/traspasos/datos";
import { turnoDeAhora, TURNOS } from "@/modulos/traspasos/formato";
import "./traspasos.css";
import { AlDia, SinTablas } from "./comunes";
import { Registrar } from "./Registrar";
import { Viajes } from "./Viajes";

export const dynamic = "force-dynamic";

export default async function TraspasosPage() {
  const fecha = hoyLocal();

  /* Las siete consultas en una sola tanda: en serie la pantalla
     tardaría lo que suman y aquí ninguna depende de otra. */
  const [permisos, t, pts, dia, ctl, placas, rutas, nombres, pl, ru] = await Promise.all([
    misPermisos(), leerTipos(), leerPuntos(), viajesDelDia(fecha),
    control(fecha), placasRecientes(), rutasFrecuentes(), nombresTodos(),
    placasMaestro(), rutasMaestro(),
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

  /* EL PLAN DEL TURNO, TIPO POR TIPO. Es lo que convierte "escoger el
     tipo" en "escoger del plan": qué se prometió mover en este turno y
     cuánto falta de cada uno.

     NO HACE FALTA NINGUNA CONSULTA NUEVA: v_traspasos_control ya trae
     una fila por (fecha, turno, tipo) con planeado y cumplido, que es
     exactamente esto. Pedirlo otra vez sería preguntar dos veces lo
     mismo y arriesgarse a que las dos respuestas no coincidan. */
  const planPorTipo: Record<string, {
    tipo: string; nombre: string; planeado: number; cumplido: number;
  }[]> = {};
  for (const tu of TURNOS) {
    planPorTipo[tu] = ctl.filas
      .filter((f) => f.turno === tu && f.planeado > 0)
      .sort((a, b) => (a.tipo_orden ?? 99) - (b.tipo_orden ?? 99))
      .map((f) => ({
        tipo: f.tipo, nombre: f.tipo_nombre,
        planeado: f.planeado, cumplido: f.cumplido,
      }));
  }

  const turno = turnoDeAhora();

  return (
    <div className="tp">
      {/* Los cuadritos del plan suben también cuando registra otro
          supervisor desde otro equipo. */}
      <AlDia cada={90} />

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
                   placasM={pl.placas} rutasM={ru.rutas}
                   fecha={fecha} turnoSugerido={turno}
                   planTurno={planTurno} hechosTurno={hechosTurno}
                   planPorTipo={planPorTipo}
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
