"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import type { Unidad } from "@/modulos/inventario/envase/calc";
import { useAvisos } from "@/components/Aviso";

export type FilaSku = { sku: string; nombre: string; inicial: number[]; vigente: number[] };
type M = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;
type Vista = "vigente" | "inicial" | "cambios";
const UNI: [Unidad, string][] = [["hl", "HL"], ["un", "Unidades"], ["cajas", "Cajas"], ["estibas", "Estibas"]];
const VISTAS: [Vista, string][] = [["vigente", "Vigente"], ["inicial", "Inicial"], ["cambios", "Qué cambió"]];
const dCorto = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const dMes = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");

/**
 * EL PLAN DE LA SEMANA POR SKU. Arriba la misma barra de Análisis de diferencia (semana ‹ ›, qué plan, unidad, copiar y
 * Excel); debajo la tabla: un renglón por SKU y una columna por día, con el total de la semana.
 *   · Se recorre como una hoja: clic en una celda y con las flechas sube, baja y se mueve de lado; el encabezado y el SKU
 *     se quedan quietos al bajar. «Déjame ir bajando como si fueran celdas que pueda subir y bajar.»
 *   · «Qué cambió»: cada día con lo vigente y, debajo, cuánto subió o bajó contra el plan inicial. «De acuerdo al inicial
 *     y al vigente, cuál fue el incremento o dónde varió, para tenerlo claro.»
 */
