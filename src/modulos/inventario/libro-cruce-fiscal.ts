/**
 * EL CRUCE DEL INVENTARIO FISCAL, EN UN SOLO EXCEL.
 *
 * «Si quiero descargar el Excel para el análisis, en uno solo.»
 *
 * Cada hoja del fiscal la cuentan dos personas —una del operador logístico
 * y otra de Bavaria—, a ciegas, y al terminar se cruzan. Este libro junta
 * el cruce de TODAS las hojas del inventario en un archivo, para analizar
 * sin ir hoja por hoja:
 *
 *   Resumen        una fila por pareja (hoja): quiénes son, cómo van, cuántos
 *                  renglones coinciden, cuántas cajas contó cada quien y cuánto
 *                  se aleja una cuenta de la otra. Con el total del inventario.
 *   Diferencias    solo lo que no coincide, lo más grande primero: lo que hay
 *                  que ir a mirar.
 *   Por material   la suma por código en todas las hojas: qué materiales son
 *                  los que más difieren.
 *   Por persona    una fila por persona: cuántos renglones anotó, estibas, saldo,
 *                  cajas, a qué hora empezó y terminó, y si lo suyo cuadra con el cruce.
 *   Conteos por persona
 *                  lo que anotó CADA persona, renglón por renglón, tal cual (estibas,
 *                  saldo, cajas sueltas, nota y hora), agrupado por hoja y pareja.
 *   Conteos cruzados
 *                  TODOS los renglones de todas las hojas ya cruzados, lado a lado:
 *                  hoja, sitio, material, vencimiento, cajas de cada quien y la
 *                  diferencia (en fórmula: se puede cambiar y se recalcula).
 *
 * Una hoja que todavía no está lista para cruzar sale en el Resumen con lo
 * que le falta, y sin renglones: nunca se inventa un cruce.
 *
 * Puro de datos: recibe lo que ya se cruzó, no lee la base.
 */
import ExcelJS from "exceljs";
import { textoVenc, TEXTO_FILA, TEXTO_ESTADO, type ConteoPersona, type EstadoHoja, type FilaCruce } from "./fiscal-cruce";

export type ColoresLibro = { tinta: string; banda: string };   // RRGGBB
const MARCA: ColoresLibro = { tinta: "12263A", banda: "FFC000" };

export type HojaCruzada = {
  numero: number;
  ol: string | null; bavaria: string | null;
  estado: EstadoHoja;
  olRenglones: number; bavariaRenglones: number;
  /** null = todavía no se pudo cruzar (falta que alguien termine). */
  filas: FilaCruce[] | null;
  /** Lo que anotó cada persona, renglón por renglón. null = no se pudo leer (hoja sin cruzar, o falta el SQL). */
  conteos?: ConteoPersona[] | null;
  /** Cuándo terminó cada una (ISO), si ya terminó. */
  olTermino?: string | null; bavariaTermino?: string | null;
};

export type InsumosCruce = {
  nombre: string;          // «FISCAL OCTUBRE 2026 · viernes 02/10»
  fecha: string;           // YYYY-MM-DD, la del inventario
  quien: string;           // quien exporta
  hojas: HojaCruzada[];
  sello: ArrayBuffer | Uint8Array | null;
  colores?: ColoresLibro;
  /** true = a la base le falta 2026-10-fiscal-conteos-por-persona.sql: el libro lo dice en vez de dejar las pestañas en blanco. */
  sinConteos?: boolean;
};

/* ---------- colores ---------- */
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const aclarar = (h: string, t: number) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
const BLANCO = "FFFFFFFF", VERDE = "FF00B050", NARANJA = "FFFF6A00", ROJO = "FFE0123B";
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> =>
  ({ name: "Calibri", size, bold, color: { argb: color }, ...extra });
const EMU = 9525;
const en = (col: number, dx: number, fila: number, dy: number) =>
  ({ nativeCol: col, nativeColOff: Math.round(dx * EMU), nativeRow: fila, nativeRowOff: Math.round(dy * EMU) }) as unknown as ExcelJS.Anchor;

type Paleta = { TINTA: string; BANDA: string; GRIS: string; LINEA: string; FONDO: string };
function paleta(c?: ColoresLibro): Paleta {
  const ok = (x?: string) => !!x && /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c?.tinta) ? c!.tinta : MARCA.tinta, b = ok(c?.banda) ? c!.banda : MARCA.banda;
  return { TINTA: aHex(hex(t)), BANDA: aHex(hex(b)), GRIS: aclarar(t, 0.64), LINEA: aclarar(t, 0.13), FONDO: aclarar(t, 0.045) };
}

