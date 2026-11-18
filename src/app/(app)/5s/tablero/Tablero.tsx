"use client";

/**
 * 5S · TABLERO — el «Dashboard ejecutivo» de INOVA, con lo que de verdad sirve para decidir:
 *   · cómo va cada área contra SU meta (la peor arriba: es a la que hay que ir);
 *   · cuál de las 5 S está floja en todo el centro;
 *   · la tendencia semana a semana;
 *   · los responsables de área, por el puntaje de sus áreas (INOVA rankeaba al auditor, que no es quien ordena);
 *   · lo que más se repite como «no cumple» — lo que una acción correctiva sola arreglaría en todas partes;
 *   · si el cronograma se está cumpliendo;
 *   · el plan de acción: cuántos hallazgos siguen abiertos o vencidos en cada área, y si se cierran a tiempo.
 * Colores de los informes: carbón para lo que está bien, rojo de Bavaria solo bajo la meta.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { logoMarca, useFotoCompartir, type TipoFoto } from "@/components/FotoCompartir";
import { leerPaleta } from "@/app/(app)/quiebra/rotura/HojaFirma";
import {
  NOMBRE_S, fechaLarga, hoyCo, pct,
  type Area5S, type ClaveS, type Hallazgo5S, type Inspeccion5S, type Programada5S, type Responsable5S,
} from "@/modulos/cinco-s/cinco-s";
import { armarTablero5S, piso, restar, type NoCumple5S } from "@/modulos/cinco-s/tablero";

const PERIODOS = [
  { id: "4s", t: "4 semanas", dias: 28 }, { id: "3m", t: "3 meses", dias: 91 },
  { id: "6m", t: "6 meses", dias: 182 }, { id: "1a", t: "12 meses", dias: 365 }, { id: "todo", t: "Todo", dias: 99999 },
] as const;

export function Tablero({ filas, areas, responsables, meta, plan, noCumple, hallazgos }: {
  filas: Inspeccion5S[]; areas: Area5S[]; responsables: Responsable5S[]; meta: number; plan: Programada5S[]; noCumple: NoCumple5S[];
  hallazgos?: Hallazgo5S[];
}) {
  const hoy = hoyCo();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("3m");
  const [areaF, setAreaF] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const P = PERIODOS.find((p) => p.id === periodo)!;
  const desde = restar(hoy, P.dias);
  const T = useMemo(() => armarTablero5S({ filas, areas, responsables, meta, plan, noCumple, desde, hoy, areaF }),
    [filas, areas, responsables, meta, plan, noCumple, desde, hoy, areaF]);
  const { vista, general, metaRef, porArea, bajoMeta, sinAuditar, porS, peorS, semanas, porResp, porAuditor, repetidos, cumplePlan } = T;
  const cerradas = { length: T.cerradas };
  const p5 = piso(porS.map((x) => x.pct), metaRef);
  const esc5 = (v: number) => (100 * Math.max(0, v - p5)) / (100 - p5);

  /* EL DASHBOARD PARA COPIAR: una imagen con todo, para pegar en WhatsApp o en un correo. */
  const nomArea = areas.find((a) => a.id === areaF)?.nombre ?? "Todas las áreas";
  const primera = vista.length ? vista[vista.length - 1].fecha : desde;
  const foto = useFotoCompartir(async (_t: TipoFoto) => {
    const [{ dibujarDashboard5S, nombreDashboard5S }, logo] = await Promise.all([import("@/modulos/cinco-s/foto-5s"), logoMarca()]);
    return { lienzo: dibujarDashboard5S(T, { logo, paleta: leerPaleta(caja.current) ?? undefined, periodo: P.t, area: nomArea, desde: P.id === "todo" ? primera : desde, hasta: hoy }),
      nombre: nombreDashboard5S(hoy, nomArea) };
  }, "Dashboard 5S", { dashboard: "Dashboard 5S" }, undefined, ["dashboard"]);

  const maxRep = repetidos[0]?.n ?? 1;

  /* EL PLAN DE ACCIÓN POR ÁREA: lo pendiente cuenta siempre (no importa de cuándo es); lo cerrado, en el periodo. */
  const planArea = useMemo(() => {
    if (!hallazgos) return null;
    const m = new Map<string, { area: string; vencida: number; sin_plan: number; abierta: number; cerradas: number; aTiempo: number }>();
    for (const h of hallazgos) {
      if (areaF && h.area_id !== areaF) continue;
      if (h.estado === "cerrada" && (h.cerrada_el ?? "").slice(0, 10) < desde) continue;
      const x = m.get(h.area) ?? { area: h.area, vencida: 0, sin_plan: 0, abierta: 0, cerradas: 0, aTiempo: 0 };
      if (h.estado === "cerrada") { x.cerradas++; if (!h.accion_fecha || (h.cerrada_el ?? "").slice(0, 10) <= h.accion_fecha) x.aTiempo++ }
      else x[h.estado]++;
      m.set(h.area, x);
    }
    return [...m.values()].sort((a, b) => b.vencida - a.vencida || b.sin_plan - a.sin_plan || b.abierta - a.abierta || a.area.localeCompare(b.area));
  }, [hallazgos, areaF, desde]);

  return (
    <div className="s5" ref={caja}>
      {foto.vista}
      <header className="s5-cab">
        <div>
          <p className="s5-ojo">5S · ORDEN Y ASEO</p>
          <h1>Tablero</h1>
        </div>
        <div className="s5-filtros">
          <button type="button" className="s5-bt osc" onClick={() => foto.abrir("dashboard")} disabled={foto.armando != null || vista.length === 0}>
            <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>
            {foto.armando ? "Armando…" : "Dashboard para copiar"}
          </button>
          <div className="s5-seg" role="group" aria-label="Periodo">
            {PERIODOS.map((p) => <button key={p.id} type="button" className={periodo === p.id ? "on" : ""} onClick={() => setPeriodo(p.id)}>{p.t}</button>)}
          </div>
          <label className="s5-campo">
            <select value={areaF} onChange={(e) => setAreaF(e.target.value)} aria-label="Área">
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
        </div>
      </header>

      {vista.length === 0 ? (
        <p className="s5-vacio">No hay inspecciones en este periodo. Cambia el periodo o haz la primera en <b>5S › Inspeccionar</b>.</p>
      ) : (<>
        <section className="s5-kpis" aria-label="Resumen">
          <div className={"s5-kpi" + (general != null && general < metaRef ? " bajo" : "")}><span>Cumplimiento</span><b>{pct(general)}</b><small>meta {pct(metaRef)} · {vista.length} inspecciones</small></div>
          <div className={"s5-kpi" + (bajoMeta ? " bajo" : "")}><span>Áreas bajo la meta</span><b>{bajoMeta}<i className="de"> de {porArea.length}</i></b><small>{porArea[0] && porArea[0].pct < porArea[0].meta ? `la más baja: ${porArea[0].nombre}` : "todas cumplen"}</small></div>
          <div className={"s5-kpi" + (peorS && peorS.pct! < metaRef ? " bajo" : "")}><span>La S más floja</span><b>{peorS ? `${peorS.n}S` : "—"}</b><small>{peorS ? `${peorS.nombre} · ${pct(peorS.pct)}` : "—"}</small></div>
          <div className={"s5-kpi" + (cumplePlan != null && cumplePlan < 100 ? " bajo" : "")}><span>Cumplimiento del plan</span><b>{pct(cumplePlan)}</b><small>{cerradas.length ? `${T.hechas} de ${cerradas.length} auditorías programadas` : "sin auditorías programadas"}</small></div>
        </section>

        <div className="s5-tab-grid">
          {/* POR ÁREA */}
          <section className="s5-card s5-tab-ancho">
            <header><h2>Cumplimiento por área</h2><p>Promedio del periodo contra la meta de cada área (la raya). La que más le falta, arriba.</p></header>
            <ul className="s5-barras">
              {porArea.map((a) => (
                <li key={a.id}>
                  <div className="nom"><b>{a.nombre}</b><small>{a.responsable ?? "sin responsable"} · {a.n} {a.n === 1 ? "inspección" : "inspecciones"} · última {fechaLarga(a.ultima)}</small></div>
                  <div className="barra" aria-hidden><i className={a.pct < a.meta ? "bajo" : ""} style={{ width: `${a.pct}%` }} /><em style={{ left: `${a.meta}%` }} /></div>
                  <b className={"v" + (a.pct < a.meta ? " bajo" : "")}>{pct(a.pct)}</b>
                  <span className="hz">{a.hallazgos ? `${a.hallazgos} hallazgos` : "sin hallazgos"}</span>
                </li>
              ))}
            </ul>
            {sinAuditar.length > 0 && !areaF && (
              <p className="s5-aviso" style={{ margin: "0 16px 16px" }}>Sin auditar en 30 días: {sinAuditar.map((a) => a.nombre).join(", ")}. <Link href="/5s/cronograma">Programar</Link></p>
            )}
          </section>

          {/* LAS 5 S */}
          <section className="s5-card">
            <header><h2>Las 5 S</h2><p>Promedio de cada S en el periodo{p5 > 0 ? ` (eje desde ${p5})` : ""}.</p></header>
            <div className="s5-cols-s">
              {porS.map((s) => (
                <div key={s.clave} className={s.pct != null && s.pct < metaRef ? "bajo" : ""}>
                  <b className="v">{s.pct == null ? "—" : Math.round(s.pct)}</b>
                  <div className="col" aria-hidden><i style={{ height: `${esc5(s.pct ?? 0)}%` }} /><em style={{ bottom: `${esc5(metaRef)}%` }} /></div>
                  <span><b>{s.n}S</b>{s.nombre}</span>
                </div>
              ))}
            </div>
          </section>

          {/* TENDENCIA */}
          <section className="s5-card">
            <header><h2>Semana a semana</h2><p>Promedio de las inspecciones de cada semana.</p></header>
            <Tendencia semanas={semanas} meta={metaRef} />
          </section>

          {/* LO QUE MÁS SE REPITE */}
          <section className="s5-card">
            <header><h2>Lo que más se repite</h2><p>Los puntos que más veces no cumplen: una acción ahí arregla varias áreas.</p></header>
            {repetidos.length === 0 ? <p className="s5-vacio" style={{ border: 0 }}>Ningún punto se ha incumplido en este periodo.</p> : (
              <ol className="s5-rep">
                {repetidos.map((r) => (
                  <li key={r.pregunta}>
                    <span className="s">{NOMBRE_S[r.s as ClaveS]?.n}S</span>
                    <div>
                      <p>{r.pregunta}</p>
                      <small>{r.zonas.size ? [...r.zonas].slice(0, 4).join(", ") : "sin zona"}{r.altas ? ` · ${r.altas} de severidad alta` : ""}</small>
                      <div className="barra" aria-hidden><i style={{ width: `${(100 * r.n) / maxRep}%` }} /></div>
                    </div>
                    <b>{r.n}×</b>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* PLAN DE ACCIÓN */}
          {planArea && (
            <section className="s5-card">
              <header><h2>Plan de acción</h2><p>Hallazgos pendientes por área y cuántos se cerraron a tiempo en el periodo. <Link href="/5s/plan">Ir al plan</Link></p></header>
              {planArea.length === 0 ? <p className="s5-vacio" style={{ border: 0 }}>Sin hallazgos.</p> : (
                <table className="s5-tabla">
                  <thead><tr><th>Área</th><th className="num">Vencidos</th><th className="num">Sin plan</th><th className="num">En curso</th><th className="num">Cerrados</th><th className="num">A tiempo</th></tr></thead>
                  <tbody>
                    {planArea.map((x) => (
                      <tr key={x.area}><td><b>{x.area}</b></td>
                        <td className={"num" + (x.vencida ? " nc" : "")}>{x.vencida}</td>
                        <td className={"num" + (x.sin_plan ? " nc" : "")}>{x.sin_plan}</td>
                        <td className="num">{x.abierta}</td><td className="num">{x.cerradas}</td>
                        <td className="num pct">{x.cerradas ? `${Math.round((100 * x.aTiempo) / x.cerradas)} %` : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* RESPONSABLES */}
          <section className="s5-card">
            <header><h2>Responsables de área</h2><p>El puntaje de las áreas que tienen a cargo.</p></header>
            <table className="s5-tabla">
              <thead><tr><th>#</th><th>Responsable</th><th className="num">Insp.</th><th className="num">Hallazgos</th><th className="num">%</th></tr></thead>
              <tbody>
                {porResp.map((r, i) => (
                  <tr key={r.nombre}><td>{i + 1}</td><td><b>{r.nombre}</b><small style={{ display: "block", color: "var(--s5-gris)" }}>{r.areas} {r.areas === 1 ? "área" : "áreas"}</small></td>
                    <td className="num">{r.n}</td><td className={"num" + (r.hallazgos ? " nc" : "")}>{r.hallazgos}</td>
                    <td className={"num pct" + (r.pct < metaRef ? " bajo" : "")}>{pct(r.pct)}</td></tr>
                ))}
              </tbody>
            </table>
            {porAuditor.length > 0 && <p className="s5-sub" style={{ padding: "8px 16px 14px" }}>Auditorías hechas: {porAuditor.map(([n, k]) => `${n} ${k}`).join(" · ")}</p>}
          </section>
        </div>
      </>)}
    </div>
  );
}

/** La tendencia: columnas por semana con la raya de la meta. SVG simple, sin librerías. */
function Tendencia({ semanas, meta }: { semanas: { k: string; s: number; pct: number; n: number }[]; meta: number }) {
  if (semanas.length === 0) return <p className="s5-vacio" style={{ border: 0 }}>Sin datos.</p>;
  const W = 520, H = 200, top = 22, base = 170, izq = 26, ancho = (W - izq) / Math.max(semanas.length, 6);
  const p0 = piso(semanas.map((x) => x.pct), meta);
  const y = (v: number) => base - ((base - top) * Math.max(0, v - p0)) / (100 - p0);
  return (
    <svg className="s5-tend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumplimiento por semana">
      {[p0, Math.round((p0 + 100) / 2), 100].map((v) => <g key={v}><line x1={izq} x2={W} y1={y(v)} y2={y(v)} stroke="#EEF0F3" /><text x="0" y={y(v) + 3} className="eje">{v}</text></g>)}
      {semanas.map((s, i) => {
        const x = izq + i * ancho + ancho * 0.18, w = ancho * 0.64, bajo = s.pct < meta;
        return (
          <g key={s.k}>
            <rect x={x} y={y(s.pct)} width={w} height={base - y(s.pct)} fill={bajo ? "#C8102E" : "#3B3B3B"} />
            <text x={x + w / 2} y={y(s.pct) - 5} textAnchor="middle" className="val">{Math.round(s.pct)}</text>
            <text x={x + w / 2} y={base + 16} textAnchor="middle" className="eje">S{s.s}</text>
          </g>
        );
      })}
      <line x1={izq} x2={W} y1={y(meta)} y2={y(meta)} stroke="#0d0d0d" strokeDasharray="4 3" strokeWidth="1.5" />
      <text x={W - 2} y={y(meta) - 4} textAnchor="end" className="eje fuerte">meta {Math.round(meta)}</text>
    </svg>
  );
}
