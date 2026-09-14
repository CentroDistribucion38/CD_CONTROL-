import { misPermisos } from "@/lib/permisos";
import { controlRango, vaciosRango, hoyLocal, type Control } from "@/modulos/traspasos/datos";
import { fecha as fechaLarga } from "@/modulos/traspasos/formato";
import "../traspasos.css";
import { SinTablas } from "../comunes";

export const dynamic = "force-dynamic";

/**
 * CONTROL — plan contra real, los últimos siete días.
 *
 * LAS DOS CIFRAS QUE NO SON LA MISMA. Esto ya estaba bien pensado en la
 * versión de la hoja y se conserva con las mismas palabras:
 *
 *   ADHERENCIA    de lo PLANEADO, cuánto se hizo. Mide si el plan se
 *                 cumplió. Tope 100%: hacer viajes de más no arregla
 *                 los que faltaron.
 *   CUMPLIMIENTO  todo lo que se movió contra lo planeado, adicionales
 *                 incluidos. Mide si la operación movió lo que tenía
 *                 que mover, aunque no fuera lo que decía el papel.
 *
 * Un turno con 10 planeados que hace 6 de los planeados y 6 adicionales
 * tiene 60% de adherencia y 120% de cumplimiento. Las dos son ciertas y
 * dicen cosas distintas: movió lo que había que mover, y planeó mal.
 * Una sola de las dos escondería justamente eso.
 *
 * La diferencia con la hoja es de dónde salen: allá las calculaba la
 * pantalla sobre un campo escrito a mano; aquí salen de la vista, sobre
 * los viajes registrados. Es la misma fórmula sobre una sola verdad.
 */
