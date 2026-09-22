import { misPermisos } from "@/lib/permisos";
import {
  controlRango, vaciosRango, tipos as leerTipos, hoyLocal, cruceDelDia, type Control,
} from "@/modulos/traspasos/datos";
import { fecha as fechaLarga, TURNOS } from "@/modulos/traspasos/formato";
import { nombresTodos } from "@/modulos/sider/datos";
import "../traspasos.css";
import "../cruce/cruce.css";
import { AlDia, SinTablas } from "../comunes";
import { Barra } from "./Barra";
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
  searchParams: Promise<{ dias?: string; turno?: string; tipo?: string; d?: string }>;
}) {
  const q = await searchParams;
  const hoy = hoyLocal();

  /* EL DÍA EN EL QUE TERMINA LA VENTANA, y puede ser MAÑANA.
     Antes esto era hoy y punto, y eso dejaba el plan de mañana sin
     forma de mirarse: se armaba en Plan y no había dónde verlo contra
     nada. Un plan que no se puede revisar antes de que empiece el turno
     es un plan que solo se revisa cuando ya no se puede arreglar. */
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.d ?? "") ? q.d! : hoy;
  const esHoy = dia === hoy;
  const hasta = dia;
  const dias = Math.min(Math.max(Number(q.dias) || 0, 0), 365);
  const desde = new Date(Date.parse(hasta + "T12:00:00") - dias * 86400_000)
    .toISOString().slice(0, 10);

  const [permisos, ctl, vacios, t, cruce, nombres] = await Promise.all([
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
  const rotulo = dias === 0 ? fechaLarga(hasta) : `${fechaLarga(desde)} a ${fechaLarga(hasta)}`;

  /* La circunferencia del anillo: 2·π·34. Se calcula y no se escribe a
     mano porque el radio y el número tienen que ir juntos — si alguien
     cambia el radio y el número se queda, el anillo miente. */
  const R = 34, C = 2 * Math.PI * R;

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
      <Fechas dia={dia} hoy={hoy} esHoy={esHoy} ruta="/traspasos/control" param="d" />

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
          <Barra tipos={t.tipos} soloBotones hoy={hoy} dia={dia} />
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
      <Barra tipos={t.tipos} soloFiltros hoy={hoy} dia={dia} />

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

        <div className="turnos">
          {porTurno.map((x) => (
            <div className="turno" key={x.turno}>
              <svg viewBox="0 0 86 86">
                <circle cx="43" cy="43" r={R} fill="none" stroke="var(--tp-fondo)" strokeWidth="10" />
                <circle cx="43" cy="43" r={R} fill="none" stroke={color(x.hay ? x.pct : null)}
                        strokeWidth="10" strokeLinecap="butt"
                        strokeDasharray={`${(Math.min(x.pct, 100) / 100) * C} ${C}`}
                        transform="rotate(-90 43 43)" />
                <text x="43" y="49" textAnchor="middle" fontFamily="Archivo" fontWeight="900"
                      fontSize="20" fill="var(--tp-tinta)">
                  {x.hay ? `${x.pct}%` : "—"}
                </text>
              </svg>
              <b>Turno {x.turno}</b>
              <span>{x.hay ? `${x.adheridos} de ${x.planeado}` : "sin plan"}</span>
            </div>
          ))}
        </div>
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
                  {dias > 0 && <th>Fecha</th>}
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
                    {dias > 0 && <td>{f.fecha}</td>}
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
                  <td>Total{dias === 0 ? " del día" : " del período"}</td>
                  {dias > 0 && <td />}
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
