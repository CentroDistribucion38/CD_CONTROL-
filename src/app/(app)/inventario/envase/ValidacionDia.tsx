"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendario, type Atajo } from "@/components/CalendarioRango";
import type { Alerta, FilaDia, Unidad } from "@/modulos/inventario/envase/calc";

type M = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;
type Dia = { fecha: string; estado: "cerrado" | "abierto" | "sin" | "futuro" };
const UNI: [Unidad, string, string][] = [["hl", "HL", "HL"], ["un", "Unidades", "un."], ["cajas", "Cajas", "cajas"], ["estibas", "Estibas", "est."]];
const ESTADO = {
  cerrado: ["Cerrado", "la MB51 ya trae la madrugada siguiente"],
  abierto: ["Abierto", "falta la MB51 de después de las 6:00 del día siguiente"],
  sin: ["Sin MB51", "no hay movimientos cargados de este día"],
  futuro: ["Sin datos", "todavía no llega este día"],
} as const;
const corto = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const antesDe = (f: string) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) };
const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");

/**
 * VALIDACIÓN DEL DÍA. Lo principal arriba: las cifras del día y la tabla por SKU (clic en el SKU abre sus órdenes).
 * Las alertas van al final, cerradas, con su conteo a la vista en las cifras.
 */
export function ValidacionDia({ dia, hoy, conDatos, antes, despues, filas, alertas, maestro, hayCorte, estado }: {
  dia: string; hoy: string; conDatos: string[]; antes: string; despues: string; filas: FilaDia[]; alertas: Alerta[]; maestro: M;
  hayCorte: boolean; estado: Dia["estado"];
}) {
  const router = useRouter();
  const ir = (f: string) => router.push(`/inventario/envase?d=${f}`);
  const atajos: Atajo[] = [
    { t: "Ayer", d: () => [antesDe(hoy), antesDe(hoy)] },
    { t: "Hoy", d: () => [hoy, hoy] },
  ];
  const [u, setU] = useState<Unidad>("hl");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const conv = (un: number, sku: string, uu: Unidad = u): number | null => {
    const x = maestro[sku];
    if (uu === "un") return un;
    if (uu === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
    if (uu === "cajas") return x?.ref ? un / x.ref : null;
    return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
  };
  const fmt = (v: number | null, uu: Unidad = u) => v == null ? "—" : uu === "estibas" ? v.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : n0(v);
  const suma = (k: (f: FilaDia) => number) => {
    let s = 0, sinDato = 0;
    for (const f of filas) { const v = conv(k(f), f.sku); if (v == null) { if (k(f)) sinDato++ } else s += v }
    return { s, sinDato };
  };
  const plan = suma((f) => f.planIni), corte = suma((f) => f.planCorte ?? 0), notif = suma((f) => f.notif), madr = suma((f) => f.madrugada);
  const ret = filas.filter((f) => f.retornable);
  const falta = alertas.filter((a) => a.tipo === "falta261");
  const faltaUn = falta.reduce((a, x) => a + x.un, 0);
  const faltaHl = falta.reduce((a, x) => a + (conv(x.un, x.sku, "hl") ?? 0), 0);
  const faltaCj = falta.reduce((a, x) => a + (conv(x.un, x.sku, "cajas") ?? 0), 0);
  const cajaMas = alertas.filter((a) => a.tipo === "caja").reduce((a, x) => a + x.un, 0);
  const perd = alertas.filter((a) => a.tipo === "perdida");
  const unom = UNI.find((x) => x[0] === u)![2];
  const pct = (a: number, b: number) => {
    if (!b) return a ? <span className="mut">sin plan</span> : <span className="mut">—</span>;
    const p = a / b, c = p < 0.9 ? "var(--fe-mal)" : p > 1.1 ? "var(--fe-aviso)" : "var(--fe-bien)";
    return <span className="pe-pct"><u><i style={{ width: `${Math.min(100, 100 * p)}%`, background: c }} /></u><b className={p < 0.9 ? "mal" : ""}>{Math.round(100 * p)} %</b></span>;
  };
  const abrir = (s: string) => setAbiertos((x) => { const y = new Set(x); if (y.has(s)) y.delete(s); else y.add(s); return y });
  const conteo = (t: Alerta["tipo"]) => alertas.filter((a) => a.tipo === t).length;
  const NOMBRE: Record<Alerta["tipo"], [string, string]> = { falta261: ["Falta 261", "t-r"], perdida: ["261 ≠ 531", "t-g"], caja: ["Caja de más", "t-a"], plan: ["Bajo plan", "t-n"] };

  return (
    <>
      {/* EL DÍA: el mismo calendario de Análisis de diferencia y Base (un punto en los días que tienen MB51), con
          flechas para el anterior y el siguiente. Lo escogido va en ámbar, nada en negro. */}
      <div className="ad"><div className="ad-barra pe-barra">
        <div className="ad-dia"><span>Día</span>
          <div className="ad-cal">
            <Calendario desde={dia} hasta={dia} minF="2026-01-01" maxF={hoy} atajos={atajos} unDia marcados={new Set(conDatos)}
                        aplicar={(d) => { if (d && d !== dia) ir(d) }} />
          </div>
        </div>
        <div className="pe-flechas">
          <Link href={`/inventario/envase?d=${antes}`} aria-label="Día anterior">‹</Link>
          {despues <= hoy ? <Link href={`/inventario/envase?d=${despues}`} aria-label="Día siguiente">›</Link> : <span aria-hidden>›</span>}
        </div>
        <div className={`pe-estado e-${estado}`}><b>{ESTADO[estado][0]}</b><small>{ESTADO[estado][1]}</small></div>
        <div className="pe-unidad">Unidad
          <div className="pe-seg" role="group" aria-label="Unidad">
            {UNI.map(([k, t]) => <button key={k} type="button" className={u === k ? "on" : ""} aria-pressed={u === k} onClick={() => setU(k)}>{t}</button>)}
          </div>
        </div>
      </div></div>

      {estado === "abierto" && (
        <p className="pe-aviso"><b>Este día todavía está abierto.</b> La noche se notifica de madrugada con la fecha de hoy: el día se cierra
          cuando subas una MB51 sacada después de las 6:00 del día siguiente. Lo que ves es lo notificado hasta ahora.</p>
      )}

      {filas.length === 0 ? (
        <p className="pe-vacio">No hay plan ni notificaciones para este día. Sube el instructivo de la semana y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : (<>
        <section className="pe-card pe-kpi" aria-label="Cifras del día">
          <div className="k-am"><span className="l">Plan del día</span><b>{fmt(plan.s)}<small>{unom}</small></b>
            <em>{hayCorte ? <>último corte: <b style={{ display: "inline", font: "inherit", fontWeight: 700 }}>{fmt(corte.s)}</b></> : "plan inicial"}</em></div>
          <div><span className="l">Notificado (Z01)</span><b>{fmt(notif.s)}<small>{unom}</small></b><em>{madr.s ? `${fmt(madr.s)} ${unom} digitados al otro día` : "nada digitado al día siguiente"}</em></div>
          <div><span className="l">Cumplimiento</span><b className={plan.s && notif.s / plan.s < 0.9 ? "mal" : ""}>{plan.s ? `${Math.round((100 * notif.s) / plan.s)} %` : "—"}</b>
            <em>{plan.s ? `${notif.s - plan.s > 0 ? "+" : ""}${fmt(notif.s - plan.s)} ${unom} contra el plan` : "sin plan inicial"}</em></div>
          <div className={faltaUn ? "k-r" : ""}><span className="l">Botella sin 261</span><b className={faltaUn ? "mal" : "bien"}>{faltaUn ? n0(faltaUn) : "0 ✓"}</b>
            <em>{faltaUn ? `${n0(faltaHl)} HL · ${n0(faltaCj)} cajas · ${falta.length} ${falta.length === 1 ? "orden" : "órdenes"}` : `${ret.length} SKU retornables`}</em></div>
          <div className={cajaMas ? "k-am" : ""}><span className="l">Caja de más</span><b>{n0(cajaMas)}</b><em>261 de caja sobre Z01 ÷ unidades por caja</em></div>
          <div><span className="l">261 ≠ 531</span><b>{perd.length}</b><em>{perd.length ? "salió de AG22 y no llegó igual a AG28" : "todo lo que salió llegó"}</em></div>
        </section>
        {(plan.sinDato > 0 || notif.sinDato > 0) && u !== "un" && (
          <p className="pe-nota" style={{ padding: 0 }}>Hay SKU sin {u === "estibas" ? "cajas por estiba" : u === "cajas" ? "unidades por caja" : "contenido"} en el maestro: no entran en la suma en {unom}.</p>
        )}

        <section className="pe-card">
          <h3 className="pe-h3">{corto(dia)} · por SKU <small>clic en el SKU abre sus órdenes · envase en botellas y cajas</small></h3>
          <div className="pe-caja">
            <table className="pe-t">
              <thead><tr>
                <th className="l">SKU</th><th>Plan del día</th>{hayCorte && <th>Último corte</th>}<th>Notificado</th><th className="l">Cumplimiento</th><th>Diferencia</th><th title="Notificado con fecha de este día pero digitado en SAP al día siguiente (la producción de la noche)">Digitado al otro día</th>
                <th className="g">Botella teórica</th><th>261 botella</th><th>Falta 261</th><th className="g">Caja teórica</th><th>261 caja</th><th>Caja de más</th>
              </tr></thead>
              <tbody>
                {filas.map((f) => {
                  const ab = abiertos.has(f.sku), dif = f.notif - f.planIni;
                  return (
                    <Fragment key={f.sku}>
                      <tr>
                        <td className="l"><button type="button" className="sku" aria-expanded={ab} onClick={() => abrir(f.sku)}><i>{ab ? "▾" : "▸"}</i><b>{f.sku}</b> {(f.nombre || maestro[f.sku]?.nombre || "").slice(0, 30)}</button></td>
                        <td>{fmt(conv(f.planIni, f.sku))}</td>
                        {hayCorte && <td>{f.planCorte == null ? "—" : fmt(conv(f.planCorte, f.sku))}</td>}
                        <td><b>{fmt(conv(f.notif, f.sku))}</b></td>
                        <td className="l">{pct(f.notif, f.planIni)}</td>
                        <td className={f.planIni && dif < -0.5 ? "mal" : ""}>{dif > 0 ? "+" : ""}{fmt(conv(dif, f.sku))}</td>
                        <td className="mut">{f.madrugada ? fmt(conv(f.madrugada, f.sku)) : "—"}</td>
                        {f.retornable && (f.botTeo || f.b261 || f.c261) ? (<>
                          <td className="g">{n0(f.botTeo)}</td><td>{n0(f.b261)}</td>
                          <td className={f.botTeo - f.b261 > 0.5 ? "mal" : "bien"}>{f.botTeo - f.b261 > 0.5 ? n0(f.botTeo - f.b261) : "✓"}</td>
                          <td className="g">{f.ref ? n0(f.cajaTeo) : "—"}</td><td>{n0(f.c261)}</td>
                          <td className={f.c261 - f.cajaTeo > 0.5 ? "mal" : "bien"}>{f.c261 - f.cajaTeo > 0.5 ? `+${n0(f.c261 - f.cajaTeo)}` : "✓"}</td>
                        </>) : <td className="g na" colSpan={6}>{f.retornable ? "retornable · sin órdenes este día" : "no retornable · sin envase"}</td>}
                      </tr>
                      {ab && (f.ordenes.length ? f.ordenes.map((o) => (
                        <tr key={o.orden} className="sub">
                          <td className="l">Orden <b>{o.orden}</b></td>
                          <td></td>{hayCorte && <td></td>}
                          <td>{fmt(conv(o.z, f.sku))}</td><td className="l mut">{n0(o.z)} un.</td><td></td>
                          <td className="mut">{o.madrugada ? fmt(conv(o.madrugada, f.sku)) : "—"}</td>
                          {f.retornable ? (<>
                            <td className="g">{n0(o.z)}</td><td>{n0(o.b261)}</td>
                            <td className={o.z - o.b261 > 0.5 ? "mal" : "bien"}>{o.z - o.b261 > 0.5 ? n0(o.z - o.b261) : "✓"}</td>
                            <td className="g">{f.ref ? n0(o.z / f.ref) : "—"}</td><td>{n0(o.c261)}</td>
                            <td className={f.ref && o.c261 - o.z / f.ref > 0.5 ? "mal" : "bien"}>{f.ref && o.c261 - o.z / f.ref > 0.5 ? `+${n0(o.c261 - o.z / f.ref)}` : "✓"}</td>
                          </>) : <td className="g na" colSpan={6}></td>}
                        </tr>
                      )) : <tr className="sub"><td className="l mut" colSpan={hayCorte ? 13 : 12}>Sin órdenes notificadas este día.</td></tr>)}
                    </Fragment>
                  );
                })}
                <tr className="tot">
                  <td className="l">Total del día</td><td>{fmt(plan.s)}</td>{hayCorte && <td>{fmt(corte.s)}</td>}<td>{fmt(notif.s)}</td>
                  <td className="l">{plan.s ? `${Math.round((100 * notif.s) / plan.s)} %` : "—"}</td><td>{fmt(notif.s - plan.s)}</td><td>{madr.s ? fmt(madr.s) : "—"}</td>
                  <td className="g"></td><td></td><td>{faltaUn ? n0(faltaUn) : "0"}</td><td className="g"></td><td></td><td>{cajaMas ? `+${n0(cajaMas)}` : "0"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="pe-nota">Notificado = Z01 − Z02 con fecha de contabilización de este día, aunque se haya digitado al día siguiente («Digitado al otro día»: la producción de la noche que se notifica de madrugada). Envase solo en
            retornables: la botella va 1 a 1 con lo producido y la caja es unidades ÷ unidades por caja; lo que salió de AG22 y no llegó igual a AG28 sale en las alertas.</p>
        </section>
      </>)}

      {alertas.length > 0 && (
        <details className="pe-card">
          <summary className="pe-h3">Alertas del día
            {(["falta261", "perdida", "caja", "plan"] as const).filter((t) => conteo(t)).map((t) => <span key={t} className={`pe-tag ${NOMBRE[t][1]}`}>{conteo(t)} {NOMBRE[t][0]}</span>)}
            <small>se recalculan con cada MB51</small>
          </summary>
          {alertas.map((a, i) => (
            <div key={i} className="pe-al">
              <span className={`pe-tag ${NOMBRE[a.tipo][1]}`}>{NOMBRE[a.tipo][0]}</span>
              <div><b>{a.orden ? `Orden ${a.orden} · ` : ""}{a.sku} {(maestro[a.sku]?.nombre ?? "").slice(0, 34)}</b><p>{a.texto}</p></div>
              <span className="q">{a.tipo === "caja" ? `${n0(a.un)} cajas` : a.tipo === "plan" ? `${fmt(conv(a.un, a.sku, "hl"), "hl")} HL` : a.tipo === "perdida" ? n0(a.un) : `${n0(a.un)} bot.`}</span>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