/* Los nombres de las pestañas (las fórmulas del resumen los leen). */
const S_DET = "Conteos cruzados", S_CON = "Conteos por persona";

const NF = "#,##0;[Red]-#,##0;0";
const DIF = '+#,##0;[Red]-#,##0;0';
const PCT = "0.0%";

/** Cuánto se alejan las dos cuentas, en cajas, sumando lo que no coincide. */
export function cajasDistintas(filas: FilaCruce[]): number {
  return filas.reduce((t, f) => t + Math.abs(f.diferencia), 0);
}
/** Qué tan parecidas son las dos cuentas: 100 % si todas las cajas coinciden. */
export function exactitud(filas: FilaCruce[]): number {
  const ol = filas.reduce((t, f) => t + (f.cajasOl ?? 0), 0), ba = filas.reduce((t, f) => t + (f.cajasBavaria ?? 0), 0);
  const mayor = Math.max(ol, ba);
  return mayor === 0 ? 1 : Math.max(0, 1 - cajasDistintas(filas) / mayor);
}
/** Qué dice de una hoja, en una frase. */
export function lecturaHoja(h: HojaCruzada): string {
  if (h.filas) {
    if (h.filas.length === 0) return "Ninguno de los dos contó nada.";
    const dif = h.filas.filter((f) => f.estado !== "COINCIDE").length;
    return dif === 0 ? `Todo coincide (${h.filas.length} renglones).` : `${dif} de ${h.filas.length} renglones no coinciden.`;
  }
  if (h.estado === "una-termino") return "Falta que la otra persona termine.";
  if (h.estado === "contando") return "Todavía están contando.";
  return "Sin empezar.";
}

function cabecera(h: ExcelJS.Worksheet, P: Paleta, sello: number | null, titulo: string, sub: string, ancho: number, volver = true) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= ancho; c++) h.getCell(1, c).fill = relleno(P.BANDA);
  h.getRow(2).height = 9.75; h.getRow(3).height = 30; h.getRow(4).height = 16; h.getRow(5).height = 9.75;
  if (sello != null) h.addImage(sello, { tl: en(1, 4, 2, 0), ext: { width: 40, height: 40 } });
  const t = h.getCell(3, 3); t.value = titulo; t.font = letra(18, P.TINTA, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 3); s.value = sub; s.font = letra(9.5, P.GRIS);
  /* Como en el consolidado: en cada pestaña, el camino de vuelta a la portada. */
  if (volver) {
    h.getRow(5).height = 16;
    const v = h.getCell(5, 3); v.value = { formula: `HYPERLINK("#'Resumen'!A1","← volver al resumen")`, result: "← volver al resumen" };
    v.font = letra(9, "FF0563C1", false, { underline: true });
  }
}
const encabezado = (h: ExcelJS.Worksheet, fila: number, P: Paleta, cols: string[]) => {
  h.getRow(fila).height = 30;
  cols.forEach((t, i) => {
    const c = h.getCell(fila, 2 + i); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(P.TINTA);
    c.alignment = { vertical: "middle", horizontal: i < 3 ? "left" : "center", indent: 1, wrapText: true };
  });
};
const celda = (c: ExcelJS.Cell, P: Paleta, par: boolean, o: { num?: boolean; centro?: boolean; negrita?: boolean; fmt?: string } = {}) => {
  c.font = letra(10, P.TINTA, !!o.negrita);
  c.alignment = { vertical: "middle", indent: o.num ? 0 : 1, horizontal: o.num ? "right" : o.centro ? "center" : "left" };
  c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } };
  if (par) c.fill = relleno(P.FONDO);
  if (o.fmt) c.numFmt = o.fmt;
};
const pareja = (h: HojaCruzada) => `${h.ol ?? "—"}  ·  ${h.bavaria ?? "—"}`;
const COLOR_ESTADO: Record<string, string> = { COINCIDE: VERDE, DIFIERE: NARANJA, SOLO_OL: ROJO, SOLO_BAVARIA: ROJO };
const colorPct = (p: number) => (p >= 0.95 ? VERDE : p >= 0.8 ? NARANJA : ROJO);

