import { misPermisos } from "@/lib/permisos";
import {
  controlRango, vaciosRango, tipos as leerTipos, hoyLocal, cruceDelDia, fueraDelPlanRango,
  type Control,
} from "@/modulos/traspasos/datos";
import { fecha as fechaLarga, TURNOS } from "@/modulos/traspasos/formato";
import { nombresTodos } from "@/modulos/sider/datos";
import "../traspasos.css";
import "../cruce/cruce.css";
import { AlDia, SinTablas } from "../comunes";
import { Barra } from "./Barra";
import { Turnos } from "./Turnos";
import { TarjetaKpi } from "./TarjetaKpi";
import { Diferencias } from "./Diferencias";
import { Fechas } from "../plan/Fechas";

export const dynamic = "force-dynamic";

/**
 * CONTROL Y EJECUCIÓN — la pantalla de la reunión.
 *
 * SE LEE DE ARRIBA ABAJO Y EN ESE ORDEN A PROPÓSITO:
 *
 *   1. la cifra que manda ..... adherencia al plan
 *   2. cómo va repartida ...... la cinta y los tres turnos
 *   3. lo que está mal ........ las alertas
 *   4. el detalle ............. la tabla por tipo
 *
 * Quien entra a las seis de la mañana mira la primera línea y se va.
 * Quien está en la reunión baja hasta la tabla. Las dos cosas en la
 * misma pantalla, sin pestañas.
 *
 * LAS DOS CIFRAS QUE NO SON LA MISMA:
 *
 *   ADHERENCIA    de lo PLANEADO, cuánto se hizo. Tope 100%: hacer
 *                 viajes de más no arregla los que faltaron.
 *   CUMPLIMIENTO  todo lo movido contra lo planeado, adicionales
 *                 incluidos.
 *
 * LA CINTA tiene tres tramos que SUMAN EL PLAN, no el total movido: lo
 * que se hizo dentro del plan, lo que se hizo de más, y el hueco de lo
 * que no salió. El hueco va punteado y sin color porque un hueco tiene
 * que verse como un hueco.
 */
