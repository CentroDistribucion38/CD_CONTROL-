"use client";

/**
 * LA REJILLA — el espejo de la hoja de Excel.
 *
 * Un día por COLUMNA y un concepto por fila, igual que en SIMULADOR y en
 * QUIEBRA DIARIA. Las casillas blancas se escriben; las grises se
 * calculan o vienen de la meta.
 *
 * Por qué así y no una fila por día: quien llena esto viene de la hoja,
 * y en la hoja se avanza de izquierda a derecha con Tab llenando el
 * mismo concepto en varios días. Una tabla con los días en filas obliga
 * a saltar de columna en cada día y se pierde el sitio.
 *
 * Las tres capas de la baja, de lo más específico a lo más general:
 *   desglose por causal  >  total escrito a mano  >  lo importado de SAP
 * Cuando un día tiene desglose escrito, su casilla de total se bloquea y
 * muestra la suma: dos cifras editables que deberían dar lo mismo es la
 * receta para que un día no cuadre y nadie sepa por qué.
 */

import { CAUSALES, NOMBRE_HOJA } from "@/modulos/quiebra/diario";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pf = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";
const dia = (f: string) => Number(f.slice(8, 10));
const mesDe = (f: string) => MESES[Number(f.slice(5, 7)) - 1];

/** Lo que la rejilla necesita saber de cada día. */
export type ColumnaDia = {
  fecha: string;
  /** La cifra que MANDA, ya resuelta. */
  produccion: number;
  baja: number;
  pct: number | null;
  /** Meta del mes de ese día. */
  meta: number | null;
  /** Lo que dice SAP, para poder comparar. */
  sapProduccion: number | null;
  sapBaja: number | null;
  /** Lo que hay escrito en las casillas ahora mismo. */
  produccionEsc: string;
  bajaEsc: string;
  causalesEsc: Record<string, string>;
  /** Si hay desglose escrito, el total se calcula y no se escribe. */
  hayDesglose: boolean;
  /** Valor efectivo por causal, para las casillas del desglose. */
  causalVale: Record<string, number | null>;
};

export type Campo = "produccion" | "baja" | { causal: string };

