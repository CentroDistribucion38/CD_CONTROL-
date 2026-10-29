"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaCuadre07 } from "@/modulos/carnaval/logica";
import { leerZexiAg07 } from "@/modulos/carnaval/leerZexi";
import { guardarZexiAg07, quitarZexiAg07 } from "./actions";

const ent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const conSigno = (v: number) => (v > 0.5 ? "+" : v < -0.5 ? "−" : "") + ent.format(Math.abs(v));
const POS = 9; /* SAP deja 9 posiciones por documento */
const IR = (f?: string) => `/inventario/balance/cuadre?alm=AG07&sub=cuadre${f ? `&fecha=${f}` : ""}`;

/**
 * AG07 · CUADRE SAP, en dos pasos.
 *   PASO 1 · PALLETS: el conteo es el inventario de pallets de Control (sin los que no tienen entrada de mercancía) contra la ZEXI de AG07
 *            en control de calidad. El 3500005 no se toca en control-cal: lo que haya ahí se pasa al AG71 en libre utilización.
 *   PASO 2 · INVENTARIO contra la ZEXI de AG07 (cajas, estibas…): pendiente de definir cómo se convierten a unidades de SAP.
 */
export function CuadreAg07({ fecha, hoy, filas, zexi, puedeEditar, faltaSql }: {
  fecha: string; hoy: string; filas: FilaCuadre07[]; zexi: { archivo: string | null; actualizado_en: string } | null; puedeEditar: boolean; faltaSql: boolean;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [hechos, setHechos] = useState<Record<string, boolean>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function alElegir(f: File | undefined) {
    if (!f) return;
    setAviso(null);
    const l = await leerZexiAg07(f);
    if (l.error) { setAviso({ t: l.error, mal: true }); return }
    start(async () => {
      const r = await guardarZexiAg07(fecha, JSON.stringify(l.filas), f.name);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setHechos({}); setAviso({ t: `ZEXI cargada: ${l.filas.filter((x) => x.almacen === "AG07").length} materiales de AG07 y ${l.filas.filter((x) => x.almacen === "AG71").length} de AG71.` });
      router.refresh();
    });
  }
  function quitar() { start(async () => { const r = await quitarZexiAg07(fecha); if (r.error) setAviso({ t: r.error, mal: true }); else { setHechos({}); router.refresh() } }) }

  /* Los movimientos que hay que hacer en SAP, agrupados por tipo y partidos en documentos de 9 posiciones. */
  const grupos = useMemo(() => {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number }[]>();
    for (const f of filas) for (const mv of f.movs) m.set(mv.titulo, [...(m.get(mv.titulo) ?? []), { codigo: f.codigo, descripcion: f.descripcion, cantidad: mv.cantidad }]);
    return [...m];
  }, [filas]);

  async function copiar(xs: { codigo: string; cantidad: number }[], que: "c" | "q", clave: string) {
    const texto = xs.map((x) => que === "c" ? x.codigo : String(x.cantidad)).join("\r\n");
    try { await navigator.clipboard.writeText(texto) } catch {
      const t = document.createElement("textarea"); t.value = texto; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { document.execCommand("copy") } finally { t.remove() }
    }
    setCopiado(clave); window.setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 2000);
  }

  const sinFilas = filas.length === 0;
  return (
    <>
      {aviso && <p className={`cv-msg ${aviso.mal ? "mal" : ""}`} role="status">{aviso.t}</p>}
      {faltaSql && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql en Supabase: sin ella no se sabe qué pallets no tienen entrada de mercancía.</p>}

      <div className="cv-barra">
        <label>Cuadre al día
          <input type="date" className="cv-fecha" value={fecha} max={hoy} disabled={pend} onChange={(e) => e.target.value && router.push(IR(e.target.value))} />
        </label>
        <span className="grow" />
        {zexi && puedeEditar && <button type="button" className="cs-bt alt" disabled={pend} onClick={quitar}>Quitar la ZEXI</button>}
        {puedeEditar && <button type="button" className="cs-bt" disabled={pend} onClick={() => input.current?.click()}>{pend ? "Guardando…" : zexi ? "Cambiar la ZEXI de AG07" : "Subir la ZEXI de AG07"}</button>}
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />
      </div>

      <h2 className="cs-h"><i>1</i> Cuadre de pallets <small className="cs-h-s">el conteo de Control contra la ZEXI de AG07 en control de calidad</small></h2>
      <p className="cv-nota" style={{ margin: "0 0 10px" }}>
        {zexi ? `ZEXI: ${zexi.archivo ?? "sin nombre"} · subida ${new Date(zexi.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}`
          : "Sube la ZEXI de AG07 (la que también trae AG71) para cuadrar los pallets."}
      </p>

      {sinFilas ? <p className="cv-msg" style={{ borderLeftColor: "var(--fe-linea)", background: "#fff" }}>No hay pallets en Carnaval a esta fecha.</p> : (
        <div className="cv-tabla-cont">
          <table className="cv-tabla">
            <thead><tr>
              <th>Código</th><th>Material</th><th className="r">Pallets</th><th className="r" title="Sin entrada de mercancía: no están en SAP">Sin EM</th>
              <th className="r">Conteo (unid.)</th><th className="r">AG07 control-cal</th><th className="r">AG71 libre</th><th className="r">Diferencia</th><th>Qué hacer</th>
            </tr></thead>
            <tbody>
              {filas.map((f) => {
                const cuadra = zexi && f.movs.length === 0 && Math.abs(f.dif) < 0.5;
                return (
                  <tr key={f.codigo} className={cuadra ? "" : ""}>
                    <td><code>{f.codigo}</code></td>
                    <td>{f.descripcion}</td>
                    <td className="r">{nf.format(f.palletsSap)}</td>
                    <td className="r">{f.pendientes ? <span className="cv-sinem">−{nf.format(f.pendientes)}</span> : ""}</td>
                    <td className="r"><b>{ent.format(f.conteo)}</b></td>
                    <td className="r">{zexi ? ent.format(f.calidad) : "—"}</td>
                    <td className="r">{f.libre71 == null ? "" : zexi ? ent.format(f.libre71) : "—"}</td>
                    <td className="r">{zexi ? (Math.abs(f.dif) < 0.5 ? "0" : <b className="cv-neg">{conSigno(f.dif)}</b>) : "—"}</td>
                    <td>{!zexi ? "—" : f.movs.length ? f.movs.map((m) => `${m.titulo}: ${ent.format(m.cantidad)}`).join(" · ")
                      : f.sinAlcanzar ? "" : <span className="cv-ok">Cuadra</span>}
                      {f.sinAlcanzar > 0 && <span className="cv-neg"> Faltan {ent.format(f.sinAlcanzar)} que no hay en libre ni bloqueado</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cv-nota">
        Conteo = pallets de Control sin los que no tienen entrada de mercancía, por las unidades de cada pallet. La diferencia es lo de SAP menos el conteo: en el 3500005 se mide en el AG71 libre
        después de pasarle lo que tenga el AG07 en control-cal (ese SKU no se toca en control-cal y es el único que va al AG71). Una diferencia que coincide con los pallets «sin EM» se arregla sola
        cuando Peldar registre su entrada de mercancía.
      </p>

      {zexi && grupos.length > 0 && (
        <>
          <h3 className="cv-sub-h">Qué hacer en SAP</h3>
          <div className="cv-movs">
            {grupos.map(([titulo, xs]) => Array.from({ length: Math.ceil(xs.length / POS) }, (_, d) => xs.slice(d * POS, (d + 1) * POS)).map((doc, d) => {
              const clave = `${titulo}|${d}`;
              return (
                <div key={clave} className={"cv-mov" + (hechos[clave] ? " hecho" : "")}>
                  <div className="cv-mov-cab">
                    <b>{titulo}</b><span>Documento {d + 1} · {doc.length} posición{doc.length === 1 ? "" : "es"}</span>
                    <span className="grow" />
                    <button type="button" className="cs-bt alt" onClick={() => void copiar(doc, "c", `${clave}c`)}>{copiado === `${clave}c` ? "✓ Copiado" : "Códigos"}</button>
                    <button type="button" className="cs-bt alt" onClick={() => void copiar(doc, "q", `${clave}q`)}>{copiado === `${clave}q` ? "✓ Copiado" : "Cantidades"}</button>
                    <label className="cv-marca"><input type="checkbox" checked={!!hechos[clave]} onChange={(e) => setHechos((h) => ({ ...h, [clave]: e.target.checked }))} /> Hecho en SAP</label>
                  </div>
                  <table className="cv-tabla"><tbody>
                    {doc.map((x) => <tr key={x.codigo}><td><code>{x.codigo}</code></td><td>{x.descripcion}</td><td className="r"><b>{ent.format(x.cantidad)}</b></td></tr>)}
                  </tbody></table>
                </div>
              );
            }))}
          </div>
        </>
      )}
      {zexi && !sinFilas && grupos.length === 0 && <p className="cv-msg" style={{ borderLeftColor: "#1E6B37", background: "#E7F4EC" }}>Los pallets cuadran con la ZEXI: no hay nada que mover en SAP.</p>}

      <h2 className="cs-h" style={{ marginTop: 22 }}><i>2</i> Inventario contra la ZEXI de AG07 <small className="cs-h-s">cajas, estibas y lo demás de la hoja</small></h2>
      <p className="cv-nota">Este paso se arma después del de pallets. Falta definir cómo se convierte lo de la hoja de Inventario (estibas y cajas) a las unidades de SAP.</p>
    </>
  );
}