export async function armarCruceFiscal(o: InsumosCruce): Promise<ArrayBuffer> {
  const P = paleta(o.colores);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Inventario fiscal"; wb.created = new Date();
  const sello = o.sello ? wb.addImage({ buffer: o.sello as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const cruzadas = o.hojas.filter((h) => h.filas);
  const todas = cruzadas.flatMap((h) => h.filas!.map((f) => ({ h, f })));
  const hoy = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fechaInv = o.fecha.split("-").reverse().join("/");
  const sub = `${o.nombre}  ·  inventario del ${fechaInv}  ·  exportado${o.quien ? ` por ${o.quien}` : ""} el ${hoy}`;

  /* LAS PESTAÑAS EN SU ORDEN: primero lo que se lee, al final el detalle. */
  const rs = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: P.BANDA } } });
  const df = wb.addWorksheet("Diferencias", { properties: { tabColor: { argb: NARANJA } } });
  const pm = wb.addWorksheet("Por material", { properties: { tabColor: { argb: P.TINTA } } });
  const pp = wb.addWorksheet("Por persona", { properties: { tabColor: { argb: P.BANDA } } });
  const cp = wb.addWorksheet(S_CON, { properties: { tabColor: { argb: P.TINTA } } });
  const d = wb.addWorksheet(S_DET, { properties: { tabColor: { argb: P.TINTA } } });
  wb.calcProperties = { fullCalcOnLoad: true };
  /* Para imprimir: horizontal y todas las columnas en el ancho de la hoja. */
  for (const w of [rs, df, pm, pp, cp, d]) w.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  /* =================== DETALLE (se arma primero: el resumen lo lee con fórmulas) =================== */
  const DC = ["Hoja", "Pareja (operador · Bavaria)", "Estado", "Sitio", "Código", "Material", "Vence",
    "Cajas operador", "Cajas Bavaria", "Diferencia (operador − Bavaria)", "Diferencia sin signo", "Diferencia sobre la mayor"];
  const DA = [2, 7, 34, 17, 18, 11, 38, 13, 13, 13, 17, 14, 15, 2];
  d.columns = DA.map((w) => ({ width: w }));
  cabecera(d, P, sello, "Conteos cruzados · todas las hojas, lado a lado", sub, DA.length);
  const DF0 = 7;
  encabezado(d, DF0, P, DC);
  todas.forEach(({ h, f }, i) => {
    const r = DF0 + 1 + i, row = d.getRow(r); row.height = 20;
    const ol = f.cajasOl, ba = f.cajasBavaria, mayor = Math.max(ol ?? 0, ba ?? 0);
    const vals: ExcelJS.CellValue[] = [h.numero, pareja(h), TEXTO_FILA[f.estado], f.ubicacion, f.sku, f.material,
      textoVenc(f.vencDia, f.vencMes, f.vencAnio), ol, ba,
      { formula: `N(I${r})-N(J${r})`, result: f.diferencia },
      { formula: `ABS(K${r})`, result: Math.abs(f.diferencia) },
      { formula: `IF(MAX(N(I${r}),N(J${r}))=0,0,L${r}/MAX(N(I${r}),N(J${r})))`, result: mayor === 0 ? 0 : Math.abs(f.diferencia) / mayor }];
    vals.forEach((v, k) => {
      const c = row.getCell(2 + k); c.value = v;
      celda(c, P, i % 2 === 1, { num: k >= 7 && k <= 10, centro: k === 0 || k === 2 || k === 6, fmt: k === 9 ? DIF : k === 10 ? NF : k === 11 ? PCT : k === 7 || k === 8 ? NF : undefined, negrita: k === 4 });
    });
    const e = row.getCell(4); e.fill = relleno(COLOR_ESTADO[f.estado]); e.font = letra(9, BLANCO, true);
  });
  const dUlt = DF0 + todas.length;
  if (todas.length > 0) d.autoFilter = { from: { row: DF0, column: 2 }, to: { row: dUlt, column: 1 + DC.length } };
  d.views = [{ showGridLines: false, state: "frozen", ySplit: DF0, xSplit: 2 }];
  const dr = (col: string) => `'${S_DET}'!$${col}$${DF0 + 1}:$${col}$${Math.max(dUlt, DF0 + 1)}`;

  /* =================== RESUMEN =================== */
  const RC = ["Hoja", "Operador logístico", "Bavaria", "Estado", "Renglones", "Coinciden", "Difieren", "Solo operador", "Solo Bavaria",
    "Cajas operador", "Cajas Bavaria", "Diferencia neta", "Cajas distintas", "% de renglones que coinciden", "Exactitud en cajas", "Lectura"];
  const RA = [2, 7, 24, 24, 17, 11, 11, 11, 11, 11, 14, 14, 13, 13, 15, 14, 44, 2];
  rs.columns = RA.map((w) => ({ width: w }));
  cabecera(rs, P, sello, "Cruce del inventario fiscal · por pareja", sub, RA.length, false);
  const listas = cruzadas.length;
  const totFilas = todas.length, coinc = todas.filter((x) => x.f.estado === "COINCIDE").length;
  const sumOl = todas.reduce((t, x) => t + (x.f.cajasOl ?? 0), 0), sumBa = todas.reduce((t, x) => t + (x.f.cajasBavaria ?? 0), 0);
  const dist = todas.reduce((t, x) => t + Math.abs(x.f.diferencia), 0);
  const pctInv = totFilas ? coinc / totFilas : 1;
  const mayorInv = Math.max(sumOl, sumBa), exInv = mayorInv === 0 ? 1 : Math.max(0, 1 - dist / mayorInv);
  /* las cifras grandes */
  const cifras: [string, string | number, string, string?][] = [
    ["HOJAS CRUZADAS", `${listas} de ${o.hojas.length}`, listas === o.hojas.length ? VERDE : NARANJA],
    ["RENGLONES QUE COINCIDEN", pctInv, colorPct(pctInv), PCT],
    ["CAJAS · OPERADOR", sumOl, P.BANDA, NF], ["CAJAS · BAVARIA", sumBa, P.BANDA, NF],
    ["CAJAS DISTINTAS", dist, dist ? NARANJA : VERDE, NF], ["EXACTITUD EN CAJAS", exInv, colorPct(exInv), PCT],
  ];
  rs.getRow(6).height = 15; rs.getRow(7).height = 30; rs.getRow(8).height = 12;
  const pares: [number, number][] = [[2, 3], [4, 5], [6, 8], [9, 11], [12, 14], [15, 17]];
  cifras.forEach(([t, v, raya, fmt], i) => {
    const [a, b] = pares[i];
    rs.mergeCells(6, a, 6, b); rs.mergeCells(7, a, 7, b);
    for (let c = a; c <= b; c++) { rs.getCell(6, c).fill = relleno(P.FONDO); rs.getCell(7, c).fill = relleno(P.FONDO) }
    const lado: Partial<ExcelJS.Borders> = { left: { style: "thick", color: { argb: raya } }, right: { style: "thick", color: { argb: BLANCO } } };
    const x = rs.getCell(6, a); x.value = t; x.font = letra(7.5, P.GRIS, true); x.alignment = { indent: 1, vertical: "bottom" }; x.border = lado;
    const y = rs.getCell(7, a); y.value = v; y.font = letra(20, P.TINTA, true); y.alignment = { indent: 1, vertical: "middle", horizontal: "left" }; y.border = lado;
    if (fmt) y.numFmt = fmt;
  });
  const RF0 = 9;
  encabezado(rs, RF0, P, RC);
  o.hojas.forEach((h, i) => {
    const r = RF0 + 1 + i, row = rs.getRow(r); row.height = 24;
    const fs = h.filas, hojaN = h.numero;
    const cuenta = (est: string) => (fs ? fs.filter((f) => f.estado === est).length : 0);
    const sOl = fs ? fs.reduce((t, f) => t + (f.cajasOl ?? 0), 0) : 0, sBa = fs ? fs.reduce((t, f) => t + (f.cajasBavaria ?? 0), 0) : 0;
    const dd = fs ? cajasDistintas(fs) : 0, pc = fs ? (fs.length ? cuenta("COINCIDE") / fs.length : 1) : null;
    const ex = fs ? exactitud(fs) : null;
    const contar = (est: string, res: number): ExcelJS.CellValue => fs ? { formula: `COUNTIFS(${dr("B")},B${r},${dr("D")},"${est}")`, result: res } : null;
    const vals: ExcelJS.CellValue[] = [
      hojaN, h.ol ?? "falta", h.bavaria ?? "falta", TEXTO_ESTADO[h.estado],
      fs ? { formula: `COUNTIFS(${dr("B")},B${r})`, result: fs.length } : null,
      contar(TEXTO_FILA.COINCIDE, cuenta("COINCIDE")), contar(TEXTO_FILA.DIFIERE, cuenta("DIFIERE")),
      contar(TEXTO_FILA.SOLO_OL, cuenta("SOLO_OL")), contar(TEXTO_FILA.SOLO_BAVARIA, cuenta("SOLO_BAVARIA")),
      fs ? { formula: `SUMIFS(${dr("I")},${dr("B")},B${r})`, result: sOl } : null,
      fs ? { formula: `SUMIFS(${dr("J")},${dr("B")},B${r})`, result: sBa } : null,
      fs ? { formula: `K${r}-L${r}`, result: sOl - sBa } : null,
      fs ? { formula: `SUMIFS(${dr("L")},${dr("B")},B${r})`, result: dd } : null,
      pc, ex, lecturaHoja(h),
    ];
    vals.forEach((v, k) => {
      const c = row.getCell(2 + k); c.value = v;
      celda(c, P, i % 2 === 1, { num: k >= 4 && k <= 12, centro: k === 0 || k === 3, negrita: k === 0 || k === 1 || k === 2,
        fmt: k === 11 ? DIF : k >= 4 && k <= 12 ? NF : k === 13 || k === 14 ? PCT : undefined });
    });
    const e = row.getCell(5); e.font = letra(9, BLANCO, true);
    e.fill = relleno(h.estado === "lista" ? VERDE : h.estado === "una-termino" ? NARANJA : "FF8A8E8A");
    for (const k of [14, 15]) { const v = k === 14 ? pc : ex; if (v !== null) { const c = row.getCell(k + 1); c.font = letra(10, BLANCO, true); c.fill = relleno(colorPct(v)); c.alignment = { vertical: "middle", horizontal: "center" } } }
    row.getCell(17).alignment = { vertical: "middle", indent: 1, wrapText: true };
  });
  /* total del inventario */
  const T = RF0 + 1 + o.hojas.length, tot = rs.getRow(T); tot.height = 26;
  const totales = [totFilas, coinc, todas.filter((x) => x.f.estado === "DIFIERE").length, todas.filter((x) => x.f.estado === "SOLO_OL").length,
    todas.filter((x) => x.f.estado === "SOLO_BAVARIA").length, sumOl, sumBa, sumOl - sumBa, dist];     // columnas F..N
  const filaT: ExcelJS.CellValue[] = ["", "TOTAL DEL INVENTARIO", "", "", ...totales.map((v, i) => {
    const col = String.fromCharCode(70 + i);                                                           // F, G, … N
    return { formula: `SUM(${col}${RF0 + 1}:${col}${T - 1})`, result: v } as ExcelJS.CellValue;
  }), pctInv, exInv, `${listas} de ${o.hojas.length} hojas cruzadas`];
  filaT.forEach((v, k) => {
    const c = tot.getCell(2 + k); if (v !== "") c.value = v;
    c.font = letra(10.5, BLANCO, true); c.fill = relleno(P.TINTA);
    c.alignment = { vertical: "middle", indent: k < 3 || k === 15 ? 1 : 0, horizontal: k >= 4 && k <= 14 ? "right" : "left" };
    if (k >= 4 && k <= 12) c.numFmt = k === 11 ? DIF : NF;
    if (k === 13 || k === 14) c.numFmt = PCT;
  });
  /* cómo leerlo */
  const N0 = T + 2;
  const notas = [
    "CÓMO LEERLO",
    "Cada hoja la cuentan dos personas, a ciegas: una del operador logístico y una de Bavaria. Se cruzan cuando las dos terminan.",
    "Un renglón es «lo mismo» si coincide el sitio, el material y el vencimiento. Coincide si además las cajas son las mismas.",
    "Cajas = estibas × cajas por estiba + saldo + cajas sueltas. Lo que contó solo uno de los dos cuenta como diferencia.",
    "Diferencia neta = cajas del operador − cajas de Bavaria (positivo: el operador contó más). Cajas distintas suma las diferencias sin signo.",
    "Exactitud en cajas = 1 − cajas distintas ÷ el mayor de los dos totales. 100 % es que las dos cuentas son idénticas.",
    "Pestañas: «Diferencias» (lo que hay que revisar) · «Por material» · «Por persona» (cuánto anotó cada quien) · «Conteos por persona» (lo anotado, renglón por renglón) · «Conteos cruzados» (los dos lados juntos).",
    "Colores del % : verde desde 95 %, naranja desde 80 %, rojo por debajo. Las cifras de esta hoja son fórmulas sobre «Conteos cruzados»: si filtras o corriges allá, aquí se actualizan.",
  ];
  notas.forEach((t, i) => {
    rs.mergeCells(N0 + i, 2, N0 + i, 17);
    const c = rs.getCell(N0 + i, 2); c.value = t;
    c.font = i === 0 ? letra(8.5, P.GRIS, true) : letra(9.5, P.TINTA);
    c.alignment = { vertical: "top", wrapText: true, indent: 1 };
    rs.getRow(N0 + i).height = i === 0 ? 16 : 18;
  });
  rs.views = [{ showGridLines: false, state: "frozen", ySplit: RF0 }];

  /* =================== DIFERENCIAS =================== */
  const mal = todas.filter((x) => x.f.estado !== "COINCIDE")
    .sort((a, b) => Math.abs(b.f.diferencia) - Math.abs(a.f.diferencia) || a.h.numero - b.h.numero);
  const FC = ["Hoja", "Pareja (operador · Bavaria)", "Qué pasó", "Sitio", "Código", "Material", "Vence", "Cajas operador", "Cajas Bavaria", "Diferencia (operador − Bavaria)", "Quién contó más"];
  const FA = [2, 7, 34, 17, 18, 11, 38, 13, 13, 13, 17, 22, 2];
  df.columns = FA.map((w) => ({ width: w }));
  cabecera(df, P, sello, "Lo que no coincide · lo más grande primero", `${sub}  ·  ${mal.length} ${mal.length === 1 ? "renglón" : "renglones"}`, FA.length);
  const FF0 = 7;
  encabezado(df, FF0, P, FC);
  mal.forEach(({ h, f }, i) => {
    const r = FF0 + 1 + i, row = df.getRow(r); row.height = 20;
    const quien = f.diferencia > 0 ? "El operador" : f.diferencia < 0 ? "Bavaria" : "—";
    [h.numero, pareja(h), TEXTO_FILA[f.estado], f.ubicacion, f.sku, f.material, textoVenc(f.vencDia, f.vencMes, f.vencAnio), f.cajasOl, f.cajasBavaria, f.diferencia, quien]
      .forEach((v, k) => {
        const c = row.getCell(2 + k); c.value = v;
        celda(c, P, i % 2 === 1, { num: k >= 7 && k <= 9, centro: k === 0 || k === 2 || k === 6 || k === 10, fmt: k === 9 ? DIF : k === 7 || k === 8 ? NF : undefined, negrita: k === 4 });
      });
    const e = row.getCell(4); e.fill = relleno(COLOR_ESTADO[f.estado]); e.font = letra(9, BLANCO, true);
  });
  if (mal.length === 0) {
    df.mergeCells(FF0 + 1, 2, FF0 + 1, 12);
    const c = df.getCell(FF0 + 1, 2); c.value = listas ? "Todo coincide: no hay diferencias." : "Todavía no hay hojas cruzadas."; c.font = letra(12, listas ? VERDE : P.GRIS, true); c.alignment = { indent: 1, vertical: "middle" };
    df.getRow(FF0 + 1).height = 30;
  } else df.autoFilter = { from: { row: FF0, column: 2 }, to: { row: FF0 + mal.length, column: 1 + FC.length } };
  df.views = [{ showGridLines: false, state: "frozen", ySplit: FF0 }];

  /* =================== POR MATERIAL =================== */
  const porSku = new Map<string, { sku: string; material: string; renglones: number; conDif: number; ol: number; ba: number; dist: number }>();
  for (const { f } of todas) {
    const x = porSku.get(f.sku) ?? { sku: f.sku, material: f.material, renglones: 0, conDif: 0, ol: 0, ba: 0, dist: 0 };
    x.renglones++; if (f.estado !== "COINCIDE") x.conDif++;
    x.ol += f.cajasOl ?? 0; x.ba += f.cajasBavaria ?? 0; x.dist += Math.abs(f.diferencia);
    porSku.set(f.sku, x);
  }
  const mats = [...porSku.values()].sort((a, b) => b.dist - a.dist || a.sku.localeCompare(b.sku));
  const MC = ["Código", "Material", "Renglones", "Con diferencia", "Cajas operador", "Cajas Bavaria", "Diferencia neta", "Cajas distintas", "Exactitud en cajas"];
  const MA = [2, 12, 40, 11, 13, 14, 14, 14, 14, 14, 2];
  pm.columns = MA.map((w) => ({ width: w }));
  cabecera(pm, P, sello, "Por material · todas las hojas juntas", `${sub}  ·  ${mats.length} materiales`, MA.length);
  const MF0 = 7;
  encabezado(pm, MF0, P, MC);
  mats.forEach((m, i) => {
    const r = MF0 + 1 + i, row = pm.getRow(r); row.height = 20;
    const mayor = Math.max(m.ol, m.ba), ex = mayor === 0 ? 1 : Math.max(0, 1 - m.dist / mayor);
    [m.sku, m.material, m.renglones, m.conDif, m.ol, m.ba, { formula: `F${r}-G${r}`, result: m.ol - m.ba }, m.dist,
      { formula: `IF(MAX(F${r},G${r})=0,1,MAX(0,1-I${r}/MAX(F${r},G${r})))`, result: ex }]
      .forEach((v, k) => {
        const c = row.getCell(2 + k); c.value = v as ExcelJS.CellValue;
        celda(c, P, i % 2 === 1, { num: k >= 2, negrita: k === 0, fmt: k === 6 ? DIF : k === 8 ? PCT : k >= 2 ? NF : undefined });
      });
    const e = row.getCell(10); e.font = letra(10, BLANCO, true); e.fill = relleno(colorPct(ex)); e.alignment = { vertical: "middle", horizontal: "center" };
  });
  if (mats.length) pm.autoFilter = { from: { row: MF0, column: 2 }, to: { row: MF0 + mats.length, column: 1 + MC.length } };
  pm.views = [{ showGridLines: false, state: "frozen", ySplit: MF0 }];

  /* =================== POR PERSONA =================== */
  const hayCon = (h: HojaCruzada) => !!h.filas && !!h.conteos;
  const conHojas = o.hojas.filter(hayCon);
  const aviso = (w: ExcelJS.Worksheet, hasta: number, fila: number) => {
    w.mergeCells(fila, 2, fila, hasta);
    const c = w.getCell(fila, 2);
    c.value = o.sinConteos
      ? "Lo que anotó cada persona todavía no se puede leer: falta correr supabase/migraciones/2026-10-fiscal-conteos-por-persona.sql en Supabase. El cruce de las hojas sí está completo en las demás pestañas."
      : cruzadas.length ? "Esta hoja no trajo los conteos de las personas." : "Todavía no hay hojas cruzadas: los conteos de cada persona se ven cuando las dos terminan.";
    c.font = letra(11, o.sinConteos ? NARANJA : P.GRIS, true); c.alignment = { indent: 1, vertical: "middle", wrapText: true };
    w.getRow(fila).height = 34;
  };
  const hora = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600_000) : null);   // hora de Colombia (UTC−5)
  const FH = "dd/mm/yyyy hh:mm";
  const CONF0 = 7;
  const todosCon = conHojas.flatMap((h) => [...h.conteos!].sort((a, b) => (a.equipo === b.equipo ? 0 : a.equipo === "OL" ? -1 : 1) || a.ubicacion.localeCompare(b.ubicacion) || a.sku.localeCompare(b.sku))
    .map((c) => ({ h, c })));
  const cr = (col: string) => `'${S_CON}'!$${col}$${CONF0 + 1}:$${col}$${Math.max(CONF0 + todosCon.length, CONF0 + 1)}`;
  const PC = ["Hoja", "Equipo", "Persona", "Su pareja", "Renglones", "Estibas", "Saldo", "Cajas sueltas", "Total de cajas", "Cajas en el cruce", "¿Cuadra con el cruce?", "Empezó", "Última anotación", "Terminó"];
  const PA = [2, 7, 20, 26, 26, 11, 11, 11, 13, 14, 14, 16, 17, 17, 17, 2];
  pp.columns = PA.map((w) => ({ width: w }));
  cabecera(pp, P, sello, "Por persona · lo que anotó cada quien", `${sub}  ·  ${o.hojas.length * 2} personas en ${o.hojas.length} hojas`, PA.length);
  encabezado(pp, 7, P, PC);
  let rp = 7;
  o.hojas.forEach((h, i) => {
    for (const eq of ["OL", "BAVARIA"] as const) {
      rp++; const row = pp.getRow(rp); row.height = 22;
      const quien = eq === "OL" ? h.ol : h.bavaria, pareja2 = eq === "OL" ? h.bavaria : h.ol;
      const propios = hayCon(h) ? h.conteos!.filter((c) => c.equipo === eq) : null;
      const sum = (f: (c: ConteoPersona) => number) => (propios ? propios.reduce((t, c) => t + f(c), 0) : null);
      const hs = propios ? propios.map((c) => c.contadoEn).filter((x): x is string => !!x).sort() : [];
      const term = eq === "OL" ? h.olTermino : h.bavariaTermino;
      const cruceCajas = h.filas ? h.filas.reduce((t, f) => t + ((eq === "OL" ? f.cajasOl : f.cajasBavaria) ?? 0), 0) : null;
      const colTot = eq === "OL" ? "I" : "J";
      const rengl = propios ? propios.length : (eq === "OL" ? h.olRenglones : h.bavariaRenglones);
      const total = sum((c) => c.totalCajas);
      const cuadra = propios && cruceCajas !== null ? (total === cruceCajas ? "✓ cuadra" : "revisar") : null;
      const vals: ExcelJS.CellValue[] = [
        h.numero, eq === "OL" ? "Operador logístico" : "Bavaria", quien ?? "falta", pareja2 ?? "falta",
        propios ? { formula: `COUNTIFS(${cr("B")},B${rp},${cr("D")},C${rp})`, result: propios.length } : rengl,
        propios ? { formula: `SUMIFS(${cr("J")},${cr("B")},B${rp},${cr("D")},C${rp})`, result: sum((c) => c.estibas ?? 0) ?? 0 } : null,
        propios ? { formula: `SUMIFS(${cr("L")},${cr("B")},B${rp},${cr("D")},C${rp})`, result: sum((c) => c.saldo ?? 0) ?? 0 } : null,
        propios ? { formula: `SUMIFS(${cr("M")},${cr("B")},B${rp},${cr("D")},C${rp})`, result: sum((c) => c.cajas ?? 0) ?? 0 } : null,
        propios ? { formula: `SUMIFS(${cr("N")},${cr("B")},B${rp},${cr("D")},C${rp})`, result: total ?? 0 } : null,
        cruceCajas === null ? null : { formula: `SUMIFS('${S_DET}'!$${colTot}$${DF0 + 1}:$${colTot}$${Math.max(dUlt, DF0 + 1)},'${S_DET}'!$B$${DF0 + 1}:$B$${Math.max(dUlt, DF0 + 1)},B${rp})`, result: cruceCajas },
        cuadra === null ? null : { formula: `IF(J${rp}=K${rp},"✓ cuadra","revisar")`, result: cuadra },
        hs.length ? hora(hs[0]) : null, hs.length ? hora(hs[hs.length - 1]) : null,
        term ? hora(term) : (rengl > 0 ? "contando…" : "sin empezar"),
      ];
      vals.forEach((v, k) => {
        const c = row.getCell(2 + k); c.value = v;
        celda(c, P, i % 2 === 1, { num: k >= 4 && k <= 9, centro: k === 0 || k === 10 || k >= 11, negrita: k === 0 || k === 2, fmt: k >= 4 && k <= 9 ? NF : k >= 11 ? FH : undefined });
      });
      const e = row.getCell(3); e.font = letra(9, BLANCO, true); e.fill = relleno(eq === "OL" ? P.TINTA : "FF8A8E8A");
      if (cuadra) { const c = row.getCell(12); c.font = letra(9.5, BLANCO, true); c.fill = relleno(cuadra === "revisar" ? ROJO : VERDE); }
    }
  });
  if (o.hojas.length) pp.autoFilter = { from: { row: 7, column: 2 }, to: { row: rp, column: 1 + PC.length } };
  pp.views = [{ showGridLines: false, state: "frozen", ySplit: 7, xSplit: 2 }];
  if (!conHojas.length) { rp += 2; aviso(pp, 1 + PC.length, rp) }

  /* =================== CONTEOS POR PERSONA (renglón por renglón) =================== */
  const CC = ["Hoja", "Pareja (operador · Bavaria)", "Equipo", "Persona", "Sitio", "Código", "Material", "Vence",
    "Estibas", "Cajas por estiba", "Saldo", "Cajas sueltas", "Total de cajas", "Nota", "Cuándo lo anotó"];
  const CA = [2, 7, 34, 17, 20, 17, 11, 38, 13, 10, 11, 10, 11, 12, 30, 17, 2];
  cp.columns = CA.map((w) => ({ width: w }));
  cabecera(cp, P, sello, "Conteos por persona · lo anotado, renglón por renglón", `${sub}  ·  ${todosCon.length} renglones`, CA.length);
  encabezado(cp, CONF0, P, CC);
  todosCon.forEach(({ h, c }, i) => {
    const r = CONF0 + 1 + i, row = cp.getRow(r); row.height = 20;
    const vals: ExcelJS.CellValue[] = [h.numero, pareja(h), c.equipo === "OL" ? "Operador logístico" : "Bavaria", c.persona, c.ubicacion, c.sku, c.material,
      textoVenc(c.vencDia, c.vencMes, c.vencAnio), c.estibas, c.cajasPorEstiba, c.saldo, c.cajas,
      { formula: `N(J${r})*N(K${r})+N(L${r})+N(M${r})`, result: c.totalCajas }, c.nota, hora(c.contadoEn)];
    vals.forEach((v, k) => {
      const x = row.getCell(2 + k); x.value = v;
      celda(x, P, i % 2 === 1, { num: k >= 8 && k <= 12, centro: k === 0 || k === 2 || k === 7 || k === 14, negrita: k === 5 || k === 12, fmt: k >= 8 && k <= 12 ? NF : k === 14 ? FH : undefined });
    });
    const e = row.getCell(4); e.font = letra(9, BLANCO, true); e.fill = relleno(c.equipo === "OL" ? P.TINTA : "FF8A8E8A");
  });
  if (todosCon.length) cp.autoFilter = { from: { row: CONF0, column: 2 }, to: { row: CONF0 + todosCon.length, column: 1 + CC.length } };
  else aviso(cp, 1 + CC.length, CONF0 + 1);
  cp.views = [{ showGridLines: false, state: "frozen", ySplit: CONF0, xSplit: 2 }];

  wb.views = [{ x: 0, y: 0, width: 12000, height: 8000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
