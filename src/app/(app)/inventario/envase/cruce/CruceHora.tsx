"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendario, type Atajo } from "@/components/CalendarioRango";
import type { Unidad } from "@/modulos/inventario/envase/calc";

export type FilaCruceHora = { tren: string; sku: string; planDia: number; planHasta: number; /** la primera hora con plan en esa línea */ desde: number | null };
type Env = { cod: string; txt: string } | null;
export type DetalleSku = { nombre: string; notif: number; retornable: boolean; ref: number; b261: number; c261: number; botella: Env; caja: Env };
type M = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;

const UNI: [Unidad, string, string][] = [["hl", "HL", "HL"], ["un", "Unidades", "un."], ["cajas", "Cajas", "cajas"], ["estibas", "Estibas", "est."]];
const HORAS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const TURNOS = ["06:00", "14:00", "22:00"];
const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
const antesDe = (f: string) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) };
const corto = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const nombreLinea = (t: string) => t.replace(/^TREN-?\s*/i, "Línea ");
const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * CRUCE A LA HORA. Arriba el día y la hora (por defecto, ahora); después las cifras de producto y de envase, la tabla de
 * producto por línea y la de envase por SKU retornable. Lo principal primero; las notas, al pie.
 */
export function CruceHora({ dia, hoy, hora, esAhora, mb51, filas, detalle, maestro }: {
  dia: string; hoy: string; hora: string; esAhora: boolean; mb51: string | null;
  filas: FilaCruceHora[]; detalle: Record<string, DetalleSku>; maestro: M;
}) {
  const router = useRouter();
  const ir = (d: string, h?: string) => router.push(`/inventario/envase/cruce?d=${d}${h ? `&h=${h}` : ""}`);
  const atajos: Atajo[] = [{ t: "Ayer", d: () => [antesDe(hoy), antesDe(hoy)] }, { t: "Hoy", d: () => [hoy, hoy] }];
  const [u, setU] = useState<Unidad>("hl");
  const unom = UNI.find((x) => x[0] === u)![2];
  const conv = (un: number, sku: string, uu: Unidad = u): number | null => {
    const x = maestro[sku];
    if (uu === "un") return un;
    if (uu === "hl") return x?.ml ? (un * x.ml) / 1e5 : null;
    if (uu === "cajas") return x?.ref ? un / x.ref : null;
    return x?.ref && x.cpe ? un / x.ref / x.cpe : null;
  };
  const fmt = (v: number | null) => v == null ? "—" : u === "estibas" ? v.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : n0(v);
  const nombre = (sku: string) => (detalle[sku]?.nombre || maestro[sku]?.nombre || "").slice(0, 30);

  /* La MB51: lo notificado y el 261 llegan hasta ahí. Si es de antes de la hora escogida (más de una hora), se avisa. */
  const mb51Txt = mb51 ? (mb51.slice(0, 10) === dia ? mb51.slice(11, 16) : `${corto(mb51.slice(0, 10))} ${mb51.slice(11, 16)}`) : null;
  const mb51Vieja = !mb51 || mb51.slice(0, 10) < dia || (mb51.slice(0, 10) === dia && min(hora) - min(mb51.slice(11, 16)) > 60);

  /* EL PLAN A LA HORA POR SKU (sumando sus líneas) y los SKU notificados que no están en el plan del día. */
  const planSku = new Map<string, { dia: number; hasta: number }>();
  for (const f of filas) { const x = planSku.get(f.sku) ?? { dia: 0, hasta: 0 }; x.dia += f.planDia; x.hasta += f.planHasta; planSku.set(f.sku, x) }
  const skus = new Set<string>([...planSku.keys(), ...Object.keys(detalle).filter((k) => Math.abs(detalle[k].notif) > 0.5 || detalle[k].b261 || detalle[k].c261)]);

  /* PRODUCTO POR LÍNEA. La MB51 no dice en qué línea se envasó: lo notificado de un SKU que está en varias líneas se reparte
     en proporción a su plan a esa hora. */
  const cuenta = new Map<string, number>(); for (const f of filas) cuenta.set(f.sku, (cuenta.get(f.sku) ?? 0) + 1);
  const peso = (f: FilaCruceHora) => f.planHasta || f.planDia;
  const G = new Map<string, { tren: string; rs: { sku: string; dia: number; hasta: number; notif: number; repartido: boolean; desde: number | null }[] }>();
  for (const f of filas) {
    const tp = filas.filter((x) => x.sku === f.sku).reduce((a, x) => a + peso(x), 0), n = detalle[f.sku]?.notif ?? 0;
    const notif = tp > 0 ? (n * peso(f)) / tp : n / (cuenta.get(f.sku) ?? 1);
    if (!G.has(f.tren)) G.set(f.tren, { tren: f.tren, rs: [] });
    G.get(f.tren)!.rs.push({ sku: f.sku, dia: f.planDia, hasta: f.planHasta, notif, repartido: (cuenta.get(f.sku) ?? 0) > 1, desde: f.desde });
  }
  const sinLinea = [...skus].filter((s) => !planSku.has(s) && Math.abs(detalle[s]?.notif ?? 0) > 0.5);
  if (sinLinea.length) G.set("~", { tren: "Sin línea en el plan", rs: sinLinea.map((s) => ({ sku: s, dia: 0, hasta: 0, notif: detalle[s].notif, repartido: false, desde: null })) });
  const grupos = [...G.entries()].sort(([a], [b]) => (a === "~" ? 1 : 0) - (b === "~" ? 1 : 0) || a.localeCompare(b, "es", { numeric: true })).map(([, g]) => g);
  for (const g of grupos) g.rs.sort((a, b) => b.hasta - a.hasta || b.notif - a.notif);
  const sumaU = (rs: { sku: string }[], k: (r: { sku: string; dia: number; hasta: number; notif: number }) => number) => {
    let s = 0; for (const r of rs) { const v = conv(k(r as never), r.sku); if (v != null) s += v } return s;
  };
  const todos = grupos.flatMap((g) => g.rs);
  const tDia = sumaU(todos, (r) => r.dia), tHasta = sumaU(todos, (r) => r.hasta), tNot = sumaU(todos, (r) => r.notif);
  const tPend = tHasta - tNot;

  /* ENVASE (retornables). Lo que debería ir cargado (261) a esta hora sale del PLAN A LA HORA, no del día: si el día son 100
     y a esta hora van 70, el envase de esas 70. No se puede cargar lo que no se ha envasado. Va en la misma unidad que el
     producto (HL por defecto; unidades, cajas o estibas al escoger): la botella y la caja de lo envasado. Se agrupa por el envase
     (código de botella + código de caja): varios SKU pueden usar el mismo. Todo se guarda en unidades de producto (una botella por
     unidad, una caja por «unidades por caja») y se convierte al mostrar. */
  type ES = { sku: string; dia: number; hasta: number; b261: number; c261: number };
  const EG = new Map<string, { bot: Env; caja: Env; rs: ES[] }>();
  for (const s of skus) {
    const d = detalle[s]; if (!d?.retornable) continue;
    const p = planSku.get(s) ?? { dia: 0, hasta: 0 }, ref = d.ref || maestro[s]?.ref || 0;
    const k = `${d.botella?.cod ?? "?"}|${d.caja?.cod ?? "?"}`;
    const g = EG.get(k) ?? { bot: d.botella, caja: d.caja, rs: [] };
    g.rs.push({ sku: s, dia: p.dia, hasta: p.hasta, b261: d.b261, c261: ref ? d.c261 * ref : 0 });
    EG.set(k, g);
  }
  const sumE = (rs: ES[], k: (r: ES) => number) => sumaU(rs as never, k as never);
  const crudo = (rs: ES[], k: (r: ES) => number) => rs.reduce((a, r) => a + k(r), 0);
  const envs = [...EG.values()].sort((a, b) => crudo(b.rs, (r) => r.hasta) - crudo(a.rs, (r) => r.hasta) || crudo(b.rs, (r) => r.b261) - crudo(a.rs, (r) => r.b261));
  const envRs = envs.flatMap((g) => g.rs);
  /* Plan − 261: positivo = falta cargar (SAP todavía tiene ese envase en AG22); negativo = se cargó más de lo que el plan lleva.
     El umbral va en unidades (media botella), y el valor se muestra en la unidad escogida. */
  const dif = (rs: ES[], k: (r: ES) => number) => {
    const x = crudo(rs, (r) => r.hasta - k(r)), v = sumE(rs, (r) => r.hasta - k(r));
    if (crudo(rs, (r) => r.hasta) < 0.5 && Math.abs(crudo(rs, k)) < 0.5 && crudo(rs, (r) => r.dia) > 0) return <span className="mut">todavía no le toca</span>;
    return x > 0.5 ? <b className="mal">{fmt(v)} <small>falta</small></b> : x < -0.5 ? <b style={{ color: "var(--fe-aviso)" }}>{fmt(-v)} <small>de más</small></b> : <span className="bien">✓</span>;
  };
  const porSku = (k: (r: ES) => number, signo: 1 | -1) => sumE(envRs.filter((r) => signo * (r.hasta - k(r)) > 0.5), (r) => signo * (r.hasta - k(r)));
  const faltaBot = porSku((r) => r.b261, 1), masBot = porSku((r) => r.b261, -1);
  const faltaCj = porSku((r) => r.c261, 1), masCj = porSku((r) => r.c261, -1);
  const pct = (a: number, b: number) => {
    if (!b) return a ? <span className="mut">sin plan</span> : <span className="mut">—</span>;
    const p = a / b, c = p < 0.9 ? "var(--fe-mal)" : p > 1.1 ? "var(--fe-aviso)" : "var(--fe-bien)";
    return <span className="pe-pct"><u><i style={{ width: `${Math.min(100, 100 * p)}%`, background: c }} /></u><b className={p < 0.9 ? "mal" : ""}>{Math.round(100 * p)} %</b></span>;
  };

  return (
    <>
      <div className="ad"><div className="ad-barra pe-barra">
        <div className="ad-dia"><span>Día</span>
          <div className="ad-cal">
            <Calendario desde={dia} hasta={dia} minF="2026-01-01" maxF={hoy} atajos={atajos} unDia
                        aplicar={(d) => { if (d && d !== dia) ir(d) }} />
          </div>
        </div>
        <div className="ad-dia"><span>Hora</span>
          <select className="pe-hora" value={esAhora ? "" : hora} onChange={(e) => ir(dia, e.target.value || undefined)} aria-label="Hora del cruce">
            {dia === hoy && <option value="">Ahora ({hora})</option>}
            <optgroup label="Cambios de turno">{TURNOS.map((x) => <option key={"t" + x} value={x}>{x}</option>)}</optgroup>
            <optgroup label="Otra hora">{HORAS.filter((x) => !TURNOS.includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>
            {!esAhora && !HORAS.includes(hora) && <option value={hora}>{hora === "23:59" ? "Día completo" : hora}</option>}
          </select>
        </div>
        <div className="pe-unidad">Unidad
          <div className="pe-seg" role="group" aria-label="Unidad">
            {UNI.map(([k, t]) => <button key={k} type="button" className={u === k ? "on" : ""} aria-pressed={u === k} onClick={() => setU(k)}>{t}</button>)}
          </div>
        </div>
      </div></div>

      {mb51Vieja && (
        <p className="pe-aviso"><b>La última MB51 es de {mb51Txt ?? "—"}.</b> Lo notificado y el 261 que se digitaron después todavía no se ven:
          el pendiente y el envase «de más» salen más altos de lo real. Para el dato real, sube una MB51 nueva en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      )}

      {skus.size === 0 ? (
        <p className="pe-vacio">No hay plan ni notificaciones para este día. Sube el instructivo de la semana y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : (<>
        <section className="pe-card pe-kpi" aria-label={`Cifras a las ${hora}`}>
          <div className="k-am"><span className="l">Plan a las {hora}</span><b>{fmt(tHasta)}<small>{unom}</small></b><em>del día: {fmt(tDia)} {unom}</em></div>
          <div><span className="l">Notificado (Z01 − Z02)</span><b>{fmt(tNot)}<small>{unom}</small></b><em>digitado hasta las {hora}{mb51Vieja ? ` · MB51 ${mb51Txt ?? "—"}` : ""}</em></div>
          <div className={tPend > 0.5 ? "k-r" : ""}><span className="l">Pendiente por notificar</span><b className={tPend > 0.5 ? "mal" : "bien"}>{tPend > 0.5 ? fmt(tPend) : "0 ✓"}<small>{tPend > 0.5 ? unom : ""}</small></b>
            <em>{tPend < -0.5 ? `${fmt(-tPend)} ${unom} por encima del plan` : "plan a esta hora − notificado"}</em></div>
          <div><span className="l">Cumplimiento a las {hora}</span><b className={tHasta && tNot / tHasta < 0.9 ? "mal" : ""}>{tHasta ? `${Math.round((100 * tNot) / tHasta)} %` : "—"}</b>
            <em>{tDia ? `del día: ${Math.round((100 * tNot) / tDia)} %` : "sin plan"}</em></div>
          <div className="k-am"><span className="l">Envase a las {hora}</span><b>{fmt(sumE(envRs, (r) => r.hasta))}<small>{unom}</small></b><em>retornables · del día: {fmt(sumE(envRs, (r) => r.dia))} {unom}</em></div>
          <div className={faltaBot > 0 || masBot > 0 ? "k-r" : ""}><span className="l">Botella · plan − 261</span>
            <b className={faltaBot > 0 ? "mal" : "bien"}>{faltaBot > 0 ? fmt(faltaBot) : "0 ✓"}<small>{faltaBot > 0 ? unom : ""}</small></b>
            <em>{faltaBot > 0 ? "falta cargar" : "nada por cargar"}{masBot > 0 ? ` · ${fmt(masBot)} ${unom} de más` : ""} · caja: {faltaCj > 0 ? `faltan ${fmt(faltaCj)} ${unom}` : "✓"}{masCj > 0 ? `, ${fmt(masCj)} de más` : ""}</em></div>
        </section>

        <section className="pe-card">
          <h3 className="pe-h3">Producto a las {hora} · por línea
            <small>cada TREN del instructivo · lo notificado de un SKU en varias líneas se reparte por su plan</small></h3>
          <div className="pe-caja">
            <table className="pe-t pe-lin">
              <thead><tr>
                <th className="l">Línea · SKU</th><th>Plan del día</th><th className="pe-ahora">Plan a las {hora}</th>
                <th>Notificado</th><th className="l">Cumplimiento</th><th>Pendiente</th>
              </tr></thead>
              <tbody>
                {grupos.map((g) => {
                  const gD = sumaU(g.rs, (r) => r.dia), gH = sumaU(g.rs, (r) => r.hasta), gN = sumaU(g.rs, (r) => r.notif), gP = gH - gN;
                  return (
                    <Fragment key={g.tren}>
                      <tr className="pe-lin-cab">
                        <td className="l"><b>{g.tren === "Sin línea en el plan" ? g.tren : nombreLinea(g.tren)}</b> <small>{g.rs.length} SKU</small></td>
                        <td>{fmt(gD)}</td><td className="pe-ahora">{fmt(gH)}</td><td><b>{fmt(gN)}</b></td>
                        <td className="l">{pct(gN, gH)}</td>
                        <td className={gP > 0.5 ? "mal" : "bien"}><b>{gP > 0.5 ? fmt(gP) : gP < -0.5 ? `+${fmt(-gP)}` : "✓"}</b></td>
                      </tr>
                      {g.rs.map((r) => {
                        const p = r.hasta - r.notif;
                        /* Todavía no le toca: su plan en esta línea empieza después de la hora escogida. No es «✓», es «empieza a las …». */
                        const despues = !r.hasta && r.dia > 0 && Math.abs(r.notif) < 0.5;
                        const hd = r.desde == null ? "" : `${String(r.desde).padStart(2, "0")}:00`;
                        return (
                          <tr key={g.tren + r.sku} className="sub">
                            <td className="l"><b>{r.sku}</b> {nombre(r.sku)}{r.repartido && <small className="mut"> · repartido</small>}</td>
                            <td>{fmt(conv(r.dia, r.sku))}</td><td className="pe-ahora">{r.hasta ? fmt(conv(r.hasta, r.sku)) : despues ? <span className="mut">empieza {hd}</span> : "—"}</td>
                            <td>{fmt(conv(r.notif, r.sku))}</td><td className="l">{despues ? <span className="mut">todavía no le toca</span> : pct(r.notif, r.hasta)}</td>
                            <td className={despues ? "mut" : p > 0.5 ? "mal" : "bien"}>{despues ? "—" : p > 0.5 ? fmt(conv(p, r.sku)) : p < -0.5 ? `+${fmt(conv(-p, r.sku))}` : "✓"}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                <tr className="pe-lin-cab">
                  <td className="l"><b>Total</b></td><td>{fmt(tDia)}</td><td className="pe-ahora">{fmt(tHasta)}</td><td><b>{fmt(tNot)}</b></td>
                  <td className="l">{pct(tNot, tHasta)}</td><td className={tPend > 0.5 ? "mal" : "bien"}><b>{tPend > 0.5 ? fmt(tPend) : tPend < -0.5 ? `+${fmt(-tPend)}` : "✓"}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="pe-card">
          <h3 className="pe-h3">Envase a las {hora} · retornables
            <small>lo que debería ir cargado (261) sale del plan a esta hora · en {unom} de producto · «falta» = SAP todavía lo tiene en AG22</small></h3>
          {envs.length ? (
            <div className="pe-caja">
              <table className="pe-t pe-lin">
                <thead><tr>
                  <th className="l">Envase · código SAP</th><th>Plan del día</th><th className="pe-ahora">Plan a las {hora}</th>
                  <th>Debería ir cargado</th><th>261 cargado</th><th>Plan − 261</th>
                </tr></thead>
                <tbody>
                  {envs.map((g) => (
                    <Fragment key={(g.bot?.cod ?? "?") + (g.caja?.cod ?? "?")}>
                      <tr className="pe-lin-cab">
                        <td className="l"><b>{g.rs.map((r) => `${r.sku} ${nombre(r.sku)}`).join(" · ")}</b></td>
                        <td>{fmt(sumE(g.rs, (r) => r.dia))}</td><td className="pe-ahora"><b>{fmt(sumE(g.rs, (r) => r.hasta))}</b></td>
                        <td colSpan={3} />
                      </tr>
                      <tr className="sub">
                        <td className="l">Botella · {g.bot ? <><b>{g.bot.cod}</b> {g.bot.txt}</> : <span className="mut">sin 261 en la última semana</span>}</td>
                        <td /><td className="pe-ahora" />
                        <td>{fmt(sumE(g.rs, (r) => r.hasta))}</td><td>{fmt(sumE(g.rs, (r) => r.b261))}</td><td>{dif(g.rs, (r) => r.b261)}</td>
                      </tr>
                      <tr className="sub">
                        <td className="l">Caja · {g.caja ? <><b>{g.caja.cod}</b> {g.caja.txt}</> : <span className="mut">sin 261 en la última semana</span>}</td>
                        <td /><td className="pe-ahora" />
                        <td>{fmt(sumE(g.rs, (r) => r.hasta))}</td><td>{fmt(sumE(g.rs, (r) => r.c261))}</td><td>{dif(g.rs, (r) => r.c261)}</td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="pe-lin-cab">
                    <td className="l"><b>Total</b></td><td>{fmt(sumE(envRs, (r) => r.dia))}</td><td className="pe-ahora"><b>{fmt(sumE(envRs, (r) => r.hasta))}</b></td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : <p className="pe-vacio">Ningún SKU retornable con plan o movimientos a esta hora.</p>}
        </section>

        <p className="pe-nota">«Plan a las {hora}»: el plan vigente (último corte; si no hay, el inicial) sumado hora por hora — cada columna del instructivo
          es una hora y la hora en curso cuenta en proporción a los minutos. Lo notificado y el 261 son lo digitado en SAP hasta las {hora}, con fecha
          de este día. El envase se calcula del plan a la hora: no se carga lo que todavía no se ha envasado.</p>
      </>)}
    </>
  );
}
