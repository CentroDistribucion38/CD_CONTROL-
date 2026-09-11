import { acciones as leerAcciones, porArea, parametros } from "@/modulos/acciones/datos";
import "../acciones.css";
import { SinTablas } from "../comunes";

export const dynamic = "force-dynamic";

/**
 * ANÁLISIS — la pregunta que no contesta el tablero.
 *
 * El tablero dice CÓMO VAMOS. Esta pantalla dice POR QUÉ SE REPITE, que
 * es la única pregunta que puede hacer que el número del tablero cambie
 * de verdad y no por un mes bueno.
 *
 * Todo se calcula sobre lo que ya se trajo: los reincidentes salen de
 * agrupar las acciones por motivo y zona, y no de otra consulta. Una
 * pantalla de análisis que pide seis consultas más para decir lo que ya
 * estaba en la primera es lenta sin necesidad.
 */
export default async function AnalisisPage() {
  const [datos, areas, par] = await Promise.all([leerAcciones(1000), porArea(), parametros()]);
  if (datos.falta) return <div className="ac"><SinTablas /></div>;

  const vivas = datos.acciones.filter((a) => a.estado !== "anulada");
  const tope = par.par["reincidencia_veces"] ?? 3;

  /* DÓNDE SE REPITE. Se agrupa por motivo + zona, que es exactamente la
     llave con la que la base cuenta la reincidencia: así lo que se ve
     aquí es lo mismo que va a bloquear el sistema, y no una segunda
     manera de contar que diga otra cosa. */
  const mapa = new Map<string, {
    motivo: string; zona: string; n: number; abiertas: number; ultima: string;
  }>();
  for (const a of vivas) {
    if (!a.zona) continue;
    const k = a.motivo + "|" + a.zona;
    const x = mapa.get(k) ?? {
      motivo: a.motivo_nombre, zona: a.zona_nombre ?? a.zona,
      n: 0, abiertas: 0, ultima: a.reportada_en,
    };
    x.n += 1;
    if (a.viva) x.abiertas += 1;
    if (a.reportada_en > x.ultima) x.ultima = a.reportada_en;
    mapa.set(k, x);
  }
  const repiten = [...mapa.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n);

  /* QUIÉN LAS REPORTA no se mide, a propósito: contar reportes por
     persona convierte reportar en algo que se evita. Lo que se mide es
     el problema, no el mensajero. */

  const porMotivo = new Map<string, number>();
  for (const a of vivas) porMotivo.set(a.motivo_nombre, (porMotivo.get(a.motivo_nombre) ?? 0) + 1);
  const motivosTop = [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxMotivo = motivosTop[0]?.[1] ?? 1;

  const verificadas = vivas.filter((a) => a.estado === "verificada").length;
  const efectivas = vivas.filter((a) => a.efectiva).length;
  const autoV = vivas.filter((a) => a.auto_verificada).length;
  const reabiertas = vivas.filter((a) => a.estado === "reabierta").length;

  const fecha = (s: string) =>
    new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="ac">
      <section className="cabeza">
        <div>
          <p className="ojo">ACCIONES CORRECTIVAS · CD38 AG01</p>
          <h1>Análisis</h1>
          <p className="sub">
            El tablero dice cómo vamos. Esto dice por qué se repite, que es la única pregunta
            capaz de mover el número del tablero de verdad y no por un mes bueno.
          </p>
        </div>
      </section>

      <section className="cifras">
        <div className="cifra">
          <div className="rot">VERIFICADAS</div>
          <div className="n">{verificadas}</div>
          <div className="u">de {vivas.length} acciones en total</div>
        </div>
        <div className="cifra">
          <div className="rot">EFECTIVAS</div>
          <div className="n">{efectivas}</div>
          <div className="u">sirvieron de verdad</div>
        </div>
        <div className={"cifra" + (reabiertas ? " mal" : "")}>
          <div className="rot">REABIERTAS</div>
          <div className="n">{reabiertas}</div>
          <div className="u">se verificaron y no habían servido</div>
        </div>
        <div className={"cifra" + (autoV ? " ojo" : "")}>
          <div className="rot">SE VERIFICÓ SOLO</div>
          <div className="n">{autoV}</div>
          <div className="u">las cerró y verificó la misma persona</div>
        </div>
      </section>

      <section className="caja">
        <div className="cab">
          <div>
            <h2>Dónde se repite</h2>
            <p>
              Mismo motivo, mismo sitio. A las {tope} veces el sistema deja de aceptar otra
              corrección y pide preventiva: estas son las que van camino de eso.
            </p>
          </div>
        </div>
        <div className="rueda">
          {repiten.length === 0 && (
            <div className="vacio">
              <b>Nada se ha repetido todavía</b>
              Ningún motivo ha vuelto a salir en la misma zona.
            </div>
          )}
          {repiten.map((x) => (
            <div key={x.motivo + x.zona} className={"fila" + (x.n >= tope ? " vencida" : "")}>
              <div className="cod">{x.n}ª VEZ</div>
              <div>
                <div className="tit">{x.motivo}</div>
                <div className="meta">
                  <b>{x.zona}</b>
                  <span>·</span>
                  <span>última el {fecha(x.ultima)}</span>
                  {x.abiertas > 0 && <><span>·</span><span>{x.abiertas} sin cerrar</span></>}
                </div>
              </div>
              <div className="der">
                {x.n >= tope
                  ? <span className="eti alta">EXIGE PREVENTIVA</span>
                  : <span className="plazo ok">{tope - x.n} para el corte</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="caja" style={{ flex: "0 0 auto" }}>
        <div className="cab">
          <div>
            <h2>Qué es lo que más sale</h2>
            <p>Por motivo, contando todo lo reportado. No por persona: contar reportes por
               persona convierte reportar en algo que se evita.</p>
          </div>
        </div>
        <div className="barras">
          {motivosTop.map(([m, n]) => (
            <div className="b" key={m}>
              <div className="et">{m}</div>
              <div className="riel"><i style={{ width: `${(n / maxMotivo) * 100}%` }} /></div>
              <div className="pct">{n}</div>
            </div>
          ))}
          {motivosTop.length === 0 && <div className="vacio">Todavía no hay nada reportado.</div>}
        </div>
      </section>

      <section className="caja" style={{ flex: "0 0 auto" }}>
        <div className="cab">
          <div>
            <h2>Cumplimiento por área</h2>
            <p>Efectivas sobre verificadas. Un guion es que en esa área todavía no se verificó nada.</p>
          </div>
        </div>
        <div className="barras">
          {areas.map((x) => (
            <div key={x.area}
                 className={"b" + (x.pct != null && x.pct < (par.par["meta_efectividad"] ?? 90) ? " mal" : "")}>
              <div className="et">{x.area_nombre}</div>
              <div className="riel"><i style={{ width: `${x.pct ?? 0}%` }} /></div>
              <div className={"pct" + (x.pct == null ? " nd" : "")}>
                {x.pct != null ? `${x.pct}%` : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
