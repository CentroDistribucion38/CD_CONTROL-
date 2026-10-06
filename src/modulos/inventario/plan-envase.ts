/**
 * EL PLAN DE ENVASE → ESTIBAS POR DÍA.
 *
 * El «Instructivo de Envase» (Suite 360) trae una hoja por semana. De cada
 * una se leen DOS cosas:
 *
 *   1. «Pendiente por envasar específico»: por tren y SKU (SAP), el formato
 *      (cc por envase), la referencia (envases por caja), los HL y las
 *      UNIDADES de la semana.
 *   2. La grilla de cada tren: qué SKU envasa, qué día y en qué turno, y
 *      cuántos HL. Cada columna es una hora (24 por día): T1 = 0–8 h,
 *      T2 = 8–16 h, T3 = 16–24 h.
 *
 * DE UNIDADES A ESTIBAS:  unidades ÷ referencia = cajas;  cajas ÷ factor de
 * estibado (cajas por estiba del Maestro) = estibas. Cada bloque de la
 * grilla se queda con la parte de las unidades de su SKU que le toca por
 * HL, así lo que suman los bloques es EXACTAMENTE lo pendiente del Excel.
 *
 * Aquí no hay nada de pantalla ni de base: recibe la hoja ya leída y
 * devuelve datos. Lo demás (subir, guardar, dibujar) vive en
 * src/app/(app)/inventario/recibir/.
 */

/* ───────────────────────── la hoja, sin depender de la librería ───────────────────────── */

export type Hoja = {
  v: (r: number, c: number) => unknown;                       // fila y columna desde 1
  merges: { r1: number; c1: number; r2: number; c2: number }[];
  filas: number;
  cols: number;
};

const letras = (c: number) => { let s = ""; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26) } return s };

/** Una hoja de SheetJS (`ws`) vista como `Hoja`. Los rangos combinados se leen desde su celda de arriba a la izquierda. */
export function hojaDeSheetJS(ws: Record<string, unknown>): Hoja {
  const ref = String(ws["!ref"] ?? "A1");
  const fin = ref.split(":").pop() as string;
  const m = /^([A-Z]+)(\d+)$/.exec(fin);
  const cols = m ? [...m[1]].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) : 1;
  const filas = m ? Number(m[2]) : 1;
  const mg = ((ws["!merges"] as { s: { r: number; c: number }; e: { r: number; c: number } }[] | undefined) ?? [])
    .map((x) => ({ r1: x.s.r + 1, c1: x.s.c + 1, r2: x.e.r + 1, c2: x.e.c + 1 }));
  return {
    filas, cols, merges: mg,
    v: (r, c) => { const x = ws[letras(c) + r] as { v?: unknown } | undefined; return x ? x.v : undefined },
  };
}

/* ───────────────────────── lo que sale ───────────────────────── */

export type Pendiente = { tren: string; sap: string; sku: string; eficiencia: number | null; formato: number | null; referencia: number | null; hl: number; unidades: number };
export type Bloque = { tren: string; sap: string; fecha: string; turno: 1 | 2 | 3; hora_ini: number; horas: number; hl: number; unidades: number };
export type SemanaPlan = {
  anio: number; semana: number; fecha_ini: string; fecha_fin: string;
  escenario: string | null; generado: string | null;
  pendientes: Pendiente[]; bloques: Bloque[]; avisos: string[];
};

/* ───────────────────────── utilidades ───────────────────────── */

