import { misPermisos } from "@/lib/permisos";
import { seguimientoRango, hoyLocal, type Seguimiento } from "@/modulos/traspasos/datos";
import { fecha as fechaLarga } from "@/modulos/traspasos/formato";
import "../traspasos.css";
import { SinTablas } from "../comunes";

export const dynamic = "force-dynamic";

/**
 * SEGUIMIENTO — plan contra real, los últimos días.
 *
 * Contesta tres preguntas en el mismo renglón, y las tres importan:
 *
 *   lo planeado que se cumplió ..... va bien
 *   lo planeado que no ............. hay que explicarlo
 *   lo movido sin planear .......... la planeación no está sirviendo
 *
 * La tercera es la que casi siempre falta en estos informes, porque
 * sale de mirar la realidad y no el plan. Aquí tiene nombre propio y
 * filo de color: un turno con cuatro renglones «sin planear» cumplió
 * todo lo que prometió y aun así planeó mal.
 */
export default async function SeguimientoPage() {
  const hasta = hoyLocal();
  /* Siete días. No es una lista para explorar: es la pregunta del comité
     del lunes. Un rango abierto haría bajar meses para mirar una semana. */
  const desde = new Date(Date.parse(hasta + "T12:00:00") - 6 * 86400_000)
    .toISOString().slice(0, 10);

  const [permisos, seg] = await Promise.all([
    misPermisos(), seguimientoRango(desde, hasta),
  ]);
  void permisos;

  if (seg.falta) return <div className="tp"><SinTablas /></div>;

  const porDia = new Map<string, Seguimiento[]>();
  for (const f of seg.filas) {
    const l = porDia.get(f.fecha) ?? [];
    l.push(f);
    porDia.set(f.fecha, l);
  }

  const tot = (l: Seguimiento[], k: keyof Seguimiento) =>
    l.reduce((a, f) => a + (Number(f[k]) || 0), 0);

  const planeado = tot(seg.filas, "planeado");
  const cumplido = tot(seg.filas, "cumplido");
  const sinPlanear = seg.filas.filter((f) => f.sin_planear).length;
  const vacios = tot(seg.filas, "vacios_hechos");

  return (
    <div className="tp">
      <section className="cabeza">
        <div>
          <p className="ojo">TRASPASOS · SEGUIMIENTO · CD38 AG01</p>
          <h1>Plan contra real</h1>
          <p className="sub">
            Los últimos siete días. Lo que se planeó, lo que se movió, y —sobre todo— lo que se
            movió <b>sin estar en el plan</b>: esa es la cifra que dice si la planeación está
            sirviendo, y es la que no aparece cuando el informe se arma mirando solo el plan.
          </p>
        </div>
        <div className="kpi">
          <div className="rot">CUMPLIMIENTO DE LA SEMANA</div>
          <div className="num">
            {planeado > 0 ? Math.round((cumplido / planeado) * 100) : 0}<span className="u">%</span>
          </div>
          <div className="pie">{cumplido} de {planeado} viajes planeados</div>
        </div>
      </section>

      <div className="cifras">
        <div className="cifra">
          <div className="rot">PLANEADO</div>
          <div className="n">{planeado}</div>
          <div className="u">viajes con carga</div>
        </div>
        <div className="cifra">
          <div className="rot">CUMPLIDO</div>
          <div className="n">{cumplido}</div>
          <div className="u">contado sobre los viajes registrados</div>
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
      </div>

      {seg.filas.length === 0 ? (
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
                  {tot(filas, "cumplido")} de {tot(filas, "planeado")} viajes
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
                    <th className="n">Vacíos</th>
                    <th className="n">Placas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((x) => (
                    <tr key={x.turno + x.tipo} className={x.sin_planear ? "sin-plan" : undefined}>
                      <td className="n">{x.turno}</td>
                      <td className="tipo">
                        {x.tipo_nombre}
                        {x.es_adicional && <> <span className="eti">ADICIONAL</span></>}
                        {x.sin_planear && <> <span className="eti ojo">SIN PLANEAR</span></>}
                      </td>
                      <td className="n">{x.planeado || "—"}</td>
                      <td className="n">
                        {x.cumplido}
                        {x.de_mas > 0 && <span className="eti" style={{ marginLeft: 6 }}>+{x.de_mas}</span>}
                      </td>
                      <td className="n">{x.faltan > 0 ? x.faltan : "—"}</td>
                      <td className="n">{x.vacios_hechos || "—"}</td>
                      <td className="n">{x.placas || "—"}</td>
                      <td className="n">
                        {x.pct != null && (
                          <span className={"barra" + (x.pct < 100 ? " corto" : "")}
                                aria-label={`${x.pct}%`}>
                            <i style={{ width: `${Math.min(100, x.pct)}%` }} />
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
