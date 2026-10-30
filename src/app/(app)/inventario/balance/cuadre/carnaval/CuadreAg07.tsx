"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaCuadre07, FilaInv07, Partida } from "@/modulos/carnaval/logica";
import { leerZexiAg07 } from "@/modulos/carnaval/leerZexi";
import { agregarPartida, guardarBalanceoAg07, guardarZexiAg07, quitarPartida, quitarZexiAg07 } from "./actions";

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
export function CuadreAg07({ fecha, hoy, filas, inventario, hojaDe, hojaGuardada, zexi, puedeEditar, faltaSql, partidas, faltaSqlPartidas, codigos, guardado, congelado }: {
  fecha: string; hoy: string; filas: FilaCuadre07[]; inventario: FilaInv07[]; hojaDe: string | null; hojaGuardada: boolean; zexi: { archivo: string | null; actualizado_en: string } | null; puedeEditar: boolean; faltaSql: boolean;
  guardado: { en: string; nombre: string | null } | null; congelado?: { en: string; nombre: string | null }; partidas: Partida[]; faltaSqlPartidas: boolean; codigos: { codigo: string; descripcion: string }[];
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
  function guardarBalanceo() {
    setAviso(null);
    start(async () => {
      const r = await guardarBalanceoAg07(fecha);
      if (r.error) { setAviso({ t: r.error, mal: true }); return }
      setAviso({ t: `Balanceo del ${fecha} guardado en el Histórico (almacén AG07).` }); router.refresh();
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
  const [tab, setTab] = useState<1 | 2>(1);
  const [verCeros, setVerCeros] = useState(false);
  const cuadra1 = (f: FilaCuadre07) => !!zexi && Math.abs(f.dif) < 0.5 && !f.bloqRestante && f.movs.length === 0 && !f.sinAlcanzar;
  const pend1 = filas.filter((f) => !cuadra1(f)).length;
  const hayHoja = !!zexi && !!hojaDe;
  const pend2 = hayHoja ? difs2.length : 0;
  const balanceado = !sinFilas && pend1 === 0;
  const todoOk = !!zexi && !sinFilas && pend1 + pend2 === 0;
  const hora = zexi ? new Date(zexi.actualizado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "";
  const bloqTotal = inventario.reduce((t, f) => t + f.bloqueado, 0) + filas.reduce((t, f) => t + f.bloqRestante, 0);
  const movsPorHacer = grupos.reduce((t, [, xs]) => t + xs.length, 0) + (hayHoja ? grupos2.reduce((t, [, xs]) => t + xs.length, 0) : 0);
  const grupoDe = (f: FilaInv07) => (f.codigo === "3500163" ? "Estiba de madera" : f.tipo === "CAJA" ? "Cajas plásticas" : "Envase");
  const ORDEN = ["Envase", "Estiba de madera", "Cajas plásticas"];
  const esCero2 = (f: FilaInv07) => f.unidades === 0 && f.sap === 0 && !f.bloqueado;
  const ocultos2 = inventario.filter(esCero2).length;
  const visibles2 = inventario.filter((f) => verCeros || !esCero2(f));
  const IconoCaja = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true"><path d="M3 8h18v12H3zM9 8V5h6v3M3 13h18" /></svg>;
  const Marca = ({ ok }: { ok: boolean }) => <i className={"cv-marca-e " + (ok ? "ok" : "mal")}>{ok ? "✓" : "!"}</i>;
  return (
    <>
      {congelado && (
        <div className="cv-congelado" role="status">
          <span><b>Así quedó guardado</b> el {new Date(congelado.en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}{congelado.nombre ? ` por ${congelado.nombre}` : ""}. No incluye lo que se haya hecho después.</span>
          <button type="button" className="cs-bt alt" onClick={() => router.push(IR(fecha))}>Editar este día (ver lo de ahora)</button>
        </div>
      )}
      {aviso && <p className={`cv-msg ${aviso.mal ? "mal" : ""}`} role="status">{aviso.t}</p>}
      {faltaSql && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-cuadre-sap.sql en Supabase: sin ella no se sabe qué pallets no tienen entrada de mercancía.</p>}
      <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { void alElegir(e.target.files?.[0]); e.target.value = "" }} />

      <div className="cv-b">
        {/* ---------- COLUMNA IZQUIERDA: estado, ZEXI, resumen y acciones ---------- */}
        <aside className="cv-b-lado">
          <div className="cv-card">
            <h4>Día del cuadre</h4>
            <div className="cv-card-b"><input type="date" className="cv-fecha" value={fecha} max={hoy} disabled={pend} onChange={(e) => e.target.value && router.push(IR(e.target.value))} /></div>
          </div>

          <div className={"cv-estado " + (!zexi || sinFilas ? "" : todoOk ? "ok" : "mal")}>
            <b>{!zexi ? "Sube la ZEXI de AG07" : sinFilas ? "Sin pallets en esta fecha" : todoOk ? "Todo balanceado" : `${pend1 + pend2} por balancear`}</b>
            <span>{zexi ? `ZEXI ${hora}` : "trae AG07 y AG71"}</span>
          </div>

          <div className="cv-card">
            <h4>ZEXI de AG07 {zexi && <em>✓ cargado</em>}</h4>
            <div className="cv-card-b">
              <b className="cv-arch">{zexi ? (zexi.archivo ?? "sin nombre") : "Todavía no hay ZEXI de este día"}</b>
              <div className="cv-botones">
                {puedeEditar && <button type="button" className="cs-bt alt" disabled={pend} onClick={() => input.current?.click()}>{pend ? "Guardando…" : zexi ? "Subir ZEXI nueva (confirmar)" : "Subir la ZEXI de AG07"}</button>}
                {zexi && puedeEditar && <button type="button" className="cs-bt alt" disabled={pend} onClick={quitar}>Quitar</button>}
              </div>
            </div>
          </div>

          {zexi && (
            <div className="cv-card">
              <h4>Resumen</h4>
              <div className="cv-card-b cv-res">
                <div><span>Pallets · materiales</span><b>{filas.length - pend1} / {filas.length} <Marca ok={pend1 === 0} /></b></div>
                <div><span>Inventario · renglones</span><b>{hayHoja ? `${inventario.length - pend2} / ${inventario.length}` : "—"} {hayHoja && <Marca ok={pend2 === 0} />}</b></div>
                <div><span>Bloqueado en AG07</span><b>{ent.format(bloqTotal)} <Marca ok={bloqTotal < 0.5} /></b></div>
                <div><span>Movimientos por hacer</span><b>{movsPorHacer} <Marca ok={movsPorHacer === 0} /></b></div>
                <div><span>Partidas rápidas</span><b>{partidas.length}</b></div>
              </div>
            </div>
          )}

          {zexi && puedeEditar && (
            <div className="cv-card">
              <h4>Acciones</h4>
              <div className="cv-card-b cv-botones v">
                <button type="button" className="cs-bt" disabled={pend} onClick={guardarBalanceo} title="Guarda cómo quedó el cuadre de este día en el Histórico">{guardado ? "Volver a guardar el balanceo" : "Guardar balanceo del día"}</button>
                <button type="button" className="cs-bt alt" onClick={() => abrirPartidas(tab)} title="Partidas rápidas: sumar código y cantidad al conteo o a la ZEXI"><IconoCaja /> Partidas rápidas{partidas.some((x) => x.paso === tab) ? ` · ${partidas.filter((x) => x.paso === tab).length}` : ""}</button>
                {guardado && <small className="cv-nota" style={{ margin: 0 }}>Guardado en el Histórico el {new Date(guardado.en).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}{guardado.nombre ? ` por ${guardado.nombre}` : ""}.</small>}
              </div>
            </div>
          )}
        </aside>

        {/* ---------- COLUMNA DERECHA: los dos pasos ---------- */}
        <div className="cv-b-main">
          <div className="cv-b-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 1} className={tab === 1 ? "on" : ""} onClick={() => setTab(1)}>Paso 1 · Pallets{zexi && !sinFilas && <i className={"cv-chip-t " + (pend1 === 0 ? "ok" : "mal")}>{pend1 === 0 ? `${filas.length} ✓` : `${pend1} !`}</i>}</button>
            <button type="button" role="tab" aria-selected={tab === 2} className={tab === 2 ? "on" : ""} onClick={() => setTab(2)}>Paso 2 · Inventario{hayHoja && <i className={"cv-chip-t " + (pend2 === 0 ? "ok" : "mal")}>{pend2 === 0 ? `${inventario.length} ✓` : `${pend2} !`}</i>}</button>
            <span className="grow" />
            {tab === 2 && hayHoja && ocultos2 > 0 && (
              <button type="button" className="cv-ver0" aria-pressed={verCeros} onClick={() => setVerCeros((v) => !v)} title="Mostrar u ocultar los renglones que están en cero">
                {verCeros ? "Ocultar" : "Ver"} renglones en cero ({ocultos2})
              </button>
            )}
          </div>

          {tab === 1 && (
            <>
              {!zexi && <p className="cv-nota" style={{ margin: "0 0 10px" }}>Sube la ZEXI de AG07 (la que también trae AG71) para cuadrar los pallets.</p>}
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
              {zexi && grupos.length > 0 && (<><h3 className="cv-sub-h">Qué hacer en SAP</h3>{renderGrupos(grupos, "p1")}</>)}
            </>
          )}

          {tab === 2 && (
            <>
              {!zexi ? <p className="cv-nota">Sube la ZEXI de AG07 para compararla con la hoja de Inventario.</p>
                : !hojaDe ? <p className="cv-msg mal">No hay una hoja de Inventario guardada para comparar. Guárdala en la pestaña Inventario.</p>
                : (
                  <>
                    <p className="cv-nota" style={{ margin: "0 0 8px" }}>{hojaGuardada ? `Hoja de Inventario del ${fecha}.` : `El ${fecha} no tiene hoja guardada: se usa la del ${hojaDe}.`}</p>
                    <div className="cs-scroll">
                      <table className="cs-t">
                        <thead><tr><th>Código</th><th>Material</th><th className="n">Estibas</th><th className="n">Cajas</th><th className="n">Hoja (unid.)</th><th className="n">Libre</th><th className="n">Bloqueado</th><th className="n">SAP</th><th className="n">Diferencia</th><th>Estado</th></tr></thead>
                        <tbody>
                          {ORDEN.flatMap((g) => {
                            const rs = visibles2.filter((f) => grupoDe(f) === g);
                            if (!rs.length) return [];
                            return [
                              <tr key={"g-" + g} className="cv-grp"><td colSpan={10}>{g}</td></tr>,
                              ...rs.map((f) => {
                                const cero = Math.abs(f.dif) < 0.5;
                                return (
                                  <tr key={f.codigo} className={cero && !f.bloqueado ? "" : "pend"}>
                                    <td className="mono">{f.codigo}</td>
                                    <td>{f.descripcion}{f.sinFactor && <span className="cv-neg"> · sin cajas por estiba en el maestro</span>}{f.nota && <small className="cs-ext">{f.nota}</small>}</td>
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
                              }),
                            ];
                          })}
                        </tbody>
                      </table>
                    </div>
                    {difs2.length > 0 && (<><h3 className="cv-sub-h">Qué hacer en SAP</h3>{renderGrupos(grupos2, "p2")}</>)}
                  </>
                )}
            </>
          )}
        </div>
      </div>

      {/* LAS REGLAS: cerradas, al final */}
      <details className="cv-reglas">
        <summary>Reglas y avisos <span>cómo se arma el conteo · qué entra y qué no · el bloqueado pasa a libre con el 343</span></summary>
        <p className="cv-nota">
          <b>Paso 1.</b> Conteo = pallets de Control sin los que no tienen entrada de mercancía, por las unidades de cada pallet. La diferencia es lo de SAP menos el conteo: el 3500005 se mide solo en el AG71 libre
          (lo que tenga el AG07 en control-cal no se mira ni se mueve: se ve en rojo y permanece). Una diferencia que coincide con los pallets «sin EM» se arregla sola cuando Peldar registre su entrada de mercancía.
        </p>
        <p className="cv-nota">
          <b>Paso 2.</b> Estibas y cajas pasan a unidades con los factores del maestro (unidades por caja, cajas por estiba). Entra toda la hoja menos PALLET (ya se cuadró en el paso 1); los dos casco de vidrio solo suman sus cajas y sus estibas (no el envase).
          Se compara contra la libre utilización de AG07 en la ZEXI (el control de calidad ya quedó en el paso 1). En AG07 nada debe quedar en bloqueado: todo el bloqueado pasa a libre con el 343.
          Diferencia = SAP − hoja: lo que falta en SAP entra a AG07 desde AG22 y lo que sobra sale hacia AG22, ambos con el 311.
        </p>
      </details>

      {/* CAJA DE HERRAMIENTAS · partidas rápidas */}
      <dialog ref={dlg} className="cv-dlg" style={{ width: "min(860px, calc(100vw - 24px))" }} aria-label="Partidas rápidas">
        <div className="cv-dlg-caja">
          <div className="cv-dlg-cab">
            <div><p>Cuadre SAP AG07 · paso {paso}</p><h2>Partidas rápidas</h2></div>
            <button type="button" className="cv-dlg-x" aria-label="Cerrar" onClick={() => dlg.current?.close()}>×</button>
          </div>
          <div className="cv-dlg-cuerpo">
            <p style={{ margin: 0, fontSize: 13 }}>Código y cantidad en unidades (negativa si resta). Se suma al conteo o a la ZEXI de ese día, solo en el paso {paso === 1 ? "1 (pallets)" : "2 (inventario)"}.</p>
            {faltaSqlPartidas && <p className="cv-msg mal">Falta correr supabase/migraciones/2026-10-carnaval-partidas.sql en Supabase.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
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
              <div style={{ overflowX: "visible" }}><table className="cs-t" style={{ width: "100%", minWidth: 0 }}><thead><tr><th>Código</th><th>Material</th><th className="n">Cantidad</th><th>Suma a</th><th></th></tr></thead>
                <tbody>{partidas.filter((x) => x.paso === paso).map((x) => (
                  <tr key={x.id}><td className="mono">{x.codigo}</td><td>{nombreDe.get(x.codigo) ?? ""}{x.nota && <small className="cs-ext">{x.nota}</small>}</td>
                    <td className="n"><b>{conSigno(x.cantidad)}</b></td><td>{x.lado === "CONTEO" ? "Conteo" : "ZEXI"}</td>
                    <td><button type="button" className="cs-bt alt" style={{ padding: "2px 8px" }} aria-label="Quitar" disabled={pend} onClick={() => quitarP(x.id)}>×</button></td></tr>
                ))}</tbody></table></div>
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
