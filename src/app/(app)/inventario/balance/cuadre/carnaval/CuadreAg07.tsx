"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaCuadre07, FilaInv07, Partida } from "@/modulos/carnaval/logica";
import { leerZexiAg07 } from "@/modulos/carnaval/leerZexi";
import { agregarPartida, guardarZexiAg07, quitarPartida, quitarZexiAg07 } from "./actions";

const ent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const conSigno = (v: number) => (v > 0.5 ? "+" : v < -0.5 ? "−" : "") + ent.format(Math.abs(v));
const POS = 9; /* SAP deja 9 posiciones por documento */
const IR = (f?: string) => `/inventario/balance/cuadre?alm=AG07&sub=cuadre${f ? `&fecha=${f}` : ""}`;

/**
 * AG07 · CUADRE SAP, en dos pasos.
 *   PASO 1 · PALLETS: el conteo es el inventario de pallets de Control (sin los que no tienen entrada de mercancía) contra la ZEXI de AG07
 *            en control de calidad. El 3500005 se mide solo en AG71 libre; su control-cal de AG07 no se mueve ni cuenta.
 *   PASO 2 · INVENTARIO: la hoja (estibas y cajas, pasadas a unidades con los factores del maestro) contra la ZEXI de AG07.
 */
export function CuadreAg07({ fecha, hoy, filas, inventario, hojaDe, hojaGuardada, zexi, puedeEditar, faltaSql, partidas, faltaSqlPartidas, codigos }: {
  fecha: string; hoy: string; filas: FilaCuadre07[]; inventario: FilaInv07[]; hojaDe: string | null; hojaGuardada: boolean; zexi: { archivo: string | null; actualizado_en: string } | null; puedeEditar: boolean; faltaSql: boolean;
  partidas: Partida[]; faltaSqlPartidas: boolean; codigos: { codigo: string; descripcion: string }[];
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [aviso, setAviso] = useState<{ t: string; mal?: boolean } | null>(null);
  const [hechos, setHechos] = useState<Record<string, boolean>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /* PARTIDAS RÁPIDAS: la caja de herramientas */
  const dlg = useRef<HTMLDialogElement>(null);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [pCod, setPCod] = useState(""); const [pCant, setPCant] = useState(""); const [pLado, setPLado] = useState<"CONTEO" | "SAP">("CONTEO"); const [pNota, setPNota] = useState("");
  const [pMsg, setPMsg] = useState<string | null>(null);
  const abrirPartidas = (n: 1 | 2) => { setPaso(n); setPMsg(null); dlg.current?.showModal() };
  const nombreDe = useMemo(() => new Map(codigos.map((c) => [c.codigo, c.descripcion])), [codigos]);
  function agregar() {
    setPMsg(null);
    const cant = Number(pCant.replace(/\./g, "").replace(",", "."));
    start(async () => {
      const r = await agregarPartida(fecha, paso, pCod, cant, pLado, pNota);
      if (r.error) { setPMsg(r.error); return }
      setPCod(""); setPCant(""); setPNota(""); router.refresh();
    });
  }
  function quitarP(id: string) { start(async () => { const r = await quitarPartida(id); if (r.error) setPMsg(r.error); else router.refresh() }) }

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


  /* Los grupos de movimientos de SAP: documentos de 9 posiciones, con Códigos / Cantidades / Hecho en SAP. */
  function renderGrupos(gs: [string, { codigo: string; descripcion: string; cantidad: number }[]][], pref: string) {
    return (
      <div className="cv-movs">
        {gs.map(([titulo, xs]) => Array.from({ length: Math.ceil(xs.length / POS) }, (_, d) => xs.slice(d * POS, (d + 1) * POS)).map((doc, d) => {
          const clave = `${pref}|${titulo}|${d}`;
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
    );
  }

  /* Paso 2: solo lo que NO da cero. SAP menos que la hoja → hay que sumar; SAP más que la hoja → hay que restar. */
  const difs2 = inventario.filter((f) => Math.abs(f.dif) >= 0.5 || f.bloqueado > 0.5);
  const grupos2 = useMemo(() => {
    const m = new Map<string, { codigo: string; descripcion: string; cantidad: number }[]>();
    /* En AG07 nada debe quedar en bloqueado: primero todo el bloqueado pasa a libre (343); después se cuadra la diferencia con el 311. */
    for (const f of difs2) if (f.bloqueado > 0.5) {
      const t = "Mov 343 en AG07 (Bloqueado → Libre: nada debe quedar en bloqueado)";
      m.set(t, [...(m.get(t) ?? []), { codigo: f.codigo, descripcion: f.descripcion, cantidad: Math.round(f.bloqueado) }]);
    }
    for (const f of difs2) if (Math.abs(f.dif) >= 0.5) {
      const t = `${f.tipo === "ENVASE" ? "Envase" : "Caja plástica"} AG07 · ${f.dif < 0 ? "Mov 311 (AG22 → AG07 libre: SAP tiene menos que la hoja)" : "Mov 311 (AG07 libre → AG22: SAP tiene más que la hoja)"}`;
      m.set(t, [...(m.get(t) ?? []), { codigo: f.codigo, descripcion: f.descripcion, cantidad: Math.abs(f.dif) }]);
    }
    return [...m];
  }, [difs2]);

  const sinFilas = filas.length === 0;
  const balanceado = !sinFilas && filas.every((f) => Math.abs(f.dif) < 0.5 && f.movs.length === 0 && !f.sinAlcanzar && !f.bloqRestante);
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
        {puedeEditar && <button type="button" className="cs-bt" disabled={pend} onClick={() => input.current?.click()}>{pend ? "Guardando…" : zexi ? "Subir la ZEXI nueva (confirmar)" : "Subir la ZEXI de AG07"}</button>}
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />
      </div>

      {zexi && !sinFilas && (() => {
        const p1 = filas.filter((f) => Math.abs(f.dif) >= 0.5 || f.bloqRestante > 0).length;
        const p2 = hojaDe ? difs2.length : 0;
        return p1 + p2 === 0
          ? <p className="cv-msg" style={{ borderLeftColor: "#1E6B37", background: "#E7F4EC" }}><b>Todo quedó balanceado</b> con esta ZEXI: pallets e inventario.</p>
          : <p className="cv-msg mal"><b>Falta balancear:</b> {p1} material(es) en pallets{hojaDe ? ` y ${p2} renglón(es) en inventario` : ""}. Haz los movimientos en SAP y sube la ZEXI nueva: aquí te dice si ya quedó todo en cero.</p>;
      })()}

      <h2 className="cs-h"><i>1</i> Cuadre de pallets <small className="cs-h-s">el conteo de Control contra la ZEXI de AG07 en control de calidad</small>{puedeEditar && <button type="button" className="cs-bt alt" style={{ marginLeft: 10, padding: "4px 8px" }} title="Partidas rápidas: sumar código y cantidad al conteo o a la ZEXI" aria-label="Partidas rápidas" onClick={() => abrirPartidas(1)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M3 8h18v12H3zM9 8V5h6v3M3 13h18" /></svg>{partidas.some((x) => x.paso === 1) && <b style={{ marginLeft: 4 }}>{partidas.filter((x) => x.paso === 1).length}</b>}</button>}</h2>
      <p className="cv-nota" style={{ margin: "0 0 10px" }}>
        {zexi ? `ZEXI: ${zexi.archivo ?? "sin nombre"} · subida ${new Date(zexi.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}`
          : "Sube la ZEXI de AG07 (la que también trae AG71) para cuadrar los pallets."}
      </p>
      {zexi && !sinFilas && (balanceado
        ? <p className="cv-msg" style={{ borderLeftColor: "#1E6B37", background: "#E7F4EC" }}><b>Pallets balanceados.</b> Lo que dice SAP en esta ZEXI coincide con el conteo de Control.</p>
        : <p className="cv-msg mal">Los pallets <b>no están balanceados</b> con esta ZEXI. Haz en SAP lo que sale abajo y luego sube la ZEXI nueva (botón «Subir la ZEXI nueva») para confirmar que quedó en cero.</p>)}

      {sinFilas ? <p className="cv-msg" style={{ borderLeftColor: "var(--fe-linea)", background: "#fff" }}>No hay pallets en Carnaval a esta fecha.</p> : (
        <div className="cs-scroll">
          <table className="cs-t">
            <thead><tr>
              <th>Código</th><th>Material</th><th className="n">Conteo</th><th className="n">SAP antes</th><th className="n">Diferencia</th>
              <th className="n">Cambio en SAP</th><th className="n">SAP después</th><th className="n">Queda</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {filas.map((f) => {
                const sapAntes = f.libre71 != null ? f.libre71 : f.calidad;
                const queda = f.dif < -0.5 ? -f.sinAlcanzar : 0;
                const cuadra = !!zexi && Math.abs(f.dif) < 0.5 && !f.bloqRestante;
                const rojo = !!zexi && f.libre71 != null && f.calidad > 0.5;
                return (
                  <tr key={f.codigo} className={!zexi || cuadra ? "" : "pend"}>
                    <td className="mono">{f.codigo}</td>
                    <td>{f.descripcion}</td>
                    <td className="n">{ent.format(f.conteo)}{(f.partidas.conteo !== 0 || f.partidas.sap !== 0) && <small className="cs-ext">partidas: {f.partidas.conteo !== 0 && `${conSigno(f.partidas.conteo)} al conteo`}{f.partidas.conteo !== 0 && f.partidas.sap !== 0 && " · "}{f.partidas.sap !== 0 && `${conSigno(f.partidas.sap)} a la ZEXI`}</small>}{f.pendientes > 0 && <small className="cs-ext" title="Pallets sin entrada de mercancía: no están en SAP y no cuentan">{nf.format(f.palletsSap)} pallets · sin EM −{nf.format(f.pendientes)}</small>}</td>
                    <td className="n">{zexi ? ent.format(sapAntes) : "—"}<small className="cs-ext">{f.libre71 != null ? "AG71 libre" : "AG07 control-cal"}</small></td>
                    <td className="n">{!zexi ? "—" : cuadra ? "0" : conSigno(f.dif)}</td>
                    <td className="n">{!zexi || !f.movs.length ? "—" : f.movs.map((m) => <div key={m.titulo + m.cantidad}>{ent.format(m.cantidad)} <em>{m.titulo.replace(/^Mov /, "")}</em></div>)}</td>
                    <td className="n">{zexi ? ent.format(f.conteo + queda) : "—"}</td>
                    <td className="n"><b>{!zexi ? "—" : queda ? conSigno(queda) : "0"}</b></td>
                    <td>
                      {!zexi ? "—" : cuadra ? <span className="cs-chip ok">Balanceado</span>
                        : f.bloqRestante > 0 && Math.abs(f.dif) < 0.5 ? <span className="cs-chip in">Quedan {ent.format(f.bloqRestante)} en bloqueado: pasarlos a libre (343)</span>
                        : f.sinAlcanzar > 0 ? <span className="cs-chip in">Faltan {ent.format(f.sinAlcanzar)} que no hay en libre ni bloqueado</span>
                        : <span className="cs-chip in">Falta hacer {f.movs.length > 1 ? "los movimientos" : "el movimiento"} en SAP</span>}
                      {rojo && <div className="cv-neg" style={{ marginTop: 4 }}>AG07 control de calidad: {ent.format(f.calidad)} no se puede mover y no cuenta; esa cantidad permanece ahí.</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cv-nota">
        Conteo = pallets de Control sin los que no tienen entrada de mercancía, por las unidades de cada pallet. La diferencia es lo de SAP menos el conteo: el 3500005 se mide solo en el AG71 libre
        (lo que tenga el AG07 en control-cal no se mira ni se mueve: se ve en rojo y permanece). Una diferencia que coincide con los pallets «sin EM» se arregla sola
        cuando Peldar registre su entrada de mercancía.
      </p>

      {zexi && grupos.length > 0 && (
        <>
          <h3 className="cv-sub-h">Qué hacer en SAP</h3>
          {renderGrupos(grupos, "p1")}
        </>
      )}

      <h2 className="cs-h" style={{ marginTop: 22 }}><i>2</i> Inventario contra la ZEXI de AG07 <small className="cs-h-s">cajas, estibas y lo demás de la hoja</small>{puedeEditar && <button type="button" className="cs-bt alt" style={{ marginLeft: 10, padding: "4px 8px" }} title="Partidas rápidas: sumar código y cantidad al conteo o a la ZEXI" aria-label="Partidas rápidas" onClick={() => abrirPartidas(2)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M3 8h18v12H3zM9 8V5h6v3M3 13h18" /></svg>{partidas.some((x) => x.paso === 2) && <b style={{ marginLeft: 4 }}>{partidas.filter((x) => x.paso === 2).length}</b>}</button>}</h2>
      {!zexi ? <p className="cv-nota">Sube la ZEXI de AG07 para compararla con la hoja de Inventario.</p>
        : !hojaDe ? <p className="cv-msg mal">No hay una hoja de Inventario guardada para comparar. Guárdala en la pestaña Inventario.</p>
        : (
          <>
            <p className="cv-nota" style={{ margin: "0 0 10px" }}>
              {hojaGuardada ? `Hoja de Inventario del ${fecha}.` : `El ${fecha} no tiene hoja guardada: se usa la del ${hojaDe}.`} Estibas y cajas pasan a unidades con los factores del maestro (unidades por caja, cajas por estiba).
              Entra toda la hoja menos PALLET (ya se cuadró en el paso 1) y el casco de vidrio, y se compara contra la libre utilización de AG07 en la ZEXI (el control de calidad ya quedó en el paso 1). En AG07 nada debe quedar en bloqueado: todo el bloqueado pasa a libre con el 343.
            </p>
            {difs2.length === 0
              ? <p className="cv-msg" style={{ borderLeftColor: "#1E6B37", background: "#E7F4EC" }}><b>Inventario balanceado.</b> Todo lo de la hoja (envase y cajas) coincide con la ZEXI.</p>
              : <p className="cv-msg mal">Hay <b>{difs2.length}</b> renglón(es) del inventario que no cuadran con la ZEXI. Haz en SAP lo que sale abajo y sube la ZEXI nueva para confirmar.</p>}
            <div className="cs-scroll">
              <table className="cs-t">
                <thead><tr><th>Código</th><th>Material</th><th className="n">Estibas</th><th className="n">Cajas</th><th className="n">Hoja (unid.)</th><th className="n">Libre</th><th className="n">Bloqueado</th><th className="n">SAP</th><th className="n">Diferencia</th><th>Estado</th></tr></thead>
                <tbody>
                  {inventario.map((f, i) => {
                    const cero = Math.abs(f.dif) < 0.5;
                    return (
                      <tr key={f.codigo} className={(cero && !f.bloqueado ? "" : "pend ") + (i > 0 && inventario[i - 1].tipo !== f.tipo ? "cv-corte" : "")}>
                        <td className="mono">{f.codigo}</td>
                        <td>{f.descripcion}{f.tipo === "CAJA" && <span className="cv-tag" style={{ marginLeft: 6 }}>Caja</span>}{f.sinFactor && <span className="cv-neg"> · sin cajas por estiba en el maestro</span>}{f.nota && <small className="cs-ext">{f.nota}</small>}</td>
                        <td className="n">{f.estibas ? nf.format(f.estibas) : ""}</td>
                        <td className="n">{f.cajas ? nf.format(f.cajas) : ""}</td>
                        <td className="n"><b>{ent.format(f.unidades)}</b></td>
                        <td className="n">{ent.format(f.libre)}</td>
                        <td className="n">{f.bloqueado ? <b className="cv-neg">{ent.format(f.bloqueado)}</b> : ""}</td>
                        <td className="n">{ent.format(f.sap)}</td>
                        <td className="n">{cero ? "0" : <b>{conSigno(f.dif)}</b>}</td>
                        <td>{cero && !f.bloqueado ? <span className="cs-chip ok">Balanceado</span> : cero ? <span className="cs-chip in">Pasar {ent.format(f.bloqueado)} de bloqueado a libre (343)</span> : <span className="cs-chip in">{f.dif < 0 ? `Faltan ${ent.format(-f.dif)} en SAP` : `Sobran ${ent.format(f.dif)} en SAP`}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {difs2.length > 0 && (<><h3 className="cv-sub-h">Qué hacer en SAP</h3>{renderGrupos(grupos2, "p2")}</>)}
            <p className="cv-nota">Diferencia = SAP − hoja. Positiva: SAP tiene más de lo contado; negativa: SAP tiene menos. Lo que falta en SAP entra a AG07 desde AG22 y lo que sobra sale hacia AG22, ambos con el 311. El casco de vidrio no entra: sale del módulo de Casco.</p>
          </>
        )}

      {/* CAJA DE HERRAMIENTAS · partidas rápidas */}
      <dialog ref={dlg} className="cv-dlg chico" aria-label="Partidas rápidas">
        <div className="cv-dlg-caja">
          <div className="cv-dlg-cab">
            <div><p>Cuadre SAP AG07 · paso {paso}</p><h2>Partidas rápidas</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlg.current?.close()}>×</button>
          </div>
          <div className="cv-dlg-cuerpo">
            <p style={{ margin: 0, fontSize: 13 }}>Código y cantidad en unidades (negativa si resta). Se suma al conteo o a la ZEXI de ese día, solo en el paso {paso === 1 ? "1 (pallets)" : "2 (inventario)"}.</p>
            {faltaSqlPartidas && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-partidas.sql en Supabase.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="cv-form" style={{ display: "flex", flexDirection: "column", gap: 4 }}>Código
                <input type="text" list="cv-codigos-partida" className="cv-cel" style={{ width: "100%", textAlign: "left" }} value={pCod} onChange={(e) => setPCod(e.target.value)} placeholder="3500005" autoComplete="off" />
                <datalist id="cv-codigos-partida">{(paso === 1 ? filas.map((f) => ({ codigo: f.codigo, descripcion: f.descripcion })) : codigos).map((c) => <option key={c.codigo} value={c.codigo}>{c.descripcion}</option>)}</datalist>
              </label>
              <label className="cv-form" style={{ display: "flex", flexDirection: "column", gap: 4 }}>Cantidad (unid.)
                <input type="text" inputMode="decimal" className="cv-cel" style={{ width: "100%", textAlign: "right" }} value={pCant} onChange={(e) => setPCant(e.target.value)} placeholder="0" />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={"cs-bt" + (pLado === "CONTEO" ? "" : " alt")} onClick={() => setPLado("CONTEO")}>Suma al conteo</button>
              <button type="button" className={"cs-bt" + (pLado === "SAP" ? "" : " alt")} onClick={() => setPLado("SAP")}>Suma a la ZEXI (SAP)</button>
            </div>
            <label className="cv-form" style={{ display: "flex", flexDirection: "column", gap: 4 }}>Nota (opcional)
              <input type="text" className="cv-cel" style={{ width: "100%", textAlign: "left" }} value={pNota} onChange={(e) => setPNota(e.target.value)} placeholder="Por ejemplo: en tránsito" />
            </label>
            {pMsg && <p className="cv-msg mal" role="alert">{pMsg}</p>}
            {partidas.some((x) => x.paso === paso) && (
              <table className="cs-t"><thead><tr><th>Código</th><th>Material</th><th className="n">Cantidad</th><th>Suma a</th><th></th></tr></thead>
                <tbody>{partidas.filter((x) => x.paso === paso).map((x) => (
                  <tr key={x.id}><td className="mono">{x.codigo}</td><td>{nombreDe.get(x.codigo) ?? ""}{x.nota && <small className="cs-ext">{x.nota}</small>}</td>
                    <td className="n"><b>{conSigno(x.cantidad)}</b></td><td>{x.lado === "CONTEO" ? "Conteo" : "ZEXI"}</td>
                    <td><button type="button" className="cs-bt alt" style={{ padding: "2px 8px" }} aria-label="Quitar" disabled={pend} onClick={() => quitarP(x.id)}>×</button></td></tr>
                ))}</tbody></table>
            )}
          </div>
          <div className="cv-dlg-pie">
            <span className="cv-nota" style={{ margin: 0 }}>Las partidas son de este día ({fecha}).</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className="cs-bt alt" onClick={() => dlg.current?.close()}>Cerrar</button>
              <button type="button" className="cs-bt" disabled={pend || !pCod.trim() || !pCant.trim()} onClick={agregar}>{pend ? "Guardando…" : "Agregar partida"}</button>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