export function Rejilla({
  cols, editable, abierto, escribir, abrir, mostrarDesglose, alternarDesglose,
}: {
  cols: ColumnaDia[];
  editable: boolean;
  /** El día que está resaltado, para no perderse en 31 columnas. */
  abierto: string;
  escribir: (fecha: string, campo: Campo, valor: string) => void;
  abrir: (fecha: string) => void;
  mostrarDesglose: boolean;
  alternarDesglose: () => void;
}) {
  if (!cols.length) {
    return <p className="rj-vacio">El período elegido no tiene días.</p>;
  }

  /* Totales de la fila, a la derecha: es la columna Total del Excel. */
  const prodTot = cols.reduce((s, c) => s + c.produccion, 0);
  const bajaTot = cols.reduce((s, c) => s + c.baja, 0);
  const pctTot = prodTot > 0 ? bajaTot / prodTot : null;
  const causalTot = (cc: string) =>
    cols.reduce((s, c) => s + (c.causalVale[cc] ?? 0), 0);

  const clase = (c: ColumnaDia) => (c.fecha === abierto ? " aqui" : "");

  return (
    <div className="rj-marco">
      <table className="rj">
        <thead>
          <tr>
            <th className="rot">Concepto</th>
            {cols.map((c) => (
              <th key={c.fecha} className={"num" + clase(c)}>
                <button type="button" onClick={() => abrir(c.fecha)}
                        title={`${dia(c.fecha)} de ${mesDe(c.fecha)}`}>
                  <b>{dia(c.fecha)}</b>
                  <span>{mesDe(c.fecha)}</span>
                </button>
              </th>
            ))}
            <th className="num total">Total</th>
          </tr>
        </thead>

        <tbody>
          {/* ---- META: viene de quiebra_metas, no se escribe aquí ---- */}
          <tr className="calc">
            <th className="rot">META</th>
            {cols.map((c) => (
              <td key={c.fecha} className={"num" + clase(c)}>{pf(c.meta)}</td>
            ))}
            <td className="num total">—</td>
          </tr>

          {/* ---- Producción ---- */}
          <tr>
            <th className="rot">Producción</th>
            {cols.map((c) => (
              <Casilla
                key={c.fecha}
                extra={clase(c)}
                valor={c.produccionEsc}
                sap={c.sapProduccion}
                vale={c.produccion}
                editable={editable}
                cambiar={(v) => escribir(c.fecha, "produccion", v)}
                etiqueta={`Producción del ${dia(c.fecha)} de ${mesDe(c.fecha)}`}
              />
            ))}
            <td className="num total">{prodTot ? nf.format(prodTot) : "—"}</td>
          </tr>

          {/* ---- Baja total ---- */}
          <tr>
            <th className="rot">
              Baja
              <button type="button" className="rj-mas" onClick={alternarDesglose}
                      aria-expanded={mostrarDesglose}>
                {mostrarDesglose ? "− ocultar causales" : "+ por causal"}
              </button>
            </th>
            {cols.map((c) => (
              c.hayDesglose ? (
                <td key={c.fecha} className={"num sumado" + clase(c)}
                    title="Este día tiene el desglose por causal escrito: el total es su suma.">
                  {nf.format(c.baja)}
                </td>
              ) : (
                <Casilla
                  key={c.fecha}
                  extra={clase(c)}
                  valor={c.bajaEsc}
                  sap={c.sapBaja}
                  vale={c.baja}
                  editable={editable}
                  cambiar={(v) => escribir(c.fecha, "baja", v)}
                  etiqueta={`Baja del ${dia(c.fecha)} de ${mesDe(c.fecha)}`}
                />
              )
            ))}
            <td className="num total">{bajaTot ? nf.format(bajaTot) : "—"}</td>
          </tr>

          {/* ---- % Quiebra ---- */}
          <tr className="calc pct">
            <th className="rot">% Quiebra</th>
            {cols.map((c) => {
              /* Sin meta cargada para ese mes no se juzga el día. */
              const juzgable = c.pct != null && c.meta != null;
              const encima = juzgable && c.pct! > c.meta!;
              return (
                <td key={c.fecha}
                    className={"num" + clase(c) + (!juzgable ? "" : encima ? " sobre" : " bajo")}>
                  {pf(c.pct)}
                </td>
              );
            })}
            <td className="num total">{pf(pctTot)}</td>
          </tr>

          {/* ---- Desglose por causal ---- */}
          {mostrarDesglose && (
            <>
              <tr className="rj-sep">
                <th className="rot" colSpan={cols.length + 2}>
                  Desglose por causal
                  <em>
                    Escribir aquí manda sobre el total: la fila Baja pasa a ser esta suma.
                    Dejar todas en blanco devuelve el día al total escrito, y si tampoco hay,
                    a lo de SAP.
                  </em>
                </th>
              </tr>
              {CAUSALES.map((cc) => (
                <tr key={cc} className="rj-causal">
                  <th className="rot">
                    {NOMBRE_HOJA[cc] ?? cc}
                    {NOMBRE_HOJA[cc] && <em>{cc}</em>}
                  </th>
                  {cols.map((c) => (
                    <Casilla
                      key={c.fecha}
                      extra={clase(c)}
                      valor={c.causalesEsc[cc] ?? ""}
                      sap={null}
                      vale={c.causalVale[cc]}
                      editable={editable}
                      cambiar={(v) => escribir(c.fecha, { causal: cc }, v)}
                      etiqueta={`${cc} del ${dia(c.fecha)} de ${mesDe(c.fecha)}`}
                    />
                  ))}
                  <td className="num total">
                    {causalTot(cc) ? nf.format(causalTot(cc)) : "—"}
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ==================== Una casilla ====================
   Muestra lo escrito si hay algo escrito; si no, lo de SAP como pista
   gris. Así se ve de un golpe qué días están tocados a mano y qué días
   son tal cual el maestro, sin necesitar una columna aparte.
   ==================================================== */
function Casilla({ valor, sap, vale, editable, cambiar, etiqueta, extra }: {
  valor: string;
  sap: number | null;
  vale: number | null;
  editable: boolean;
  cambiar: (v: string) => void;
  etiqueta: string;
  extra: string;
}) {
  const escrito = valor.trim() !== "";
  const difiere = escrito && sap != null && Math.abs(Number(vale ?? 0) - sap) > 0.5;

  return (
    <td className={"cel" + extra + (escrito ? " tocada" : "") + (difiere ? " difiere" : "")}>
      <input
        inputMode="decimal"
        value={valor}
        disabled={!editable}
        placeholder={sap != null && sap !== 0 ? nf.format(sap) : "—"}
        onChange={(e) => cambiar(e.target.value)}
        aria-label={etiqueta}
        title={difiere && sap != null ? `SAP dice ${nf.format(sap)}` : undefined}
      />
    </td>
  );
}
