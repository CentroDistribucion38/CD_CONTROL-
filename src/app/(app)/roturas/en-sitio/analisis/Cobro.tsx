import Link from "next/link";
import { pesos } from "@/modulos/roturas/formato";

/**
 * DE DÓNDE SALE LO QUE SE LE COBRA AL OL.
 *
 * VA APARTE DE LA PÁGINA por la misma razón que el recorrido: la página
 * es un componente de SERVIDOR —hace sus consultas antes de pintar nada—
 * y eso no se puede montar en un arnés. Esto sí: recibe las cifras ya
 * calculadas y no sabe de dónde salieron, así que se le pueden dar unas
 * a mano y mirar lo que produce.
 *
 * ---------------------------------------------------------------------
 * NO CALCULA PLATA. Reparte porcentajes y ordena, nada más. Las dos
 * cifras vienen de `medirCobro`, que es una función pura con su propio
 * arnés: si esta pantalla sumara por su cuenta, habría dos cuentas de lo
 * mismo y algún día darían dos números.
 *
 * ---------------------------------------------------------------------
 * LO QUE HACE QUE LA CIFRA SE PUEDA DEFENDER
 * ---------------------------------------------------------------------
 *  · LA BARRA: cuál de las dos formas de cobrar es el problema, sin
 *    restar de cabeza. Casi siempre son las contaminadas, y eso es justo
 *    lo que hay que poder enseñarle al OL.
 *  · LA FÓRMULA ESCRITA debajo de cada una. Una cifra de plata que no
 *    dice cómo se sacó se cree o no se cree, pero no se discute.
 *  · EL TOTAL REPETIDO al pie de la tabla por causa: es lo que deja
 *    comprobar que el reparto suma lo mismo que la cifra grande. Dos
 *    cifras de la misma pantalla que no cuadran se ven las dos igual de
 *    bien.
 */
export type Cobro = {
  total: number;
  rotas: number;
  contaminadas: number;
  sinPrecio: number;
  porCausa: { nombre: string; grupo: "asumida" | "no_asumida"; valor: number }[];
  faltan?: { material: string; nombre: string; falta: string; roturas: number }[];
};