export function PlanSku({ lunes, semana, antes, despues, dias, filas, maestro, deDia, hayPlan, vistaInicial = "vigente" }: {
  lunes: string; semana: number | null; antes: string; despues: string; dias: string[]; filas: FilaSku[]; maestro: M;
  deDia: (string | null)[]; hayPlan: boolean; vistaInicial?: Vista;
}) {
  const [avisar, avisos] = useAvisos();
  const [u, setU] = useState<Unidad>("hl");
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [soloCambios, setSoloCambios] = useState(true);
  const [act, setAct] = useState<{ r: number; c: number } | null>(null);
  const hoja = useRef<HTMLDivElement>(null);

  const conv = (un: number, sku: string): number | null => {
    const x = maestro[sku];
    if (u === "un") return un;
    if (u === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
    if (u === "cajas") return x?.ref ? un / x.ref : null;
    return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
  };
  const dec = u === "estibas" || u === "hl" ? 1 : 0;
  const casi0 = (v: number) => Math.abs(v) < (dec ? 0.05 : 0.5);
  const fmt = (v: number | null) => v == null ? "—" : casi0(v) ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  const sig = (v: number) => (v > 0 ? "+" : "−") + Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  const sumar = (xs: (number | null)[]) => xs.every((x) => x != null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null;

  const t = useMemo(() => {
    let rs = filas.map((f) => {
      const ini = f.inicial.map((x) => conv(x, f.sku)), vig = f.vigente.map((x) => conv(x, f.sku));
      const dif = dias.map((_, i) => (vig[i] == null || ini[i] == null ? null : (vig[i] ?? 0) - (ini[i] ?? 0)));
      const v = vista === "inicial" ? ini : vig;
      const tIni = sumar(ini), tVig = sumar(vig);
      return { ...f, ini, vig, dif, v, tIni, tVig, tot: vista === "inicial" ? tIni : tVig, tDif: tIni == null || tVig == null ? null : tVig - tIni,
               cambio: dif.some((d) => d != null && !casi0(d)), sinDato: v.some((x, i) => x == null && (vista === "inicial" ? f.inicial : f.vigente)[i] > 0) };
    }).filter((r) => (vista === "inicial" ? r.inicial : vista === "vigente" ? r.vigente : r.inicial.map((x, i) => x + r.vigente[i])).some((x) => x > 0));
    const todos = rs; /* el total es de la semana completa, aunque se muestren solo los que cambiaron */
    if (vista === "cambios") {
      if (soloCambios) rs = rs.filter((r) => r.cambio);
      rs.sort((a, b) => Math.abs(b.tDif ?? 0) - Math.abs(a.tDif ?? 0) || a.sku.localeCompare(b.sku));
    } else rs.sort((a, b) => (b.tot ?? 0) - (a.tot ?? 0) || a.sku.localeCompare(b.sku));
    const col = (k: "v" | "ini" | "vig" | "dif") => dias.map((_, i) => todos.reduce((a, r) => a + (r[k][i] ?? 0), 0));
    const porDia = col("v"), iniDia = col("ini"), vigDia = col("vig"), difDia = col("dif");
    const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
    return { rs, porDia, iniDia, vigDia, difDia, total: sum(porDia), tIni: sum(iniDia), tVig: sum(vigDia), tDif: sum(difDia),
             nCambian: todos.filter((r) => r.cambio).length, sinDato: rs.filter((r) => r.sinDato).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, vista, u, dias, soloCambios]);

  /* LA HOJA: con las flechas se mueve la celda activa; el navegador baja solo para que se vea. */
  const nCols = dias.length + 1;
  useEffect(() => { setAct((a) => (a && (a.r >= t.rs.length + 1) ? null : a)) }, [t.rs.length]);
  useEffect(() => {
    if (!act) return;
    hoja.current?.querySelector<HTMLElement>(`[data-celda="${act.r}-${act.c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [act]);
  function tecla(e: React.KeyboardEvent) {
    const filasN = t.rs.length + 1; /* + el total */
    const a = act ?? { r: 0, c: 0 };
    const mov: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0] };
    let n: { r: number; c: number } | null = null;
    if (mov[e.key]) n = { r: Math.min(filasN - 1, Math.max(0, a.r + mov[e.key][0])), c: Math.min(nCols - 1, Math.max(0, a.c + mov[e.key][1])) };
    else if (e.key === "Home") n = { r: e.ctrlKey ? 0 : a.r, c: 0 };
    else if (e.key === "End") n = { r: e.ctrlKey ? filasN - 1 : a.r, c: nCols - 1 };
    else if (e.key === "PageDown") n = { r: Math.min(filasN - 1, a.r + 10), c: a.c };
    else if (e.key === "PageUp") n = { r: Math.max(0, a.r - 10), c: a.c };
    else if (e.key === "Escape") { setAct(null); return }
    if (!n) return;
    e.preventDefault();
    setAct(n);
  }

  const nomU = UNI.find((x) => x[0] === u)![1];
  const nomV = VISTAS.find((x) => x[0] === vista)![1];
  const num = (v: number | null) => v == null ? "" : Math.round(v * 10 ** dec) / 10 ** dec;
  const tabla = (): (string | number)[][] => vista === "cambios"
    ? [["SKU", "Descripción", ...dias.map((d) => `${dCorto(d)} (variación)`), "Inicial semana", "Vigente semana", "Variación semana"],
       ...t.rs.map((r) => [r.sku, r.nombre || maestro[r.sku]?.nombre || "", ...r.dif.map(num), num(r.tIni), num(r.tVig), num(r.tDif)]),
       ["", "Total", ...t.difDia.map(num), num(t.tIni), num(t.tVig), num(t.tDif)]]
    : [["SKU", "Descripción", ...dias.map(dCorto), "Total semana"],
       ...t.rs.map((r) => [r.sku, r.nombre || maestro[r.sku]?.nombre || "", ...r.v.map(num), num(r.tot)]),
       ["", "Total", ...t.porDia.map(num), num(t.total)]];

  async function copiar() {
    try { await navigator.clipboard.writeText(tabla().map((l) => l.join("\t")).join("\n")); avisar.bien(`Copiado: ${t.rs.length} SKU (${nomV.toLowerCase()}) en ${nomU}. Pégalo en Excel o en el correo.`) }
    catch { avisar.mal("No se pudo copiar. Usa Descargar Excel.") }
  }
  function excel() {
    const ws = XLSX.utils.aoa_to_sheet([[`Plan de la semana · ${nomV} · semana ${semana ?? ""} · ${dMes(dias[0])} – ${dMes(dias[6])} · en ${nomU}`], [], ...tabla()]);
    ws["!cols"] = [{ wch: 10 }, { wch: 42 }, ...dias.map(() => ({ wch: 13 })), { wch: 14 }, { wch: 14 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Semana ${semana ?? ""}`.trim());
    XLSX.writeFile(wb, `Plan de la semana - semana ${semana ?? lunes} - ${nomV} - ${nomU}.xlsx`);
  }

  const celda = (r: number, c: number) => ({
    "data-celda": `${r}-${c}`,
    className: (act?.r === r && act?.c === c ? "act " : "") + (act && (act.r === r || act.c === c) ? "cruz " : ""),
    onClick: () => { setAct({ r, c }); hoja.current?.focus({ preventScroll: true }) },
  });
  /* En «Qué cambió»: lo vigente y, debajo, cuánto varió contra el inicial. */
  const conCambio = (vig: number | null, d: number | null, ini: number | null) => (
    <>
      <span className="pv-v">{fmt(vig)}</span>
      {d != null && !casi0(d)
        ? <small className={d > 0 ? "sube" : "baja"} title={`Inicial ${fmt(ini)} → vigente ${fmt(vig)}`}>{d > 0 ? "▲" : "▼"} {sig(d)}</small>
        : <small className="igual">{ini != null && !casi0(ini) ? "igual" : ""}</small>}
    </>
  );

  return (
    <>
      {avisos}
      <div className="ad"><div className="ad-barra pe-barra">
        <div className="ad-dia"><span>Semana</span>
          <div className="pe-semana">
            <Link href={`/inventario/envase/plan?s=${antes}`} aria-label="Semana anterior">‹</Link>
            <b>{semana ? `Semana ${semana}` : "Semana"} <small>{dMes(dias[0])} – {dMes(dias[6])}</small></b>
            <Link href={`/inventario/envase/plan?s=${despues}`} aria-label="Semana siguiente">›</Link>
          </div>
        </div>
        <div className="ad-dia"><span>Plan</span>
          <div className="pe-seg" role="group" aria-label="Qué plan">
            {VISTAS.map(([k, x]) => <button key={k} type="button" className={vista === k ? "on" : ""} aria-pressed={vista === k} onClick={() => setVista(k)}>{x}</button>)}
          </div>
        </div>
        <div className="ad-dia"><span>Unidad</span>
          <div className="pe-seg" role="group" aria-label="Unidad">
            {UNI.map(([k, x]) => <button key={k} type="button" className={u === k ? "on" : ""} aria-pressed={u === k} onClick={() => setU(k)}>{x}</button>)}
          </div>
        </div>
        <div className="pe-acciones">
          <button type="button" className="pe-bt" disabled={!t.rs.length} onClick={copiar}>Copiar</button>
          <button type="button" className="pe-bt am" disabled={!t.rs.length} onClick={excel}>Descargar Excel</button>
        </div>
      </div></div>

      {!hayPlan ? (
        <p className="pe-vacio">No hay instructivo cargado para esta semana. Súbelo en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : t.rs.length === 0 && !(vista === "cambios" && soloCambios) ? (
        <p className="pe-vacio">{vista === "inicial" ? "Esta semana no tiene plan inicial (los instructivos cargados empiezan después del lunes)." : "El plan de esta semana no trae SKU."}</p>
      ) : (
        <section className="pe-card">
          <h3 className="pe-h3">
            {vista === "cambios" ? <>Qué cambió del inicial al vigente · {t.nCambian} SKU con cambios
              <span className={`pv-tdif ${t.tDif > 0 ? "sube" : t.tDif < 0 ? "baja" : ""}`}>semana: {fmt(t.tIni)} → {fmt(t.tVig)} {nomU} ({casi0(t.tDif) ? "igual" : sig(t.tDif)})</span>
              <label className="pv-solo"><input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} /> solo los que cambiaron</label></>
              : <>Plan {vista} · {t.rs.length} SKU</>}
            <small>en {nomU} · clic en una celda y muévete con las flechas</small>
          </h3>
          {t.rs.length === 0 ? <p className="pe-nota">Ningún SKU cambió del plan inicial al vigente esta semana.</p> : (
          <div className="pe-caja pe-hoja" ref={hoja} tabIndex={0} onKeyDown={tecla} aria-label="Plan de la semana: muévete con las flechas">
            <table className={`pe-t pe-psku ${vista === "cambios" ? "cmb" : ""}`}>
              <thead>
                <tr>
                  <th className="l">SKU</th>
                  {dias.map((d, i) => <th key={d} className={act?.c === i ? "cruz" : ""} title={vista === "inicial" ? "plan inicial" : deDia[i] ? `De: ${deDia[i]}` : "sin plan"}>{dCorto(d)}
                    {vista !== "inicial" && deDia[i] && deDia[i] !== "inicial" ? <i>corte</i> : null}</th>)}
                  <th className={"g " + (act?.c === dias.length ? "cruz" : "")}>Semana</th>
                </tr>
              </thead>
              <tbody>
                {t.rs.map((r, ri) => (
                  <tr key={r.sku} className={(act?.r === ri ? "fila-act " : "") + (vista !== "cambios" && r.cambio ? "" : "")}>
                    <td className="l"><b>{r.sku}</b> {r.nombre || maestro[r.sku]?.nombre}</td>
                    {dias.map((_, i) => (
                      <td key={i} {...celda(ri, i)} className={celda(ri, i).className + (r.v[i] == null && vista !== "cambios" ? "na" : "") + (vista === "cambios" && r.dif[i] != null && !casi0(r.dif[i]!) ? (r.dif[i]! > 0 ? " c-sube" : " c-baja") : "")}>
                        {vista === "cambios" ? conCambio(r.vig[i], r.dif[i], r.ini[i]) : fmt(r.v[i])}
                      </td>
                    ))}
                    <td {...celda(ri, dias.length)} className={"g " + celda(ri, dias.length).className}>
                      {vista === "cambios" ? conCambio(r.tVig, r.tDif, r.tIni) : <b>{fmt(r.tot)}</b>}
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td className="l">Total{vista === "cambios" && soloCambios ? <small className="igual"> todos los SKU</small> : null}</td>
                  {dias.map((_, i) => (
                    <td key={i} {...celda(t.rs.length, i)}>{vista === "cambios" ? conCambio(t.vigDia[i], t.difDia[i], t.iniDia[i]) : fmt(t.porDia[i])}</td>
                  ))}
                  <td {...celda(t.rs.length, dias.length)} className={"g " + celda(t.rs.length, dias.length).className}>
                    {vista === "cambios" ? conCambio(t.tVig, t.tDif, t.tIni) : fmt(t.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>)}
          {t.sinDato > 0 && <p className="pe-nota">{t.sinDato} SKU sin {u === "estibas" ? "cajas por estiba" : u === "cajas" ? "unidades por caja" : "contenido"} en el maestro: salen con «—» y no suman en {nomU}.</p>}
        </section>
      )}
    </>
  );
}
