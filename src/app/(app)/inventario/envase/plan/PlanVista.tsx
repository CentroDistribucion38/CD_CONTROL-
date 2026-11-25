"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Unidad } from "@/modulos/inventario/envase/calc";
import { useAvisos } from "@/components/Aviso";

export type Modo = "dia" | "rango" | "semana";
export type FilaSku = { sku: string; nombre: string; tren: string; inicial: number[]; vigente: number[] };
/** Un tramo de la línea de tiempo: un SKU en un tren, de la hora `ini` a la `fin` del día `d` (índice en `dias`). */
export type Bloque = { plan: "vig" | "ini"; d: number; tren: string; sku: string; ini: number; fin: number; un: number };
type M = Record<string, { nombre: string; ml: number; ref: number; cpe: number }>;
type Vista = "vigente" | "inicial" | "cambios";

const UNI: [Unidad, string][] = [["hl", "HL"], ["un", "Unidades"], ["cajas", "Cajas"], ["estibas", "Estibas"]];
const VISTAS: [Vista, string][] = [["vigente", "Vigente"], ["inicial", "Inicial"], ["cambios", "Qué cambió"]];
const MODOS: [Modo, string][] = [["dia", "Día"], ["rango", "Rango"], ["semana", "Semana"]];
const ms = (f: string) => Date.parse(f + "T12:00:00Z");
const masDias = (f: string, n: number) => new Date(ms(f) + n * 864e5).toISOString().slice(0, 10);
const lunesDe = (f: string) => masDias(f, -((new Date(ms(f)).getUTCDay() + 6) % 7));
const dCorto = (f: string) => new Date(ms(f)).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const dMes = (f: string) => new Date(ms(f)).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
const dLargo = (f: string) => new Date(ms(f)).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
const linea = (t: string) => t.replace(/^TREN-?/i, "Línea ");
/* Colores de la línea de tiempo: los de la marca y unos neutros fuertes; el mismo SKU siempre con el mismo color. */
const COLORES = ["#F5B800", "#0B2545", "#C8102E", "#12805C", "#6D4BD8", "#0E7490", "#B45309", "#475467", "#BE185D", "#4D7C0F"];
const colorDe = (sku: string) => { let h = 0; for (const c of sku) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length] };
const textoSobre = (c: string) => (c === "#F5B800" ? "#111" : "#fff");

/**
 * EL PLAN POR DÍA, RANGO O SEMANA. Una sola barra (ver · fechas · qué plan · unidad · copiar · Excel); cuatro cifras;
 * la LÍNEA DE TIEMPO por tren (bloques por SKU sobre las horas, con los turnos y la hora actual) y la MATRIZ por línea
 * (cada línea se pliega; mapa de calor; ▲▼ lo que cambió contra el inicial; total y peso de cada SKU). Tocar un bloque
 * lleva a su SKU en la matriz. La matriz se recorre con las flechas como una hoja.
 */
