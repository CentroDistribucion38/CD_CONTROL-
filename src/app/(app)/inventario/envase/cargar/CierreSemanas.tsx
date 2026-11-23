"use client";

import { useState } from "react";
import Link from "next/link";
import type { MaestroPlano, ResumenSemana, SkuSemana } from "@/modulos/inventario/envase/semana";

type Unidad = "hl" | "un" | "cajas" | "estibas";
const UNI: [Unidad, string, string][] = [["hl", "HL", "HL"], ["un", "Unidades", "un."], ["cajas", "Cajas", "cajas"], ["estibas", "Estibas", "est."]];
const corta = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
const DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * CARGAR › EL CIERRE DE LA SEMANA PASADA Y CÓMO VA LA ACTUAL. Lo primero que se ve al subir la MB51 o el reporte de adherencia.
 *
 * Por semana: plan inicial, plan vigente, REAL (reporte de adherencia, si se cargó), notificado y, abajo, los siete días y lo que
 * quedó pendiente por notificar SKU por SKU. En HL, unidades, cajas o estibas (todo se guarda en unidades y se convierte aquí;
 * lo real llega en cajas y pasa a unidades con las unidades por caja).
 *   · Con reporte de adherencia: adherencia = real ÷ plan vigente, y PENDIENTE POR NOTIFICAR = real − notificado.
 *   · Sin reporte: cumplimiento = notificado ÷ plan vigente, y el pendiente = plan − notificado.
 */
