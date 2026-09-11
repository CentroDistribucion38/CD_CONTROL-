import Link from "next/link";
import { salidas as leerSalidas, tolvas as leerTolvas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../../roturas.css";
import { SinTablas } from "../../comunes";

export const dynamic = "force-dynamic";

/**
 * ANÁLISIS DE LA SALIDA — cuánto vidrio salió por la puerta.
 *
 * AQUÍ NO HAY UNA SOLA UNIDAD, a propósito. Esta rama pesa kilos; las
 * unidades por causa y por proceso viven en el análisis de En sitio y
 * contestan otra pregunta.
 *
 * TODO SE MIDE SOBRE SALIDAS COMPLETAS —las tres firmas—. Una salida a
 * medio firmar todavía se puede corregir: contarla aquí sería publicar
 * un número que mañana cambia, y un informe que cambia solo deja de
 * creerse a la tercera vez.
 */
export default async function AnalisisSalidaPage() {
  const [sal, tol] = await Promise.all([leerSalidas(400), leerTolvas(false)]);
  if (sal.falta) return <div className="rt"><SinTablas /></div>;

  const completas = sal.salidas.filter((s) => s.completa);
  const abiertas = sal.salidas.filter((s) => s.estado === "abierta");
  const porFirmar = sal.salidas.filter((s) => s.estado === "cerrada" && !s.completa);

  const kg = completas.reduce((t, s) => t + Number(s.neto_kg), 0);
  const bruto = completas.reduce((t, s) => t + Number(s.bruto_kg), 0);
  const tara = completas.reduce((t, s) => t + Number(s.tara_kg), 0);
  const nTolvas = completas.reduce((t, s) => t + s.tolvas, 0);
  const promedio = nTolvas ? kg / nTolvas : 0;

  /* Cuánto sale por mes. Se agrupa por la fecha de la ÚLTIMA firma y no
     por la de apertura: una salida es del mes en que quedó facturada,
     que es cuando de verdad salió de la contabilidad. */
  const porMes = new Map<string, number>();
  for (const s of completas) {
    const d = new Date(s.facturador_en!);
    const k = d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    porMes.set(k, (porMes.get(k) ?? 0) + Number(s.neto_kg));
  }
  const meses = [...porMes.entries()].slice(-8);
  const maxMes = Math.max(1, ...meses.map(([, v]) => v));

  /* Las taras en uso. Es el número que más silenciosamente puede estar
     mal: se teclea una vez en el maestro y después se copia a cada
     línea sin que nadie lo vuelva a mirar. */
  const activas = tol.filter((t) => t.activo);

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · SALIDA · ANÁLISIS</p>
          <h1>Cuánto vidrio salió</h1>
          <p className="sub">
            Kilos netos de las salidas con las tres firmas. Las abiertas y las que esperan firma
            no entran: todavía se pueden corregir, y un informe que cambia solo deja de creerse
            a la tercera vez.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">NETO DESPACHADO</div>
          <div className="num">{kilos(kg)}<span className="u">kg</span></div>
          <div className="pie">{completas.length} salida{completas.length === 1 ? "" : "s"} completas</div>
        </div>
      </section>

      <section className="cifras">
        <div className="cifra ojo">
          <div className="rot">TOLVAS DESPACHADAS</div>
          <div className="n">{nTolvas}</div>
          <div className="u">en esas mismas salidas</div>
        </div>
        <div className="cifra">
          <div className="rot">PROMEDIO POR TOLVA</div>
          <div className="n">{kilos(promedio)}</div>
          <div className="u">kg netos. Si una salida se sale mucho de aquí, vale la pena mirarla</div>
        </div>
        <div className={"cifra" + (porFirmar.length ? " mal" : "")}>
          <div className="rot">ESPERANDO FIRMA</div>
          <div className="n">{porFirmar.length}</div>
          <div className="u">cerradas sin las tres firmas. No cuentan todavía</div>
        </div>
        <div className={"cifra" + (abiertas.length ? " ojo" : "")}>
          <div className="rot">ABIERTAS</div>
          <div className="n">{abiertas.length}</div>
          <div className="u">{kilos(abiertas.reduce((t, s) => t + Number(s.neto_kg), 0))} kg todavía pesándose</div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>La cuenta total</h2>
          <p>
            El neto sale de sumar las tolvas, aquí igual que en cada salida. No hay ningún total
            guardado en la base que pueda quedar desfasado de sus partes.
          </p>
        </div></div>
        <div style={{ padding: 14 }}>
          <div className="cuenta">
            <span className="caja-n"><small>BRUTO</small>{kilos(bruto)}</span>
            <span className="signo">−</span>
            <span className="caja-n tara"><small>TARA</small>{kilos(tara)}</span>
            <span className="signo">=</span>
            <span className="caja-n neto"><small>NETO KG</small>{kilos(kg)}</span>
          </div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Por mes</h2>
          <p>Por el mes en que se facturó, que es cuando de verdad salió.</p>
        </div></div>
        <div className="barras">
          {meses.length === 0 && (
            <div className="vacio"><b>Sin datos</b>Todavía no hay salidas con las tres firmas.</div>
          )}
          {meses.map(([mes, v]) => (
            <div key={mes} className="b">
              <div className="et">{mes}</div>
              <div className="riel"><i style={{ width: `${Math.round((v / maxMes) * 100)}%` }} /></div>
              <div className="n">{kilos(v)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Las taras en uso</h2>
          <p>
            Es el número que más silenciosamente puede estar mal: se teclea una vez y después se
            copia solo a cada línea. Si una tolva pesa distinto a la de al lado, que sea porque
            de verdad lo pesa.
          </p>
        </div></div>
        <div className="rueda">
          {activas.length === 0 && (
            <div className="vacio"><b>Sin tolvas</b>No hay ninguna activa en el maestro.</div>
          )}
          {activas.map((t) => (
            <div key={t.codigo} className="tolva">
              <div>
                <div className="nom">{t.codigo}</div>
                <div className="det">{t.modelo}</div>
              </div>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{kilos(t.tara_kg)} kg</div>
            </div>
          ))}
        </div>
      </section>

      <div className="aviso">
        <b>Estos kilos no se cuadran con las unidades de En sitio.</b> Miden cosas distintas:
        una botella de 330 y una de 750 pesan diferente, el vidrio se acumula días antes de
        salir, y parte de lo que se pesa nunca se contó en sitio. Las unidades están en{" "}
        <Link href="/roturas/en-sitio/analisis">En sitio → Análisis</Link>, aparte y a propósito.
      </div>
    </div>
  );
}