export default async function ControlPage({ searchParams }: {
  searchParams: Promise<{ dias?: string; turno?: string; tipo?: string; d?: string;
                          desde?: string; hasta?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();
  const esFecha = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? "");

  /* EL DÍA EN EL QUE TERMINA LA VENTANA, y puede ser MAÑANA.
     Antes esto era hoy y punto, y eso dejaba el plan de mañana sin
     forma de mirarse: se armaba en Plan y no había dónde verlo contra
     nada. Un plan que no se puede revisar antes de que empiece el turno
     es un plan que solo se revisa cuando ya no se puede arreglar. */
  const dia = esFecha(q.d) ? q.d! : hoy;
  const esHoy = dia === hoy;

  /* ==================================================================
     EL RANGO: DESDE Y HASTA, COMO SE PIDA.

     «Necesito que traspasos me genere informes por turno, por fecha,
     como yo quiera.» Los períodos fijos —hoy, últimos 7, últimos 30—
     resolvían la reunión de la mañana y nada más: para "del 1 al 15 de
     agosto, turno C" no había forma de pedirlo.

     LOS ENLACES VIEJOS SIGUEN SIRVIENDO. Un WhatsApp con `?dias=6` o
     con `?d=2026-08-12` abre lo mismo que abría antes: si no viene
     `desde`/`hasta`, el rango sale del día y la ventana, como siempre.
     Se invierten si llegan al revés, que es lo que pasa cuando alguien
     escribe primero el «hasta».
     ================================================================== */
  const rangoLibre = esFecha(q.desde) || esFecha(q.hasta);
  const dias = Math.min(Math.max(Number(q.dias) || 0, 0), 365);
  const a = esFecha(q.desde) ? q.desde! : esFecha(q.hasta) ? q.hasta! : dia;
  const b = esFecha(q.hasta) ? q.hasta! : esFecha(q.desde) ? q.desde! : dia;
  const desde = rangoLibre ? (a <= b ? a : b)
    : new Date(Date.parse(dia + "T12:00:00") - dias * 86400_000).toISOString().slice(0, 10);
  const hasta = rangoLibre ? (a <= b ? b : a) : dia;

  const [permisos, ctl, vacios, t, cruce, nombres, fuera] = await Promise.all([
    misPermisos(), controlRango(desde, hasta), vaciosRango(desde, hasta), leerTipos(),
    /* EL CRUCE DEL DÍA QUE SE ESTÁ MIRANDO. Ya no hay pantalla de cruce:
       Importar solo sube el corte, y las diferencias salen aquí abajo,
       que es donde se miran los números del día. Se trae solo el día
       —no el corte entero— porque esta consulta se paga en cada carga
       del tablero, y el tablero se queda puesto en la oficina. */
    cruceDelDia(dia),
    /* Para poner NOMBRE a quien registró el viaje sin documento. Un id
       no sirve para ir a preguntarle. */
    nombresTodos(),
    /* LO QUE SE MOVIÓ Y NO MIDE. Va en su propia consulta y en su
       propia vista: es trabajo hecho que no entra en el porcentaje, y
       meterlo en la misma vista que el cumplido es cómo alguien termina
       sumando tolvas al plan «porque estaban ahí». */
    fueraDelPlanRango(desde, hasta),
  ]);
  void permisos;

  if (ctl.falta) return <div className="tp"><SinTablas /></div>;

  /* VARIOS A LA VEZ, separados por coma: ?turno=A,C. Un conjunto vacío
     quiere decir «todos», que es como se comporta cualquier filtro: no
     filtrar es ver todo. Y los enlaces viejos de un solo valor siguen
     funcionando, porque «A» partido por comas es ["A"]. */
  const listaDe = (v?: string) =>
    new Set((v ?? "").split(",").map((x) => x.trim()).filter(Boolean));
  const turnos = listaDe(q.turno);
  const tipos = listaDe(q.tipo);

  /* El filtro de turno y tipo se aplica aquí porque ya vino el rango de
     la base: son decenas de filas, no miles. El de FECHA sí va en la
     base —ese es el que crece—. */
  const filas = ctl.filas.filter((f) =>
    (!turnos.size || turnos.has(f.turno)) && (!tipos.size || tipos.has(f.tipo)));

  const sum = (l: Control[], k: keyof Control) =>
    l.reduce((a, f) => a + (Number(f[k]) || 0), 0);

  const planeado = sum(filas, "planeado");
  const cumplido = sum(filas, "cumplido");
  const adheridos = sum(filas, "adheridos");
  const adicionales = sum(filas, "adicionales");
  const faltan = planeado - adheridos;
  const sinPlanear = filas.filter((f) => f.sin_planear).length;

  /* ------------------------------------------------------------------
     LO QUE SE MOVIÓ Y NO MIDE — mismo filtro de turno y de tipo que
     arriba, para que la tarjeta hable del mismo recorte que el resto de
     la pantalla. Si el filtro de tipo deja fuera las tolvas, la tarjeta
     tampoco las cuenta: una tarjeta que ignora el filtro es una cifra
     que no cuadra con nada de lo que se está mirando.
     ------------------------------------------------------------------ */
  const fueraFilas = fuera.filas.filter((f) =>
    (!turnos.size || turnos.has(f.turno)) && (!tipos.size || tipos.has(f.tipo)));
  const fueraViajes = fueraFilas.reduce((a, f) => a + (Number(f.viajes) || 0), 0);
  const fueraPorSalir = fueraFilas.reduce((a, f) => a + (Number(f.por_salir) || 0), 0);
  /* POR TIPO, que es la pregunta de verdad: «¿cuántas tolvas movimos?»,
     no «¿cuántos viajes que no miden?». Se junta por tipo —no por
     motivo— porque es el tipo lo que la gente nombra. */
  const fueraPorTipo = [...fueraFilas.reduce((m, f) => {
    const x = m.get(f.tipo) ?? {
      nombre: f.tipo_nombre ?? f.tipo, orden: f.tipo_orden ?? 99,
      motivo: f.motivo_nombre, viajes: 0, porSalir: 0,
    };
    x.viajes += Number(f.viajes) || 0;
    x.porSalir += Number(f.por_salir) || 0;
    m.set(f.tipo, x);
    return m;
  }, new Map<string, { nombre: string; orden: number; motivo: string; viajes: number; porSalir: number }>())
    .values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  /* Se calculan UNA vez sobre las sumas y no por renglón: promediar los
     porcentajes de cada tipo daría otro número —el tipo con 2 planeados
     pesaría igual que el de 40—. */
  const adherencia = planeado > 0 ? Math.round((adheridos / planeado) * 100) : 0;
  const cumplimiento = planeado > 0 ? Math.round((cumplido / planeado) * 100) : 0;

  /* La cinta reparte sobre el PLAN. Si se hicieron más de los
     planeados, el tramo de adicionales se recorta para que la cinta no
     se pase de largo: lo de más ya está dicho en su alerta. */
  const base = Math.max(planeado, 1);
  const pOk = Math.min(100, (adheridos / base) * 100);
  const pExtra = Math.min(100 - pOk, (adicionales / base) * 100);
  const pFalta = Math.max(0, 100 - pOk - pExtra);

  /* Por turno, en el orden de la bodega: C abre el día. */
  const porTurno = TURNOS.map((tu) => {
    const l = filas.filter((f) => f.turno === tu);
    const pl = sum(l, "planeado");
    const ad = sum(l, "adheridos");
    return { turno: tu, planeado: pl, adheridos: ad,
             pct: pl > 0 ? Math.round((ad / pl) * 100) : 0, hay: l.length > 0 };
  });

  const alCien = filas.filter((f) => f.planeado > 0 && f.adherencia === 100);
  const unDia = desde === hasta;
  const rotulo = unDia ? fechaLarga(hasta) : `${fechaLarga(desde)} a ${fechaLarga(hasta)}`;

  /* El anillo y su circunferencia se mudaron a Turnos.tsx, que es donde
     se dibujan ahora: el radio y el número tienen que vivir juntos o el
     día que alguien cambie uno, el anillo miente. */

  const color = (p: number | null) =>
    p == null ? "var(--tp-gris)" : p >= 100 ? "var(--tp-bien)"
      : p > 0 ? "var(--tp-ojo)" : "var(--tp-mal)";
  const clase = (p: number | null) =>
    p == null ? "" : p >= 100 ? "bien" : p > 0 ? "medio" : "mal";

  return (
    <div className="tp">
      {/* Cifras al día sin perder el arranque instantáneo. Cada dos
          minutos porque esta pantalla se queda puesta en la oficina.
          Un día que no es hoy no se mueve solo: refrescarlo sería
          gastar consultas para volver a pintar lo mismo. */}
      <AlDia cada={esHoy ? 120 : 0} />

      {/* El día en el que termina la ventana. Sirve para mirar un día
          de atrás y, sobre todo, para mirar MAÑANA: revisar el plan
          antes de que empiece el turno, que es cuando todavía se puede
          arreglar. */}
      <Fechas dia={rangoLibre ? hasta : dia} hoy={hoy} esHoy={esHoy && !rangoLibre}
              ruta="/traspasos/control" param="d" limpia={["desde", "hasta"]} />

      {/* 1 ─ LA CIFRA QUE MANDA */}
      <section className="cabeza-ctl">
        <div>
          <p className="ojo" style={{ textTransform: "uppercase" }}>
            TRASPASOS · CD38 AG01 · {rotulo}
          </p>
          <h1>Control y ejecución</h1>
          <p className="sub">
            {dia > hoy
              ? <>Este día todavía no ha llegado: lo que se ve es <b>el plan</b>, sin nada
                cumplido todavía. Sirve para revisarlo antes de que empiece el turno.</>
              : <>Lo que se planeó contra lo que de verdad salió, turno por turno y tipo por tipo.</>}
          </p>
        </div>
        <div className="der-ctl">
          <Barra tipos={t.tipos} soloBotones hoy={hoy} dia={dia} desde={desde} hasta={hasta} />
          <div className="panel-ojo">
            <div className="corte" aria-hidden />
            <div className="rot">ADHERENCIA AL PLAN</div>
            <div className="num">{adherencia}%</div>
            <div className="pie">del plan salieron <b>{adheridos} de {planeado}</b></div>
          </div>
        </div>
      </section>

      {/* LOS FILTROS, a lo ancho y debajo del título: son de toda la
          pantalla, no del panel de la derecha. Metidos en la columna
          derecha le comían el ancho al título. */}
      <Barra tipos={t.tipos} soloFiltros hoy={hoy} dia={dia} desde={desde} hasta={hasta} />

      {/* LA MISMA INFORMACIÓN, EN UNA SOLA TARJETA, para el celular.
          Solo se ve por debajo de 900 px; ahí el CSS esconde el panel
          del porcentaje, las seis cifras y la cinta, que apilados miden
          más de una pantalla entera. Los números NO se recalculan: se
          le pasan ya hechos, para que no puedan dar distinto que arriba. */}
      <TarjetaKpi
        adherencia={adherencia} cumplimiento={cumplimiento}
        planeado={planeado} adheridos={adheridos} adicionales={adicionales}
        faltan={faltan} vacios={vacios}
        pOk={pOk} pExtra={pExtra}
        turnos={[...turnos]}
      />

      {/* ─ LAS SEIS CIFRAS, SIEMPRE, AUNQUE ESTÉN EN CERO.

          Antes vivían repartidas —los porcentajes arriba, los
          adicionales dentro de la leyenda de la cinta, los vacíos solo
          como alerta y solo si había alguno—. Esconder lo que vale cero
          tiene sentido en una alerta; no en una cifra que alguien
          necesita leer todos los días. "Adicionales: 0" ES la respuesta
          a una pregunta, y no encontrarla obliga a preguntarse si es
          cero o si la pantalla no la trae.

          EL ORDEN ES EL DEL PROCESO, no el de la importancia: se
          planea, se mueve, algo sale de más, algunos van vacíos — y de
          esos cuatro salen los dos porcentajes, que por eso van al
          final. El que manda ya está grande arriba. */}
      <section className="cifras seis">
        <div className="cifra">
          <div className="rot">VIAJES PLANEADOS</div>
          <div className="n">{planeado}</div>
          <div className="u">lo que el plan publicado prometió mover</div>
        </div>

        {/* CUMPLIDOS ES LO QUE CUMPLIÓ EL PLAN, no todo lo registrado.
            La versión anterior mostraba el total —que YA lleva los
            adicionales adentro— al lado de una tarjeta de adicionales.
            Quien intentaba rehacer la cuenta sumaba el adicional dos
            veces y no le daba ninguno de los dos porcentajes. Una cifra
            de la que no salen las de al lado hace que nadie crea las
            tres. Así la fila cierra sola:

              adherencia   = cumplidos / planeados
              cumplimiento = (cumplidos + adicionales) / planeados  */}
        <div className="cifra">
          <div className="rot">VIAJES CUMPLIDOS</div>
          <div className="n">{adheridos}</div>
          <div className="u">cumplieron el plan · nadie escribe esta cifra</div>
        </div>

        <div className="cifra ojo">
          <div className="rot">ADICIONALES</div>
          <div className="n">{adicionales}</div>
          <div className="u">se movieron por encima del plan o sin planear</div>
        </div>

        {/* LOS VACÍOS VAN APARTE Y LO DICEN. Es la cifra que más fácil
            se suma por error: un viaje sin carga cuesta igual pero no
            mueve producto, así que meterlo en el cumplido inflaría la
            adherencia con viajes que no movieron nada. La vista los
            excluye —`where estado = 'registrado' and not vacio`— y esta
            tarjeta lo dice para que nadie los vuelva a sumar a mano en
            un informe. */}
        <div className="cifra aparte">
          <div className="rot">VIAJES VACÍOS</div>
          <div className="n">{vacios}</div>
          <div className="u">aparte: <b>no entran en el cálculo</b></div>
        </div>

        <div className={"cifra " + clase(planeado > 0 ? adherencia : null)}>
          <div className="rot">% ADHERENCIA</div>
          <div className="n">{planeado > 0 ? `${adherencia}%` : "—"}</div>
          {/* LA FÓRMULA ESCRITA, con las palabras de las tarjetas de
              arriba. Es lo que permite rehacer la cuenta sin salir de
              la fila — y lo que evita que alguien la rehaga mal. */}
          <div className="u">cumplidos ÷ planeados · tope 100%</div>
        </div>

        <div className={"cifra " + clase(planeado > 0 ? cumplimiento : null)}>
          <div className="rot">% CUMPLIMIENTO</div>
          <div className="n">{planeado > 0 ? `${cumplimiento}%` : "—"}</div>
          <div className="u">(cumplidos + adicionales) ÷ planeados</div>
        </div>
      </section>

      {/* ─ LO QUE SE MOVIÓ Y NO MIDE ─

          «Los viajes de tolvas y estibas que no eran para Arenosa no
           contaban en el %. Pero necesitamos dejar la tarjeta para
           visualizar cuántos viajes hicieron.»  — Santiago L

          ESTABAN FUERA DE LA VISTA ENTERA, y con razón: dentro, con
          «planeado 3, cumplido 0», pintaban un 0 % que no era verdad.
          Pero irse de la vista es irse también de la pantalla, y un
          turno que movió nueve tolvas veía un tablero que no mencionaba
          ni una. El trabajo se hizo, costó horas y montacargas, y en la
          reunión de la mañana no existía.

          POR QUÉ ABAJO Y NO ENTRE LAS SEIS: las seis cifras cierran
          solas —adherencia y cumplimiento salen de ellas—. Meter aquí
          una séptima que no entra en ninguna de las dos fórmulas rompe
          justo lo que hace que la fila se pueda rehacer a mano. Va
          después, con su propio marco y diciendo en el rótulo que no
          entra, que es la única forma de que nadie la sume.

          NO SE PINTA EN CERO. Al contrario que las seis de arriba:
          aquellas contestan una pregunta todos los días —«adicionales:
          0» ES la respuesta—; esta no. Un renglón que casi siempre dice
          «0 viajes que no miden» deja de leerse, y el día que diga
          nueve tampoco se va a leer. */}
      {fueraViajes > 0 && (
        <section className="tp-nomide">
          <div className="tp-nomide-cab">
            <div>
              <div className="rot">SE MOVIÓ Y <b>NO ENTRA EN EL %</b></div>
              <div className="n">{fueraViajes}</div>
              <div className="u">
                viaje{fueraViajes === 1 ? "" : "s"} hechos que el plan no mide
                {fueraPorSalir > 0 && <> · {fueraPorSalir} esperando a facturación</>}
              </div>
            </div>
            <ul className="tp-nomide-tipos">
              {fueraPorTipo.map((x) => (
                <li key={x.nombre}>
                  <b>{x.viajes}</b>
                  <span>{x.nombre}</span>
                  <em>{x.motivo}</em>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 2 ─ CÓMO VA REPARTIDA */}
      <section className="medidor">
        <div className="avance">
          <div className="arr">
            <b>{cumplimiento}%</b>
            <span>
              de cumplimiento · <b>{cumplido}</b> de <b>{planeado}</b> viajes planeados
            </span>
          </div>

          <div className="cinta" role="img"
               aria-label={`${adheridos} del plan, ${adicionales} adicionales, ${faltan} sin salir`}>
            <i className="ok" style={{ width: `${pOk}%` }} />
            <i className="extra" style={{ width: `${pExtra}%` }} />
            <i className="falta" style={{ width: `${pFalta}%` }} />
          </div>

          <div className="leyenda-cinta">
            <span><i style={{ background: "var(--tp-ojo)" }} /> {adheridos} del plan</span>
            <span>
              <i style={{ background: "color-mix(in srgb, var(--tp-ojo) 45%, #fff)" }} />
              {adicionales} adicionales
            </span>
            <span>
              <i style={{ background: "var(--tp-fondo)", border: "1px dashed var(--tp-linea)" }} />
              {faltan} sin salir
            </span>
          </div>
        </div>

        {/* LOS TRES ANILLOS, Y CADA UNO ABRE SU CIERRE. Las cifras se
            calculan aquí arriba y bajan hechas: si la ficha del cierre
            las volviera a sumar, un redondeo distinto bastaría para que
            el cierre y el tablero dijeran cosas distintas del mismo
            turno. */}
        <Turnos anillos={porTurno} filas={filas} desde={desde} hasta={hasta}
                rotulo={rotulo} adherencia={adherencia}
                adheridos={adheridos} planeado={planeado} />
      </section>

      {/* 3 ─ LO QUE ESTÁ MAL. Solo se pinta lo que hay: una alerta que
             dice "0" es una alerta que la gente aprende a no leer. */}
      {/* VACÍOS Y ADICIONALES YA NO SE REPITEN AQUÍ: subieron a las seis
          tarjetas. La misma cifra dos veces en la misma pantalla es la
          forma más rápida de que alguien deje de creerle a las dos. */}
      {(faltan > 0 || sinPlanear > 0 || alCien.length > 0) && (
        <section className="alertas">
          {faltan > 0 && <div className="alerta"><b>{faltan}</b> viajes sin salir</div>}
          {sinPlanear > 0 && (
            <div className="alerta neutra">
              <b>{sinPlanear}</b> tipo{sinPlanear === 1 ? "" : "s"} movido{sinPlanear === 1 ? "" : "s"} sin planear
            </div>
          )}
          {alCien.length > 0 && (
            <div className="alerta bien">
              <b>{alCien.length}</b> tipo{alCien.length === 1 ? "" : "s"} al 100%
              {alCien.length <= 2 && ` · ${alCien.map((f) => f.tipo_nombre).join(", ")}`}
            </div>
          )}
        </section>
      )}

      {/* 4 ─ EL DETALLE */}
      <section className="panel-tabla">
        <div className="cab-tabla">
          <h2>Por tipo de viaje</h2>
          <p>
            El cumplido no se escribe aquí: lo cuentan los viajes registrados. Si un número no
            cuadra, lo que falta es registrar el viaje —y ahí queda con su placa, que es lo que
            después permite decir cuál fue.
          </p>
        </div>

        {filas.length === 0 ? (
          <div className="vacio">
            <b>No hay nada en este período</b>
            En cuanto se planee un turno o se registre un viaje, aparece aquí.
          </div>
        ) : (
          <div className="tabla-envuelta">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  {!unDia && <th>Fecha</th>}
                  <th>Turno</th>
                  <th className="n">Planeado</th>
                  <th>Cumplido</th>
                  <th className="mini"></th>
                  <th className="n">%</th>
                  <th className="n">Faltan</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fecha + f.turno + f.tipo}
                      className={f.sin_planear ? "sin-plan" : undefined}>
                    <td className="nom">
                      {f.tipo_nombre}
                      {f.sin_planear && <> <span className="eti ojo">SIN PLANEAR</span></>}
                    </td>
                    {!unDia && <td>{f.fecha}</td>}
                    <td>{f.turno}</td>
                    <td className="n">{f.planeado || "—"}</td>
                    <td>
                      <span className="cuenta">{f.cumplido}</span>
                      {f.adicionales > 0 && (
                        <span className="eti" style={{ marginLeft: 8 }}>+{f.adicionales}</span>
                      )}
                    </td>
                    <td className="mini">
                      <div className="pista">
                        <div className="relleno"
                             style={{ width: `${f.adherencia ?? 0}%`,
                                      background: color(f.adherencia) }} />
                      </div>
                    </td>
                    <td className={"n pct " + clase(f.adherencia)}>
                      {f.adherencia != null ? `${f.adherencia}%` : "—"}
                    </td>
                    <td className="n">{f.faltan > 0 ? f.faltan : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total{unDia ? " del día" : " del período"}</td>
                  {!unDia && <td />}
                  <td />
                  <td className="n">{planeado}</td>
                  <td className="n">{cumplido}</td>
                  <td className="mini" />
                  <td className="n">{adherencia}%</td>
                  <td className="n">{faltan}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* =================================================================
          LAS DIFERENCIAS CONTRA SAP

          VA AL FINAL Y NO ARRIBA. El tablero contesta primero «¿vamos al
          día con el plan?», que es lo que se mira cada rato; esto
          contesta «¿y lo que salió, quedó registrado?», que se revisa
          una vez, con el corte del día ya subido.

          Y VA AQUÍ Y NO EN PANTALLA APARTE. Tenía la suya, y era el
          error: subir el archivo es una acción de una vez al día, pero
          «¿qué faltó?» es una pregunta del tablero. En pantalla aparte
          se quedaba esperando a que alguien se acordara de entrar.

          EL DÍA ES EL MISMO DE ARRIBA —el de la barra de fechas—, así
          que mirar el día de ayer trae las diferencias de ayer sin
          tocar nada más.
          ================================================================= */}
      {/* SE PINTA AUNQUE NO HAYA CORTE: el control de los viajes sin
          documento no depende de SAP, y esconderlo los días que nadie
          importó sería esconder el agujero más grande de los dos. */}
      {!cruce.falta && (
        <Diferencias lineas={cruce.lineas} hayCorte={cruce.hayCorte}
                     rotulo={fechaLarga(dia)} desde={cruce.desde} hasta={cruce.hasta}
                     tope={cruce.tope} sinDocumento={cruce.sinDocumento}
                     conDocumento={cruce.conDocumento} nombres={nombres}
                     puedeDepurar={permisos.manda} />
      )}

    </div>
  );
}
