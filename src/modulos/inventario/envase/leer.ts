/**
 * LEER EL INSTRUCTIVO DE ENVASE (Suite 360) Y LA MB51 TAL COMO SALEN, en el navegador.
 *
 * Instructivo_Envase_Barranquilla_AAAA-MM-DD_HH.MM.SS.xlsx — cada hoja «Semana NN» es un plan:
 *   · la fila de días («lunes 16 de noviembre de 2026») marca dónde empieza cada día (24 columnas, una por hora);
 *   · cada tren son 3 filas: etiqueta del SKU («Cost175», «Cos 20867», «PM»…), formato («175 X 38») y HL por bloque;
 *   · «Pendiente por envasar específico» trae el SKU de SAP de cada tren con su formato y referencia: con eso
 *     se traduce la etiqueta (que a veces trae el código y a veces no) al SKU.
 * La suma de la rejilla tiene que dar el «Resumen País»; se comprueba al leer.
 *
 * MB51 (export de SAP): columnas por su NOMBRE. Fechas y horas pueden venir como número de Excel o como texto.
 */
type Celda = string | number | boolean | null | undefined;
const txt = (v: Celda) => String(v ?? "").trim();
const norm = (v: Celda) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const masDias = (f: string, n: number) => new Date(Date.parse(f + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ INSTRUCTIVO */

export type FilaPlan = {
  fecha: string; tren: string; hora: number; etiqueta: string; sku: string | null; nombre: string | null;
  formato_ml: number | null; referencia: number | null; hl: number; unidades: number | null;
};
export type Especifico = { tren: string; nombre: string; sku: string; ml: number; ref: number; hl: number; un: number };
export type PlanLeido = {
  hoja: string; anio: number; semana: number; lunes: string; desde: string; hasta: string; generado: string;
  archivo: string; total_hl: number; filas: FilaPlan[]; especifico: Especifico[]; sinSku: string[];
  /** Total del «Pendiente por envasar específico», para comprobar que la rejilla se leyó entera. */
  totalEspecifico: number;
  /** Lo que la validación por HL cambió («TREN-5 «CC» → 5252 …») y lo que sigue sin cuadrar por SKU. */
  corregidas: string[]; descuadres: string[];
};

/** La hora del archivo sale del nombre (…_2026-11-18_21.40.13.xlsx); si no la trae, de la fecha del archivo. */
export function generadoDe(nombre: string, ultimaMod?: number) {
  const m = nombre.match(/(\d{4})-(\d{2})-(\d{2})[_ T](\d{2})[.:](\d{2})[.:](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const d = new Date(ultimaMod ?? Date.now());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Traduce la etiqueta de la rejilla al SKU, con lo que trae el tren en «Pendiente por envasar específico». */
export function resolverSku(etiqueta: string, formato: string | null, cand: Especifico[]): string | null {
  for (const n of etiqueta.match(/\d{3,6}/g) ?? []) if (cand.some((c) => c.sku === n)) return n;
  let pool = cand;
  if (formato) {
    const [ml, ref] = formato.split(/\s*X\s*/i).map(Number);
    const p2 = cand.filter((c) => c.ml === ml && c.ref === ref);
    if (p2.length) pool = p2;
  }
  if (pool.length <= 1) return pool[0]?.sku ?? null;
  const pre = etiqueta.toLowerCase().replace(/[^a-z]/g, "");
  const alias: [string, string][] = [["alig", "aguila"], ["pok", "poker"], ["cos", "coste"], ["clu", "club"], ["pm", "pony"], ["ag", "aguila"]];
  const clave = alias.find(([k]) => pre.startsWith(k))?.[1] ?? pre.slice(0, 3);
  const quiereLig = pre.startsWith("alig") || pre.includes("lig");
  const puntos = (c: Especifico) => {
    const n = c.nombre.toLowerCase().replace(/ñ/g, "n");
    let p = n.startsWith(clave) ? 10 : 0;
    if ((n.includes("light") || / lig /.test(n + " ")) !== quiereLig) p -= 5;
    if (n.includes("less sugar") || / go /.test(n)) p -= 3;
    /* «Pok330» en TREN-2 es el Poker R 330 (2512), no el NR de exportación USA (23223): la variante especial (EXP, USA, TW,
       TERMOINK, NR) solo gana si la etiqueta la nombra; la de exportación se marca en la rejilla con su SAP («23223»). */
    const variantes = ["exp", "usa", "tw", "termoink", "terc", "nr"].filter((v) => new RegExp(`(^|[^a-z])${v}([^a-z]|$)`).test(n));
    if (variantes.length) p += variantes.some((v) => etiqueta.toLowerCase().includes(v)) ? 6 : -4;
    return p;
  };
  return [...pool].sort((a, b) => puntos(b) - puntos(a))[0].sku;
}

/**
 * VALIDAR POR HL. La etiqueta de la rejilla no siempre dice el SKU («CC», «Pok330», «PM»), pero el mismo Excel lo cuadra:
 * «Pendiente por envasar específico» trae cuántos HL tiene cada SKU en cada tren, y la rejilla es exactamente ese pendiente.
 * Cada etiqueta sin su SAP (un tren, una etiqueta, un formato) es un bloque con su total de HL; se busca qué SKU del mismo
 * tren y formato le corresponde para que, por SKU, la rejilla sume lo mismo que el específico. «TREN-5 «CC» = 1083 HL» →
 * 5252 Club Col Lta (1083), no 16466 Austen. Las etiquetas que traen su SAP («Cos 20867», «23223») no se tocan.
 * Si no hay una asignación que cuadre mejor que la del nombre, se deja la del nombre. Devuelve lo cambiado y lo que no cuadra.
 */
function validarPorHL(filas: FilaPlan[], especifico: Especifico[]): { corregidas: string[]; descuadres: string[] } {
  const corregidas: string[] = [], descuadres: string[] = [];
  const n0 = (x: number) => Math.round(x).toLocaleString("es-CO");
  for (const tren of [...new Set(filas.map((f) => f.tren))]) {
    const cand = especifico.filter((e) => e.tren === tren);
    if (!cand.length) continue;
    const mias = filas.filter((f) => f.tren === tren);
    type Bloque = { etiqueta: string; ml: number | null; ref: number | null; hl: number; sku: string | null; filas: FilaPlan[]; opciones: string[] };
    const bloques = new Map<string, Bloque>();
    const fija = new Map<string, number>();
    for (const f of mias) {
      const conSap = (f.etiqueta.match(/\d{3,6}/g) ?? []).some((n) => n === f.sku && cand.some((c) => c.sku === n));
      if (conSap && f.sku) { fija.set(f.sku, (fija.get(f.sku) ?? 0) + f.hl); continue }
      const k = `${f.etiqueta}|${f.formato_ml}|${f.referencia}`;
      const b = bloques.get(k) ?? { etiqueta: f.etiqueta, ml: f.formato_ml, ref: f.referencia, hl: 0, sku: f.sku, filas: [], opciones: [] };
      b.hl += f.hl; b.filas.push(f); bloques.set(k, b);
    }
    const lista = [...bloques.values()];
    for (const b of lista) {
      const mismo = cand.filter((c) => (!b.ml || c.ml === b.ml) && (!b.ref || c.ref === b.ref)).map((c) => c.sku);
      b.opciones = mismo.length ? mismo : cand.map((c) => c.sku);
    }
    const error = (asig: (string | null)[]) => {
      const suma = new Map(fija);
      asig.forEach((sku, i) => { if (sku) suma.set(sku, (suma.get(sku) ?? 0) + lista[i].hl) });
      let e = 0;
      for (const c of cand) e += Math.abs((suma.get(c.sku) ?? 0) - c.hl);
      for (const [sku, v] of suma) if (!cand.some((c) => c.sku === sku)) e += v;
      return e;
    };
    const actual = lista.map((b) => b.sku);
    let mejor = actual, eMejor = error(actual);
    const combos = lista.reduce((x, b) => x * b.opciones.length, 1);
    if (lista.length && eMejor > 1 && combos <= 200000) {
      const asig: string[] = [];
      const probar = (i: number) => {
        if (i === lista.length) {
          const e = error(asig);
          /* Gana la que menos descuadra; a igual descuadre, la que más se parece a la del nombre. */
          const cambios = asig.filter((s, j) => s !== actual[j]).length, cambiosMejor = mejor.filter((s, j) => s !== actual[j]).length;
          if (e < eMejor - 0.5 || (Math.abs(e - eMejor) <= 0.5 && cambios < cambiosMejor)) { mejor = [...asig]; eMejor = e }
          return;
        }
        for (const o of lista[i].opciones) { asig[i] = o; probar(i + 1) }
      };
      probar(0);
    }
    mejor.forEach((sku, i) => {
      const b = lista[i];
      if (!sku || sku === b.sku) return;
      const e = cand.find((c) => c.sku === sku)!;
      for (const f of b.filas) {
        f.sku = sku; f.nombre = e.nombre; f.formato_ml = e.ml || f.formato_ml; f.referencia = e.ref || f.referencia;
        f.unidades = f.formato_ml ? Math.round((f.hl * 1e5) / f.formato_ml) : null;
      }
      corregidas.push(`${tren} «${b.etiqueta}» (${n0(b.hl)} HL) → ${sku} ${e.nombre}${b.sku ? ` (por nombre salía ${b.sku})` : ""}`);
    });
    /* Lo que sigue sin cuadrar, SKU por SKU. */
    const suma = new Map<string, number>();
    for (const f of mias) if (f.sku) suma.set(f.sku, (suma.get(f.sku) ?? 0) + f.hl);
    for (const c of cand) { const r = suma.get(c.sku) ?? 0; if (Math.abs(r - c.hl) > 1) descuadres.push(`${tren} · ${c.sku} ${c.nombre}: rejilla ${n0(r)} HL, específico ${n0(c.hl)} HL`) }
    for (const [sku, r] of suma) if (!cand.some((c) => c.sku === sku)) descuadres.push(`${tren} · ${sku}: ${n0(r)} HL en la rejilla y no está en el específico`);
  }
  return { corregidas, descuadres };
}

/** Celdas combinadas de la hoja, en coordenadas de R (fila, columna): para repartir el HL de un turno entre sus horas. */
type Combinada = { r0: number; c0: number; r1: number; c1: number };

function leerHoja(R: Celda[][], hoja: string, archivo: string, generado: string, combinadas: Combinada[] = []): PlanLeido | null {
  /* Días: la fila con «lunes 16 de noviembre de 2026». */
  const dias = new Map<number, string>();
  for (const fila of R) {
    fila.forEach((c, j) => {
      const m = typeof c === "string" ? norm(c).match(/(\d+) de (\w+) de (\d{4})/) : null;
      if (m && MESES.includes(m[2])) dias.set(j, iso(+m[3], MESES.indexOf(m[2]) + 1, +m[1]));
    });
    if (dias.size >= 5) break;
    dias.clear();
  }
  if (dias.size < 5) return null;
  const cols = [...dias.keys()].sort((a, b) => a - b);
  const c0 = cols[0];
  const diaDe = (j: number) => { let d = ""; for (const c of cols) if (c <= j) d = dias.get(c)!; return d };

  /* Pendiente por envasar específico. */
  const fe = R.findIndex((r) => r.some((c) => norm(c) === "pendiente por envasar especifico"));
  if (fe < 0) return null;
  const h = R[fe + 1].map(norm);
  const cL = h.indexOf("linea");
  const desde = (n: string) => h.findIndex((x, i) => i > cL && x === n);
  const cS = desde("sku"), cP = desde("sap"), cF = desde("formato"), cR = desde("referencia"), cH = desde("hl"), cU = desde("unidades");
  const especifico: Especifico[] = [];
  let totalEspecifico = 0;
  for (const r of R.slice(fe + 2)) {
    const l = txt(r[cL]);
    if (/^total$/i.test(l)) { totalEspecifico = Number(r[cH]) || especifico.reduce((a, e) => a + e.hl, 0); break }
    if (!l || !txt(r[cP])) continue;
    especifico.push({ tren: l, nombre: txt(r[cS]), sku: txt(r[cP]).replace(/\.0+$/, ""), ml: Number(r[cF]) || 0,
                      ref: Number(r[cR]) || 0, hl: Number(r[cH]) || 0, un: Number(r[cU]) || 0 });
  }
  if (!totalEspecifico) totalEspecifico = especifico.reduce((a, e) => a + e.hl, 0);

  /* La rejilla: TREN-N · formato · HL. */
  const filas: FilaPlan[] = [];
  const sinSku = new Set<string>();
  const fin = c0 + 24 * cols.length;
  for (let i = 0; i < fe; i++) {
    const r0 = txt(R[i]?.[0]);
    if (!/^TREN/i.test(r0)) continue;
    const lab = R[i], fmt = R[i + 1] ?? [], hl = R[i + 2] ?? [];
    const cand = especifico.filter((e) => e.tren === r0);
    for (let j = c0; j < fin; j++) {
      const v = hl[j];
      if (typeof v !== "number" || !(v > 0)) continue;
      let etiqueta = ""; for (let k = j; k >= c0; k--) { if (txt(lab[k])) { etiqueta = txt(lab[k]); break } }
      let formato: string | null = null;
      for (let k = j; k >= c0; k--) { const f = txt(fmt[k]); if (/^\d+\s*X\s*\d+$/i.test(f)) { formato = f; break } }
      const sku = resolverSku(etiqueta, formato, cand);
      const e = especifico.find((x) => x.sku === sku);
      const ml = e?.ml || (formato ? Number(formato.split(/\s*X\s*/i)[0]) : 0) || null;
      const ref = e?.ref || (formato ? Number(formato.split(/\s*X\s*/i)[1]) : 0) || null;
      if (!sku) sinSku.add(`${r0} · ${etiqueta}`);
      /* El HL de un turno viene en UNA celda combinada sobre sus horas (T1: 00:00 a 07:00 = 731 HL): se reparte parejo
         entre esas horas, para que el plan «hasta las 06:00» sume 6 de 8 y no el turno entero. */
      const m = combinadas.find((x) => x.r0 <= i + 2 && i + 2 <= x.r1 && x.c0 === j);
      const ancho = m ? Math.max(1, Math.min(m.c1, fin - 1) - j + 1) : 1;
      for (let k = 0; k < ancho; k++) {
        const parte = v / ancho;
        filas.push({ fecha: diaDe(j + k), tren: r0, hora: (j + k - c0) % 24, etiqueta, sku, nombre: e?.nombre ?? null,
                     formato_ml: ml, referencia: ref, hl: parte, unidades: ml ? Math.round((parte * 1e5) / ml) : null });
      }
    }
    i += 3;
  }
  if (!filas.length) return null;
  const { corregidas, descuadres } = validarPorHL(filas, especifico);
  const fechas = filas.map((f) => f.fecha).sort();
  const lunes = dias.get(c0)!;
  const sem = Number(hoja.match(/\d+/)?.[0] ?? 0);
  return {
    hoja, anio: Number(lunes.slice(0, 4)), semana: sem, lunes, desde: fechas[0], hasta: masDias(lunes, cols.length - 1),
    generado, archivo, total_hl: filas.reduce((a, f) => a + f.hl, 0), filas, especifico, sinSku: [...sinSku], totalEspecifico, corregidas, descuadres,
  };
}

export async function leerInstructivo(datos: ArrayBuffer, archivo: string, ultimaMod?: number): Promise<{ planes: PlanLeido[]; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array" });
  const generado = generadoDe(archivo, ultimaMod);
  const planes: PlanLeido[] = [];
  for (const n of libro.SheetNames) {
    if (!/^semana\s*\d+/i.test(n.trim())) continue;
    const ws = libro.Sheets[n];
    const R = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null });
    /* R empieza en la primera celda del rango de la hoja: las combinadas se corren a esas coordenadas. */
    const ini = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s : { r: 0, c: 0 };
    const combinadas = (ws["!merges"] ?? []).map((x) => ({ r0: x.s.r - ini.r, c0: x.s.c - ini.c, r1: x.e.r - ini.r, c1: x.e.c - ini.c }));
    const p = leerHoja(R, n.trim(), archivo, generado, combinadas);
    if (p) planes.push(p);
  }
  if (!planes.length) return { planes, error: "No encontré hojas «Semana NN» con la rejilla de trenes en ese archivo." };
  return { planes };
}

/* ------------------------------------------------------------------ MB51 */

export type FilaMB51 = {
  clave: string; fecha_contab: string; fecha_entrada: string; hora_entrada: string; centro: string; almacen: string;
  clase: string; material: string; texto: string; documento: string; usuario: string; cantidad: number; um: string; orden: string;
};

const p2 = (n: number) => String(n).padStart(2, "0");
/** Fecha de Excel (número de serie o texto dd.mm.aaaa / dd/mm/aaaa / aaaa-mm-dd) → aaaa-mm-dd. */
export function fechaDe(v: Celda): string | null {
  if (typeof v === "number" && v > 20000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}
/** Hora de Excel (fracción del día o texto hh:mm:ss) → hh:mm:ss. */
export function horaDe(v: Celda): string | null {
  if (typeof v === "number") {
    const s = Math.round((v % 1) * 86400) % 86400;
    return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
  }
  const m = txt(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${p2(+m[1])}:${m[2]}:${m[3] ?? "00"}` : null;
}
const numero = (v: Celda) => {
  if (typeof v === "number") return v;
  let s = txt(v).replace(/\s/g, ""); if (!s) return NaN;
  let neg = false; if (s.endsWith("-")) { neg = true; s = s.slice(0, -1) }
  if (/,\d{1,3}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s); return neg ? -n : n;
};
const codigo = (v: Celda) => txt(v).replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");

export async function leerMB51(datos: ArrayBuffer): Promise<{ filas: FilaMB51[]; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array" });
  const R = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null });
  const i = R.slice(0, 15).findIndex((f) => f.some((c) => /contabiliz/.test(norm(c))) && f.some((c) => /clase de mov/.test(norm(c))));
  if (i < 0) return { filas: [], error: "No parece una MB51: faltan las columnas «Fe.contabilización» y «Clase de movimiento»." };
  const t = R[i].map(norm);
  const c = (re: RegExp) => t.findIndex((x) => re.test(x));
  const C = {
    fc: c(/contabiliz/), fe: c(/fecha de entrada/), ce: c(/^centro$/), al: c(/^almacen$/), cm: c(/clase de mov/),
    mat: c(/^material$/), tx: c(/texto breve/), doc: c(/documento/), us: c(/usuario/), h: c(/hora de entrada/),
    q: c(/^cantidad$/), um: c(/medida/), ord: c(/^orden$/),
  };
  const faltan = (["fc", "fe", "cm", "mat", "h", "q"] as const).filter((k) => C[k] < 0);
  if (faltan.length) return { filas: [], error: "A la MB51 le faltan columnas: necesito Fe.contabilización, Fecha de entrada, Hora de entrada, Clase de movimiento, Material y Cantidad." };
  const vistas = new Map<string, number>();
  const filas: FilaMB51[] = [];
  for (const r of R.slice(i + 1)) {
    const fc = fechaDe(r[C.fc]), fe = fechaDe(r[C.fe]), h = horaDe(r[C.h]), q = numero(r[C.q]);
    const mat = codigo(r[C.mat]); const cm = txt(r[C.cm]);
    if (!fc || !fe || !h || !mat || !cm || !Number.isFinite(q)) continue;
    const doc = C.doc >= 0 ? codigo(r[C.doc]) : "";
    const al = C.al >= 0 ? txt(r[C.al]).toUpperCase() : "";
    const base = [doc, mat, al, cm, q, fe, h].join("|");
    const n = (vistas.get(base) ?? 0) + 1; vistas.set(base, n);
    filas.push({
      clave: `${base}|${n}`, fecha_contab: fc, fecha_entrada: fe, hora_entrada: h, centro: C.ce >= 0 ? txt(r[C.ce]) : "",
      almacen: al, clase: cm, material: mat, texto: C.tx >= 0 ? txt(r[C.tx]) : "", documento: doc,
      usuario: C.us >= 0 ? txt(r[C.us]) : "", cantidad: q, um: C.um >= 0 ? txt(r[C.um]) : "", orden: C.ord >= 0 ? codigo(r[C.ord]) : "",
    });
  }
  if (!filas.length) return { filas, error: "La MB51 no trae movimientos." };
  return { filas };
}

/* ------------------------------------------------------------------ REPORTE DE ADHERENCIA */

/**
 * Reporte_de_Adherencia_AAAA-MM-DD_HH.MM.SS.xlsx — el cierre REAL de la semana: por planta, semana («2026-47»), línea
 * («TREN-7») y producto («21447 - PONY MALTA LESS SUGAR PET 200CC X6»), lo real producido en CAJAS (puede traer decimales).
 * Columnas por su nombre. Un mismo SKU en la misma línea se suma. De la etiqueta se saca el SKU y las unidades por caja («X6»).
 */
export type FilaAdherencia = { planta: string; tren: string; sku: string; producto: string; ref: number | null; cajas_real: number; cajas_plan: number | null };
export type AdherenciaLeida = { anio: number; semana: number; lunes: string; filas: FilaAdherencia[]; archivo: string };

/** El lunes de una semana ISO (la semana 1 es la del 4 de enero). */
export function lunesIso(anio: number, semana: number) {
  const e4 = new Date(Date.UTC(anio, 0, 4, 12));
  const lunes1 = new Date(e4.getTime() - ((e4.getUTCDay() + 6) % 7) * 864e5);
  return new Date(lunes1.getTime() + (semana - 1) * 7 * 864e5).toISOString().slice(0, 10);
}

export async function leerAdherencia(datos: ArrayBuffer, archivo: string): Promise<{ reportes: AdherenciaLeida[]; error?: string }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array" });
  const R = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null });
  const fc = R.findIndex((f) => f.some((c) => /real.*cajas/.test(norm(c))));
  if (fc < 0) return { reportes: [], error: "No encontré la columna «Real (Cajas)»." };
  const cab = R[fc].map(norm);
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const cP = col(/^planta/), cS = col(/^semana/), cL = col(/^linea/), cPr = col(/^producto/), cR = col(/real.*cajas/), cPl = col(/planead.*cajas/);
  if (cS < 0 || cL < 0 || cPr < 0) return { reportes: [], error: "Faltan columnas: se esperan Semana, Linea, Producto y Real (Cajas)." };
  const num = (v: Celda) => { if (typeof v === "number") return v; const t = txt(v).replace(/\./g, "").replace(",", "."); return t === "" ? null : Number(t) };
  const porSem = new Map<string, AdherenciaLeida>();
  for (const f of R.slice(fc + 1)) {
    const sem = txt(f[cS]).match(/(\d{4})\D+(\d{1,2})/);
    const pr = txt(f[cPr]), m = pr.match(/^(\d{3,})\s*-\s*(.*)$/);
    const real = num(f[cR]);
    if (!sem || !m || real == null || !Number.isFinite(real)) continue;
    const anio = Number(sem[1]), semana = Number(sem[2]), k = `${anio}-${semana}`;
    if (!porSem.has(k)) porSem.set(k, { anio, semana, lunes: lunesIso(anio, semana), filas: [], archivo });
    const tren = txt(f[cL]).toUpperCase().replace(/\s+/g, ""), sku = m[1];
    const refM = [...m[2].matchAll(/X\s*(\d+)/gi)].pop();   // la última «X N» del nombre («250cc X 38 BOT RB», «200ccX30»)
    const pl = cPl >= 0 ? num(f[cPl]) : null;
    const filas = porSem.get(k)!.filas, ya = filas.find((x) => x.tren === tren && x.sku === sku);
    if (ya) { ya.cajas_real += real; if (pl != null && Number.isFinite(pl)) ya.cajas_plan = (ya.cajas_plan ?? 0) + pl }
    else filas.push({ planta: cP >= 0 ? txt(f[cP]) : "", tren, sku, producto: m[2].trim(), ref: refM ? Number(refM[1]) : null, cajas_real: real, cajas_plan: pl != null && Number.isFinite(pl) ? pl : null });
  }
  if (!porSem.size) return { reportes: [], error: "El reporte no trae filas con semana, producto y cajas reales." };
  return { reportes: [...porSem.values()] };
}

/** ¿Qué es este archivo? Por el nombre y, si no dice, por el contenido. */
export async function queEs(datos: ArrayBuffer, nombre: string): Promise<"instructivo" | "mb51" | "adherencia" | null> {
  if (/instructivo/i.test(nombre)) return "instructivo";
  if (/mb51/i.test(nombre)) return "mb51";
  if (/adherencia/i.test(nombre)) return "adherencia";
  const XLSX = await import("xlsx");
  const libro = XLSX.read(datos, { type: "array", sheetRows: 12 });
  if (libro.SheetNames.some((n) => /^semana\s*\d+/i.test(n.trim()))) return "instructivo";
  const R = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: null });
  if (R.some((f) => f.some((c) => /contabiliz/.test(norm(c))))) return "mb51";
  if (R.some((f) => f.some((c) => /real.*cajas/.test(norm(c))))) return "adherencia";
  return null;
}
