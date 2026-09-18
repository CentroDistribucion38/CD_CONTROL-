import Link from "next/link";
import { misPermisos } from "@/lib/permisos";
import { nombresTodos } from "@/modulos/sider/datos";
import {
  tipos as leerTipos, puntos as leerPuntos, viajesDelDia, control,
  placasRecientes, rutasFrecuentes, hoyLocal, placasMaestro, diaAbierto,
} from "@/modulos/traspasos/datos";
import { turnoDeAhora, TURNOS, conDia } from "@/modulos/traspasos/formato";
import "./traspasos.css";
import { AlDia, SinTablas } from "./comunes";
import { Fechas } from "./plan/Fechas";
import { Registrar } from "./Registrar";
import { Viajes } from "./Viajes";

export const dynamic = "force-dynamic";

export default async function TraspasosPage({ searchParams }: {
  searchParams: Promise<{ d?: string }>;
}) {
  /* EL DÍA SE PUEDE MOVER, y por eso viaja en la dirección y no en un
     estado del navegador: así el turno de la noche puede dejar abierto
     el día anterior, mandarlo por chat y que al otro le abra lo mismo.
     Se valida la forma: una fecha escrita a mano en la barra no puede
     tumbar la pantalla. */
  const q = await searchParams;
  const hoy = hoyLocal();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : hoy;
  const esHoy = fecha === hoy;
  /* HACIA ADELANTE NO SE REGISTRA. La base lo rechaza —un viaje que no
     ha salido no es un registro, es un plan—, pero enterarse por un
     mensaje rojo después de escribir placa, ruta y cantidad es la peor
     forma de enterarse. Aquí se dice antes y se ofrece el sitio
     correcto. */
  const esFuturo = fecha > hoy;

  /* Las siete consultas en una sola tanda: en serie la pantalla
     tardaría lo que suman y aquí ninguna depende de otra. */
  const [permisos, t, pts, dia, ctl, placas, rutas, nombres, pl, abierto] = await Promise.all([
    misPermisos(), leerTipos(), leerPuntos(), viajesDelDia(fecha),
    control(fecha), placasRecientes(), rutasFrecuentes(), nombresTodos(),
    placasMaestro(), diaAbierto(fecha),
  ]);

  /* EL DÍA CERRADO ES UN ESTADO DE LA PANTALLA, no del calendario.

     `abierto` viene de la BASE —`traspaso_dia_abierto`— y es la misma
     cuenta que usa el candado. No se calcula aquí a propósito: dos
     versiones de «hasta cuándo se puede tocar» se separan a la primera
     corrección, y el día que se separen el botón se verá habilitado y
     el guardado reventará.

     Y QUIEN ADMINISTRA NUNCA TIENE EL DÍA CERRADO. El candado de la
     base ya lo deja pasar; si la pantalla se lo escondiera igual,
     tendría el permiso y no la puerta. */
  const cerrado = !esFuturo && !abierto && permisos.rol !== "admin";

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
          supervisor desde otro equipo. SOLO EN HOY: un día cerrado no
          cambia solo, y refrescarlo cada minuto y medio sería gastar
          consultas para volver a pintar lo mismo. */}
      <AlDia cada={esHoy ? 90 : 0} />

      {/* Moverse de día es lo primero de la pantalla, no un filtro
          escondido: al turno de la noche le toca cerrar el día anterior
          a las cinco de la mañana y esa es la primera cosa que busca. */}
      <Fechas dia={fecha} hoy={hoy} esHoy={esHoy} ruta="/traspasos" param="d" />

      <section className="cabeza-ctl">
        <div>
          <p className="ojo">
            TRASPASOS · CD38 AG01 · TURNO {turno}
            {!esHoy && ` · ${conDia(fecha).toUpperCase()}`}
          </p>
          <h1>
            {esHoy ? "Registrar viaje"
                   : esFuturo ? "Ese día no ha pasado" : "Registrar en otro día"}
          </h1>
          <p className="sub">
            {esHoy ? (
              <>Cada viaje que sale, con su placa y su ruta. El cumplido del plan no se escribe:
              sube solo con lo que se registra aquí.</>
            ) : esFuturo ? (
              <>Estás en <b>{conDia(fecha)}</b>, que todavía no llega. Los viajes se registran
              cuando ya salieron; lo de adelante se arma en{" "}
              <Link href={`/traspasos/plan?d=${fecha}`}>Planear</Link>. Dale a HOY para volver.</>
            ) : (
              <>Estás en <b>{conDia(fecha)}</b>, no en hoy. Lo que registres aquí cuenta para
              ese día y queda marcado <b>REGISTRADO DESPUÉS</b>, con tu nombre y la fecha en que
              lo metiste. La hora que se guarda es la de arranque del turno, no la de ahora.
              Dale a HOY para volver.</>
            )}
          </p>
        </div>
        <div className="der-ctl">
          <div className="panel-ojo">
            <div className="corte" aria-hidden />
            <div className="rot">{esHoy ? "REGISTRADOS HOY" : "REGISTRADOS ESE DÍA"}</div>
            <div className="num">{cumplido}</div>
            <div className="pie">
              de <b>{planeado} planeados</b>
              {vacios > 0 && ` · y ${vacios} vacío${vacios === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
      </section>

      {/* EL DÍA CERRADO SE DICE ANTES, no al tocar el botón.

          El candado vive en la base y rechaza venga de donde venga —eso
          no cambia—. Pero un rechazo que llega DESPUÉS de llenar ocho
          campos y tocar «Registrar» se lee como un fallo de la
          aplicación, no como una regla: la primera reacción es volver a
          intentarlo, y la segunda es llamar a preguntar qué se rompió.
          Aquí se dice de entrada, con la salida escrita al lado. */}
      {cerrado && (
        <section className="caja aviso-cerrado">
          <h2>El {conDia(fecha)} ya está cerrado</h2>
          <p>
            Los viajes de días anteriores no se registran, ni se anulan, ni se corrigen: se
            quedan como quedaron. Dentro del día sí — se anula y se vuelve a registrar las
            veces que haga falta.
          </p>
          <p>
            Si de verdad falta un viaje de ese día, o hay uno que no debió quedar, lo mueve un{" "}
            <b>administrador</b>. Dale a <b>HOY</b> para volver.
          </p>
        </section>
      )}

      {permisos.puedeEditar("/traspasos") && !esFuturo && !cerrado ? (
        <Registrar tipos={t.tipos} puntos={pts} placas={placas} rutas={rutas}
                   placasM={pl.placas}
                   fecha={fecha} turnoSugerido={turno}
                   planTurno={planTurno} hechosTurno={hechosTurno}
                   planPorTipo={planPorTipo}
                   viajes={dia.viajes} nombres={nombres} />
      ) : (
        <Viajes viajes={dia.viajes} nombres={nombres} puedeEditar={false} esHoy={esHoy} />
      )}

      {permisos.puedeEditar("/traspasos") && !esFuturo && !cerrado && (
        /* CORREGIR ES SOLO DEL ADMINISTRADOR. Aquí solo se decide si se
           pinta el botón; el candado de verdad está en la base, que
           rechaza la corrección venga de donde venga. Esconder un botón
           no es un permiso. */
        <Viajes viajes={dia.viajes} nombres={nombres} puedeEditar esHoy={esHoy}
                esAdmin={permisos.rol === "admin"}
                tipos={t.tipos} puntos={pts} placas={pl.placas} />
      )}

      {/* CON EL DÍA CERRADO, EL ADMINISTRADOR SIGUE PUDIENDO. No es una
          excepción escondida: es la única forma de arreglar un error de
          la semana pasada, y por eso se ve la lista con sus botones. */}
      {permisos.puedeEditar("/traspasos") && !esFuturo && cerrado
        && permisos.rol === "admin" && (
        <Viajes viajes={dia.viajes} nombres={nombres} puedeEditar esHoy={esHoy}
                esAdmin
                tipos={t.tipos} puntos={pts} placas={pl.placas} />
      )}
    </div>
  );
}
