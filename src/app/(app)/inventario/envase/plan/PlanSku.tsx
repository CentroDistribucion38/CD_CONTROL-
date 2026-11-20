"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import type { Unidad } from "@/modulos/inventario/envase/calc";
import { useAvisos } from "@/components/Aviso";

export type FilaSku = { sku: string; nombre: string; inicial: number[]; vigente: number[] };
type M = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;
const UNI: [Unidad, string][] = [["hl", "HL"], ["un", "Unidades"], ["cajas", "Cajas"], ["estibas", "Estibas"]];
const dCorto = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const dMes = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");

/**
 * EL PLAN DE LA SEMANA POR SKU. Arriba la misma barra de Análisis de diferencia (semana ‹ ›, qué plan, unidad, copiar y
 * Excel); debajo la tabla: un renglón por SKU y una columna por día, con el total de la semana.
 */
export function PlanSku({ lunes, semana, antes, despues, dias, filas, maestro, deDia, hayPlan }: {
  lunes: string; semana: number | null; antes: string; despues: string; dias: string[]; filas: FilaSku[]; maestro: M;
  deDia: (string | null)[]; hayPlan: boolean;
}) {
  const [avisar, avisos] = useAvisos();
  const [u, setU] = useState<Unidad>("hl");
  const [cual, setCual] = useState<"vigente" | "inicial">("vigente");
  const conv = (un: number, sku: string): number | null => {
    const x = maestro[sku];
    if (u === "un") return un;
    if (u === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
    if (u === "cajas") return x?.ref ? un / x.ref : null;
    return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
  };
  const dec = u === "estibas" || u === "hl" ? 1 : 0;
  const fmt = (v: number | null) => v == null ? "—" : Math.abs(v) < 0.05 ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: 0 });

  const t = useMemo(() => {
    const rs = filas.map((f) => {
      const v = (cual === "vigente" ? f.vigente : f.inicial).map((x) => conv(x, f.sku));
      const ok = v.every((x) => x != null);
      return { ...f, v, tot: ok ? v.reduce<number>((a, x) => a + (x ?? 0), 0) : null, sinDato: !ok && v.some((x, i) => x == null && (cual === "vigente" ? f.vigente : f.inicial)[i] > 0) };
    }).filter((r) => (cual === "vigente" ? r.vigente : r.inicial).some((x) => x > 0))
      .sort((a, b) => (b.tot ?? 0) - (a.tot ?? 0) || a.sku.localeCompare(b.sku));
    const porDia = dias.map((_, i) => rs.reduce((a, r) => a + (r.v[i] ?? 0), 0));
    return { rs, porDia, total: porDia.reduce((a, x) => a + x, 0), sinDato: rs.filter((r) => r.sinDato).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, cual, u, dias]);

  const nomU = UNI.find((x) => x[0] === u)![1];
  const num = (v: number | null) => v == null ? "" : Math.round(v * 10 ** dec) / 10 ** dec;
  const encabezado = ["SKU", "Descripción", ...dias.map(dCorto), "Total semana"];
  const renglones = () => t.rs.map((r) => [r.sku, r.nombre || maestro[r.sku]?.nombre || "", ...r.v.map(num), num(r.tot)]);

  async function copiar() {
    const tsv = [encabezado, ...renglones(), ["", "Total", ...t.porDia.map(num), num(t.total)]].map((l) => l.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(tsv); avisar.bien(`Copiado: ${t.rs.length} SKU en ${nomU}. Pégalo en Excel o en el correo.`) }
    catch { avisar.mal("No se pudo copiar. Usa Descargar Excel.") }
  }
  function excel() {
    const ws = XLSX.utils.aoa_to_sheet([[`Plan ${cual} · semana ${semana ?? ""} · ${dMes(dias[0])} – ${dMes(dias[6])} · en ${nomU}`], [], encabezado, ...renglones(),
      ["", "Total", ...t.porDia.map(num), num(t.total)]]);
    ws["!cols"] = [{ wch: 10 }, { wch: 42 }, ...dias.map(() => ({ wch: 11 })), { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Semana ${semana ?? ""}`.trim());
    XLSX.writeFile(wb, `Plan por SKU - semana ${semana ?? lunes} - ${cual} - ${nomU}.xlsx`);
  }

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
            <button type="button" className={cual === "vigente" ? "on" : ""} aria-pressed={cual === "vigente"} onClick={() => setCual("vigente")}>Vigente</button>
            <button type="button" className={cual === "inicial" ? "on" : ""} aria-pressed={cual === "inicial"} onClick={() => setCual("inicial")}>Inicial</button>
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
      ) : t.rs.length === 0 ? (
        <p className="pe-vacio">{cual === "inicial" ? "Esta semana no tiene plan inicial (los instructivos cargados empiezan después del lunes)." : "El plan de esta semana no trae SKU."}</p>
      ) : (
        <section className="pe-card">
          <h3 className="pe-h3">Plan {cual} · {t.rs.length} SKU <small>en {nomU} · «—» = no se planeó ese día</small></h3>
          <div className="pe-caja">
            <table className="pe-t pe-psku">
              <thead>
                <tr>
                  <th className="l">SKU</th>
                  {dias.map((d, i) => <th key={d} title={cual === "vigente" ? (deDia[i] ? `De: ${deDia[i]}` : "sin plan") : "plan inicial"}>{dCorto(d)}
                    {cual === "vigente" && deDia[i] && deDia[i] !== "inicial" ? <i>corte</i> : null}</th>)}
                  <th className="g">Semana</th>
                </tr>
              </thead>
              <tbody>
                {t.rs.map((r) => (
                  <tr key={r.sku}>
                    <td className="l"><b>{r.sku}</b> {r.nombre || maestro[r.sku]?.nombre}</td>
                    {r.v.map((x, i) => <td key={i} className={x == null ? "na" : ""}>{fmt(x)}</td>)}
                    <td className="g"><b>{fmt(r.tot)}</b></td>
                  </tr>
                ))}
                <tr className="tot">
                  <td className="l">Total</td>
                  {t.porDia.map((x, i) => <td key={i}>{fmt(x)}</td>)}
                  <td className="g">{fmt(t.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {t.sinDato > 0 && <p className="pe-nota">{t.sinDato} SKU sin {u === "estibas" ? "cajas por estiba" : u === "cajas" ? "unidades por caja" : "contenido"} en el maestro: salen con «—» y no suman en {nomU}.</p>}
        </section>
      )}
    </>
  );
}