export function DeDondeSale({ c }: { c: Cobro }) {
  /* CON EL TOTAL EN CERO NO SE DIVIDE. Sale 0 % y la barra vacía, que es
     lo que pasa: no hay nada a cobro. */
  const pct = (v: number) => (c.total > 0 ? Math.round((v / c.total) * 100) : 0);

  /* DE MAYOR A MENOR, NO EN UN ORDEN FIJO: lo que hay que ver de un
     golpe es cuál de las dos pesa, y eso cambia con los datos. */
  const formas = [
    { id: "rotas", nom: "Rotas", valor: c.rotas,
      que: "El producto se pierde en sitio: se le cobra reponer la botella.",
      formula: "cajas × unid. por caja × precio botella del envase", chip: "SOLO ENVASE" },
    { id: "cont", nom: "Contaminadas", valor: c.contaminadas,
      que: "El envase contaminado no vuelve a la línea: se cobra envase y producto.",
      formula: "cajas × unid. por caja × (precio botella del envase + del producto)",
      chip: "ENVASE + PRODUCTO" },
  ].sort((x, z) => z.valor - x.valor);

  /* QUIÉN LA ASUME, EN UNA SOLA PALABRA. Con una causa es la suya; con
     varias hay que decir si son todas del OL o hay mezcla — la parte no
     asumida es la que alguien va a discutir, y esconderla detrás de un
     total deja la cifra indefendible. */
  const nAsum = c.porCausa.filter((x) => x.grupo === "asumida").length;
  const nNo = c.porCausa.length - nAsum;
  const quien = nNo === 0 ? "El OL" : nAsum === 0 ? "No asumida" : "El OL y otras";
  const mayor = c.porCausa[0];

  return (
    <section className="caja rq-cobro">
      <div className="rq-cobro-cab">
        <div>
          <p className="rot">COBRO · DE DÓNDE SALE</p>
          <div className="rq-cobro-tot">
            <small>$</small>
            {new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(c.total)}
          </div>
          <p className="rq-cobro-sub">Lo reportado son cajas: cajas × unidades por caja × precio de la botella, todo del maestro de Inventario.</p>
        </div>
        <div className={"rq-cobro-quien" + (nAsum === 0 && nNo > 0 ? " no" : "")}>
          <p className="rot">LO ASUME</p>
          <b>{quien}</b>
          <span>
            {c.porCausa.length === 1
              ? `Causa: ${mayor?.nombre ?? "—"}`
              : `${c.porCausa.length} causas · la mayor: ${mayor?.nombre ?? "—"}`}
          </span>
        </div>
      </div>

      <div className="rq-cobro-cuerpo">
        <div className="rq-barra" role="img"
             aria-label={`Rotas ${pct(c.rotas)} %, contaminadas ${pct(c.contaminadas)} %`}>
          <i className="rotas" style={{ width: pct(c.rotas) + "%" }} />
          <i className="cont" style={{ width: pct(c.contaminadas) + "%" }} />
        </div>
        <div className="rq-escala">
          <span>Rotas {pct(c.rotas)} %</span>
          <span>Contaminadas {pct(c.contaminadas)} %</span>
        </div>

        <div className="rq-formas">
          {formas.map((f) => (
            <div className="rq-forma" key={f.id}>
              <i className={"sw " + f.id} aria-hidden />
              <div className="rq-forma-q">
                <b>{f.nom}</b>
                <span>{f.que}</span>
                <code>{f.formula}</code>
              </div>
              <span className="rq-chip">{f.chip}</span>
              <div className="rq-forma-v">
                <b>{pesos(f.valor) ?? "—"}</b>
                <span>{pct(f.valor)} %</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rq-porcausa">
          <p className="rot">POR CAUSA</p>
          <table>
            <thead>
              <tr><th>Causa</th><th>Quién la asume</th><th className="der">Se cobra</th></tr>
            </thead>
            <tbody>
              {c.porCausa.map((x) => (
                <tr key={x.nombre}>
                  <td>
                    {x.nombre}
                    {/* EN CELULAR LA COLUMNA DE AL LADO NO CABE, y quitarla
                        sin más borraba de la pantalla lo único que avisa
                        que esa plata se va a discutir. Se repite aquí
                        abajo, chiquito, y se esconde en pantalla ancha. */}
                    <span className={"rq-pun-cel" + (x.grupo === "no_asumida" ? " no" : "")}>
                      {x.grupo === "no_asumida" ? "No asumida" : "La asume el OL"}
                    </span>
                  </td>
                  <td>
                    <span className={"rq-pun" + (x.grupo === "no_asumida" ? " no" : "")}>
                      {x.grupo === "no_asumida" ? "No asumida" : "El OL"}
                    </span>
                  </td>
                  <td className="der">{pesos(x.valor) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            {/* EL TOTAL OCUPA LAS DOS PRIMERAS COLUMNAS y va pegado a su
                cifra. Estaba en la segunda, que es la que se esconde en
                celular: el pie quedaba con un número suelto y sin decir
                de qué era. */}
            <tfoot>
              <tr>
                <td className="rq-tot-et" colSpan={2}>Total a cobrar</td>
                <td className="der">{pesos(c.total) ?? "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rq-cobro-pie">
          <p>Si un precio cambia en el maestro, el cobro se vuelve a calcular solo.</p>
          <Link className="rq-vervlas" href="/roturas/en-sitio/tablero">
            Ver las roturas una por una
          </Link>
        </div>

        {c.sinPrecio > 0 && (
          <p className="rq-mas">
            <b>{c.sinPrecio} rotura{c.sinPrecio === 1 ? "" : "s"} a cobro sin precio.</b> Al
            material le falta el precio o las unidades por caja en el maestro, así que no entra en esta cuenta — el total
            de arriba se queda corto hasta que se llene en Inventario → Maestro.
          </p>
        )}
        {(c.faltan?.length ?? 0) > 0 && (
          <ul className="rq-faltan">
            {c.faltan!.map((f) => (
              <li key={f.material}>
                <b>{f.material}</b> {f.nombre} — le falta <b>{f.falta}</b>
                {" "}· {f.roturas} rotura{f.roturas === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