export default async function ControlPage() {
  const hasta = hoyLocal();
  /* Siete días. No es una lista para explorar: es la pregunta del
     comité del lunes. Un rango abierto haría bajar meses para mirar una
     semana. */
  const desde = new Date(Date.parse(hasta + "T12:00:00") - 6 * 86400_000)
    .toISOString().slice(0, 10);

  const [permisos, ctl, vacios] = await Promise.all([
    misPermisos(), controlRango(desde, hasta), vaciosRango(desde, hasta),
  ]);
  void permisos;

  if (ctl.falta) return <div className="tp"><SinTablas /></div>;

  const porDia = new Map<string, Control[]>();
  for (const f of ctl.filas) {
    const l = porDia.get(f.fecha) ?? [];
    l.push(f);
    porDia.set(f.fecha, l);
  }

  const sum = (l: Control[], k: keyof Control) =>
    l.reduce((a, f) => a + (Number(f[k]) || 0), 0);

  const planeado = sum(ctl.filas, "planeado");
  const cumplido = sum(ctl.filas, "cumplido");
  const adheridos = sum(ctl.filas, "adheridos");
  const adicionales = sum(ctl.filas, "adicionales");
  const sinPlanear = ctl.filas.filter((f) => f.sin_planear).length;

  /* Las dos cifras se calculan UNA vez aquí, sobre las sumas, y no por
     renglón: promediar porcentajes de renglón daría otro número —el
     tipo con 2 planeados pesaría igual que el de 40—. */
  const adherencia = planeado > 0 ? Math.round((adheridos / planeado) * 100) : 0;
  const cumplimiento = planeado > 0 ? Math.round((cumplido / planeado) * 100) : 0;

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · CONTROL · CD38 AG01</p>
          <h1>Plan contra real</h1>
          <p className="sub">
            Los últimos siete días. <b>Adherencia</b> es cuánto del plan se cumplió;{" "}
            <b>cumplimiento</b> es todo lo que se movió contra lo planeado, adicionales
            incluidos. Un turno con 60% de adherencia y 120% de cumplimiento movió lo que había
            que mover <b>y</b> planeó mal — y las dos cosas hay que poderlas ver.
          </p>
        </div>
        <div className="kpi">
          <div className="rot">ADHERENCIA DE LA SEMANA</div>
          <div className="num">{adherencia}<span className="u">%</span></div>
          <div className="pie">{adheridos} de {planeado} viajes planeados</div>
        </div>
      </section>

      <div className="cifras">
        <div className="cifra">
          <div className="rot">% ADHERENCIA</div>
          <div className="n">{adherencia}%</div>
          <div className="u">de lo planeado, cuánto se hizo</div>
        </div>
        <div className="cifra">
          <div className="rot">% CUMPLIMIENTO</div>
          <div className="n">{cumplimiento}%</div>
          <div className="u">todo lo movido contra lo planeado</div>
        </div>
        <div className="cifra">
          <div className="rot">PLANEADOS</div>
          <div className="n">{planeado}</div>
          <div className="u">viajes con carga</div>
        </div>
        <div className="cifra">
          <div className="rot">CUMPLIDOS</div>
          <div className="n">{cumplido}</div>
          <div className="u">contado sobre los viajes registrados</div>
        </div>
        <div className={"cifra" + (adicionales > 0 ? " ojo" : "")}>
          <div className="rot">ADICIONALES</div>
          <div className="n">{adicionales}</div>
          <div className="u">viajes fuera de lo planeado</div>
        </div>
        <div className={"cifra" + (sinPlanear > 0 ? " ojo" : "")}>
          <div className="rot">SIN PLANEAR</div>
          <div className="n">{sinPlanear}</div>
          <div className="u">tipos que se movieron y nadie planeó</div>
        </div>
        <div className="cifra">
          <div className="rot">VIAJES VACÍOS</div>
          <div className="n">{vacios}</div>
          <div className="u">no entran en el cumplido</div>
        </div>
        <div className={"cifra" + (planeado - adheridos > 0 ? " mal" : "")}>
          <div className="rot">FALTARON</div>
          <div className="n">{planeado - adheridos}</div>
          <div className="u">planeados que no se movieron</div>
        </div>
      </div>

      {ctl.filas.length === 0 ? (
        <section className="caja">
          <div className="vacio">
            <b>No hay nada en los últimos siete días</b>
            En cuanto se planee un turno o se registre un viaje, aparece aquí.
          </div>
        </section>
      ) : (
        [...porDia.entries()].map(([f, filas]) => (
          <section className="caja" key={f}>
            <div className="cab">
              <div>
                <h2 style={{ textTransform: "capitalize" }}>{fechaLarga(f)}</h2>
                <p>
                  {sum(filas, "cumplido")} de {sum(filas, "planeado")} viajes
                  {filas.some((x) => x.sin_planear) && " · hay movimientos fuera del plan"}
                </p>
              </div>
            </div>
            <div className="tabla-envuelta">
              <table>
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Tipo</th>
                    <th className="n">Plan</th>
                    <th className="n">Real</th>
                    <th className="n">Faltan</th>
                    <th className="n">Adic.</th>
                    <th className="n">Placas</th>
                    <th className="n">Adher.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((x) => (
                    <tr key={x.turno + x.tipo} className={x.sin_planear ? "sin-plan" : undefined}>
                      <td>{x.turno}</td>
                      <td className="tipo">
                        {x.tipo_nombre}
                        {x.sin_planear && <> <span className="eti ojo">SIN PLANEAR</span></>}
                      </td>
                      <td className="n">{x.planeado || "—"}</td>
                      <td className="n">{x.cumplido}</td>
                      <td className="n">{x.faltan > 0 ? x.faltan : "—"}</td>
                      <td className="n">{x.adicionales > 0 ? `+${x.adicionales}` : "—"}</td>
                      <td className="n">{x.placas || "—"}</td>
                      <td className="n">{x.adherencia != null ? `${x.adherencia}%` : "—"}</td>
                      <td className="n">
                        {x.adherencia != null && (
                          <span className={"barra" + (x.adherencia < 100 ? " corto" : "")}
                                aria-label={`${x.adherencia}%`}>
                            <i style={{ width: `${x.adherencia}%` }} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
