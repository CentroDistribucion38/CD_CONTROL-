"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DiaHistorico, FilaHistorico } from "@/modulos/inventario/analisis-ajustes";

/**
 * PASO 3 · EL HISTÓRICO — «la hoja de históricos que se van guardando». Cada día que se le dio «Guardar»,
 * con sus totales: diferencia, lo compensado, sobrante, faltante y ajuste neto. De aquí se abre el día
 * (análisis o ajustes) y se baja el Excel con todo: por día, código por código y la matriz código × día.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const corto = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export function Historico({ dias, detalle, faltaSql }: { dias: DiaHistorico[]; detalle: FilaHistorico[]; faltaSql: boolean }) {
  const [mes, setMes] = useState("");
  const meses = useMemo(() => [...new Set(dias.map((d) => d.fecha.slice(0, 7)))].sort().reverse(), [dias]);
  const vistos = useMemo(() => dias.filter((d) => !mes || d.fecha.startsWith(mes)), [dias, mes]);
  const k = useMemo(() => ({
    sobra: vistos.reduce((t, d) => t + d.sobrante, 0), falta: vistos.reduce((t, d) => t + d.faltante, 0),
    comp: vistos.reduce((t, d) => t + d.compensado, 0), neto: vistos.reduce((t, d) => t + d.neto, 0),
  }), [vistos]);
  const tope = Math.max(1, ...vistos.map((d) => Math.max(d.sobrante, -d.faltante)));
  const [armando, setArmando] = useState(false);
  const [mal, setMal] = useState<string | null>(null);

  async function bajarExcel() {
    setArmando(true); setMal(null);
    try {
      const { armarLibroHistorico } = await import("@/modulos/inventario/libro-ajustes");
      const fechas = new Set(vistos.map((d) => d.fecha));
      const buf = await armarLibroHistorico(vistos, detalle.filter((f) => fechas.has(f.fecha)));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `historico-ajustes-bodega38${mes ? `-${mes}` : ""}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { setMal("No se pudo armar el Excel. Vuelve a intentar.") }
    finally { setArmando(false) }
  }

  if (faltaSql) return <p className="ad-msg mal">Falta correr supabase/migraciones/2026-10-analisis-diferencia-ajustes.sql en Supabase.</p>;
  if (!dias.length) return (
    <section className="ad-caja">
      <h2>Todavía no hay días guardados</h2>
      <p className="ad-nota">Cada vez que en el análisis le das <b>Guardar y pasar a ajustes</b>, ese día queda aquí.</p>
    </section>
  );

  return (
    <>
      <div className="ad-barra">
        <label className="ad-dia"><span>Mes</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="ad-mes">
            <option value="">Todos</option>
            {meses.map((m) => <option key={m} value={m}>{new Date(m + "-15T12:00:00").toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</option>)}
          </select>
        </label>
        <div className="ad-carga">
          <b>{vistos.length} día{vistos.length === 1 ? "" : "s"} guardado{vistos.length === 1 ? "" : "s"}</b>
          <small>Un día se guarda una vez: volver a guardarlo lo reemplaza. Las observaciones se quedan.</small>
        </div>
        <button type="button" className="ad-bt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel del histórico"}</button>
      </div>
      {mal && <p className="ad-msg mal">{mal}</p>}

      <div className="ad-k ad-k4">
        <div className="comp"><span>COMPENSADO</span><b>{n(k.comp)}</b><small>retornable ↔ NR nuevo</small></div>
        <div className="sobra"><span>SOBRANTE ACUMULADO</span><b>{signo(k.sobra)}</b><small>sube SAP</small></div>
        <div className="falta"><span>FALTANTE ACUMULADO</span><b>{signo(k.falta)}</b><small>baja SAP</small></div>
        <div><span>AJUSTE NETO</span><b>{signo(k.neto)}</b><small>{vistos.length} día{vistos.length === 1 ? "" : "s"}</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab"><h2>Histórico de ajustes</h2></div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj ad-hist">
            <thead><tr>
              <th>Día</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Diferencia</th><th className="n">Compensado</th>
              <th className="barra">Faltante · Sobrante</th><th className="n">Ajuste neto</th><th>Códigos</th><th>Guardado</th><th />
            </tr></thead>
            <tbody>
              {vistos.map((d) => (
                <tr key={d.fecha}>
                  <td className="b">{corto(d.fecha)}</td>
                  <td className="n">{n(d.sap)}</td>
                  <td className="n">{n(d.conteo)}</td>
                  <td className={"n" + (d.diferencia < 0 ? " neg" : " pos")}>{signo(d.diferencia)}</td>
                  <td className="n">{n(d.compensado)}</td>
                  <td className="barra">
                    {/* La barra en dos: el faltante crece a la izquierda del centro, el sobrante a la derecha. */}
                    <div className="ad-bar" title={`Faltante ${signo(d.faltante)} · Sobrante ${signo(d.sobrante)}`}>
                      <span className="f"><i style={{ width: `${(-d.faltante / tope) * 100}%` }} /></span>
                      <span className="s"><i style={{ width: `${(d.sobrante / tope) * 100}%` }} /></span>
                    </div>
                    <small><em className="neg">{signo(d.faltante)}</em> · <em className="pos">{signo(d.sobrante)}</em></small>
                  </td>
                  <td className={"n b" + (d.neto < 0 ? " neg" : d.neto > 0 ? " pos" : "")}>{signo(d.neto)}</td>
                  <td><small>{d.nSobra} sobran · {d.nFalta} faltan{d.nObs ? ` · ${d.nObs} con obs.` : ""}</small></td>
                  <td><small>{new Date(d.guardado_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{d.guardado_por ? ` · ${d.guardado_por}` : ""}</small></td>
                  <td className="acc">
                    <Link href={`/inventario/balance/analisis?fecha=${d.fecha}&paso=ajustes`}>Ajustes</Link>
                    <Link href={`/inventario/balance/analisis?fecha=${d.fecha}`}>Análisis</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ad-nota">El Excel trae tres hojas: el histórico por día, el detalle código por código con su observación, y la matriz código × día (qué código se ajusta todos los días y cuál fue cosa de un día).</p>
      </section>
    </>
  );
}
