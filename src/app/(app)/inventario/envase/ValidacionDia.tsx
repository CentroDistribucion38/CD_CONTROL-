"use client";

import { Fragment, useEffect, useState } from "react";
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
export function ValidacionDia({ dia, hastaDia, hoy, conDatos, antes, despues, filas, alertas, maestro, hayCorte, estado, ahora, lineas = [], horaCorte = null }: {
  /** El rango: un día (dia = hastaDia) o varios. Con varios, todo va sumado día por día. */
  dia: string; hastaDia: string; hoy: string; conDatos: string[]; antes: [string, string]; despues: [string, string]; filas: FilaDia[]; alertas: Alerta[]; maestro: M;
  hayCorte: boolean; estado: Dia["estado"];
  /** Solo HOY: la hora, el plan vigente sumado hora por hora hasta ahora (unidades por SKU) y hasta dónde llega la MB51. */
  ahora?: { hora: string; planHasta: Record<string, number>; mb51: string | null; fija?: boolean };
  /** Cómo se evalúa: una hora de corte (?hc=6 → hasta las 06:00), «dia» (el día completo) o null (hoy: hasta ahora;
      días pasados: completos). */
  horaCorte?: number | "dia" | null;
  /** El plan de cada SKU en cada línea (TREN) del instructivo, en unidades: inicial, vigente y (hoy) hasta esta hora. */
  lineas?: { tren: string; sku: string; ini: number; vig: number; hasta: number }[];
}) {
  const router = useRouter();
  /* «En cualquier rango de fecha: semana, días, lo que yo quiera.» */
  const rango = hastaDia > dia;
  const url = (d: string, h: string, hc: number | "dia" | null = horaCorte) => `/inventario/envase?d=${d}${h > d ? `&h=${h}` : ""}${hc != null ? `&hc=${hc}` : ""}`;
  /* La hora de corte se recuerda en este equipo: si la última vez se escogió «06:00», vuelve a salir así. */
  useEffect(() => {
    if (horaCorte != null) return;
    let g: string | null = null;
    try { g = localStorage.getItem("pe-hora-corte") } catch { /* sin almacenamiento */ }
    if (g && /^\d{1,2}$/.test(g)) router.replace(url(dia, hastaDia, Number(g)));
    else if (g === "dia") router.replace(url(dia, hastaDia, "dia"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* «Con un botón yo selecciono DÍA y con otro CORTE»: Día (completo) · Ahora (solo hoy) · Corte a las HH:00. */
  const [horaElegida, setHoraElegida] = useState<number>(typeof horaCorte === "number" ? horaCorte : 6);
  const modo: "dia" | "ahora" | "corte" = typeof horaCorte === "number" ? "corte" : horaCorte === "dia" || hastaDia !== hoy ? "dia" : "ahora";
  const cambiarCorte = (hc: number | "dia" | null) => {
    try { if (hc == null) localStorage.removeItem("pe-hora-corte"); else localStorage.setItem("pe-hora-corte", String(hc)) } catch { /* sigue */ }
    router.push(url(dia, hastaDia, hc));
  };
  const ir = (d: string, h: string) => router.push(url(d, h));
  const lunesDe = (f: string) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) };
  const mas = (f: string, n: number) => { const x = new Date(f + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) };
  const atajos: Atajo[] = [
    { t: "Hoy", d: () => [hoy, hoy] },
    { t: "Ayer", d: () => [antesDe(hoy), antesDe(hoy)] },
    { t: "Esta semana", d: () => [lunesDe(hoy), hoy] },
    { t: "Semana pasada", d: () => [mas(lunesDe(hoy), -7), mas(lunesDe(hoy), -1)] },
    { t: "Últimos 7 días", d: () => [mas(hoy, -6), hoy] },
    { t: "Este mes", d: () => [hoy.slice(0, 8) + "01", hoy] },
  ];
  const nombreRango = rango ? `${corto(dia)} al ${corto(hastaDia)}` : corto(dia);
  const del = rango ? "del período" : "del día";
  const [u, setU] = useState<Unidad>("hl");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [vista, setVista] = useState<"sku" | "linea">("sku");
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
  /* HOY, A ESTA HORA: lo que el plan vigente dice que ya debería ir notificado, y lo que falta. */
  const hasta = (sku: string) => ahora?.planHasta[sku] ?? 0;
  const planAhora = suma((f) => hasta(f.sku));
  const vigente = hayCorte ? corte : plan;
  const pendAhora = Math.max(0, planAhora.s - notif.s), faltaDia = Math.max(0, vigente.s - notif.s);
  const mb51Hora = ahora?.mb51 ? (ahora.mb51.slice(0, 10) === hastaDia ? ahora.mb51.slice(11, 16) : `${corto(ahora.mb51.slice(0, 10))} ${ahora.mb51.slice(11, 16)}`) : null;
  /* La MB51 vieja: más de una hora antes de ahora (o de otro día) — lo notificado después todavía no se ve.
     Con hora de corte fija: vieja si la MB51 es de antes de esa hora de ese día. */
  const mb51Vieja = !!ahora && (ahora.fija
    ? !ahora.mb51 || ahora.mb51.slice(0, 16).replace("T", " ") < `${hastaDia} ${ahora.hora}`
    : !ahora.mb51 || ahora.mb51.slice(0, 10) !== hastaDia
      || (Number(ahora.hora.slice(0, 2)) * 60 + Number(ahora.hora.slice(3))) - (Number(ahora.mb51.slice(11, 13)) * 60 + Number(ahora.mb51.slice(14, 16))) > 60);
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
  /* POR LÍNEA. La MB51 no dice en qué línea se envasó: lo notificado de un SKU se reparte entre las líneas que lo tienen en el plan,
     en proporción a su plan (hoy, al plan hasta esta hora). Un SKU notificado que no está en ninguna línea va en «Sin línea en el plan». */
  const grupos = (() => {
    const notifDe = new Map(filas.map((f) => [f.sku, f.notif]));
    const peso = (l: (typeof lineas)[number]) => (ahora ? l.hasta || l.vig : l.vig || l.ini);
    const totalPeso = new Map<string, number>();
    for (const l of lineas) totalPeso.set(l.sku, (totalPeso.get(l.sku) ?? 0) + peso(l));
    const enVarias = new Set<string>();
    const cuenta = new Map<string, number>(); for (const l of lineas) cuenta.set(l.sku, (cuenta.get(l.sku) ?? 0) + 1);
    for (const [k, n] of cuenta) if (n > 1) enVarias.add(k);
    const G = new Map<string, { tren: string; rs: { sku: string; ini: number; vig: number; hasta: number; notif: number; repartido: boolean }[] }>();
    for (const l of lineas) {
      const tp = totalPeso.get(l.sku) ?? 0, n = notifDe.get(l.sku) ?? 0;
      const notif = tp > 0 ? (n * peso(l)) / tp : n / (cuenta.get(l.sku) ?? 1);
      if (!G.has(l.tren)) G.set(l.tren, { tren: l.tren, rs: [] });
      G.get(l.tren)!.rs.push({ sku: l.sku, ini: l.ini, vig: l.vig, hasta: l.hasta, notif, repartido: enVarias.has(l.sku) });
    }
    const sinLinea = filas.filter((f) => !cuenta.has(f.sku) && Math.abs(f.notif) > 0.5);
    if (sinLinea.length) G.set("~", { tren: "Sin línea en el plan", rs: sinLinea.map((f) => ({ sku: f.sku, ini: 0, vig: 0, hasta: 0, notif: f.notif, repartido: false })) });
    return [...G.values()].sort((a, b) => a.tren.localeCompare(b.tren, "es", { numeric: true }));
  })();
  const nombreLinea = (t: string) => t.replace(/^TREN-?\s*/i, "Línea ");
  const sumaU = (rs: { sku: string }[], k: (r: never) => number) => {
    let s = 0; for (const r of rs) { const v = conv(k(r as never), r.sku); if (v != null) s += v } return s;
  };

  const abrir = (s: string) => setAbiertos((x) => { const y = new Set(x); if (y.has(s)) y.delete(s); else y.add(s); return y });
  const conteo = (t: Alerta["tipo"]) => alertas.filter((a) => a.tipo === t).length;
  const NOMBRE: Record<Alerta["tipo"], [string, string]> = { falta261: ["Falta 261", "t-r"], perdida: ["261 ≠ 531", "t-g"], caja: ["Caja de más", "t-a"], plan: ["Bajo plan", "t-n"] };

  return (
    <>
      {/* EL DÍA: el mismo calendario de Análisis de diferencia y Base (un punto en los días que tienen MB51), con
          flechas para el anterior y el siguiente. Lo escogido va en ámbar, nada en negro. */}
      <div className="ad"><div className="ad-barra pe-barra">
        <div className="ad-dia"><span>{rango ? "Fechas" : "Día"}</span>
          <div className="ad-cal">
            <Calendario desde={dia} hasta={hastaDia} minF="2026-01-01" maxF={hoy} atajos={atajos} marcados={new Set(conDatos)}
                        aplicar={(d, h) => { const hh = h || d; if (d && (d !== dia || hh !== hastaDia)) ir(d, hh) }} />
          </div>
        </div>
        <div className="pe-flechas">
          <Link href={url(antes[0], antes[1])} aria-label={rango ? "Período anterior" : "Día anterior"}>‹</Link>
          {despues[1] <= hoy ? <Link href={url(despues[0], despues[1])} aria-label={rango ? "Período siguiente" : "Día siguiente"}>›</Link> : <span aria-hidden>›</span>}
        </div>
        <div className={`pe-estado e-${estado}`}><b>{ESTADO[estado][0]}</b><small>{ESTADO[estado][1]}</small></div>
        <div className="pe-corte">Evaluar
          <div className="pe-seg" role="group" aria-label="Evaluar">
            <button type="button" className={modo === "dia" ? "on" : ""} aria-pressed={modo === "dia"} onClick={() => cambiarCorte(hastaDia === hoy ? "dia" : null)} title="El plan del día completo contra todo lo notificado">Día</button>
            {hastaDia === hoy && <button type="button" className={modo === "ahora" ? "on" : ""} aria-pressed={modo === "ahora"} onClick={() => cambiarCorte(null)} title="El plan hasta este momento">Ahora</button>}
            <button type="button" className={modo === "corte" ? "on" : ""} aria-pressed={modo === "corte"} onClick={() => cambiarCorte(horaElegida)} title="El plan y lo notificado hasta la hora de corte">Corte</button>
          </div>
          {modo === "corte" && (
            <select value={String(horaElegida)} aria-label="Hora de corte" onChange={(e) => { const v = Number(e.target.value); setHoraElegida(v); cambiarCorte(v) }}>
              <option value="6">06:00 · inicio del conteo</option>
              {Array.from({ length: 24 }, (_, k) => k).filter((k) => k !== 6).map((k) => <option key={k} value={k}>{String(k).padStart(2, "0")}:00</option>)}
            </select>
          )}
        </div>
        <div className="pe-unidad">Unidad
          <div className="pe-seg" role="group" aria-label="Unidad">
            {UNI.map(([k, t]) => <button key={k} type="button" className={u === k ? "on" : ""} aria-pressed={u === k} onClick={() => setU(k)}>{t}</button>)}
          </div>
        </div>
      </div></div>

      {ahora ? (
        <p className="pe-aviso"><b>{ahora.fija ? `Corte a las ${ahora.hora} del ${corto(hastaDia)}.` : `Hoy a las ${ahora.hora}.`}</b> «Plan a las {ahora.hora}» es el plan {hayCorte ? "vigente (último corte)" : "inicial"} sumado
          hora por hora {ahora.fija ? `desde las 00:00 hasta las ${ahora.hora}${rango ? " del último día (los días anteriores, completos)" : ""}` : "hasta ahora"}, y «Pendiente» es eso menos lo notificado.{" "}
          {ahora.fija && <>Lo notificado también se corta: solo lo que entró a SAP hasta las {ahora.hora} del {corto(hastaDia)}.{" "}</>}
          {mb51Vieja
            ? <><b>Lo notificado llega hasta la última MB51 ({mb51Hora ?? "sin MB51"})</b>: lo que se haya notificado después todavía no se ve. Para el dato real, sube una MB51 nueva en <Link href="/inventario/envase/cargar">Cargar</Link>.</>
            : <>La MB51 es de las {mb51Hora}: el dato está al día.</>}</p>
      ) : estado === "abierto" && (
        <p className="pe-aviso"><b>{rango ? "El último día de las fechas todavía está abierto." : "Este día todavía está abierto."}</b> La noche se notifica de madrugada con la fecha de hoy: el día se cierra
          cuando subas una MB51 sacada después de las 6:00 del día siguiente. Lo que ves es lo notificado hasta ahora.</p>
      )}

      {filas.length === 0 ? (
        <p className="pe-vacio">No hay plan ni notificaciones {rango ? "en estas fechas" : "para este día"}. Sube el instructivo de la semana y la MB51 en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : (<>
        <section className="pe-card pe-kpi" aria-label={`Cifras ${del}`}>
          <div className="k-am"><span className="l">Plan {del}</span><b>{fmt(plan.s)}<small>{unom}</small></b>
            <em>{hayCorte ? <>último corte: <b style={{ display: "inline", font: "inherit", fontWeight: 700 }}>{fmt(corte.s)}</b></> : "plan inicial"}</em></div>
          <div><span className="l">Notificado (Z01)</span><b>{fmt(notif.s)}<small>{unom}</small></b><em>{ahora ? (ahora.fija && !mb51Vieja ? `lo que entró a SAP hasta las ${ahora.hora}` : `hasta la MB51 de las ${mb51Hora ?? "—"}`) : madr.s ? `${fmt(madr.s)} ${unom} digitados al otro día` : "nada digitado al día siguiente"}</em></div>
          {ahora ? (<>
            <div className={pendAhora > 0.5 ? "k-r" : ""}><span className="l">Pendiente a las {ahora.hora}</span><b className={pendAhora > 0.5 ? "mal" : "bien"}>{pendAhora > 0.5 ? fmt(pendAhora) : "0 ✓"}<small>{pendAhora > 0.5 ? unom : ""}</small></b>
              <em>plan a esta hora {fmt(planAhora.s)} {unom} − notificado · del día faltan {fmt(faltaDia)} {unom}</em></div>
            <div><span className="l">Cumplimiento a las {ahora.hora}</span><b className={planAhora.s && notif.s / planAhora.s < 0.9 ? "mal" : ""}>{planAhora.s ? `${Math.round((100 * notif.s) / planAhora.s)} %` : "—"}</b>
              <em>{vigente.s ? `del día: ${Math.round((100 * notif.s) / vigente.s)} % de ${fmt(vigente.s)} ${unom}` : "sin plan"}</em></div>
          </>) : (
          <div><span className="l">Cumplimiento</span><b className={plan.s && notif.s / plan.s < 0.9 ? "mal" : ""}>{plan.s ? `${Math.round((100 * notif.s) / plan.s)} %` : "—"}</b>
            <em>{plan.s ? `${notif.s - plan.s > 0 ? "+" : ""}${fmt(notif.s - plan.s)} ${unom} contra el plan` : "sin plan inicial"}</em></div>)}
          <div className={faltaUn ? "k-r" : ""}><span className="l">Botella sin 261</span><b className={faltaUn ? "mal" : "bien"}>{faltaUn ? n0(faltaUn) : "0 ✓"}</b>
            <em>{faltaUn ? `${n0(faltaHl)} HL · ${n0(faltaCj)} cajas · ${falta.length} ${falta.length === 1 ? "orden" : "órdenes"}` : `${ret.length} SKU retornables`}</em></div>
          <div className={cajaMas ? "k-am" : ""}><span className="l">Caja de más</span><b>{n0(cajaMas)}</b><em>261 de caja sobre Z01 ÷ unidades por caja</em></div>
          <div><span className="l">261 ≠ 531</span><b>{perd.length}</b><em>{perd.length ? "salió de AG22 y no llegó igual a AG28" : "todo lo que salió llegó"}</em></div>
        </section>
        {(plan.sinDato > 0 || notif.sinDato > 0) && u !== "un" && (
          <p className="pe-nota" style={{ padding: 0 }}>Hay SKU sin {u === "estibas" ? "cajas por estiba" : u === "cajas" ? "unidades por caja" : "contenido"} en el maestro: no entran en la suma en {unom}.</p>
        )}

        <section className="pe-card">
          <h3 className="pe-h3">{nombreRango} · {vista === "sku" ? "por SKU" : "por línea"}
            <span className="pe-seg pe-vista" role="group" aria-label="Ver">
              <button type="button" className={vista === "sku" ? "on" : ""} aria-pressed={vista === "sku"} onClick={() => setVista("sku")}>Por SKU</button>
              <button type="button" className={vista === "linea" ? "on" : ""} aria-pressed={vista === "linea"} onClick={() => setVista("linea")} disabled={!lineas.length} title={lineas.length ? "" : "El plan de este día no trae líneas"}>Por línea</button>
            </span>
            <small>{vista === "sku" ? "clic en el SKU abre sus órdenes · envase en botellas y cajas" : "cada TREN del instructivo con sus SKU · lo notificado de un SKU en varias líneas se reparte por su plan"}</small></h3>
          {vista === "linea" ? (
            <div className="pe-caja">
              <table className="pe-t pe-lin">
                <thead><tr>
                  <th className="l">Línea · SKU</th><th>Plan inicial</th>{hayCorte && <th>Plan vigente</th>}{ahora && <th className="pe-ahora">Plan a las {ahora.hora}</th>}
                  <th>Notificado</th><th className="l">Cumplimiento{ahora ? " a esta hora" : ""}</th><th>{ahora ? "Pendiente" : "Diferencia"}</th>
                </tr></thead>
                <tbody>
                  {grupos.map((g) => {
                    const base = (r: { vig: number; ini: number; hasta: number }) => (ahora ? r.hasta : hayCorte ? r.vig : r.ini);
                    const gIni = sumaU(g.rs, (r: { ini: number }) => r.ini), gVig = sumaU(g.rs, (r: { vig: number }) => r.vig), gHasta = sumaU(g.rs, (r: { hasta: number }) => r.hasta);
                    const gNot = sumaU(g.rs, (r: { notif: number }) => r.notif), gBase = ahora ? gHasta : hayCorte ? gVig : gIni, gPend = gBase - gNot;
                    return (
                      <Fragment key={g.tren}>
                        <tr className="pe-lin-cab">
                          <td className="l"><b>{g.tren === "Sin línea en el plan" ? g.tren : nombreLinea(g.tren)}</b> <small>{g.rs.length} SKU</small></td>
                          <td>{fmt(gIni)}</td>{hayCorte && <td>{fmt(gVig)}</td>}{ahora && <td className="pe-ahora">{fmt(gHasta)}</td>}
                          <td><b>{fmt(gNot)}</b></td>
                          <td className="l">{gBase ? <span className="pe-pct"><u><i style={{ width: `${Math.min(100, (100 * gNot) / gBase)}%`, background: gNot / gBase < 0.9 ? "var(--fe-mal)" : "var(--fe-bien)" }} /></u><b className={gNot / gBase < 0.9 ? "mal" : ""}>{Math.round((100 * gNot) / gBase)} %</b></span> : <span className="mut">—</span>}</td>
                          <td className={gPend > 0.5 ? "mal" : "bien"}><b>{gPend > 0.5 ? fmt(gPend) : gPend < -0.5 ? `+${fmt(-gPend)}` : "✓"}</b></td>
                        </tr>
                        {g.rs.map((r) => {
                          const b = base(r), pend = b - r.notif;
                          return (
                            <tr key={g.tren + r.sku} className="sub">
                              <td className="l"><b>{r.sku}</b> {(filas.find((f) => f.sku === r.sku)?.nombre || maestro[r.sku]?.nombre || "").slice(0, 30)}{r.repartido && <small className="mut"> · repartido</small>}</td>
                              <td>{fmt(conv(r.ini, r.sku))}</td>{hayCorte && <td>{fmt(conv(r.vig, r.sku))}</td>}{ahora && <td className="pe-ahora">{r.hasta ? fmt(conv(r.hasta, r.sku)) : "—"}</td>}
                              <td>{fmt(conv(r.notif, r.sku))}</td>
                              <td className="l">{pct(r.notif, b)}</td>
                              <td className={pend > 0.5 ? "mal" : "bien"}>{pend > 0.5 ? fmt(conv(pend, r.sku)) : pend < -0.5 ? `+${fmt(conv(-pend, r.sku))}` : "✓"}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
          <div className="pe-caja">
            <table className="pe-t">
              <thead><tr>
                <th className="l">SKU</th><th>Plan {del}</th>{hayCorte && <th>{rango ? "Plan vigente" : "Último corte"}</th>}{ahora && <th className="pe-ahora" title="El plan vigente sumado hora por hora hasta ahora">Plan a las {ahora.hora}</th>}<th>Notificado</th><th className="l">Cumplimiento{ahora ? " a esta hora" : ""}</th><th>{ahora ? "Pendiente" : "Diferencia"}</th><th title="Notificado con fecha de este día pero digitado en SAP al día siguiente (la producción de la noche)">Digitado al otro día</th>
                <th className="g">Botella teórica</th><th>261 botella</th><th>Falta 261</th><th className="g">Caja teórica</th><th>261 caja</th><th>Caja de más</th>
              </tr></thead>
              <tbody>
                {filas.map((f) => {
                  const ab = abiertos.has(f.sku), dif = f.notif - f.planIni;
                  const ph = hasta(f.sku), pend = ph - f.notif;
                  return (
                    <Fragment key={f.sku}>
                      <tr>
                        <td className="l"><button type="button" className="sku" aria-expanded={ab} onClick={() => abrir(f.sku)}><i>{ab ? "▾" : "▸"}</i><b>{f.sku}</b> {(f.nombre || maestro[f.sku]?.nombre || "").slice(0, 30)}</button></td>
                        <td>{fmt(conv(f.planIni, f.sku))}</td>
                        {hayCorte && <td>{f.planCorte == null ? "—" : fmt(conv(f.planCorte, f.sku))}</td>}
                        {ahora && <td className="pe-ahora">{ph ? fmt(conv(ph, f.sku)) : "—"}</td>}
                        <td><b>{fmt(conv(f.notif, f.sku))}</b></td>
                        <td className="l">{ahora ? pct(f.notif, ph) : pct(f.notif, f.planIni)}</td>
                        {ahora
                          ? <td className={pend > 0.5 ? "mal" : "bien"}>{pend > 0.5 ? fmt(conv(pend, f.sku)) : pend < -0.5 ? `+${fmt(conv(-pend, f.sku))}` : "✓"}</td>
                          : <td className={f.planIni && dif < -0.5 ? "mal" : ""}>{dif > 0 ? "+" : ""}{fmt(conv(dif, f.sku))}</td>}
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
                          <td></td>{hayCorte && <td></td>}{ahora && <td></td>}
                          <td>{fmt(conv(o.z, f.sku))}</td><td className="l mut">{n0(o.z)} un.</td><td></td>
                          <td className="mut">{o.madrugada ? fmt(conv(o.madrugada, f.sku)) : "—"}</td>
                          {f.retornable ? (<>
                            <td className="g">{n0(o.z)}</td><td>{n0(o.b261)}</td>
                            <td className={o.z - o.b261 > 0.5 ? "mal" : "bien"}>{o.z - o.b261 > 0.5 ? n0(o.z - o.b261) : "✓"}</td>
                            <td className="g">{f.ref ? n0(o.z / f.ref) : "—"}</td><td>{n0(o.c261)}</td>
                            <td className={f.ref && o.c261 - o.z / f.ref > 0.5 ? "mal" : "bien"}>{f.ref && o.c261 - o.z / f.ref > 0.5 ? `+${n0(o.c261 - o.z / f.ref)}` : "✓"}</td>
                          </>) : <td className="g na" colSpan={6}></td>}
                        </tr>
                      )) : <tr className="sub"><td className="l mut" colSpan={12 + (hayCorte ? 1 : 0) + (ahora ? 1 : 0)}>Sin órdenes notificadas este día.</td></tr>)}
                    </Fragment>
                  );
                })}
                <tr className="tot">
                  <td className="l">Total {del}</td><td>{fmt(plan.s)}</td>{hayCorte && <td>{fmt(corte.s)}</td>}{ahora && <td className="pe-ahora">{fmt(planAhora.s)}</td>}<td>{fmt(notif.s)}</td>
                  {ahora
                    ? <><td className="l">{planAhora.s ? `${Math.round((100 * notif.s) / planAhora.s)} %` : "—"}</td><td>{pendAhora > 0.5 ? fmt(pendAhora) : "✓"}</td></>
                    : <><td className="l">{plan.s ? `${Math.round((100 * notif.s) / plan.s)} %` : "—"}</td><td>{fmt(notif.s - plan.s)}</td></>}<td>{madr.s ? fmt(madr.s) : "—"}</td>
                  <td className="g"></td><td></td><td>{faltaUn ? n0(faltaUn) : "0"}</td><td className="g"></td><td></td><td>{cajaMas ? `+${n0(cajaMas)}` : "0"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
          <p className="pe-nota">Notificado = Z01 − Z02 con fecha de contabilización de este día, aunque se haya digitado al día siguiente («Digitado al otro día»: la producción de la noche que se notifica de madrugada). Envase solo en
            retornables: la botella va 1 a 1 con lo producido y la caja es unidades ÷ unidades por caja; lo que salió de AG22 y no llegó igual a AG28 sale en las alertas.</p>
        </section>
      </>)}

      {alertas.length > 0 && (
        <details className="pe-card">
          <summary className="pe-h3">Alertas {del}
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