const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const DIA_RE = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function sumarDias(isoFecha: string, n: number): string {
  const [y, m, d] = isoFecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const num = (x: unknown): number | null => {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") { const n = Number(x.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && x.trim() !== "" ? n : null }
  return null;
};
const txt = (x: unknown): string => (x == null ? "" : x instanceof Date ? "" : String(x).trim());

/* ───────────────────────── una hoja «Semana N» ───────────────────────── */

export function leerSemana(h: Hoja, nombreHoja: string): SemanaPlan | null {
  const avisos: string[] = [];
  /* Valor de una celda, mirando también el rango combinado al que pertenece. */
  const origen = (r: number, c: number) => {
    const m = h.merges.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
    return m ? { r: m.r1, c: m.c1, c2: m.c2 } : { r, c, c2: c };
  };
  const val = (r: number, c: number) => { const o = origen(r, c); return h.v(o.r, o.c) };
  const buscar = (re: RegExp, desde = 1, hasta = h.filas) => {
    for (let r = desde; r <= Math.min(hasta, h.filas); r++) for (let c = 1; c <= h.cols; c++) { if (re.test(sinTilde(txt(h.v(r, c))))) return { r, c } }
    return null;
  };
  const derecha = (r: number, c: number) => { for (let k = c + 1; k <= Math.min(c + 40, h.cols); k++) { const x = h.v(r, k); if (x != null && txt(x) !== "") return x } return undefined };

  /* Encabezado: semana, escenario, fecha de generación. */
  const sem = buscar(/^semana:?$/, 1, 10);
  let semana = sem ? num(derecha(sem.r, sem.c)) : null;
  if (semana == null) { const m = /(\d+)/.exec(nombreHoja); semana = m ? Number(m[1]) : null }
  if (semana == null) return null;
  const esc = buscar(/^escenario:?$/, 1, 10);
  const gen = buscar(/^fecha:?$/, 1, 4);
  const escenario = esc ? txt(derecha(esc.r, esc.c)) || null : null;
  const gTxt = gen ? txt(derecha(gen.r, gen.c)) : "";
  const generado = /^\d{4}-\d{2}-\d{2}/.test(gTxt) ? gTxt.slice(0, 10) : null;

  /* Los siete días: están en la fila de «lunes 17 de agosto de 2026…». */
  const dias: { fecha: string; c1: number; c2: number }[] = [];
  let filaDias = 0;
  for (let r = 6; r <= 10 && !dias.length; r++) {
    for (let c = 1; c <= h.cols; c++) {
      const m = DIA_RE.exec(sinTilde(txt(h.v(r, c))));
      if (m && MESES[m[3]]) { dias.push({ fecha: iso(Number(m[4]), MESES[m[3]], Number(m[2])), c1: c, c2: c }); filaDias = r }
    }
  }
  if (!dias.length) { avisos.push("No encontré los días de la semana en la hoja."); return null }
  for (let i = 0; i < dias.length; i++) dias[i].c2 = (dias[i + 1] ? dias[i + 1].c1 : dias[i].c1 + (i > 0 ? dias[i].c1 - dias[i - 1].c1 : 24)) - 1;
  if (dias.length !== 7) avisos.push(`La hoja trae ${dias.length} días y no 7.`);

  /* «Pendiente por envasar específico»: tren, SKU, SAP, eficiencia, formato, referencia, HL, unidades. */
  const pendientes: Pendiente[] = [];
  const anc = buscar(/pendiente por envasar espec/);
  if (!anc) avisos.push("No encontré «Pendiente por envasar específico».");
  else {
    const cab = anc.r + 1, col: Record<string, number> = {};
    const nombres: [string, RegExp][] = [["tren", /^linea$/], ["sku", /^sku$/], ["sap", /^sap$/], ["efi", /^eficiencia$/], ["fmt", /^formato$/], ["ref", /^referencia$/], ["hl", /^hl$/], ["uni", /^unidades$/]];
    for (let c = anc.c; c <= Math.min(anc.c + 110, h.cols); c++) {
      const t = sinTilde(txt(h.v(cab, c)));
      for (const [k, re] of nombres) if (re.test(t) && !(k in col)) col[k] = c;
    }
    if (nombres.some(([k]) => !(k in col))) avisos.push("Las columnas de «Pendiente por envasar específico» no son las de siempre.");
    else {
      for (let r = cab + 1; r <= h.filas; r++) {
        const tren = txt(h.v(r, col.tren));
        if (!tren || /^total/i.test(tren)) break;
        const sap = txt(h.v(r, col.sap)).replace(/\.0$/, "");
        if (!sap) continue;
        pendientes.push({ tren, sap, sku: txt(h.v(r, col.sku)), eficiencia: num(h.v(r, col.efi)), formato: num(h.v(r, col.fmt)), referencia: num(h.v(r, col.ref)), hl: num(h.v(r, col.hl)) ?? 0, unidades: num(h.v(r, col.uni)) ?? 0 });
      }
    }
  }

  /* La grilla: cada tren son tres filas (SKU, programa inicial, HL envasados). */
  type Crudo = { tren: string; etiqueta: string; formato: number; ref: number; dia: number; hora: number; horas: number; hl: number; dpa?: boolean };
  const crudos: Crudo[] = [];
  for (let r = filaDias + 1; r <= h.filas; r++) {
    const tren = txt(h.v(r, 1));
    if (!/^tren-\d+/i.test(tren) || !/programa inicial/.test(sinTilde(txt(h.v(r + 1, 1))))) continue;
    for (let c = dias[0].c1; c <= dias[dias.length - 1].c2; c++) {
      const o = origen(r + 2, c);
      if (o.c !== c) continue;                                   // solo la celda de arriba a la izquierda de cada bloque
      const hl = num(h.v(r + 2, c));
      if (hl == null || hl <= 0) continue;
      const prog = txt(val(r + 1, c));
      const f = /^(\d+)\s*x\s*(\d+)$/i.exec(prog);
      const dpa = !f && /^dpa\b/i.test(prog);                    // un cambio de líquido o de empaque: todavía sale lo último del SKU anterior
      if (!f && !dpa) continue;                                  // sin demanda, mantenimiento sin HL…: no es envase
      const di = dias.findIndex((d) => c >= d.c1 && c <= d.c2);
      if (di < 0) continue;
      const ancho = dias[di].c2 - dias[di].c1 + 1;
      crudos.push({ tren: tren.toUpperCase(), etiqueta: txt(val(r, c)), formato: f ? Number(f[1]) : 0, ref: f ? Number(f[2]) : 0, dia: di, hora: Math.floor(((c - dias[di].c1) * 24) / ancho), horas: o.c2 - c + 1, hl, dpa });
    }
  }

  /* A qué SAP pertenece cada bloque. Primero los que traen el número en la etiqueta («Cos 20867»);
     luego, para los de nombre corto («PM», «Ag269x6»), por formato y referencia sin contar los SKU que ya
     se nombraron con su número en ese tren, y al final por las letras del nombre. */
  const enTren = (t: string) => pendientes.filter((p) => p.tren.toUpperCase() === t);
  const numeroDe = (b: Crudo) => { const n = /\d{4,6}/.exec(b.etiqueta)?.[0]; return n && enTren(b.tren).some((p) => p.sap === n) ? n : null };
  const nombrados = new Map<string, Set<string>>();
  for (const b of crudos) { if (b.dpa) continue; const n = numeroDe(b); if (n) (nombrados.get(b.tren) ?? nombrados.set(b.tren, new Set()).get(b.tren)!).add(n) }
  const sapDe = (b: Crudo): string | null => {
    const n = numeroDe(b);
    if (n) return n;
    const ya = nombrados.get(b.tren) ?? new Set<string>();
    const cand = enTren(b.tren);
    let pool = cand.filter((p) => p.formato === b.formato && p.referencia === b.ref);
    if (pool.length > 1) { const libres = pool.filter((p) => !ya.has(p.sap)); if (libres.length) pool = libres }
    if (pool.length === 1) return pool[0].sap;
    const base = sinTilde(/^[a-zñ]+/i.exec(sinTilde(b.etiqueta))?.[0] ?? "");
    const lista = pool.length ? pool : cand.filter((p) => !ya.has(p.sap));
    for (let k = base.length; k >= 2; k--) {
      const m = lista.filter((p) => sinTilde(p.sku).startsWith(base.slice(0, k)));
      if (m.length === 1) return m[0].sap;
      if (m.length > 1) break;
    }
    return null;
  };
  const resueltos: (Crudo & { sap: string })[] = [];
  const sinResolver = new Set<string>();
  const ultimo = new Map<string, string>();
  const colgados: Crudo[] = [];
  for (const b of crudos) {
    if (b.dpa) { const u = ultimo.get(b.tren); if (u) resueltos.push({ ...b, sap: u }); else colgados.push(b); continue }
    const sap = sapDe(b);
    if (sap) { resueltos.push({ ...b, sap }); ultimo.set(b.tren, sap) } else sinResolver.add(`${b.tren} «${b.etiqueta}» ${b.formato} X ${b.ref}`);
    /* Un cambio que abre la semana (antes de cualquier SKU) es de lo que sigue. */
    if (sap && colgados.length) { for (const c of colgados.splice(0)) if (c.tren === b.tren) resueltos.push({ ...c, sap }); }
  }
  for (const s2 of sinResolver) avisos.push(`No supe a qué SKU del pendiente corresponde: ${s2}.`);

  /* Las unidades del SKU se reparten entre sus bloques según los HL: la suma queda igual al pendiente. */
  const kk = (tren: string, sap: string) => tren.toUpperCase() + "|" + sap;
  const hlPorSap = new Map<string, number>();
  for (const b of resueltos) hlPorSap.set(kk(b.tren, b.sap), (hlPorSap.get(kk(b.tren, b.sap)) ?? 0) + b.hl);
  const bloques: Bloque[] = resueltos.map((b) => {
    const p = pendientes.find((x) => x.sap === b.sap && x.tren.toUpperCase() === b.tren) ?? pendientes.find((x) => x.sap === b.sap);
    const tot = hlPorSap.get(kk(b.tren, b.sap)) ?? 0;
    const unidades = p && tot > 0 ? Math.round((p.unidades * b.hl) / tot) : 0;
    return { tren: b.tren, sap: b.sap, fecha: dias[b.dia].fecha, turno: (Math.floor(b.hora / 8) + 1) as 1 | 2 | 3, hora_ini: b.hora, horas: b.horas, hl: b.hl, unidades };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tren.localeCompare(b.tren, "es", { numeric: true }) || a.hora_ini - b.hora_ini);

  /* Cuadre: lo que suma la grilla contra lo pendiente. */
  for (const p of pendientes) {
    const g = hlPorSap.get(kk(p.tren, p.sap)) ?? 0;
    if (g === 0 && p.unidades > 0) avisos.push(`${p.sku || p.sap} (${p.tren}) está en el pendiente pero no aparece programado en la grilla.`);
    else if (Math.abs(g - p.hl) > Math.max(2, p.hl * 0.005)) avisos.push(`${p.sku || p.sap}: la grilla suma ${Math.round(g)} HL y el pendiente dice ${Math.round(p.hl)}.`);
  }

  const anio = Number(dias[0].fecha.slice(0, 4));
  return { anio, semana, fecha_ini: dias[0].fecha, fecha_fin: dias[dias.length - 1].fecha, escenario, generado, pendientes, bloques, avisos };
}

/** Todas las hojas «Semana N» de un libro de SheetJS. */
export function leerPlanEnvase(wb: { SheetNames: string[]; Sheets: Record<string, unknown> }): SemanaPlan[] {
  const out: SemanaPlan[] = [];
  for (const nombre of wb.SheetNames) {
    if (!/^semana\s*\d+$/i.test(nombre.trim())) continue;
    const s = leerSemana(hojaDeSheetJS(wb.Sheets[nombre] as Record<string, unknown>), nombre);
    if (s) out.push(s);
  }
  return out.sort((a, b) => a.anio - b.anio || a.semana - b.semana);
}

/* ───────────────────────── unidades → cajas → estibas ───────────────────────── */

export type Factores = Map<string, { cajas_por_estiba: number | null; nombre: string | null }>;

export const cajasDe = (unidades: number, referencia: number | null) => (referencia && referencia > 0 ? unidades / referencia : null);
export function estibasDe(unidades: number, referencia: number | null, cajasPorEstiba: number | null): number | null {
  const c = cajasDe(unidades, referencia);
  return c != null && cajasPorEstiba && cajasPorEstiba > 0 ? c / cajasPorEstiba : null;
}

export type FilaSku = {
  tren: string; sap: string; sku: string; formato: number | null; referencia: number | null; cpe: number | null;
  unidades: number; cajas: number | null; estibas: number | null;
  /** Estibas ENTERAS de la fila (lo que se pinta): los días y turnos suman exactamente esto. */
  enteras: number;
  porDia: Record<string, { total: number; t: [number, number, number] }>;
};
export type Vista = {
  dias: string[];
  skus: FilaSku[];
  trenes: { tren: string; porDia: Record<string, number>; total: number }[];
  porDia: Record<string, number>;
  total: number;
  sinFactor: { sap: string; sku: string; tren: string }[];
};

/** Reparte `objetivo` (entero) entre los valores con el método del mayor resto: cada uno queda en su parte entera y las que sobran van a los de mayor decimal. */
export function repartir(valores: number[], objetivo: number): number[] {
  const base = valores.map((v) => Math.floor(v + 1e-9));
  let faltan = objetivo - base.reduce((a, b) => a + b, 0);
  const orden = valores.map((v, i) => ({ i, r: v - base[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; faltan > 0 && orden.length; k = (k + 1) % orden.length, faltan--) base[orden[k].i]++;
  for (let k = orden.length - 1; faltan < 0 && orden.length; k = (k - 1 + orden.length) % orden.length, faltan++) if (base[orden[k].i] > 0) base[orden[k].i]--; else faltan--;
  return base;
}

/** La semana lista para pintar: estibas por SKU y día (y turno), por tren, y los totales. */
export type Medida = "estibas" | "cajas" | "unidades" | "hl";
export const MEDIDAS: { id: Medida; txt: string; unidad: string }[] = [
  { id: "estibas", txt: "Estibas", unidad: "estibas" }, { id: "cajas", txt: "Cajas", unidad: "cajas" },
  { id: "unidades", txt: "Unidades", unidad: "unidades" }, { id: "hl", txt: "Hectolitros", unidad: "HL" },
];

/** Lo que vale un bloque en la medida pedida. Cajas, unidades y HL no necesitan el factor de estibado. */
function valorBloque(b: Bloque, f: { referencia: number | null; cpe: number | null }, medida: Medida): number {
  if (medida === "hl") return b.hl;
  if (medida === "unidades") return b.unidades;
  if (medida === "cajas") return f.referencia ? b.unidades / f.referencia : 0;
  return estibasDe(b.unidades, f.referencia, f.cpe) ?? 0;
}

export function vistaSemana(s: { fecha_ini: string; pendientes: Pendiente[]; bloques: Bloque[] }, factores: Factores, medida: Medida = "estibas"): Vista {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(s.fecha_ini, i));
  const cpeDe = (sap: string) => factores.get(sap)?.cajas_por_estiba ?? null;
  const claves = new Map<string, FilaSku>();
  const llave = (tren: string, sap: string) => tren.toUpperCase() + "|" + sap;
  for (const p of s.pendientes) {
    const cpe = cpeDe(p.sap);
    claves.set(llave(p.tren, p.sap), {
      tren: p.tren.toUpperCase(), sap: p.sap, sku: p.sku || factores.get(p.sap)?.nombre || p.sap, formato: p.formato, referencia: p.referencia, cpe,
      unidades: p.unidades, cajas: cajasDe(p.unidades, p.referencia), estibas: estibasDe(p.unidades, p.referencia, cpe), enteras: 0, porDia: {},
    });
  }
  /* Se acumula EXACTO (con decimales) y al final se reparte en estibas ENTERAS:
     redondear cada casilla por su lado hace que los días no sumen el total de
     la fila (541 + 541 + 540 ≠ 1.621). Se redondea con el método del mayor
     resto: cada fila suma justo su total, el total de la semana es el exacto
     redondeado, y todo lo que se ve en pantalla suma lo que dice. */
  const exacto = new Map<FilaSku, Record<string, [number, number, number]>>();
  for (const b of s.bloques) {
    let f = claves.get(llave(b.tren, b.sap)) ?? [...claves.values()].find((x) => x.sap === b.sap);
    if (!f) {
      const cpe = cpeDe(b.sap);
      f = { tren: b.tren.toUpperCase(), sap: b.sap, sku: factores.get(b.sap)?.nombre || b.sap, formato: null, referencia: null, cpe, unidades: 0, cajas: null, estibas: null, enteras: 0, porDia: {} };
      claves.set(llave(b.tren, b.sap), f);
    }
    const e = valorBloque(b, f, medida);
    const d = exacto.get(f) ?? {}; (d[b.fecha] ??= [0, 0, 0])[b.turno - 1] += e; exacto.set(f, d);
  }
  const filas = [...exacto.keys()];
  const sumaFila = (f: FilaSku) => Object.values(exacto.get(f)!).reduce((a, t) => a + t[0] + t[1] + t[2], 0);
  const metaFilas = repartir(filas.map(sumaFila), Math.round(filas.reduce((a, f) => a + sumaFila(f), 0)));
  const porDia: Record<string, number> = {};
  const trenes = new Map<string, { tren: string; porDia: Record<string, number>; total: number }>();
  let total = 0;
  filas.forEach((f, i) => {
    f.enteras = metaFilas[i];
    const celdas: { dia: string; k: number; v: number }[] = [];
    for (const [dia, t] of Object.entries(exacto.get(f)!)) t.forEach((v, k) => celdas.push({ dia, k, v }));
    const ent = repartir(celdas.map((c) => c.v), metaFilas[i]);
    const tr = trenes.get(f.tren) ?? { tren: f.tren, porDia: {}, total: 0 };
    celdas.forEach((c, j) => {
      if (!ent[j]) return;
      const d = (f.porDia[c.dia] ??= { total: 0, t: [0, 0, 0] });
      d.total += ent[j]; d.t[c.k] += ent[j];
      porDia[c.dia] = (porDia[c.dia] ?? 0) + ent[j];
      tr.porDia[c.dia] = (tr.porDia[c.dia] ?? 0) + ent[j];
    });
    tr.total += metaFilas[i]; trenes.set(f.tren, tr); total += metaFilas[i];
  });
  const skus = [...claves.values()].sort((a, b) => a.tren.localeCompare(b.tren, "es", { numeric: true }) || a.sku.localeCompare(b.sku, "es"));
  return {
    dias, skus, total, porDia,
    trenes: [...trenes.values()].sort((a, b) => a.tren.localeCompare(b.tren, "es", { numeric: true })),
    sinFactor: skus.filter((f) => !f.cpe).map((f) => ({ sap: f.sap, sku: f.sku, tren: f.tren })),
  };
}