export function CierreSemanas({ semanas, maestro, mb51, faltaAdh }: { semanas: ResumenSemana[]; maestro: MaestroPlano; mb51: string | null; faltaAdh: boolean }) {
  const [u, setU] = useState<Unidad>("hl");
  const unom = UNI.find((x) => x[0] === u)![2];
  const conv = (un: number, sku: string): number | null => {
    const x = maestro[sku];
    if (u === "un") return un;
    if (u === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
    if (u === "cajas") return x?.ref ? un / x.ref : null;
    return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
  };
  const fmt = (v: number | null) => v == null ? "—" : u === "estibas" ? v.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("es-CO");
  /* Suma convertida; lo que no se puede convertir (falta un dato del maestro) se cuenta aparte. */
  const suma = (skus: SkuSemana[], k: (s: SkuSemana) => number) => { let t = 0; for (const s of skus) { const v = conv(k(s), s.sku); if (v != null) t += v } return t };
  const real = (s: SkuSemana): number | null => s.realUn;
  const mb = mb51 ? `${corta(mb51.slice(0, 10))} ${mb51.slice(11, 16)}` : "—";

  return (
    <section className="pe-sem" aria-label="Cierre de la semana pasada y semana actual">
      <div className="pe-sem-bar">
        <span>{faltaAdh ? "Para validar contra el reporte de adherencia, corre 2026-11-plan-envase-adherencia.sql en Supabase."
          : semanas[0]?.real ? "" : "Sube el Reporte_de_Adherencia de la semana pasada y el cierre se valida contra lo real."}</span>
        <div className="pe-unidad">Unidad
          <div className="pe-seg" role="group" aria-label="Unidad">
            {UNI.map(([k, t]) => <button key={k} type="button" className={u === k ? "on" : ""} aria-pressed={u === k} onClick={() => setU(k)}>{t}</button>)}
          </div>
        </div>
      </div>
      {semanas.map((s, k) => {
        const dk = (i: number, key: keyof SkuSemana["dias"][number]) => suma(s.skus, (x) => x.dias[i][key]);
        const tot = (key: keyof SkuSemana["dias"][number]) => suma(s.skus, (x) => x.dias.reduce((a, d) => a + d[key], 0));
        const planIni = tot("planIni"), planVig = tot("planVig"), planHasta = tot("planHasta"), notif = tot("notif");
        const base = k === 0 ? planVig : planHasta;
        const hayReal = !!s.real;
        const realT = hayReal ? suma(s.skus, (x) => real(x) ?? 0) : 0;
        const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "—");
        const tag = s.estado === "cerrada" ? <span className="pe-tag t-v">Cerrada</span>
          : s.estado === "abierta" ? <span className="pe-tag t-a">Falta la madrugada del domingo</span>
          : s.estado === "en curso" ? <span className="pe-tag t-g">En curso</span> : <span className="pe-tag t-g">Sin plan</span>;
        /* EL PENDIENTE SE SUMA SKU POR SKU, no como total − total: lo notificado de más en un SKU no tapa lo que falta en otro
           («tengo un pendiente en rojo y arriba sale 0»). Lo de más va aparte. */
        let pend = 0, deMas = 0;
        for (const x of s.skus) {
          const c = hayReal ? real(x) ?? 0 : x.dias.reduce((a, d) => a + (k === 0 ? d.planVig : d.planHasta), 0);
          const nn = x.dias.reduce((a, d) => a + d.notif, 0), v = conv(Math.abs(c - nn), x.sku) ?? 0;
          if (c - nn >= 1) pend += v; else if (nn - c >= 1) deMas += v;
        }
        return (
          <article key={s.lunes} className="pe-card pe-sem-c">
            <header>
              <div><small>{k === 0 ? "SEMANA PASADA · CIERRE" : "SEMANA ACTUAL · A ESTA HORA"}</small>
                <h3>Semana {s.semana ?? "—"} <em>{corta(s.lunes)} al {corta(s.domingo)}</em></h3>
                <Link className="pe-sem-ver" href={`/inventario/envase?d=${s.lunes}&h=${k === 0 ? s.domingo : s.dias.filter((d) => d.estado !== "futuro").pop()?.dia ?? s.lunes}`}>Validar la semana por SKU →</Link></div>
              <div className="pe-sem-tags">{tag}{hayReal && <span className="pe-tag t-v" title={s.real!.archivo ?? ""}>Adherencia cargada</span>}</div>
            </header>
            {s.estado === "sin plan" ? <p className="pe-nota">No hay instructivo ni reporte de adherencia de esta semana.</p> : (<>
              <div className={`pe-sem-k${hayReal ? " cinco" : ""}`}>
                <div><span>Plan inicial</span><b>{fmt(planIni)}<small>{unom}</small></b>{k === 1 && <em>semana completa</em>}</div>
                <div><span>{k === 0 ? "Plan vigente" : "Plan vigente a esta hora"}</span><b>{fmt(base)}<small>{unom}</small></b>{k === 1 && <em>semana: {fmt(planVig)} {unom}</em>}</div>
                {hayReal && <div className="k-am"><span>Real · adherencia</span><b>{fmt(realT)}<small>{unom}</small></b><em>adherencia {pct(realT, planVig)} del plan</em></div>}
                <div><span>Notificado</span><b>{fmt(notif)}<small>{unom}</small></b><em>{hayReal ? `${pct(notif, realT)} de lo real` : `${pct(notif, base)} del plan`}</em></div>
                <div className={pend >= 0.5 ? "mal" : ""}><span>Pendiente por notificar</span><b>{pend >= 0.5 ? fmt(pend) : "0 ✓"}<small>{pend >= 0.5 ? unom : ""}</small></b>
                  <em>{hayReal ? "real − notificado" : "plan − notificado"}, SKU por SKU{deMas >= 0.5 ? ` · ${fmt(deMas)} ${unom} notificados de más en otros SKU` : ""}</em></div>
              </div>
              <table className="pe-t pe-sem-t">
                <thead><tr><th className="l" />{s.dias.map((d, i) => <th key={d.dia}><Link href={`/inventario/envase?d=${d.dia}`}>{DIA[i]} {d.dia.slice(8)}</Link></th>)}</tr></thead>
                <tbody>
                  <tr><td className="l">Plan vigente</td>{s.dias.map((d, i) => { const v = dk(i, "planVig"); return <td key={d.dia} className={d.estado === "futuro" ? "mut" : ""}>{v ? fmt(v) : "—"}</td> })}</tr>
                  <tr><td className="l">Notificado</td>{s.dias.map((d, i) => <td key={d.dia}>{d.estado === "futuro" ? "" : fmt(dk(i, "notif"))}</td>)}</tr>
                  <tr><td className="l">Cumplimiento</td>{s.dias.map((d, i) => {
                    const b = dk(i, "planHasta") || (d.estado === "futuro" ? 0 : dk(i, "planVig")), n = dk(i, "notif"), x = b ? n / b : null;
                    return <td key={d.dia} className={x != null && x < 0.9 ? "mal" : ""}>{d.estado === "futuro" ? "" : x == null ? "—" : `${Math.round(100 * x)} %`}{d.estado === "abierto" && <small className="mut"> abierto</small>}</td>;
                  })}</tr>
                </tbody>
              </table>
              <Pendientes s={s} k={k} hayReal={hayReal} conv={conv} fmt={fmt} real={real} unom={unom} />
            </>)}
          </article>
        );
      })}
      <p className="pe-nota pe-sem-n">Notificado = Z01 − Z02 por fecha de contabilización (lo de madrugada cuenta en su día). Lo real sale del reporte de adherencia
        (cajas × unidades por caja). Última MB51: {mb}. La semana pasada queda cerrada cuando la MB51 trae lo digitado desde las 6:00 del lunes. Cada día abre su Validación.</p>
    </section>
  );
}

