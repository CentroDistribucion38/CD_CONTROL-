"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { InformeCierre } from "./InformeCierre";
import { useRouter } from "next/navigation";
import type { FilaAjuste, Guardado } from "@/modulos/inventario/analisis-ajustes";
import { analisisFinal } from "@/modulos/inventario/compensa";
import { guardarFinal } from "./actions";

/**
 * PASO 3 · EL ANÁLISIS FINAL — cómo queda SAP con lo que ya se hizo: SAP inicial + compensación hecha +
 * ajuste hecho = SAP final, contra el mismo CONTEO. Lo que siga con diferencia es lo que falta por hacer.
 * «Guardar análisis final» lo deja en el histórico.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Final({ fecha, guardado, ajustes, final, puedeEditar, faltaSql }: {
  fecha: string; guardado: Guardado | null; ajustes: FilaAjuste[]; final: { en: string } | null; puedeEditar: boolean; faltaSql: string | null;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [solo, setSolo] = useState(false);
  const filas = useMemo(() => analisisFinal(ajustes), [ajustes]);
  const vistas = useMemo(() => filas.filter((f) => !solo || f.difFinal !== 0), [filas, solo]);
  const familias = useMemo(() => {
    const m = new Map<string, typeof filas>();
    for (const f of vistas) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [vistas]);
  const s = (k: (f: (typeof filas)[number]) => number, xs = filas) => xs.reduce((t, f) => t + k(f), 0);
  const ini = s((f) => f.diferencia), fin = s((f) => f.difFinal);
  const pendientes = filas.filter((f) => f.difFinal !== 0).length;
  const avance = Math.abs(ini) + 0 > 0 ? 1 - s((f) => Math.abs(f.difFinal)) / Math.max(1, s((f) => Math.abs(f.diferencia))) : 1;

  const guardar = () => start(async () => {
    const r = await guardarFinal(fecha, JSON.stringify(filas.map((f) => ({
      familia: f.familia, codigo: f.codigo, descripcion: f.descripcion, sap: f.sap, conteo: f.conteo, diferencia: f.diferencia,
      compensa: f.compensa, ajuste: f.ajuste, movComp: f.movComp, movAjuste: f.movAjuste, sapFinal: f.sapFinal, difFinal: f.difFinal, observacion: f.observacion,
    }))));
    if ("error" in r && r.error) { setMsg({ mal: true, t: r.error }); return }
    setMsg({ t: "Análisis final guardado: ya está en el histórico." });
    router.refresh();
  });

  const [armando, setArmando] = useState(false);
  async function bajarExcel() {
    if (!guardado) return;
    setArmando(true); setMsg(null);
    try {
      const { armarLibroFinal } = await import("@/modulos/inventario/libro-ajustes");
      const buf = await armarLibroFinal({ fecha, fechaLarga: largo(fecha), guardadoEn: guardado.guardado_en, guardadoPor: guardado.guardado_por, ajustes, analisis: guardado.filas, finalEn: final?.en ?? null });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `analisis-final-bodega38-${fecha}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { setMsg({ mal: true, t: "No se pudo armar el Excel. Vuelve a intentar." }) }
    finally { setArmando(false) }
  }

  if (!guardado) return (
    <section className="ad-caja">
      <h2>Todavía no se ha guardado el análisis del {largo(fecha)}</h2>
      <p className="ad-nota">El análisis final sale del análisis guardado y de lo que marques como hecho en los ajustes.</p>
      <p className="ad-ir"><Link className="ad-bt" href={`/inventario/balance/analisis?fecha=${fecha}`}>← Ir al análisis</Link></p>
    </section>
  );

  return (
    <>
      {faltaSql && <p className="ad-msg mal">{faltaSql}</p>}
      <div className="ad-barra">
        <div className="ad-carga">
          <b>{final ? `Análisis final guardado · ${cuando(final.en)}` : "Análisis final sin guardar"}</b>
          <small>SAP final = SAP + compensación hecha + ajuste hecho. Lo que marcas como hecho en <b>Ajustes</b> se ve aquí al instante; guárdalo cuando termines para que quede en el histórico.</small>
        </div>
        <Link className="ad-bt alt" href={`/inventario/balance/analisis?fecha=${fecha}&paso=ajustes`}>← Ajustes</Link>
        <button type="button" className="ad-bt alt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>
        <InformeCierre fecha={fecha} fechaLarga={largo(fecha)} ajustes={ajustes} guardadoEn={guardado.guardado_en} guardadoPor={guardado.guardado_por} finalEn={final?.en ?? null} />
        {puedeEditar && <button type="button" className="ad-bt" disabled={pend || !!faltaSql} onClick={guardar}>{pend ? "Guardando…" : final ? "Guardar de nuevo el final" : "Guardar análisis final"}</button>}
      </div>
      {msg && <p className={"ad-msg" + (msg.mal ? " mal" : " bien")} role="status">{msg.t}</p>}

      <div className="ad-k ad-k4">
        <div><span>DIFERENCIA INICIAL</span><b>{signo(ini)}</b><small>la del análisis guardado</small></div>
        <div className="comp"><span>MOVIDO EN SAP</span><b>{signo(s((f) => f.movComp + f.movAjuste))}</b><small>compensación {signo(s((f) => f.movComp))} · ajuste {signo(s((f) => f.movAjuste))}</small></div>
        <div className={fin === 0 ? "sobra" : "falta"}><span>DIFERENCIA FINAL</span><b>{signo(fin)}</b><small>{pendientes ? `${pendientes} código${pendientes === 1 ? "" : "s"} siguen con diferencia` : "todo cuadra ✓"}</small></div>
        <div><span>AVANCE</span><b>{Math.round(Math.max(0, avance) * 100)}%</b><small>de la diferencia ya resuelta</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Análisis final · {largo(fecha)}</h2>
          <label className="ad-chk"><input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo lo que sigue con diferencia</label>
        </div>
        <div className="ad-tabla-caja">
          <table className="ad-t ad-piv ad-aj">
            <thead><tr>
              <th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP inicial</th><th className="n">Compensación hecha</th>
              <th className="n">Ajuste hecho</th><th className="n">SAP final</th><th className="n">Conteo</th><th className="n">Diferencia final</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {familias.map(([fam, xs]) => (
                <Fragment key={fam}>
                  {xs.map((f, i) => (
                    <tr key={f.codigo}>
                      {i === 0 && <td className="fam" rowSpan={xs.length}>{fam}</td>}
                      <td className="mono">{f.codigo}</td>
                      <td>{f.descripcion}</td>
                      <td className="n">{n(f.sap)}</td>
                      <td className="n">{f.movComp ? signo(f.movComp) : <span className="ad-na">—</span>}</td>
                      <td className="n">{f.movAjuste ? signo(f.movAjuste) : <span className="ad-na">—</span>}</td>
                      <td className="n b">{n(f.sapFinal)}</td>
                      <td className="n">{n(f.conteo)}</td>
                      <td className={"n b" + (f.difFinal < 0 ? " neg" : f.difFinal > 0 ? " pos" : "")}>{f.difFinal ? signo(f.difFinal) : "0"}</td>
                      <td><span className={"ad-sent" + (f.difFinal === 0 ? (f.diferencia === 0 ? " ok" : " sobra") : " falta")}>{f.difFinal === 0 ? (f.diferencia === 0 ? "Cuadraba" : "Cuadrado ✓") : "Pendiente"}</span></td>
                    </tr>
                  ))}
                  <tr className="sub">
                    <td colSpan={3}>Total {fam.split(" · ")[0]}</td>
                    <td className="n">{n(s((f) => f.sap, xs))}</td><td className="n">{signo(s((f) => f.movComp, xs))}</td><td className="n">{signo(s((f) => f.movAjuste, xs))}</td>
                    <td className="n">{n(s((f) => f.sapFinal, xs))}</td><td className="n">{n(s((f) => f.conteo, xs))}</td><td className="n">{signo(s((f) => f.difFinal, xs))}</td><td />
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={3}>Total general</td><td className="n">{n(s((f) => f.sap))}</td><td className="n">{signo(s((f) => f.movComp))}</td><td className="n">{signo(s((f) => f.movAjuste))}</td>
              <td className="n">{n(s((f) => f.sapFinal))}</td><td className="n">{n(s((f) => f.conteo))}</td><td className="n">{signo(fin)}</td><td />
            </tr></tfoot>
          </table>
        </div>
        <p className="ad-nota">La compensación hecha mueve SAP al revés de la compensación (el retornable recibe lo del NR nuevo); el ajuste hecho lo mueve en su signo. Si todo se hizo, la diferencia final es cero.</p>
      </section>
    </>
  );
}
