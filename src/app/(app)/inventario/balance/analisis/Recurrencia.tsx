"use client";

import { useMemo, useState } from "react";
import type { DiaHistorico, FilaHistorico } from "@/modulos/inventario/analisis-ajustes";

/**
 * RECURRENCIA — «un aviso tipo "3501224 lleva 5 días seguidos faltando"; separa el error de un día del
 * problema de fondo, partiendo del rango de fecha que yo le ponga».
 * Sale de los días GUARDADOS (el histórico): por código, el ajuste de cada día, la racha con que termina el
 * rango (días guardados seguidos faltando o sobrando) y cuántos días faltó o sobró.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const dc = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
const menos = (iso: string, d: number) => new Date(Date.parse(iso + "T12:00:00Z") - d * 86400000).toISOString().slice(0, 10);

export function Recurrencia({ dias, detalle }: { dias: DiaHistorico[]; detalle: FilaHistorico[] }) {
  const ultimo = dias.map((d) => d.fecha).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(menos(ultimo, 29));
  const [hasta, setHasta] = useState(ultimo);
  const [minRacha, setMinRacha] = useState(3);
  const [ver, setVer] = useState<"alerta" | "todo">("alerta");

  const fechas = useMemo(() => [...new Set(dias.map((d) => d.fecha))].filter((f) => f >= desde && f <= hasta).sort(), [dias, desde, hasta]);
  const codigos = useMemo(() => {
    const en = new Set(fechas);
    const por = new Map<string, { codigo: string; descripcion: string; familia: string; v: Map<string, number> }>();
    for (const f of detalle) {
      if (!en.has(f.fecha)) continue;
      const c = por.get(f.codigo) ?? { codigo: f.codigo, descripcion: f.descripcion, familia: f.familia, v: new Map() };
      c.v.set(f.fecha, f.ajuste); por.set(f.codigo, c);
    }
    return [...por.values()].map((c) => {
      const serie = fechas.map((d) => c.v.get(d) ?? 0);
      /* La racha con que termina el rango: días guardados seguidos con el mismo signo que el último. */
      const ult = serie.at(-1) ?? 0; let racha = 0;
      if (ult !== 0) for (let i = serie.length - 1; i >= 0 && Math.sign(serie[i]) === Math.sign(ult); i--) racha++;
      let max = 0, run = 0, sg = 0;
      for (const x of serie) { if (x !== 0 && Math.sign(x) === sg) run++; else { run = x !== 0 ? 1 : 0; sg = Math.sign(x) } max = Math.max(max, run) }
      return {
        ...c, serie, ult, racha, max,
        falta: serie.filter((x) => x < 0).length, sobra: serie.filter((x) => x > 0).length,
        total: serie.reduce((t, x) => t + x, 0),
      };
    }).filter((c) => c.falta + c.sobra > 0)
      .sort((a, b) => b.racha - a.racha || (b.falta + b.sobra) - (a.falta + a.sobra) || Math.abs(b.total) - Math.abs(a.total));
  }, [detalle, fechas]);
  const alertas = codigos.filter((c) => c.racha >= minRacha);
  const vistos = ver === "alerta" ? alertas : codigos;

  if (!dias.length) return <section className="ad-caja"><h2>Todavía no hay días guardados</h2><p className="ad-nota">La recurrencia sale del histórico: guarda el análisis de cada día.</p></section>;

  return (
    <>
      <div className="ad-barra">
        <label className="ad-dia"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} /></label>
        <label className="ad-dia"><span>Hasta</span><input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} /></label>
        <label className="ad-dia"><span>Aviso desde</span>
          <select className="ad-mes" value={minRacha} onChange={(e) => setMinRacha(Number(e.target.value))}>
            {[2, 3, 4, 5, 7, 10].map((x) => <option key={x} value={x}>{x} días seguidos</option>)}
          </select>
        </label>
        <div className="ad-carga">
          <b>{fechas.length} día{fechas.length === 1 ? "" : "s"} guardado{fechas.length === 1 ? "" : "s"} en el rango</b>
          <small>«Seguidos» = días guardados seguidos. Un día sin guardar no corta ni suma la racha.</small>
        </div>
      </div>

      {alertas.length > 0 ? (
        <section className="ad-alertas">
          {alertas.slice(0, 12).map((c) => (
            <div key={c.codigo} className={"ad-alerta " + (c.ult < 0 ? "falta" : "sobra")}>
              <b>{c.codigo}</b> {c.descripcion} lleva <b>{c.racha} días seguidos {c.ult < 0 ? "faltando" : "sobrando"}</b>
              <small>hoy {signo(c.ult)} · en el rango {signo(c.total)} · {c.falta} días faltó, {c.sobra} sobró</small>
            </div>
          ))}
        </section>
      ) : <p className="ad-msg bien">Ningún código lleva {minRacha} o más días seguidos con ajuste en el rango.</p>}

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Recurrencia por código</h2>
          <div className="ad-ver" role="tablist" aria-label="Qué ver">
            <button type="button" role="tab" aria-selected={ver === "alerta"} className={ver === "alerta" ? "on falta" : ""} onClick={() => setVer("alerta")}>Con aviso <em>{alertas.length}</em></button>
            <button type="button" role="tab" aria-selected={ver === "todo"} className={ver === "todo" ? "on" : ""} onClick={() => setVer("todo")}>Todos con ajuste <em>{codigos.length}</em></button>
          </div>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj ad-rec">
            <thead><tr>
              <th>Código</th><th>Descripción</th><th>Racha</th><th className="n">Días faltó</th><th className="n">Días sobró</th><th className="n">Racha más larga</th><th className="n">Total en el rango</th>
              <th className="dias">Día a día ({fechas.length ? `${dc(fechas[0])} → ${dc(fechas.at(-1)!)}` : "—"})</th>
            </tr></thead>
            <tbody>
              {vistos.map((c) => (
                <tr key={c.codigo}>
                  <td className="mono">{c.codigo}</td>
                  <td>{c.descripcion}</td>
                  <td>{c.racha ? <span className={"ad-sent " + (c.ult < 0 ? "falta" : "sobra")}>{c.racha} {c.ult < 0 ? "faltando" : "sobrando"}</span> : <span className="ad-na">—</span>}</td>
                  <td className="n">{c.falta}</td>
                  <td className="n">{c.sobra}</td>
                  <td className="n">{c.max}</td>
                  <td className={"n b" + (c.total < 0 ? " neg" : c.total > 0 ? " pos" : "")}>{signo(c.total)}</td>
                  <td className="dias">
                    <div className="ad-puntos">
                      {c.serie.map((x, i) => <i key={fechas[i]} className={x < 0 ? "f" : x > 0 ? "s" : ""} title={`${dc(fechas[i])}: ${x ? signo(x) : "sin ajuste"}`} />)}
                    </div>
                  </td>
                </tr>
              ))}
              {!vistos.length && <tr><td colSpan={8} className="ad-vacio">Nada en el rango.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="ad-nota">Cada cuadrito es un día guardado: rojo faltó (baja SAP), verde sobró (sube SAP), gris sin ajuste. Pasa el mouse para ver la cantidad.</p>
      </section>
    </>
  );
}
