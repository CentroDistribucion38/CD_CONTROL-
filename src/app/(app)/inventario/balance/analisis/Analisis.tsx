"use client";

import { Existencias } from "./Existencias";
import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Analisis as Datos, FilaAnalisis } from "@/modulos/inventario/analisis-dif";
import { guardarAnalisis, guardarNovedades, quitarNovedades } from "./actions";
import { leerPlantilla } from "./leer-plantilla";
import { Avisos } from "./Avisos";

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
  /* Por defecto solo salen los SKU con diferencia (o con descuadre en otro almacén): lo demás ya cuadró. */
  const [soloDif, setSoloDif] = useState(true);
  const { fecha, filas } = datos;

  const familias = useMemo(() => {
    const m = new Map<string, FilaAnalisis[]>();
    for (const f of filas) if (!soloDif || f.diferencia !== 0 || f.descuadres?.length) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [filas, soloDif]);
  const tot = filas.reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
  const informativas = datos.novedades.filter((x) => x.lado === "NO SUMA");
  /* EN LÍNEA: el envase y la caja de lo que el plan de envase pone a correr ese día. */
  const enLinea = datos.enLinea ?? {};
  const nEnLinea = filas.filter((f) => enLinea[f.codigo]?.length).length;
  const T = ["", "T1", "T2", "T3"];
  const trenesDe = (c: string) => [...new Set((enLinea[c] ?? []).map((x) => x.tren))].join(" · ");
  const detalleLinea = (c: string) => (enLinea[c] ?? []).map((x) => `${x.tren} · ${x.sku} (${x.sap}) · ${x.turnos.map((t) => T[t] ?? t).join(", ")}${x.por === "caja" ? " · su caja" : ""}`).join("\n");

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

      {/* ---------- LO QUE ALIMENTA EL DÍA: una sola fila chica (el detalle sale al pasar el mouse) y los avisos al lado ---------- */}
      <div className="ad-fuentes">
        <Avisos avisos={datos.avisos} />
        {datos.fuentes.map((f) => (
          <span key={f.nombre} className={"ad-fuente" + (f.ok ? " ok" : "")} title={`${f.nombre}: ${f.detalle}`}><i>{f.ok ? "✓" : "!"}</i><b>{f.nombre}</b></span>
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

      {/* ---------- EL CONTEO SIN SEGREGAR: para compararlo con el tablero del libro de inventario ---------- */}
      {datos.contados?.totales && (() => {
        const { donde, estibasAnalisis, plasticasAnalisis } = datos.contados.totales;
        const xs = Object.entries(donde).filter(([, t]) => t.renglones > 0);
        const T = xs.reduce((a, [, t]) => ({ cajas: a.cajas + t.cajas, estibas: a.estibas + t.estibas, plasticas: a.plasticas + t.plasticas, renglones: a.renglones + t.renglones }), { cajas: 0, estibas: 0, plasticas: 0, renglones: 0 });
        const b = donde["BODEGA"] ?? { renglones: 0, cajas: 0, estibas: 0, plasticas: 0 };
        const dEst = estibasAnalisis - b.estibas, dPl = plasticasAnalisis - b.plasticas;
        return (
          <details className="ad-nota ad-nota-d">
            <summary><b>Conteo sin segregar</b> · {n(T.cajas)} cajas · {n(T.estibas)} estibas físicas · {n(T.plasticas)} cajas plásticas<span> · ver cuentas</span></summary>
          <p title="Cajas = total de cajas contadas (producto, envase y cajas vacías). Estibas físicas = estibas completas + 1 por cada saldo. Cajas plásticas = todo lo que viaja en caja, sin barril ni madera. Es la misma cuenta del tablero del libro de inventario.">
            <b>Conteo sin segregar (el tablero, todos los almacenes):</b> {n(T.cajas)} cajas · {n(T.estibas)} estibas físicas · {n(T.plasticas)} cajas plásticas
            {" "}({xs.map(([k, t]) => `${k === "BODEGA" ? "Bodega 38" : k} ${n(t.estibas)} estibas`).join(" · ")}).
            {" "}<b>Este análisis es de AG22 (Bodega 38):</b> Fábrica, AG17 y AG16 se balancean en sus Cuadres SAP y llegan aquí como BALANCE (lo movido) y DESCUADRE (lo que quedó sin cuadrar).
            {" "}Estiba 3500163 <b>{n(estibasAnalisis)}</b>{Math.abs(dEst) < 0.5 ? " = las estibas físicas de Bodega 38." : <>: {signo(dEst)} frente a las estibas físicas de Bodega 38 (las estibas contadas con su propio código entran por sus cajas).</>}
            {" "}Cajas plásticas (E01) <b>{n(plasticasAnalisis)}</b>{Math.abs(dPl) < 0.5 ? " = las de Bodega 38." : <>: {signo(dPl)} frente a las de Bodega 38 (producto sin envase retornable en el maestro, envase excluido, cajas sin factor, o lo que entra por pasivos y balance).</>}
          </p>
          </details>
        );
      })()}

      {/* ---------- LAS EXISTENCIAS DE SAP POR ESTADO (ZEXI AG18) ---------- */}
      <Existencias ex={datos.existencias} />

      {/* ---------- LA TABLA ---------- */}
      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Análisis · {largo(fecha)}</h2>
          <label className="ad-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> Solo con diferencia o descuadre en otro almacén</label>
          {filas.length > 0 && <button type="button" className="ad-bt alt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>}
          {filas.length > 0 && puedeEditar && (
            <button type="button" className="ad-bt" disabled={pend} onClick={guardarYSeguir}
                    title={guardadoEn ? `Ya se guardó el ${new Date(guardadoEn).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: guardar de nuevo lo reemplaza` : "Guarda la foto de este análisis y abre los ajustes"}>
              {pend ? "Guardando…" : guardadoEn ? "Guardar de nuevo y ver ajustes →" : "Guardar y pasar a ajustes →"}
            </button>
          )}
        </div>
        {nEnLinea > 0 && (
          <p className="ad-enl-ley"><span className="ad-enl">EN LÍNEA</span> {nEnLinea} {nEnLinea === 1 ? "código está" : "códigos están"} en producción ese día según el plan de envase: la línea los está tomando mientras se cuenta, así que su diferencia puede no ser real. Pasa el mouse por la etiqueta para ver el SKU y el turno.</p>
        )}
        {filas.length === 0 ? <p className="ad-vacio">No hay nada para ese día: falta el conteo, el cuadre o la plantilla.</p> : (
          <div className="ad-tabla-caja">
            <table className="ad-t ad-piv">
              <thead><tr><th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Diferencia</th></tr></thead>
              <tbody>
                {familias.map(([fam, xs]) => {
                  const s = filas.filter((f) => f.familia === fam).reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
                  return (
                    <Fragment key={fam}>
                      {xs.map((f, i) => {
                        const ab = abierta === f.codigo;
                        return (
                          <Fragment key={f.codigo}>
                            <tr className={(ab ? "ab" : "") + (enLinea[f.codigo]?.length ? " enl" : "")}>
                              {i === 0 && <td className="fam" rowSpan={xs.length + xs.filter((x) => x.codigo === abierta).length}>{fam}</td>}
                              <td className="mono"><button type="button" className="ad-cod" aria-expanded={ab} onClick={() => setAbierta(ab ? null : f.codigo)}>{f.codigo}</button></td>
                              <td>{f.descripcion}{f.descuadres?.map((d) => <span key={d.alm} className="ad-est falta" style={{ marginLeft: 8 }} title={`Quedó sin cuadrar en ${d.alm} después de los 311: SAP tiene ${d.queda > 0 ? "de más" : "de menos"}`}>{d.alm} {signo(d.queda)}</span>)}{enLinea[f.codigo]?.length ? <span className="ad-enl" title={"En línea según el plan de envase:\n" + detalleLinea(f.codigo)}>EN LÍNEA · {trenesDe(f.codigo)}</span> : null}</td>
                              <td className="n">{n(f.sap)}</td>
                              <td className="n">{n(f.conteo)}</td>
                              <td className={"n b" + (f.diferencia < 0 ? " neg" : f.diferencia > 0 ? " pos" : "")}>{signo(f.diferencia)}</td>
                            </tr>
                            {ab && (
                              <tr className="ad-det"><td colSpan={5}>
                                <div className="ad-det-dos">
                                  <div><b>SAP · {n(f.sap)}</b><ul>{f.deSap.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deSap.length && !f.pendSap?.length && <li><span>— (no está en la ZEXI ni en el balance)</span></li>}</ul>
                                    {f.pendSap && f.pendSap.length > 0 && (
                                      <><b title="Falta la ZEXI de las 6 a. m. en la plantilla: cuando la subas, esto se suma a SAP.">BALANCE y DESCUADRE de otros almacenes (aún no suma) · {n(f.pendSap.reduce((t, p) => t + p.cantidad, 0))}</b>
                                      <ul>{f.pendSap.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}</ul></>
                                    )}
                                  </div>
                                  <div><b>CONTEO · {n(f.conteo)}</b><ul>{f.deConteo.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deConteo.length && <li><span>—</span></li>}</ul>
                                  
                                    {f.fuera && f.fuera.length > 0 && (() => { const tf = f.fuera!.reduce((t, p) => t + p.cantidad, 0); return (
                                      <><b title="No suma: estas estibas ya están cuadradas en el Cuadre SAP de su almacén. Se muestran para que el total dé el del tablero.">OTROS ALMACENES · ya cuadrados allá (no suma) · {n(tf)}</b>
                                      <ul>{f.fuera!.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}<li><span><b>Total: Bodega 38 + otros almacenes</b> (el tablero)</span><em><b>{n(f.conteo + tf)}</b></em></li></ul></>
                                    ); })()}
                                  </div>
                                </div>
                                {f.descuadres && f.descuadres.length > 0 && (
                                  <p className="ad-nota"><b>Quedó sin cuadrar en otros almacenes (después de los 311):</b> {f.descuadres.map((d) => `${d.alm} ${signo(d.queda)} (SAP ${d.queda > 0 ? "de más" : "de menos"})`).join(" · ")}. Aparece aunque la diferencia total salga en cero, porque se compensa con otro almacén.</p>
                                )}
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
