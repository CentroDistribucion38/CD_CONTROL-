import Link from "next/link";
import { roturas as leerRoturas } from "@/modulos/roturas/datos";
import "../../roturas.css";
import { SinTablas } from "../../comunes";

export const dynamic = "force-dynamic";

/**
 * ANÁLISIS DE EN SITIO — por qué se sigue rompiendo lo mismo.
 *
 * AQUÍ NO HAY UN SOLO KILO, a propósito. Esta rama cuenta unidades por
 * causa y por proceso: contesta de quién fue la rotura y de dónde salió.
 * Los kilos viven en el análisis de la salida y contestan otra pregunta.
 * Juntarlos en una pantalla es lo que termina en un informe con un
 * factor de conversión inventado — una botella de 330 y una de 750 pesan
 * distinto, el vidrio se acumula días antes de salir, y parte de lo que
 * se pesa nunca se contó aquí.
 *
 * Todo se calcula sobre lo que ya se trajo. Una pantalla de análisis que
 * pide seis consultas más para decir lo que ya estaba en la primera es
 * lenta sin necesidad.
 */
export default async function AnalisisEnSitioPage() {
  const datos = await leerRoturas(1000);
  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const vivas = datos.roturas.filter((r) => r.estado !== "anulada");
  /* Se agrupa sobre lo que CUENTA, no sobre todo lo reportado: incluir
     lo que ABI devolvió haría que el ranking de causas midiera también
     los errores de digitación, y la conclusión saldría torcida. */
  const cuentan = vivas.filter((r) => r.cuenta);

  function agrupar(clave: (r: typeof cuentan[number]) => string) {
    const m = new Map<string, number>();
    for (const r of cuentan) m.set(clave(r), (m.get(clave(r)) ?? 0) + r.unidades_vidrio);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  const porCausa = agrupar((r) => r.causa_nombre);
  const porProceso = agrupar((r) => r.proceso_nombre);
  const maxCausa = porCausa[0]?.[1] ?? 1;
  const maxProceso = porProceso[0]?.[1] ?? 1;

  const total = cuentan.reduce((s, r) => s + r.unidades_vidrio, 0);
  const noAsumidas = cuentan.filter((r) => r.grupo === "no_asumida")
    .reduce((s, r) => s + r.unidades_vidrio, 0);
  const pctNoAsumida = total ? Math.round((noAsumidas / total) * 100) : 0;

  const devueltas = vivas.filter((r) => r.estado === "no_cuenta").length;
  const pctDevueltas = vivas.length ? Math.round((devueltas / vivas.length) * 100) : 0;
  const pt = cuentan.filter((r) => r.tipo === "producto_terminado")
    .reduce((s, r) => s + r.unidades_vidrio, 0);

  const causasNoAsumidas = new Set(cuentan.filter((r) => r.grupo === "no_asumida")
    .map((r) => r.causa_nombre));

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · EN SITIO · ANÁLISIS</p>
          <h1>Por qué se rompe</h1>
          <p className="sub">
            Unidades de vidrio de lo que ya tiene visto bueno, por causa y por proceso. La causa
            dice de quién fue; el proceso, dónde pasó. Si un proceso pesa el doble que el
            siguiente, el problema es del proceso y no del turno que le tocó ese día.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">UNIDADES DE VIDRIO QUE CUENTAN</div>
          <div className="num">{total}<span className="u">und</span></div>
          <div className="pie">{cuentan.length} roturas con visto bueno</div>
        </div>
      </section>

      <section className="cifras">
        <div className={"cifra" + (pctNoAsumida > 25 ? " mal" : "")}>
          <div className="rot">NO ASUMIDAS</div>
          <div className="n">{pctNoAsumida}%</div>
          <div className="u">{noAsumidas} unidades que se dice que no fueron del OL</div>
        </div>
        <div className={"cifra" + (pctDevueltas > 15 ? " mal" : "")}>
          <div className="rot">DEVUELTAS POR ABI</div>
          <div className="n">{pctDevueltas}%</div>
          <div className="u">{devueltas} que ABI marcó como que no cuentan</div>
        </div>
        <div className="cifra ojo">
          <div className="rot">DE PRODUCTO TERMINADO</div>
          <div className="n">{pt}</div>
          <div className="u">botellas rotas dentro del empaque</div>
        </div>
        <div className="cifra">
          <div className="rot">ROTURAS REGISTRADAS</div>
          <div className="n">{vivas.length}</div>
          <div className="u">sin contar las anuladas</div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Por causa</h2>
          <p>
            En rojo, las causas que dicen que la rotura no fue del OL: cada una de esas es plata
            que alguien más va a discutir, y por eso todas exigen foto.
          </p>
        </div></div>
        <div className="barras">
          {porCausa.length === 0 && (
            <div className="vacio"><b>Sin datos</b>Todavía no hay roturas con visto bueno.</div>
          )}
          {porCausa.map(([nombre, n]) => (
            <div key={nombre} className={"b" + (causasNoAsumidas.has(nombre) ? " mal" : "")}>
              <div className="et">{nombre}</div>
              <div className="riel"><i style={{ width: `${Math.round((n / maxCausa) * 100)}%` }} /></div>
              <div className="n">{n}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Por proceso</h2>
          <p>Dónde pasa.</p>
        </div></div>
        <div className="barras">
          {porProceso.length === 0 && (
            <div className="vacio"><b>Sin datos</b>Todavía no hay roturas con visto bueno.</div>
          )}
          {porProceso.map(([nombre, n]) => (
            <div key={nombre} className="b">
              <div className="et">{nombre}</div>
              <div className="riel"><i style={{ width: `${Math.round((n / maxProceso) * 100)}%` }} /></div>
              <div className="n">{n}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="aviso">
        <b>Estas unidades no se cuadran con los kilos de la salida.</b> Miden cosas distintas:
        una botella de 330 y una de 750 pesan diferente, el vidrio se acumula días antes de
        salir, y parte de lo que se pesa nunca se contó aquí. Los kilos están en{" "}
        <Link href="/roturas/salida/analisis">Salida → Análisis</Link>, aparte y a propósito.
      </div>
    </div>
  );
}
