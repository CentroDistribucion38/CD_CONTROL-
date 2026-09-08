"use client";

/**
 * LA TABLA DEL AÑO — la segunda tabla de la hoja SIMULADOR.
 *
 * Meses en columnas y una columna Total al final, igual que en el Excel:
 *   METAS · Producción T1 · Losses T1 · % Losses
 *
 * La usan los dos tableros. Es la misma cifra en los dos sitios a
 * propósito, y sale de la MISMA vista (v_quiebra_diario_mes), que ya
 * resuelve lo escrito a mano sobre lo importado. Si se calculara aparte
 * en cada pantalla, el día que no coincidieran nadie sabría cuál creer.
 */

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const pf = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(d).replace(".", ",") + "%";

export type MesAnio = {
  num_mes: number;
  produccion: number;
  baja: number;
  pct: number | null;
  dias_escritos?: number;
};

export function TablaAnio({ anio, meses, metas, resaltar }: {
  anio: number;
  meses: MesAnio[];
  /** "2026-08" → 0.0119 */
  metas: Record<string, number>;
  /** Mes a resaltar (1–12), el que se esté mirando. */
  resaltar?: number;
}) {
  const porMes = new Map(meses.map((m) => [m.num_mes, m]));
  const todos = Array.from({ length: 12 }, (_, i) => i + 1);

  const prodTotal = meses.reduce((s, m) => s + m.produccion, 0);
  const bajaTotal = meses.reduce((s, m) => s + m.baja, 0);
  const pctTotal = prodTotal > 0 ? bajaTotal / prodTotal : null;

  /* La meta del año se pondera por producción, igual que en el resto de
     la plataforma: un mes que produjo la mitad no puede pesar lo mismo. */
  let mn = 0, md = 0;
  for (const m of meses) {
    const mt = metas[`${anio}-${String(m.num_mes).padStart(2, "0")}`];
    if (mt == null || m.produccion <= 0) continue;
    mn += m.produccion * mt; md += m.produccion;
  }
  const metaTotal = md > 0 ? mn / md : null;

  const metaDe = (n: number) => metas[`${anio}-${String(n).padStart(2, "0")}`] ?? null;

  return (
    <div className="an-marco">
      <table className="an">
        <thead>
          <tr>
            <th className="rot">{anio}</th>
            {todos.map((n) => (
              <th key={n} className={"num" + (n === resaltar ? " aqui" : "")}>{MESES[n - 1]}</th>
            ))}
            <th className="num total">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="metas">
            <th className="rot">METAS</th>
            {todos.map((n) => (
              <td key={n} className={"num" + (n === resaltar ? " aqui" : "")}>{pf(metaDe(n))}</td>
            ))}
            <td className="num total">{pf(metaTotal)}</td>
          </tr>
          <tr>
            <th className="rot">Producción</th>
            {todos.map((n) => {
              const m = porMes.get(n);
              return (
                <td key={n} className={"num" + (n === resaltar ? " aqui" : "")}>
                  {m && m.produccion ? nf.format(m.produccion) : "—"}
                </td>
              );
            })}
            <td className="num total">{prodTotal ? nf.format(prodTotal) : "—"}</td>
          </tr>
          <tr>
            <th className="rot">Baja</th>
            {todos.map((n) => {
              const m = porMes.get(n);
              return (
                <td key={n} className={"num" + (n === resaltar ? " aqui" : "")}>
                  {m && m.baja ? nf.format(m.baja) : "—"}
                  {!!m?.dias_escritos && <i className="mano" title={`${m.dias_escritos} día(s) escritos a mano`} />}
                </td>
              );
            })}
            <td className="num total">{bajaTotal ? nf.format(bajaTotal) : "—"}</td>
          </tr>
          <tr className="pct">
            <th className="rot">% Quiebra</th>
            {todos.map((n) => {
              const m = porMes.get(n);
              const mt = metaDe(n);
              /* Sin meta cargada no se puede decir si cumplió: se deja
                 en gris. Verde sería afirmar algo que no se sabe. */
              const juzgable = m?.pct != null && mt != null;
              const encima = juzgable && m!.pct! > mt!;
              return (
                <td key={n}
                    className={"num" + (n === resaltar ? " aqui" : "")
                               + (!juzgable ? "" : encima ? " sobre" : " bajo")}>
                  {pf(m?.pct)}
                </td>
              );
            })}
            <td className={"num total" + (pctTotal != null && metaTotal != null
                            ? pctTotal > metaTotal ? " sobre" : " bajo" : "")}>
              {pf(pctTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