/* LO QUE QUEDÓ PENDIENTE POR NOTIFICAR, POR SKU. Con reporte de adherencia: real − notificado; sin él: plan vigente − notificado.
   Del más grande al más chico; lo notificado de más va al final, en gris. En la semana pasada abre de una; en la actual, cerrado. */
function Pendientes({ s, k, hayReal, conv, fmt, real, unom }: {
  s: ResumenSemana; k: number; hayReal: boolean; conv: (un: number, sku: string) => number | null; fmt: (v: number | null) => string;
  real: (s: SkuSemana) => number | null; unom: string;
}) {
  const filas = s.skus.map((x) => {
    const plan = x.dias.reduce((a, d) => a + (k === 0 ? d.planVig : d.planHasta), 0), notif = x.dias.reduce((a, d) => a + d.notif, 0);
    const r = real(x), contra = hayReal ? r ?? 0 : plan, pendUn = contra - notif;
    return { x, plan, notif, r, pendUn, pend: conv(pendUn, x.sku) };
  }).filter((f) => Math.abs(f.pendUn) >= 1 || (hayReal && Math.abs(f.plan - (f.r ?? 0)) >= 1));
  /* Lo que redondeado a la unidad escogida da 0 (p. ej. 0,3 HL) no es pendiente ni «de más»: es ✓. */
  const cuenta = (v: number | null) => v == null || Math.abs(v) >= 0.5;
  const pend = filas.filter((f) => f.pendUn >= 1 && cuenta(f.pend)).sort((a, b) => (b.pend ?? 0) - (a.pend ?? 0));
  const mas = filas.filter((f) => f.pendUn <= -1 && cuenta(f.pend)).sort((a, b) => (a.pend ?? 0) - (b.pend ?? 0));
  const ok = filas.filter((f) => !pend.includes(f) && !mas.includes(f));
  if (!pend.length && !mas.length) return <p className="pe-nota">Nada pendiente por notificar: {hayReal ? "todo lo real" : "todo lo del plan"} está notificado.</p>;
  const t = pend.reduce((a, f) => a + (f.pend ?? 0), 0);
  const fila = (f: (typeof filas)[number], cls = "") => (
    <tr key={f.x.sku} className={cls}>
      <td className="l"><b>{f.x.sku}</b> {f.x.nombre.slice(0, 32)}{cls === "mut" && f.pendUn < 0 ? <small> · de más</small> : null}</td>
      <td>{fmt(conv(f.plan, f.x.sku))}</td>
      {hayReal && <td>{f.r == null ? "—" : fmt(conv(f.r, f.x.sku))}</td>}
      {hayReal && <td>{f.plan ? `${Math.round((100 * (f.r ?? 0)) / f.plan)} %` : "—"}</td>}
      <td>{fmt(conv(f.notif, f.x.sku))}</td>
      <td className={f.pendUn >= 1 && cuenta(f.pend) ? "mal" : ""}><b>{f.pendUn >= 1 && cuenta(f.pend) ? fmt(f.pend) : f.pendUn <= -1 && cuenta(f.pend) ? `+${fmt(f.pend == null ? null : -f.pend)}` : "✓"}</b></td>
    </tr>
  );
  return (
    <details className="pe-sem-p" open={k === 0}>
      <summary><b>Pendiente por notificar</b> · {pend.length} SKU · {fmt(t)} {unom}{mas.length ? ` · ${mas.length} ${mas.length === 1 ? "notificado" : "notificados"} de más` : ""}{hayReal ? " · contra lo real" : " · contra el plan"}</summary>
      <table className="pe-t">
        <thead><tr><th className="l">SKU</th><th>{k === 0 ? "Plan vigente" : "Plan a esta hora"}</th>{hayReal && <th>Real</th>}{hayReal && <th>Adherencia</th>}<th>Notificado</th><th>Pendiente</th></tr></thead>
        <tbody>{pend.map((f) => fila(f))}{mas.map((f) => fila(f, "mut"))}{ok.map((f) => fila(f, "mut"))}</tbody>
      </table>
    </details>
  );
}
