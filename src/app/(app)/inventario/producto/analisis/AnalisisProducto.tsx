"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnalisisProducto as Datos, FilaProducto } from "@/modulos/inventario/producto-dif";
import { leerPlantilla } from "../../balance/analisis/leer-plantilla";
import { guardarAnalisisProducto, guardarNovedadesProducto, guardarZexiProducto, quitarNovedadesProducto } from "./actions";
import { leerZexiProducto, type FilaZexi } from "./leer-zexi";

/**
 * PASO 1 · EL ANÁLISIS DE PRODUCTO — la misma hoja del análisis de Balance, para el cíclico.
 * Arriba la plantilla (se valida en el navegador antes de subir), los totales y la tabla por familia
 * (SAP · CONTEO · DIFERENCIA). Tocar un código abre de qué partida sale cada lado, dónde lo contó Bavaria y
 * cuánto contó el operador.
 */
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const n = (v: number) => nf.format(v);
const signo = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + nf.format(Math.abs(v));
/** La diferencia leída en cajas («−2,5 cajas»), para el producto que se cuenta por caja. */
const enCajas = (u: number, upc: number) => (upc > 1 && u !== 0 ? `${u > 0 ? "+" : "−"}${nf1.format(Math.abs(u) / upc)} cj` : "");

export function AnalisisProducto({ datos, puedeEditar, guardadoEn }: { datos: Datos; puedeEditar: boolean; guardadoEn: string | null }) {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const archivoZexi = useRef<HTMLInputElement>(null);
  /* LA ZEXI LEÍDA, esperando que se escojan los almacenes que cuentan como existencia. */
  const [zexi, setZexi] = useState<{ archivo: string; filas: FilaZexi[]; almacenes: Record<string, boolean> } | null>(null);
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; mal?: boolean } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [soloDif, setSoloDif] = useState(true);
  const { filas, ciclico } = datos;

  const familias = useMemo(() => {
    const m = new Map<string, FilaProducto[]>();
    for (const f of filas) if (!soloDif || f.diferencia !== 0) (m.get(f.familia) ?? m.set(f.familia, []).get(f.familia)!).push(f);
    return [...m];
  }, [filas, soloDif]);
  const tot = filas.reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
  const conZexi = datos.novedades.some((x) => x.tipo === "ZEXI PRODUCTO");
  const zexiCargada = datos.novedades.filter((x) => x.tipo === "ZEXI PRODUCTO");
  const zexiAlm = [...new Set(zexiCargada.map((x) => x.documento ?? "—"))];
  const plantilla = datos.novedades.filter((x) => x.tipo !== "ZEXI PRODUCTO");

  /* SUBIR LA ZEXI TAL CUAL SALE DE SAP: se lee aquí, se escogen los almacenes y se guarda como la existencia. */
  async function leerZexi(a: File) {
    setMsg(null); setErrores([]);
    const r = await leerZexiProducto(a, (sku) => datos.maestroSistema[sku]?.upc ?? 1);
    if (r.error) { setMsg({ mal: true, t: r.error }); return }
    const almacenes = Object.fromEntries([...new Set(r.filas.map((f) => f.almacen))].sort().map((x) => [x, true]));
    setZexi({ archivo: a.name, filas: r.filas, almacenes });
  }
  const guardarZexi = () => ciclico && zexi && start(async () => {
    const elegidas = zexi.filas.filter((f) => zexi.almacenes[f.almacen]);
    const g = await guardarZexiProducto(ciclico.id, JSON.stringify(elegidas.map((f) => ({ almacen: f.almacen, codigo: f.codigo, unidades: f.unidades }))), zexi.archivo);
    if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
    const alm = Object.keys(zexi.almacenes).filter((k) => zexi.almacenes[k]);
    setZexi(null);
    setMsg({ t: `ZEXI cargada: ${elegidas.length} renglones de ${alm.join(", ")}. Abajo está el análisis.` });
    router.refresh();
  });
  const informativas = datos.novedades.filter((x) => x.lado === "NO SUMA");

  async function subir(a: File) {
    if (!ciclico) return;
    setMsg(null); setErrores([]);
    const r = await leerPlantilla(a, datos.maestroSistema);
    if (r.errores.length) {
      setErrores(r.errores);
      setMsg({ mal: true, t: `La plantilla tiene ${r.errores.length} ${r.errores.length === 1 ? "fila con problema" : "filas con problemas"}: corrígelas y vuelve a subirla. No se subió nada.` });
      return;
    }
    if (!r.filas.length) { setMsg({ mal: true, t: "La plantilla no trae filas en NOVEDADES." }); return }
    start(async () => {
      const g = await guardarNovedadesProducto(ciclico.id, JSON.stringify(r.filas.map((f) => ({ tipo: f.tipo, lado: f.lado, documento: f.documento, codigo: f.codigo, unidades: f.unidades }))), a.name);
      if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
      const zx = r.filas.filter((f) => f.tipo === "ZEXI PRODUCTO").length;
      setMsg({ t: `Novedades cargadas: ${r.filas.length} filas${zx ? ` (trae ${zx} de ZEXI PRODUCTO: reemplazan la ZEXI que había)` : ""}. Abajo está el análisis.` });
      router.refresh();
    });
  }
  const quitar = () => ciclico && start(async () => {
    const g = await quitarNovedadesProducto(ciclico.id);
    if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
    setMsg({ t: "Se quitó la plantilla de este cíclico." }); router.refresh();
  });
  const guardarYSeguir = () => ciclico && start(async () => {
    const g = await guardarAnalisisProducto(ciclico.id, ciclico.fecha, JSON.stringify(filas));
    if ("error" in g && g.error) { setMsg({ mal: true, t: g.error }); return }
    router.push(`/inventario/producto/analisis?c=${ciclico.id}&paso=ajustes`);
  });

  /* EL EXCEL: la tabla del análisis y, en otra hoja, de dónde sale cada lado (código · lado · partida). */
  const [armando, setArmando] = useState(false);
  async function bajarExcel() {
    if (!ciclico) return;
    setArmando(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.map((f) => ({
        FAMILIA: f.familia, CÓDIGO: f.codigo, DESCRIPCIÓN: f.descripcion, SAP: f.sap, CONTEO: f.conteo, DIFERENCIA: f.diferencia,
        "DIFERENCIA EN CAJAS": f.upc > 1 ? Math.round((f.diferencia / f.upc) * 10) / 10 : f.diferencia, "CONTÓ EL OPERADOR (no suma)": f.ol ?? "",
      }))), "ANÁLISIS");
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.flatMap((f) => [
        ...f.deConteo.map((p) => ({ CÓDIGO: f.codigo, LADO: "CONTEO", PARTIDA: p.nombre, UNIDADES: p.cantidad })),
        ...f.deSap.map((p) => ({ CÓDIGO: f.codigo, LADO: "SAP", PARTIDA: p.nombre, UNIDADES: p.cantidad })),
      ])), "DE DÓNDE SALE");
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.flatMap((f) => (f.ubicaciones ?? []).map((u) => ({ CÓDIGO: f.codigo, DESCRIPCIÓN: f.descripcion, UBICACIÓN: u.ubicacion, UNIDADES: u.cantidad })))), "CONTEO BAVARIA");
      XLSX.writeFile(libro, `analisis-diferencia-producto-${ciclico.fecha}.xlsx`);
    } catch { setMsg({ mal: true, t: "No se pudo armar el Excel. Vuelve a intentar." }) }
    finally { setArmando(false) }
  }

  if (!ciclico) return (
    <section className="ad-caja">
      <h2>Todavía no hay inventarios cíclicos</h2>
      <p className="ad-nota">Arma uno en <b>Producto → Cíclico</b>, habilita el Contar y, cuando Bavaria haya contado, vuelve aquí con la plantilla.</p>
    </section>
  );

  return (
    <>
      {/* 1 · LA ZEXI (la existencia, lado SAP), tal cual sale de SAP. */}
      <div className="ad-barra">
        <div className="ad-carga">
          <b>{conZexi ? "ZEXI cargada" : "Falta la ZEXI"}</b>
          <small>{conZexi
            ? `${zexiCargada[0]?.archivo ?? "—"} · ${zexiCargada.length} renglones · ${zexiAlm.join(", ")}`
            : "El EXPORT.XLSX de la ZEXI, tal cual sale de SAP: es la existencia (lado SAP). Escoges qué almacenes cuentan."}</small>
        </div>
        <input ref={archivoZexi} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void leerZexi(a) }} />
        {puedeEditar && <button type="button" className="ad-bt" disabled={pend || !!datos.falta} onClick={() => archivoZexi.current?.click()}>{conZexi ? "Cambiar ZEXI" : "Subir ZEXI"}</button>}
      </div>
      {/* 2 · LAS NOVEDADES (opcional): la plantilla de siempre. */}
      <div className="ad-barra">
        <div className="ad-carga">
          <b>{plantilla.length ? "Novedades cargadas" : "Novedades (opcional)"}</b>
          <small>{plantilla.length
            ? `${plantilla[0]?.archivo ?? "—"} · ${plantilla.length} filas`
            : "Palés L1 a L7, producto en fábrica o expo, Z09 pendiente, maquila, mermas, bajas y pendientes del CD: la plantilla de novedades de producto. Se valida antes de subir."}</small>
        </div>
        <input ref={archivo} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) void subir(a) }} />
        {puedeEditar && datos.carga && <button type="button" className="ad-bt alt" disabled={pend} onClick={quitar} title="Quita la ZEXI y las novedades de este cíclico">Quitar todo</button>}
        {puedeEditar && <button type="button" className="ad-bt alt" disabled={pend || !!datos.falta} onClick={() => archivo.current?.click()}>{pend ? "Subiendo…" : plantilla.length ? "Cambiar plantilla" : "Subir plantilla"}</button>}
        <a className="ad-bt alt" href="/plantillas/producto-novedades.xlsx" download>Plantilla vacía</a>
      </div>

      {/* LOS ALMACENES DE LA ZEXI: ventana propia (no la del navegador), recta. */}
      {zexi && (
        <div className="ad-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !pend) setZexi(null) }}>
          <div className="ad-modal-caja" role="dialog" aria-modal="true" aria-labelledby="ad-zexi-t">
            <p className="ad-modal-ojo">ZEXI · {zexi.archivo}</p>
            <h3 id="ad-zexi-t">¿Qué almacenes son la existencia?</h3>
            <p className="ad-modal-sub">Lo de los almacenes marcados va al lado SAP, cada uno como su partida. Solo entran los productos del cíclico; los envases quedan en «No entran».</p>
            <div className="ad-zexi-alm">
              {Object.keys(zexi.almacenes).map((a) => {
                const xs = zexi.filas.filter((f) => f.almacen === a);
                const u = xs.reduce((t, f) => t + f.unidades, 0);
                return (
                  <label key={a} className="ad-chk">
                    <input type="checkbox" checked={zexi.almacenes[a]} onChange={(e) => setZexi({ ...zexi, almacenes: { ...zexi.almacenes, [a]: e.target.checked } })} />
                    <b>{a}</b> · {xs.length} materiales · {n(u)} unidades{xs.some((f) => f.enCajas) ? " (en cajas → unidades)" : ""}
                  </label>
                );
              })}
            </div>
            <div className="ad-modal-acc">
              <button type="button" className="ad-bt alt" disabled={pend} onClick={() => setZexi(null)}>Cancelar</button>
              <button type="button" className="ad-bt" disabled={pend || !Object.values(zexi.almacenes).some(Boolean)} onClick={guardarZexi}>{pend ? "Guardando…" : "Cargar ZEXI"}</button>
            </div>
          </div>
        </div>
      )}
      {datos.falta && <p className="ad-msg mal">{datos.falta}</p>}
      {msg && <p className={"ad-msg" + (msg.mal ? " mal" : " bien")} role="status">{msg.t}</p>}
      {errores.length > 0 && <ul className="ad-errores">{errores.slice(0, 30).map((e) => <li key={e}>{e}</li>)}{errores.length > 30 && <li>… y {errores.length - 30} más.</li>}</ul>}

      <div className="ad-k ad-k4">
        <div><span>SAP</span><b>{n(tot.sap)}</b><small>unidades · ZEXI y novedades</small></div>
        <div><span>CONTEO BAVARIA</span><b>{n(tot.conteo)}</b><small>unidades · {n(datos.contado.bavaria.codigos)} códigos contados</small></div>
        <div className="skus" title="Lo que contó el operador logístico: no suma, sirve para ver si la pareja coincidió">
          <span>CONTÓ EL OPERADOR</span><b>{n(datos.contado.ol.unidades)}</b><small>{n(datos.contado.ol.codigos)} códigos · no suma</small>
        </div>
        <div className={"dif" + (tot.conteo - tot.sap < 0 ? " neg" : "")}><span>DIFERENCIA (CONTEO − SAP)</span><b>{signo(tot.conteo - tot.sap)}</b><small>{filas.filter((f) => f.diferencia !== 0).length} de {filas.length} códigos con diferencia</small></div>
      </div>

      <section className="ad-caja ad-hoja">
        <div className="ad-hoja-cab">
          <h2>Análisis · {ciclico.nombre}</h2>
          <label className="ad-chk"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> Solo con diferencia</label>
          {filas.length > 0 && <button type="button" className="ad-bt alt" disabled={armando} onClick={() => void bajarExcel()}>{armando ? "Armando el Excel…" : "Descargar Excel"}</button>}
          {filas.length > 0 && puedeEditar && (
            <button type="button" className="ad-bt" disabled={pend || !!datos.falta} onClick={guardarYSeguir}
                    title={guardadoEn ? `Ya se guardó el ${new Date(guardadoEn).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: guardar de nuevo lo reemplaza` : "Guarda la foto de este análisis y abre los ajustes"}>
              {pend ? "Guardando…" : guardadoEn ? "Guardar de nuevo y ver ajustes →" : "Guardar y pasar a ajustes →"}
            </button>
          )}
        </div>
        {filas.length === 0 ? <p className="ad-vacio">Todavía no hay nada: falta que Bavaria cuente su hoja o subir la ZEXI.</p> : (
          <div className="ad-tabla-caja">
            <table className="ad-t ad-piv">
              <thead><tr><th>Familia</th><th>Código</th><th>Descripción</th><th className="n">SAP</th><th className="n">Conteo</th><th className="n">Diferencia</th><th className="n">En cajas</th></tr></thead>
              <tbody>
                {familias.map(([fam, xs]) => {
                  const s = filas.filter((f) => f.familia === fam).reduce((t, f) => ({ sap: t.sap + f.sap, conteo: t.conteo + f.conteo }), { sap: 0, conteo: 0 });
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
                              <td className="n">{enCajas(f.diferencia, f.upc)}</td>
                            </tr>
                            {ab && (
                              <tr className="ad-det"><td colSpan={6}>
                                <div className="ad-det-dos">
                                  <div><b>SAP · {n(f.sap)}</b>
                                    <ul>{f.deSap.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deSap.length && <li><span>— (no está en la ZEXI)</span></li>}</ul>
                                  </div>
                                  <div><b>CONTEO · {n(f.conteo)}</b>
                                    <ul>{f.deConteo.map((p) => <li key={p.nombre}><span>{p.nombre}</span><em>{n(p.cantidad)}</em></li>)}{!f.deConteo.length && <li><span>— (Bavaria no lo contó)</span></li>}</ul>
                                    {(f.ubicaciones?.length ?? 0) > 0 && (
                                      <><b>Dónde lo contó Bavaria</b>
                                      <ul>{f.ubicaciones!.map((u) => <li key={u.ubicacion}><span>{u.ubicacion}</span><em>{n(u.cantidad)}</em></li>)}</ul></>
                                    )}
                                    <b title="No suma: es para ver si la pareja coincidió">CONTÓ EL OPERADOR (no suma) · {f.ol == null ? "—" : n(f.ol)}</b>
                                    {f.ol != null && f.ol !== (f.deConteo.find((p) => p.nombre.startsWith("CONTEO BAVARIA"))?.cantidad ?? 0) && (
                                      <p className="ad-nota">El operador y Bavaria no contaron lo mismo en este código: crucen la hoja en Contar antes de ajustar.</p>
                                    )}
                                  </div>
                                </div>
                              </td></tr>
                            )}
                          </Fragment>
                        );
                      })}
                      <tr className="sub"><td colSpan={3}>Total {fam}</td><td className="n">{n(s.sap)}</td><td className="n">{n(s.conteo)}</td><td className={"n" + (s.conteo - s.sap < 0 ? " neg" : "")}>{signo(s.conteo - s.sap)}</td><td /></tr>
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total general</td><td className="n">{n(tot.sap)}</td><td className="n">{n(tot.conteo)}</td><td className={"n" + (tot.conteo - tot.sap < 0 ? " neg" : "")}>{signo(tot.conteo - tot.sap)}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
        <p className="ad-nota">
          Toca un código para ver de qué partida sale cada lado. Unidades (la última columna, en cajas). CONTEO = lo que contó
          Bavaria en el cíclico + las novedades que suman al conteo; SAP = la ZEXI (los almacenes escogidos) + las novedades que suman a SAP.
          {ciclico.familias.length > 0 ? <> Entran los productos de {ciclico.familias.join(", ")} y lo que Bavaria haya contado.</> : <> Las hojas no tienen familias: entran todos los productos.</>}
        </p>
        {datos.noEntran.length > 0 && (
          <details className="ad-nota">
            <summary>No entran: {datos.noEntran.length} {datos.noEntran.length === 1 ? "código" : "códigos"} de la plantilla (envase u otra familia)</summary>
            <p>{datos.noEntran.map((x) => `${x.codigo} (${x.tipo} · ${x.motivo})`).join(" · ")}</p>
          </details>
        )}
        {informativas.length > 0 && <p className="ad-nota">Informativo (no suma): {informativas.map((x) => `${x.tipo} ${x.codigo} ${n(Number(x.unidades))}`).join(" · ")}.</p>}
      </section>
    </>
  );
}