export function PlanVista({ modo, dias, hoy, ahora, semana, filas, bloques, maestro, deDia, hayPlan }: {
  modo: Modo; dias: string[]; hoy: string; ahora: string; semana: number | null;
  filas: FilaSku[]; bloques: Bloque[]; maestro: M; deDia: (string | null)[]; hayPlan: boolean;
}) {
  const router = useRouter();
  const [avisar, avisos] = useAvisos();
  const [u, setU] = useState<Unidad>("hl");
  const [vista, setVista] = useState<Vista>("vigente");
  const [plegadas, setPlegadas] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(null);
  const [act, setAct] = useState<{ r: number; c: number } | null>(null);
  /* La SELECCIÓN como en Excel: del ancla a la celda activa (clic y arrastrar, o Shift + flechas / Shift + clic). */
  const [ancla, setAncla] = useState<{ r: number; c: number } | null>(null);
  const arrastrando = useRef(false);
  useEffect(() => { const fin = () => { arrastrando.current = false }; window.addEventListener("mouseup", fin); return () => window.removeEventListener("mouseup", fin) }, []);
  const [desde, setDesde] = useState(dias[0]);
  const [hasta, setHasta] = useState(dias[dias.length - 1]);
  const [bajando, setBajando] = useState(false);
  const hoja = useRef<HTMLDivElement>(null);
  useEffect(() => { setDesde(dias[0]); setHasta(dias[dias.length - 1]) }, [dias]);
  const nd = dias.length;

  const conv = (x: number, sku: string): number | null => {
    const m = maestro[sku];
    if (u === "un") return x;
    if (u === "hl") return m?.ml ? (x * m.ml) / 1e5 : null;
    if (u === "cajas") return m?.ref ? x / m.ref : null;
    return m?.ref && m.cpe ? x / m.ref / m.cpe : null;
  };
  const dec = u === "estibas" || u === "hl" ? 1 : 0;
  const casi0 = (v: number) => Math.abs(v) < (dec ? 0.05 : 0.5);
  const fmt = (v: number | null) => v == null ? "—" : casi0(v) ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: dec && Math.abs(v) < 100 ? 1 : 0 });
  const sig = (v: number) => (v > 0 ? "+" : "−") + Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: dec && Math.abs(v) < 100 ? 1 : 0 });
  const nomU = UNI.find((x) => x[0] === u)![1];
  const nomV = VISTAS.find((x) => x[0] === vista)![1];
  const nombre = (sku: string) => filas.find((f) => f.sku === sku)?.nombre || maestro[sku]?.nombre || "";

  /* LA SECUENCIA DEL PLAN: en cada línea los SKU van en el orden en que corren (el primer bloque de cada uno en la línea
     de tiempo), como en el instructivo: Línea 2 → 2512 (00 h), 23223 (13 h), 2912 (19 h). Y sus horas, para mostrarlas. */
  const planB = vista === "inicial" ? "ini" : "vig";
  const secuencia = useMemo(() => {
    const m = new Map<string, { k: number; tramos: { d: number; ini: number; fin: number }[] }>();
    for (const b of [...bloques].filter((x) => x.plan === planB).sort((a, b) => a.d - b.d || a.ini - b.ini)) {
      const key = `${b.tren}|${b.sku}`;
      const x = m.get(key) ?? m.set(key, { k: b.d * 24 + b.ini, tramos: [] }).get(key)!;
      const u = x.tramos[x.tramos.length - 1];
      if (u && u.d === b.d && u.fin >= b.ini) u.fin = Math.max(u.fin, b.fin); else x.tramos.push({ d: b.d, ini: b.ini, fin: b.fin });
    }
    return m;
  }, [bloques, planB]);
  const orden = (tren: string, sku: string) => secuencia.get(`${tren}|${sku}`)?.k ?? 1e9;
  const horario = (tren: string, sku: string) => {
    const tr = secuencia.get(`${tren}|${sku}`)?.tramos ?? [];
    const h2 = (h: number) => String(h).padStart(2, "0");
    if (!tr.length) return "";
    if (nd === 1) return tr.map((x) => `${h2(x.ini)}–${h2(x.fin)} h`).join(" · ");
    return `desde ${dCorto(dias[tr[0].d])} ${h2(tr[0].ini)} h`;
  };

  /* ---------------- los números, en la unidad escogida ---------------- */
  const t = useMemo(() => {
    const rs = filas.map((f) => {
      const ini = f.inicial.map((x) => conv(x, f.sku)), vig = f.vigente.map((x) => conv(x, f.sku));
      const dif = dias.map((_, i) => (vig[i] == null || ini[i] == null ? null : (vig[i] ?? 0) - (ini[i] ?? 0)));
      const v = vista === "inicial" ? ini : vista === "cambios" ? dif : vig;
      const tot = v.reduce<number>((a, x) => a + (x ?? 0), 0);
      return { ...f, ini, vig, dif, v, tot, cambio: dif.some((d) => d != null && !casi0(d)) };
    }).filter((r) => vista === "cambios" ? r.cambio : r.v.some((x) => x != null && !casi0(x)));
    const trenes = [...new Set(rs.map((r) => r.tren))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    const grupos = trenes.map((tr) => {
      const xs = rs.filter((r) => r.tren === tr).sort((a, b) => orden(tr, a.sku) - orden(tr, b.sku) || b.tot - a.tot);
      const dia = dias.map((_, i) => xs.reduce((a, r) => a + (r.v[i] ?? 0), 0));
      return { tren: tr, xs, dia, tot: dia.reduce((a, x) => a + x, 0) };
    });
    const dia = dias.map((_, i) => rs.reduce((a, r) => a + (r.v[i] ?? 0), 0));
    const total = dia.reduce((a, x) => a + x, 0);
    const max = Math.max(0, ...rs.flatMap((r) => r.v.map((x) => Math.abs(x ?? 0))));
    const todos = filas.map((f) => ({ ini: f.inicial.reduce((a, x) => a + (conv(x, f.sku) ?? 0), 0), vig: f.vigente.reduce((a, x) => a + (conv(x, f.sku) ?? 0), 0), f }));
    const nCambian = filas.filter((f) => f.inicial.some((x, i) => !casi0((conv(f.vigente[i], f.sku) ?? 0) - (conv(x, f.sku) ?? 0)))).length;
    const varTot = todos.reduce((a, x) => a + x.vig - x.ini, 0);
    return { rs, grupos, dia, total, max, nCambian, varTot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, vista, u, dias, secuencia]);

  /* ---------------- navegación entre días, rangos y semanas ---------------- */
  const ir = (q: string) => router.push(`/inventario/envase/plan?${q}`);
  const cambiarModo = (m: Modo) => {
    if (m === modo) return;
    const base = dias.includes(hoy) ? hoy : dias[0];
    if (m === "dia") ir(`v=dia&d=${base}`);
    else if (m === "semana") ir(`v=semana&s=${lunesDe(base)}`);
    else ir(`v=rango&d=${dias[0]}&h=${modo === "dia" ? masDias(dias[0], 6) : dias[nd - 1]}`);
  };
  const paso = (n: number) => modo === "dia" ? ir(`v=dia&d=${masDias(dias[0], n)}`)
    : modo === "semana" ? ir(`v=semana&s=${masDias(dias[0], 7 * n)}`)
    : ir(`v=rango&d=${masDias(dias[0], n * nd)}&h=${masDias(dias[nd - 1], n * nd)}`);
  const titulo = modo === "dia" ? dLargo(dias[0]) : modo === "semana" ? `Semana ${semana ?? ""}`.trim() : `${dMes(dias[0])} – ${dMes(dias[nd - 1])}`;

  /* ---------------- cifras de arriba ---------------- */
  const hAhora = Number(ahora.slice(0, 2)) + Number(ahora.slice(3, 5)) / 60;
  const iHoy = dias.indexOf(hoy);
  const plan = vista === "inicial" ? "ini" : "vig";
  const delPlan = bloques.filter((b) => b.plan === plan);
  const hastaAhora = iHoy < 0 ? null : delPlan.filter((b) => b.d === iHoy).reduce((a, b) => {
    const h = Math.max(0, Math.min(b.fin, hAhora) - b.ini) / (b.fin - b.ini);
    return a + (conv(b.un * h, b.sku) ?? 0);
  }, 0);
  const iMax = t.dia.indexOf(Math.max(...t.dia));
  const gMax = [...t.grupos].sort((a, b) => b.tot - a.tot)[0];

  /* ---------------- línea de tiempo ---------------- */
  const trenesT = [...new Set(delPlan.map((b) => b.tren))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const horasDia = nd === 1 ? 24 : 24;
  const anchoMin = nd === 1 ? 0 : Math.max(nd * 190, 0);
  const pct = (d: number, h: number) => ((d * horasDia + h) / (nd * horasDia)) * 100;
  const ir_a_sku = (sku: string) => {
    setFoco(sku);
    const r = t.rs.find((x) => x.sku === sku);
    if (r && plegadas.has(r.tren)) setPlegadas((p) => { const n = new Set(p); n.delete(r.tren); return n });
    setTimeout(() => document.getElementById(`pv-sku-${sku}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 30);
  };

  /* ---------------- matriz: filas visibles y teclado ---------------- */
  const visibles = t.grupos.flatMap((g) => plegadas.has(g.tren) ? [] : g.xs);
  const conTotal = nd > 1;
  const nCols = nd + (conTotal ? 1 : 0);
  useEffect(() => { setAct((a) => (a && a.r >= visibles.length + 1 ? null : a)) }, [visibles.length]);
  useEffect(() => { if (act) hoja.current?.querySelector<HTMLElement>(`[data-celda="${act.r}-${act.c}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }) }, [act]);
  function tecla(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && act) { e.preventDefault(); void copiarSel(); return }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setAncla({ r: 0, c: 0 }); setAct({ r: visibles.length, c: nCols - 1 }); return }
    const n0 = visibles.length + 1, a = act ?? { r: 0, c: 0 };
    const mov: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], Enter: [1, 0] };
    let n: { r: number; c: number } | null = null;
    if (mov[e.key]) n = { r: Math.min(n0 - 1, Math.max(0, a.r + mov[e.key][0])), c: Math.min(nCols - 1, Math.max(0, a.c + mov[e.key][1])) };
    else if (e.key === "Home") n = { r: e.ctrlKey ? 0 : a.r, c: 0 };
    else if (e.key === "End") n = { r: e.ctrlKey ? n0 - 1 : a.r, c: nCols - 1 };
    else if (e.key === "Escape") { setAct(null); setAncla(null); return }
    if (!n) return;
    e.preventDefault(); setAct(n);
    if (!e.shiftKey) setAncla(n);
  }
  const sel = act && ancla ? { r0: Math.min(act.r, ancla.r), r1: Math.max(act.r, ancla.r), c0: Math.min(act.c, ancla.c), c1: Math.max(act.c, ancla.c) } : null;
  const enSel = (r: number, c: number) => !!sel && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;
  const celda = (r: number, c: number) => ({
    "data-celda": `${r}-${c}`,
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setAct({ r, c }); if (!e.shiftKey || !ancla) setAncla({ r, c });
      arrastrando.current = true; hoja.current?.focus({ preventScroll: true });
    },
    onMouseEnter: () => { if (arrastrando.current) setAct({ r, c }) },
    cl: (act?.r === r && act?.c === c ? " act" : "") + (enSel(r, c) ? " sel" : ""),
  });
  /* El valor de una celda de la matriz (fila visible · columna), para sumar y copiar la selección. */
  const valor = (r: number, c: number): number | null => {
    if (r < visibles.length) { const x = visibles[r]; return c < nd ? x.v[c] : x.tot }
    return c < nd ? t.dia[c] : t.total;
  };
  const resumen = useMemo(() => {
    if (!sel) return null;
    const xs: number[] = [];
    for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) { const v = valor(r, c); if (v != null && !casi0(v)) xs.push(v) }
    const n = (sel.r1 - sel.r0 + 1) * (sel.c1 - sel.c0 + 1);
    const suma = xs.reduce((a, x) => a + x, 0);
    return { n, conDato: xs.length, suma, prom: xs.length ? suma / xs.length : 0, max: xs.length ? Math.max(...xs) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.r0, sel?.r1, sel?.c0, sel?.c1, t, vista, u]);
  async function copiarSel() {
    if (!sel) return;
    const ls: string[] = [];
    for (let r = sel.r0; r <= sel.r1; r++) { const fila: string[] = []; for (let c = sel.c0; c <= sel.c1; c++) fila.push(num(valor(r, c))); ls.push(fila.join("\t")) }
    try { await navigator.clipboard.writeText(ls.join("\n")); avisar.bien(`Copiadas ${resumen?.n ?? 0} celdas: pégalas en Excel.`) }
    catch { avisar.mal("El navegador no dejó copiar.") }
  }
  const calor = (v: number | null) => {
    if (v == null || casi0(v) || !t.max || vista === "cambios") return undefined;
    return { background: `color-mix(in srgb, #F5B800 ${Math.round(10 + 62 * Math.min(1, Math.abs(v) / t.max))}%, transparent)` };
  };

  /* ---------------- copiar y Excel ---------------- */
  const num = (v: number | null) => v == null ? "" : String(Math.round(v * 10 ** dec) / 10 ** dec).replace(".", ",");
  async function copiar() {
    const cab = ["Línea", "SKU", "Descripción", ...dias.map(dCorto), modo === "dia" ? "Día" : "Total"];
    const ls = t.grupos.flatMap((g) => g.xs.map((r) => [linea(g.tren), r.sku, r.nombre || nombre(r.sku), ...r.v.map(num), num(r.tot)]));
    try { await navigator.clipboard.writeText([cab, ...ls, ["", "", "Total", ...t.dia.map(num), num(t.total)]].map((l) => l.join("\t")).join("\n")); avisar.bien(`Copiado: ${t.rs.length} SKU (${nomV.toLowerCase()}) en ${nomU}.`) }
    catch { avisar.mal("No se pudo copiar. Usa Descargar Excel.") }
  }
  async function excel() {
    setBajando(true);
    try {
      const { armarLibroPlan } = await import("@/modulos/inventario/envase/libro-plan");
      const buf = await armarLibroPlan({
        semana, periodo: titulo, desde: dias[0], hasta: dias[nd - 1], dias: dias.map(dCorto), fechas: dias, fuente: deDia, vista, unidad: nomU, decimales: dec,
        filas: filas.map((f) => ({ sku: f.sku, nombre: f.nombre || nombre(f.sku), tren: f.tren, ini: f.inicial.map((x) => conv(x, f.sku)), vig: f.vigente.map((x) => conv(x, f.sku)) })),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      a.download = `Plan ${titulo} - ${nomV} - ${nomU}.xlsx`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { avisar.mal(`No se pudo armar el Excel: ${e instanceof Error ? e.message : e}`) }
    finally { setBajando(false) }
  }

  let ri = -1; /* índice de la fila visible, para el teclado */
  return (
    <>
      {avisos}
      <div className="ad"><div className="ad-barra pe-barra pv-barra">
        <div className="ad-dia"><span>Ver</span>
          <div className="pe-seg" role="group" aria-label="Ver por">
            {MODOS.map(([k, x]) => <button key={k} type="button" className={modo === k ? "on" : ""} aria-pressed={modo === k} onClick={() => cambiarModo(k)}>{x}</button>)}
          </div>
        </div>
        <div className="ad-dia"><span>{modo === "rango" ? "Fechas" : modo === "dia" ? "Día" : "Semana"}</span>
          {modo === "rango" ? (
            <div className="pv-rango">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <i aria-hidden>→</i>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
              <button type="button" className="pe-bt" disabled={!desde || !hasta || (desde === dias[0] && hasta === dias[nd - 1])} onClick={() => ir(`v=rango&d=${desde}&h=${hasta}`)}>Ver</button>
            </div>
          ) : (
            <div className="pe-semana">
              <button type="button" className="pv-fl" onClick={() => paso(-1)} aria-label="Anterior">‹</button>
              {modo === "dia"
                ? <label className="pv-dia"><b>{dLargo(dias[0])}</b><input type="date" value={dias[0]} onChange={(e) => e.target.value && ir(`v=dia&d=${e.target.value}`)} aria-label="Escoger día" /></label>
                : <b>{titulo} <small>{dMes(dias[0])} – {dMes(dias[nd - 1])}</small></b>}
              <button type="button" className="pv-fl" onClick={() => paso(1)} aria-label="Siguiente">›</button>
            </div>
          )}
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
          <button type="button" className="pe-bt" disabled={!t.rs.length} onClick={() => void copiar()}>Copiar</button>
          <button type="button" className="pe-bt am" disabled={!filas.length || bajando} onClick={() => void excel()}>{bajando ? "Armando…" : "Descargar Excel"}</button>
        </div>
      </div></div>

      {!hayPlan ? (
        <p className="pe-vacio">No hay instructivo cargado para {modo === "dia" ? "ese día" : "esas fechas"}. Súbelo en <Link href="/inventario/envase/cargar">Cargar</Link>.</p>
      ) : (<>
        {/* ================= CIFRAS ================= */}
        <div className="pv-cifras">
          {vista === "cambios" ? (
            <div className={"pv-cif " + (t.varTot < 0 ? "r" : "v")}><span>Variación {modo === "dia" ? "del día" : "del periodo"}</span><b>{casi0(t.varTot) ? "0" : sig(t.varTot)} {nomU}</b><small>vigente − inicial</small></div>
          ) : (
            <div className="pv-cif"><span>Plan {vista} {modo === "dia" ? "del día" : modo === "semana" ? "de la semana" : "del rango"}</span><b>{fmt(t.total)} {nomU}</b><small>{t.rs.length} SKU en {t.grupos.length} línea{t.grupos.length === 1 ? "" : "s"}</small></div>
          )}
          {hastaAhora != null && vista !== "cambios" ? (
            <div className="pv-cif"><span>A las {ahora} de hoy</span><b>{fmt(hastaAhora)} {nomU}</b><small>lo que el plan ya debía haber envasado</small></div>
          ) : (
            <div className="pv-cif v"><span>{nd === 1 ? "Día" : "Día más cargado"}</span><b>{dCorto(dias[iMax] ?? dias[0])}</b><small>{fmt(t.dia[iMax] ?? 0)} {nomU}</small></div>
          )}
          <div className="pv-cif"><span>Línea más cargada</span><b>{gMax ? linea(gMax.tren) : "—"}</b><small>{gMax ? `${fmt(gMax.tot)} ${nomU} · ${gMax.xs.length} SKU` : ""}</small></div>
          <div className={"pv-cif " + (t.nCambian ? "r" : "v")}><span>Cambió contra el inicial</span><b>{t.nCambian} SKU</b><small>{casi0(t.varTot) ? "sin variación" : `${sig(t.varTot)} ${nomU}`}</small></div>
        </div>

        {/* ================= LÍNEA DE TIEMPO ================= */}
        <section className="pe-card pv-tl">
          <h3 className="pe-h3">Línea de tiempo por tren <small>{vista === "inicial" ? "plan inicial" : "plan vigente"} · toca un bloque para ver su SKU abajo</small></h3>
          {!trenesT.length ? <p className="pe-nota">Sin plan por horas en estas fechas.</p> : (
            <div className="pv-tl-scroll">
              <div className="pv-tl-in" style={{ minWidth: anchoMin || undefined }}>
                <div className="pv-tl-cab">
                  <div className="pv-ln" />
                  <div className="pv-trk">
                    {dias.map((d, i) => (
                      <div key={d} className={"pv-dcab" + (d === hoy ? " hoy" : "")} style={{ left: `${pct(i, 0)}%`, width: `${100 / nd}%` }}>
                        {nd > 1 && <b>{dCorto(d)}</b>}
                        <div className="pv-turnos">{["T1", "T2", "T3"].map((x, k) => <span key={x}>{x}{nd <= 2 ? ` · ${String(k * 8).padStart(2, "0")}–${String(k * 8 + 8).padStart(2, "0")}` : ""}</span>)}</div>
                        <div className="pv-horas">{Array.from({ length: nd === 1 ? 13 : 4 }, (_, k) => k * (nd === 1 ? 2 : 6)).map((hh) => <span key={hh} style={{ left: `${(hh / 24) * 100}%` }}>{String(hh).padStart(2, "0")}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {trenesT.map((tr) => {
                  const bs = delPlan.filter((b) => b.tren === tr);
                  const tot = bs.reduce((a, b) => a + (conv(b.un, b.sku) ?? 0), 0);
                  return (
                    <div key={tr} className="pv-lane">
                      <div className="pv-ln"><b>{linea(tr)}</b><small>{fmt(tot)} {nomU}</small></div>
                      <div className="pv-trk" style={{ backgroundSize: `${100 / (nd * (nd === 1 ? 12 : 4))}% 100%` }}>
                        {dias.map((_, i) => i > 0 && <i key={i} className="pv-sep" style={{ left: `${pct(i, 0)}%` }} />)}
                        {bs.map((b, k) => {
                          const c = colorDe(b.sku), w = pct(0, b.fin - b.ini) , horas = b.fin - b.ini;
                          const pxH = nd === 1 ? 50 : 8;
                          const v = conv(b.un, b.sku);
                          return (
                            <button key={k} type="button" className={"pv-blk" + (foco === b.sku ? " foco" : "")} onClick={() => ir_a_sku(b.sku)}
                              style={{ left: `${pct(b.d, b.ini)}%`, width: `${w}%`, background: c, color: textoSobre(c) }}
                              title={`${b.sku} ${nombre(b.sku)} · ${dCorto(dias[b.d])} ${String(b.ini).padStart(2, "0")}–${String(b.fin).padStart(2, "0")} h · ${fmt(v)} ${nomU}`}>
                              {horas * pxH >= 34 && <b>{b.sku}</b>}
                              {horas * pxH >= 120 && <span> {nombre(b.sku).slice(0, Math.max(8, Math.floor(horas * pxH / 9)))}</span>}
                              {horas * pxH >= 70 && <small>{fmt(v)} {nomU}{nd === 1 ? ` · ${String(b.ini).padStart(2, "0")}–${String(b.fin).padStart(2, "0")} h` : ""}</small>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {iHoy >= 0 && <div className="pv-ahora" style={{ left: `calc(var(--pv-ln) + (100% - var(--pv-ln)) * ${pct(iHoy, hAhora) / 100})` }}><span>{ahora}</span></div>}
              </div>
            </div>
          )}
        </section>

        {/* ================= MATRIZ POR LÍNEA ================= */}
        <section className="pe-card">
          <h3 className="pe-h3">
            {vista === "cambios" ? <>Qué cambió del inicial al vigente · {t.rs.length} SKU</> : <>Por línea y SKU · plan {vista} · {t.rs.length} SKU</>}
            <small>en {nomU} · cada línea en el orden del plan · arrastra para seleccionar celdas como en Excel</small>
          </h3>
          {!t.rs.length ? <p className="pe-nota">{vista === "cambios" ? "Ningún SKU cambió del inicial al vigente en estas fechas." : "Sin plan en estas fechas."}</p> : (
            <div className="pe-caja pe-hoja" ref={hoja} tabIndex={0} onKeyDown={tecla} aria-label="Plan por línea y SKU: muévete con las flechas">
              <table className={"pe-t pv-mx" + (vista === "cambios" ? " cmb" : "")}>
                <thead>
                  <tr>
                    <th className="l">Línea · SKU</th>
                    {dias.map((d, i) => {
                      const mx = Math.max(...t.dia.map(Math.abs)) || 1;
                      return (
                        <th key={d} className={(d === hoy ? "hoy " : "") + (act?.c === i ? "cruz" : "")} title={vista === "inicial" ? "plan inicial" : deDia[i] ? `De: ${deDia[i]}` : "sin plan"}>
                          {dCorto(d)}{vista !== "inicial" && deDia[i] && deDia[i] !== "inicial" ? <i>corte</i> : null}
                          {nd > 1 && <span className="pv-mb"><span style={{ height: `${Math.round(Math.abs(t.dia[i]) / mx * 22)}px` }} /></span>}
                          <small>{vista === "cambios" ? (casi0(t.dia[i]) ? "—" : sig(t.dia[i])) : fmt(t.dia[i])}</small>
                        </th>
                      );
                    })}
                    {conTotal && <th className={"g " + (act?.c === nd ? "cruz" : "")}>Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {t.grupos.map((g) => {
                    const pleg = plegadas.has(g.tren);
                    return [
                      <tr key={g.tren} className="pv-gr">
                        <td className="l"><button type="button" aria-expanded={!pleg} onClick={() => setPlegadas((p) => { const n = new Set(p); if (n.has(g.tren)) n.delete(g.tren); else n.add(g.tren); return n })}>
                          <i aria-hidden>{pleg ? "▸" : "▾"}</i> {linea(g.tren)} <small>{g.xs.length} SKU</small></button></td>
                        {g.dia.map((v, i) => <td key={i}>{vista === "cambios" ? (casi0(v) ? "—" : sig(v)) : fmt(v)}</td>)}
                        {conTotal && <td className="g">{vista === "cambios" ? (casi0(g.tot) ? "—" : sig(g.tot)) : fmt(g.tot)}</td>}
                      </tr>,
                      ...(pleg ? [] : g.xs.map((r) => {
                        ri++;
                        const R = ri;
                        return (
                          <tr key={r.sku} id={`pv-sku-${r.sku}`} className={(act?.r === R ? "fila-act " : "") + (foco === r.sku ? "pv-foco" : "")}>
                            <td className="l"><span className="pv-n">{g.xs.indexOf(r) + 1}</span><span className="pv-pt" style={{ background: colorDe(r.sku) }} /><b>{r.sku}</b> {r.nombre || nombre(r.sku)}
                              {horario(r.tren, r.sku) && <small className="pv-hr">{horario(r.tren, r.sku)}</small>}</td>
                            {dias.map((_, i) => {
                              const c = celda(R, i), v = r.v[i], dv = r.dif[i];
                              return (
                                <td key={i} data-celda={c["data-celda"]} onMouseDown={c.onMouseDown} onMouseEnter={c.onMouseEnter} style={calor(v)}
                                  className={c.cl + (vista === "cambios" && v != null && !casi0(v) ? (v > 0 ? " c-sube" : " c-baja") : "")}
                                  title={dv != null && !casi0(dv) ? `Inicial ${fmt(r.ini[i])} → vigente ${fmt(r.vig[i])}` : undefined}>
                                  {vista === "cambios" ? (v == null || casi0(v) ? "—" : sig(v)) : fmt(v)}
                                  {vista === "vigente" && dv != null && !casi0(dv) && <em className={dv > 0 ? "sube" : "baja"}>{dv > 0 ? "▲" : "▼"} {sig(dv).slice(1)}</em>}
                                </td>
                              );
                            })}
                            {conTotal && (() => { const c = celda(R, nd); return (
                              <td data-celda={c["data-celda"]} onMouseDown={c.onMouseDown} onMouseEnter={c.onMouseEnter} className={"g" + c.cl}>
                                <b>{vista === "cambios" ? (casi0(r.tot) ? "—" : sig(r.tot)) : fmt(r.tot)}</b>
                                {vista !== "cambios" && t.total > 0 && <span className="pv-peso" style={{ width: `${Math.max(2, Math.round(r.tot / t.total * 120))}px` }} title={`${Math.round(r.tot / t.total * 1000) / 10} % del total`} />}
                              </td>
                            ) })()}
                          </tr>
                        );
                      })),
                    ];
                  })}
                  <tr className="tot">
                    <td className="l">Total</td>
                    {t.dia.map((v, i) => { const c = celda(visibles.length, i); return <td key={i} data-celda={c["data-celda"]} onMouseDown={c.onMouseDown} onMouseEnter={c.onMouseEnter} className={c.cl}>{vista === "cambios" ? (casi0(v) ? "—" : sig(v)) : fmt(v)}</td> })}
                    {conTotal && (() => { const c = celda(visibles.length, nd); return <td data-celda={c["data-celda"]} onMouseDown={c.onMouseDown} onMouseEnter={c.onMouseEnter} className={"g" + c.cl}>{vista === "cambios" ? (casi0(t.total) ? "—" : sig(t.total)) : fmt(t.total)}</td> })()}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {resumen && resumen.n > 1 && (
            <div className="pv-selbar" role="status">
              <span><b>{resumen.n}</b> celdas</span>
              <span>Suma <b>{vista === "cambios" ? sig(resumen.suma) : fmt(resumen.suma)}</b> {nomU}</span>
              <span>Promedio <b>{fmt(resumen.prom)}</b></span>
              <span>Máx <b>{fmt(resumen.max)}</b></span>
              <button type="button" className="pe-bt" onClick={() => void copiarSel()}>Copiar selección</button>
              <small>arrastra o Shift + flechas para seleccionar · Ctrl+C copia · Esc quita</small>
            </div>
          )}
        </section>
      </>)}
    </>
  );
}
