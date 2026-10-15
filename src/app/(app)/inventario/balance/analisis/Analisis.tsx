"use client";

import { Existencias } from "./Existencias";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Analisis as Datos, FilaAnalisis } from "@/modulos/inventario/analisis-dif";
import { guardarAnalisis, guardarNovedades, quitarNovedades } from "./actions";
import { leerPlantilla } from "./leer-plantilla";

/**
 * LA HOJA DE ANÁLISIS: «¿dónde lo subo para que me pase a la hoja de análisis?».
 * Arriba el día y la plantilla (se valida en el navegador antes de subir); luego lo que alimenta el día,
 * los totales y la tabla por familia (como la dinámica del Excel: SAP · CONTEO · DIFERENCIA). Tocar un
 * código abre de qué partida sale cada lado.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
const largo = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function Analisis({ datos, hoy, puedeEditar, guardadoEn, guardadoPor, obs }: { datos: Datos; hoy: string; puedeEditar: boolean; guardadoEn: string | null; guardadoPor: string | null; obs: Record<string, string> }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [soloDif, setSoloDif] = useState(false);
  const { fecha, filas } = datos;

  const familias = useMemo(() => {
    const m = new Map<string, FilaAnalisis[]>();
    for (const f of filas) if (!soloDif || f.diferencia !== 0) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [filas, soloDif]);
  const tot = filas.reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
  const informativas = datos.novedades.filter((x) => x.lado === "NO SUMA");

  const irA = (d: string) => router.push(`/inventario/balance/analisis?fecha=${d}`);

  async function subir(a: File) {
    setMsg(null); setErrores([]);
    const r = await leerPlantilla(a);
    if (r.errores.length) { setErrores(r.errores); setMsg({ mal: true, t: `La plantilla tiene ${r.errores.length} ${r.errores.length === 1 ? "fila con problema" : "filas con problemas"}: corrígelas y vuelve a subirla. No se subió nada.` }); return }
    const dia = r.fecha ?? fecha;
    start(async () => {
      const g = await guardarNovedades(dia, JSON.stringify(r.filas), a.name);
      if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
      setMsg({ t: `Plantilla del ${largo(dia)} cargada: ${r.filas.length} filas. Abajo está el análisis.` });
      if (dia !== fecha) irA(dia); else router.refresh();
    });
  }
  const quitar = () => start(async () => {
    const g = await quitarNovedades(fecha);
    if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
    setMsg({ t: "Se quitó la plantilla de ese día." }); router.refresh();
  });

  /* GUARDAR Y PASAR A AJUSTES: se guarda la foto del análisis y se abre el paso 2. */
  const guardarYSeguir = () => start(async () => {
    const g = await guardarAnalisis(fecha, JSON.stringify(filas));
    if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
    router.push(`/inventario/balance/analisis?fecha=${fecha}&paso=ajustes`);
  });

  /* EL EXCEL DEL ANÁLISIS: la dinámica, la BASE de donde sale (código · lado · partida), las fuentes y las
     hojas de los ajustes (compensación R ↔ NR, sobrantes, faltantes y el detalle partida por partida). */
  const [armando, setArmando] = useState(false);
  async function bajarExcel() {
    setArmando(true); setMsg(null);
    try {
      const [{ armarLibroAnalisis }, { calcularAjustes }] = await Promise.all([import("@/modulos/inventario/libro-ajustes"), import("@/modulos/inventario/compensa")]);
      const buf = await armarLibroAnalisis({
        fecha, fechaLarga: largo(fecha), guardadoEn, guardadoPor,
        analisis: filas, ajustes: calcularAjustes(filas, obs), fuentes: datos.fuentes, noEntran: datos.noEntran,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `analisis-diferencia-bodega38-${fecha}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { setMsg({ mal: true, t: "No se pudo armar el Excel. Vuelve a intentar." }) }
    finally { setArmando(false) }
  }

  return (
    <>
      {/* ---------- EL DÍA Y LA PLANTILLA ---------- */}
      <div className="ad-barra">
        <label className="ad-dia"><span>Día</span>
          <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && irA(e.target.value)} />
        </label>
        <div className="ad-carga">
          <b>{datos.carga ? "Plantilla cargada" : "Falta la plantilla del día"}</b>
          <small>{datos.carga ? `${datos.carga.archivo ?? "—"} · ${datos.carga.filas} filas${datos.carga.subido_en ? " · " + new Date(datos.carga.subido_en).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`
            : "Novedades y la ZEXI de las 6. Se valida antes de subir: si una fila está mal, no se sube nada."}</small>
        </div>
        <input ref={archivo} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subir(a) }} />
        {puedeEditar && datos.carga && <button type="button" className="ad-bt alt" disabled={pend} onClick={quitar}>Quitar</button>}
        {puedeEditar && <button type="button" className="ad-bt" disabled={pend || datos.faltaSql} onClick={() => archivo.current?.click()}>{pend ? "Subiendo…" : datos.carga ? "Cambiar plantilla" : "Subir plantilla"}</button>}
        <a className="ad-bt alt" href="/plantillas/analisis-diferencia-novedades.xlsx" download>Plantilla vacía</a>
      </div>
      {datos.faltaSql && <p className="ad-msg mal">Falta correr supabase/migraciones/2026-10-analisis-diferencia.sql en Supabase.</p>}
      {msg && <p className={"ad-msg" + (msg.mal ? " mal" : " bien")} role="status">{msg.t}</p>}
      {errores.length > 0 && <ul className="ad-errores">{errores.slice(0, 30).map((e) => <li key={e}>{e}</li>)}{errores.length > 30 && <li>… y {errores.length - 30} más.</li>}</ul>}
      {datos.avisos.map((a) => <p key={a} className="ad-msg mal">{a}</p>)}

      {/* ---------- LO QUE ALIMENTA EL DÍA ---------- */}
      <div className="ad-fuentes">
        {datos.fuentes.map((f) => (
          <span key={f.nombre} className={"ad-fuente" + (f.ok ? " ok" : "")} title={f.detalle}><i>{f.ok ? "✓" : "!"}</i><b>{f.nombre}</b><small>{f.detalle}</small></span>
        ))}
      </div>

      {/* ---------- LOS TOTALES ---------- */}
      <div className="ad-k ad-k4">
        <div><span>SAP</span><b>{n(tot.sap)}</b><small>unidades</small></div>
        <div><span>CONTEO</span><b>{n(tot.conteo)}</b><small>unidades</small></div>
        <div className="skus" title="SKUs distintos contados en Bodega ese día (sin FÁBRICA)">
          <span>SKUs CONTADOS</span><b>{n(datos.contados?.skus ?? 0)}</b>
          <small>{datos.contados
            ? `${n(datos.contados.producto)} producto · ${n(datos.contados.envase)} envase${datos.contados.otros ? ` · ${n(datos.contados.otros)} otros` : ""} · ${n(datos.contados.renglones)} renglones`
            : "sin conteo"}</small>
        </div>
        <div className={"dif" + (tot.conteo - tot.sap < 0 ? " neg" : "")}><span>DIFERENCIA (CONTEO − SAP)</span><b>{signo(tot.conteo - tot.sap)}</b><small>{filas.filter((f) => f.diferencia !== 0).length} de {filas.length} códigos con diferencia</small></div>
      </div>

      {/* ---------- LAS EXISTENCIAS DE SAP POR ESTADO (ZEXI AG18) ---------- */}
      <Existencias ex={datos.existencias} />

      {/* ---------- LA TABLA ---------- */}
      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Análisis · {largo(fecha)}</h2>
          <label className="ad-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> Solo con diferencia</label>
          {filas.length > 0 && <button type="button" className="ad-bt alt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>}
          {filas.length > 0 && puedeEditar && (
            <button type="button" className="ad-bt" disabled={pend} onClick={guardarYSeguir}
                    title={guardadoEn ? `Ya se guardó el ${new Date(guardadoEn).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: guardar de nuevo lo reemplaza` : "Guarda la foto de este análisis y abre los ajustes"}>
              {pend ? "Guardando…" : guardadoEn ? "Guardar de nuevo y ver ajustes →" : "Guardar y pasar a ajustes →"}
            </button>
          )}
        </div>
        {filas.length === 0 ? <p className="ad-vacio">No hay nada para ese día: falta el conteo, el cuadre o la plantilla.</p> : (
          <div className="ad-tabla-caja">
            <table className="ad-t ad-piv">
              <thead><tr><th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Diferencia</th></tr></thead>
              <tbody>
                {familias.map(([fam, xs]) => {
                  const s = xs.reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
                  return (
                    <Fragment key={fam}>
                      {xs.map((f, i) => {
                        const ab = abierta === f.codigo;
                        return (
                          <Fragment key={f.codigo}>
                            <tr className={ab ? "ab" : ""}>
                              {i === 0 && <td className="fam" rowSpan={xs.length + xs.filter((x) => x.codigo === abierta).length}>{fam}</td>}
                              <td className="mono"><button type="button" className="ad-cod" aria-expanded={ab} onClick={() => setAbierta(ab ? null : f.codigo)}>{f.codigo}</button></td>
                              <td>{f.descripcion}</td>
                              <td className="n">{n(f.sap)}</td>
                              <td className="n">{n(f.conteo)}</td>
                              <td className={"n b" + (f.diferencia < 0 ? " neg" : f.diferencia > 0 ? " pos" : "")}>{signo(f.diferencia)}</td>
                            </tr>
                            {ab && (
                              <tr className="ad-det"><td colSpan={5}>
                                <div className="ad-det-dos">
                                  <div><b>SAP · {n(f.sap)}</b><ul>{f.deSap.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deSap.length && <li><span>— (no está en la ZEXI ni en el balance)</span></li>}</ul></div>
                                  <div><b>CONTEO · {n(f.conteo)}</b><ul>{f.deConteo.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deConteo.length && <li><span>—</span></li>}</ul></div>
                                </div>
                              </td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                      <tr className="sub"><td colSpan={3}>Total {fam.split(" · ")[0]}</td><td className="n">{n(s.sap)}</td><td className="n">{n(s.conteo)}</td><td className={"n" + (s.conteo - s.sap < 0 ? " neg" : "")}>{signo(s.conteo - s.sap)}</td></tr>
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total general</td><td className="n">{n(tot.sap)}</td><td className="n">{n(tot.conteo)}</td><td className={"n" + (tot.conteo - tot.sap < 0 ? " neg" : "")}>{signo(tot.conteo - tot.sap)}</td></tr></tfoot>
            </table>
          </div>
        )}
        <p className="ad-nota">Toca un código para ver de qué partida sale cada lado. Unidades; cajas plásticas y estibas por unidad.
          {datos.noEntran.length > 0 && <> No entran: {datos.noEntran.join(", ")}.</>}</p>
        {informativas.length > 0 && <p className="ad-nota">Informativo (no suma): {informativas.map((x) => `${x.tipo} ${x.codigo} ${n(Number(x.unidades))}`).join(" · ")}.</p>}
      </section>
    </>
  );
}
