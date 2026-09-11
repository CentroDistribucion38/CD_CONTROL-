import { roturas as leerRoturas, salidas as leerSalidas } from "@/modulos/roturas/datos";
import { kilos } from "@/modulos/roturas/formato";
import "../roturas.css";
import { SinTablas } from "../comunes";

export const dynamic = "force-dynamic";

/**
 * ANÁLISIS — por qué se sigue rompiendo lo mismo.
 *
 * DOS MITADES QUE NO SE SUMAN, Y SE DICE. Arriba, unidades por causa y
 * por proceso: de quién fue y de dónde salió. Abajo, kilos que salieron
 * por la puerta. No hay ni una cifra que mezcle las dos, porque una
 * botella de 330 y una de 750 pesan distinto, el vidrio se acumula días
 * antes de salir, y parte de lo que se pesa nunca se contó en sitio. El
 * día que alguien "cuadre" las dos va a estar inventando un factor de
 * conversión que no existe.
 *
 * Todo se calcula sobre lo que ya se trajo. Una pantalla de análisis que
 * pide seis consultas más para decir lo que ya estaba en la primera es
 * lenta sin necesidad.
 */
export default async function AnalisisRoturasPage() {
  const [datos, sal] = await Promise.all([leerRoturas(1000), leerSalidas(300)]);
  if (datos.falta) return <div className="rt"><SinTablas /></div>;

  const vivas = datos.roturas.filter((r) => r.estado !== "anulada");
  const cuentan = vivas.filter((r) => r.cuenta);

  /* Se agrupa sobre lo que CUENTA, no sobre todo lo reportado: incluir
     lo que ABI devolvió haría que el ranking de causas midiera también
     los errores de digitación, y la conclusión saldría torcida. */
  function agrupar(clave: (r: typeof cuentan[number]) => string) {
    const m = new Map<string, number>();
    for (const r of cuentan) m.set(clave(r), (m.get(clave(r)) ?? 0) + r.unidades_vidrio);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  const porCausa = agrupar((r) => r.causa_nombre);
  const porProceso = agrupar((r) => r.proceso_nombre);
  const maxCausa = porCausa[0]?.[1] ?? 1;
  const maxProceso = porProceso[0]?.[1] ?? 1;

  const noAsumidas = cuentan.filter((r) => r.grupo === "no_asumida")
    .reduce((s, r) => s + r.unidades_vidrio, 0);
  const totalUnidades = cuentan.reduce((s, r) => s + r.unidades_vidrio, 0);
  const pctNoAsumida = totalUnidades ? Math.round((noAsumidas / totalUnidades) * 100) : 0;

  const devueltas = vivas.filter((r) => r.estado === "no_cuenta").length;
  const pctDevueltas = vivas.length ? Math.round((devueltas / vivas.length) * 100) : 0;

  /* Los kilos van sobre salidas COMPLETAS: una salida a medio firmar
     todavía se puede corregir, y contarla aquí sería publicar un número
     que mañana cambia. */
  const completas = sal.salidas.filter((s) => s.completa);
  const kgSalidos = completas.reduce((t, s) => t + Number(s.neto_kg), 0);
  const tolvasTotal = completas.reduce((t, s) => t + s.tolvas, 0);

  const causasNoAsumidas = new Set(cuentan.filter((r) => r.grupo === "no_asumida")
    .map((r) => r.causa_nombre));

  return (
    <div className="rt">
      <section className="cabeza">
        <div>
          <p className="ojo">ROTURAS · ANÁLISIS</p>
          <h1>Por qué se rompe</h1>
          <p className="sub">
            Arriba, unidades por causa y por proceso: de quién fue la rotura y de dónde salió.
            Abajo, los kilos que salieron por la puerta. Las dos mitades no se suman entre sí a
            propósito — no existe el factor que convierta una en la otra.
          </p>
        </div>
        <div className="kpi">
          <div className="corte" aria-hidden />
          <div className="rot">UNIDADES DE VIDRIO QUE CUENTAN</div>
          <div className="num">{totalUnidades}<span className="u">und</span></div>
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
          <div className="rot">KILOS QUE SALIERON</div>
          <div className="n">{kilos(kgSalidos)}</div>
          <div className="u">netos, en {completas.length} salida{completas.length === 1 ? "" : "s"} con las tres firmas</div>
        </div>
        <div className="cifra">
          <div className="rot">TOLVAS DESPACHADAS</div>
          <div className="n">{tolvasTotal}</div>
          <div className="u">en esas mismas salidas</div>
        </div>
      </section>

      <section className="caja">
        <div className="cab"><div>
          <h2>Por causa</h2>
          <p>
            Unidades de vidrio de lo que ya tiene visto bueno. En rojo, las causas que dicen que
            la rotura no fue del OL: cada una de esas es plata que alguien más va a discutir.
          </p>
        </div></div>
        <div className="barras">
          {porCausa.length === 0 && <div className="vacio"><b>Sin datos</b>Todavía no hay roturas con visto bueno.</div>}
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
          <p>
            Dónde pasa. Si un proceso pesa el doble que el siguiente, el problema es del
            proceso y no del turno que le tocó ese día.
          </p>
        </div></div>
        <div className="barras">
          {porProceso.length === 0 && <div className="vacio"><b>Sin datos</b>Todavía no hay roturas con visto bueno.</div>}
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
        <b>Estas dos mitades no se cuadran entre sí.</b> Las unidades de arriba y los kilos de
        las salidas miden cosas distintas: una botella de 330 y una de 750 pesan diferente, el
        vidrio se acumula días antes de salir, y parte de lo que se pesa nunca se contó en
        sitio. Si alguna vez hace falta un número que las una, va a ser un factor inventado.
      </div>
    </div>
  );
}
