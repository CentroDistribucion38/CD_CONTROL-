/**
 * EL EXCEL DEL PLAN DE LA SEMANA — con la misma cara de los libros de Bodega 38 (banda negra, ojo amarillo, sello de la B,
 * encabezado negro, total en amarillo), pensado para mandarlo o imprimirlo tal cual.
 *
 *   1. «Plan»: cifras de la semana arriba (plan, SKU y líneas, día más cargado, qué cambió); debajo la matriz
 *      LÍNEA → SKU × día, con el subtotal de cada línea (las líneas se pliegan con los botones − / + de Excel),
 *      el color de cada celda según cuánto pesa (mapa de calor), el total de la semana y su % del total.
 *      En «Qué cambió» las celdas son la variación contra el inicial: verde si sube, rojo si baja.
 *   2. «Qué cambió»: solo los SKU que cambiaron del inicial al vigente, día por día, con el total de la semana.
 *   3. «Detalle»: una fila por día · línea · SKU (inicial, vigente, variación), con filtros: para tablas dinámicas.
 * Las sumas son fórmulas (SUBTOTAL), así lo que se filtre o se pliegue sigue cuadrando.
 */
import ExcelJS from "exceljs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * ExcelJS escribe dentro de <sheetPr> el <pageSetUpPr> ANTES que el <outlinePr> (el de las líneas plegables), y el orden
 * que exige Excel es tabColor → outlinePr → pageSetUpPr. Con el orden al revés Excel «repara» el libro y deja la hoja
 * vacía (LibreOffice lo abre bien, por eso no se notaba). Aquí se pone en su orden antes de entregar el archivo.
 */
function ordenarSheetPr(buf: ArrayBuffer): ArrayBuffer {
  const zip = unzipSync(new Uint8Array(buf));
  for (const k of Object.keys(zip)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) continue;
    const x = strFromU8(zip[k]);
    const y = x.replace(/<sheetPr>([\s\S]*?)<\/sheetPr>/, (_, d: string) => {
      const tab = d.match(/<tabColor[^>]*\/>/)?.[0] ?? "", out = d.match(/<outlinePr[^>]*\/>/)?.[0] ?? "", pag = d.match(/<pageSetUpPr[^>]*\/>/)?.[0] ?? "";
      const resto = d.replace(/<tabColor[^>]*\/>|<outlinePr[^>]*\/>|<pageSetUpPr[^>]*\/>/g, "");
      return `<sheetPr>${tab}${out}${pag}${resto}</sheetPr>`;
    });
    if (y !== x) zip[k] = strToU8(y);
  }
  const u = zipSync(zip, { level: 6 });
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", GRIS_CLARO = "FFBDBDBD";
const FONDO = "FFF6F6F4", RAYA = "FFE3E3E0", VERDE = "FF0F7A4A", VERDE_F = "FFE3F4EA", ROJO = "FFB42318", ROJO_F = "FFFDE7EA";
const GRUPO = "FFEDEFF2";

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
const raya = (argb = RAYA, style: ExcelJS.BorderStyle = "thin"): ExcelJS.Border => ({ style, color: { argb } });

export type FilaLibroPlan = { sku: string; nombre: string; tren: string; ini: (number | null)[]; vig: (number | null)[] };
export type InsumosLibroPlan = {
  semana: number | null; desde: string; hasta: string;
  /** «Semana 48», «Miércoles 25 nov», «23 nov – 2 dic»: el título del periodo. */
  periodo?: string;
  /** «Lun 23» … y de dónde sale cada día («corte 25 nov 09:17», «inicial»). */
  dias: string[]; fechas: string[]; fuente: (string | null)[];
  vista: "vigente" | "inicial" | "cambios"; unidad: string; decimales: number;
  filas: FilaLibroPlan[];
};

const fmtNum = (dec: number) => (dec ? `#,##0.${"0".repeat(dec)};-#,##0.${"0".repeat(dec)};"—"` : '#,##0;-#,##0;"—"');
const fmtSig = (dec: number) => (dec ? `+#,##0.${"0".repeat(dec)};[Red]-#,##0.${"0".repeat(dec)};"—"` : '+#,##0;[Red]-#,##0;"—"');
/* Mapa de calor: del blanco al amarillo de la marca según lo que pesa la celda contra la más grande. */
const calor = (v: number, max: number) => {
  if (!(v > 0) || !(max > 0)) return null;
  const t = 0.12 + 0.68 * Math.min(1, v / max);
  const mez = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0").toUpperCase();
  return `FF${mez(255, 255)}${mez(255, 194)}${mez(255, 14)}`;
};
const linea = (t: string) => t.replace(/^TREN-?/i, "Línea ");
const cuando = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\./g, "");
const fechaLarga = (f: string) => new Date(f + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\./g, "");

async function cargarLogo(wb: ExcelJS.Workbook): Promise<number | null> {
  try {
    if (typeof fetch === "undefined") return null;
    const r = await fetch("/marca/logo-b.png");
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = ""; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return wb.addImage({ base64: `data:image/png;base64,${btoa(bin)}`, extension: "png" });
  } catch { return null }
}

/** La banda negra de arriba: ojo amarillo, título, de qué semana es; la raya amarilla debajo y el sello a la derecha. */
function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string, logo: number | null) {
  for (let f = 1; f <= 4; f++) for (let c = 1; c <= ancho; c++) h.getRow(f).getCell(c).fill = relleno(TINTA);
  h.getRow(1).height = 16; h.getRow(2).height = 30; h.getRow(3).height = 16; h.getRow(4).height = 8;
  const o = h.getCell(1, 1); o.value = "INVENTARIO · PLAN VS NOTIFICADO · PLAN"; o.font = letra(8.5, BANDA, true); o.alignment = { vertical: "bottom", indent: 1 };
  const t = h.getCell(2, 1); t.value = titulo; t.font = letra(20, BLANCO, true); t.alignment = { vertical: "middle", indent: 1 };
  const s = h.getCell(3, 1); s.value = sub; s.font = letra(9, GRIS_CLARO); s.alignment = { indent: 1 };
  const r5 = h.getRow(5); r5.height = 4;
  for (let c = 1; c <= ancho; c++) r5.getCell(c).fill = relleno(BANDA);
  if (logo != null) {
    const px = (h.getColumn(ancho).width ?? 9) * 7 + 5;
    h.addImage(logo, { tl: { col: ancho - 1 + Math.max(0, 1 - 62 / px), row: 0.3 } as ExcelJS.Anchor, ext: { width: 52, height: 52 }, editAs: "oneCell" });
  }
}

/** Una cifra de arriba (rótulo gris en mayúsculas, número grande, nota), sobre varias columnas, con su raya de color. */
function cifra(h: ExcelJS.Worksheet, fila: number, c0: number, c1: number, rotulo: string, valor: string, nota: string, color = BANDA) {
  h.mergeCells(fila, c0, fila, c1); h.mergeCells(fila + 1, c0, fila + 1, c1); h.mergeCells(fila + 2, c0, fila + 2, c1);
  const a = h.getCell(fila, c0); a.value = rotulo.toUpperCase(); a.font = letra(8, GRIS, true); a.alignment = { indent: 1, vertical: "bottom" };
  const b = h.getCell(fila + 1, c0); b.value = valor; b.font = letra(17, TINTA, true); b.alignment = { indent: 1, vertical: "middle" };
  const n = h.getCell(fila + 2, c0); n.value = nota; n.font = letra(8.5, GRIS); n.alignment = { indent: 1, vertical: "top" };
  for (let c = c0; c <= c1; c++) {
    for (let f = fila; f <= fila + 2; f++) h.getCell(f, c).fill = relleno(BLANCO);
    h.getCell(fila + 2, c).border = { bottom: { style: "thick", color: { argb: color } } };
  }
}

export async function armarLibroPlan(d: InsumosLibroPlan): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Plan vs notificado"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logo = await cargarLogo(wb);
  const N = fmtNum(d.decimales), S = fmtSig(d.decimales);
  const nd = d.dias.length;
  const cmb = d.vista === "cambios";
  const val = (f: FilaLibroPlan, i: number) => cmb ? ((f.vig[i] ?? 0) - (f.ini[i] ?? 0)) : (d.vista === "inicial" ? f.ini : f.vig)[i] ?? 0;
  const suma = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  const sem = d.periodo || (d.semana ? `Semana ${d.semana}` : "Periodo");
  const nomVista = d.vista === "inicial" ? "Plan inicial" : d.vista === "cambios" ? "Qué cambió (vigente − inicial)" : "Plan vigente";
  const sub = `${fechaLarga(d.desde)} – ${fechaLarga(d.hasta)} · en ${d.unidad} · exportado el ${cuando()}`;

  /* Líneas en orden (TREN-1, TREN-2…) y, dentro, los SKU de más a menos. */
  const filas = d.filas.filter((f) => d.dias.some((_, i) => Math.abs(cmb ? (f.vig[i] ?? 0) - (f.ini[i] ?? 0) : val(f, i)) > 1e-9) || (cmb && suma(f.vig) + suma(f.ini) > 0));
  const trenes = [...new Set(filas.map((f) => f.tren))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const porTren = trenes.map((t) => ({ t, fs: filas.filter((f) => f.tren === t).sort((a, b) => suma(d.dias.map((_, i) => val(b, i))) - suma(d.dias.map((_, i) => val(a, i)))) }));
  const totDia = d.dias.map((_, i) => filas.reduce((a, f) => a + val(f, i), 0));
  const totSem = suma(totDia);
  const maxCel = Math.max(0, ...filas.flatMap((f) => d.dias.map((_, i) => val(f, i))));
  const cambian = d.filas.filter((f) => d.dias.some((_, i) => Math.abs((f.vig[i] ?? 0) - (f.ini[i] ?? 0)) > (d.decimales ? 0.05 : 0.5)));
  const varSem = d.filas.reduce((a, f) => a + suma(f.vig) - suma(f.ini), 0);
  const fmtTxt = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: d.decimales });

  /* ============================== 1 · PLAN ============================== */
  {
    const h = wb.addWorksheet("Plan", { properties: { tabColor: { argb: BANDA }, outlineProperties: { summaryBelow: false, summaryRight: true } } });
    const ancho = 2 + nd + 2;
    h.columns = [{ width: 11 }, { width: 40 }, ...d.dias.map(() => ({ width: 12.5 })), { width: 14 }, { width: 11 }];
    banda(h, ancho, `${nomVista} · ${sem}`, sub, logo);

    /* Cifras de arriba */
    const iMax = totDia.indexOf(Math.max(...totDia));
    const tMax = porTren.map((x) => ({ t: x.t, v: x.fs.reduce((a, f) => a + suma(d.dias.map((_, i) => val(f, i))), 0) })).sort((a, b) => b.v - a.v)[0];
    h.getRow(6).height = 8;
    const tramos: [number, number][] = [[1, 2], [3, 4 + (nd > 6 ? 1 : 0)], [5 + (nd > 6 ? 1 : 0), 7 + (nd > 6 ? 1 : 0)], [8 + (nd > 6 ? 1 : 0), ancho]];
    if (cmb) {
      cifra(h, 7, ...tramos[0], "Variación total", `${varSem > 0 ? "+" : ""}${fmtTxt(varSem)} ${d.unidad}`, "vigente − inicial", varSem < 0 ? ROJO : VERDE);
      cifra(h, 7, ...tramos[1], "SKU que cambiaron", String(cambian.length), `de ${d.filas.length} SKU de la semana`);
    } else {
      cifra(h, 7, ...tramos[0], d.vista === "inicial" ? "Plan inicial" : "Plan vigente", `${fmtTxt(totSem)} ${d.unidad}`, `${filas.length} SKU en ${trenes.length} líneas`);
      cifra(h, 7, ...tramos[1], "Día más cargado", d.dias[iMax] ?? "—", `${fmtTxt(totDia[iMax] ?? 0)} ${d.unidad}`, VERDE);
    }
    cifra(h, 7, ...tramos[2], "Línea más cargada", tMax ? linea(tMax.t) : "—", tMax ? `${fmtTxt(tMax.v)} ${d.unidad}` : "");
    cifra(h, 7, ...tramos[3], "Cambió contra el inicial", `${cambian.length} SKU`, `${varSem > 0 ? "+" : ""}${fmtTxt(varSem)} ${d.unidad}`, cambian.length ? ROJO : VERDE);
    for (let f = 7; f <= 9; f++) h.getRow(f).height = f === 8 ? 26 : 15;
    h.getRow(10).height = 10;

    /* Encabezado: dos renglones (el día y de dónde sale) */
    const H = 11;
    const r1 = h.getRow(H), r2 = h.getRow(H + 1);
    r1.height = 24; r2.height = 14;
    const tit = ["SKU", "Descripción", ...d.dias, nd === 1 ? "Día" : "Total", "% del total"];
    tit.forEach((t, i) => {
      const a = r1.getCell(i + 1), b = r2.getCell(i + 1);
      a.value = t; a.font = letra(10, BLANCO, true); a.fill = relleno(TINTA); b.fill = relleno(TINTA);
      a.alignment = { vertical: "middle", horizontal: i < 2 ? "left" : "center", indent: i < 2 ? 1 : 0 };
      if (i >= 2 && i < 2 + nd) { b.value = d.vista === "inicial" ? "inicial" : d.fuente[i - 2] ?? "sin plan"; b.font = letra(7.5, d.fuente[i - 2] && d.fuente[i - 2] !== "inicial" ? BANDA : GRIS_CLARO, true); b.alignment = { horizontal: "center", vertical: "top" } }
      if (i === 2 + nd) { a.border = { left: { style: "medium", color: { argb: BANDA } } }; b.border = { left: { style: "medium", color: { argb: BANDA } } } }
    });
    const L = (c: number) => h.getColumn(c).letter;
    const cSem = 3 + nd, cPct = 4 + nd;
    let r = H + 2;
    const inicio = r;
    for (const { t, fs } of porTren) {
      /* El renglón de la línea, con su subtotal */
      const g = h.getRow(r), a = r + 1, b = r + fs.length;
      g.height = 20;
      for (let c = 1; c <= ancho; c++) {
        const x = g.getCell(c); x.fill = relleno(GRUPO); x.font = letra(10, TINTA, true);
        x.border = { top: { style: "medium", color: { argb: TINTA } }, bottom: raya() }; x.alignment = { vertical: "middle", horizontal: "right" };
      }
      g.getCell(1).value = `${linea(t).toUpperCase()}  ·  ${fs.length} SKU`; g.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      h.mergeCells(r, 1, r, 2);
      for (let c = 3; c <= cSem; c++) {
        const x = g.getCell(c);
        const v = c === cSem ? fs.reduce((s, f) => s + suma(d.dias.map((_, i) => val(f, i))), 0) : fs.reduce((s, f) => s + val(f, c - 3), 0);
        x.value = { formula: `SUBTOTAL(109,${L(c)}${a}:${L(c)}${b})`, result: v }; x.numFmt = cmb ? S : N;
      }
      g.getCell(cSem).border = { top: { style: "medium", color: { argb: TINTA } }, left: { style: "medium", color: { argb: BANDA } }, bottom: raya() };
      if (!cmb) { const x = g.getCell(cPct); x.value = { formula: `IFERROR(${L(cSem)}${r}/$${L(cSem)}$TOTAL,0)`, result: 0 }; x.numFmt = "0.0%" }
      r++;
      /* Los SKU de la línea (se pliegan con el − de Excel) */
      fs.forEach((f, k) => {
        const x = h.getRow(r); x.height = 18; x.outlineLevel = 1;
        x.getCell(1).value = f.sku; x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { vertical: "middle", indent: 1 };
        x.getCell(2).value = f.nombre; x.getCell(2).font = letra(9.5, TINTA); x.getCell(2).alignment = { vertical: "middle" };
        d.dias.forEach((_, i) => {
          const c = x.getCell(3 + i), v = val(f, i);
          c.value = Math.abs(v) < 1e-9 ? 0 : v; c.numFmt = cmb ? S : N; c.alignment = { horizontal: "right", vertical: "middle" };
          c.font = letra(10, cmb ? (v > 0 ? VERDE : v < 0 ? ROJO : GRIS_CLARO) : v ? TINTA : GRIS_CLARO, cmb && !!v);
          const fondo = cmb ? (v > 0 ? VERDE_F : v < 0 ? ROJO_F : null) : calor(v, maxCel);
          if (fondo) c.fill = relleno(fondo);
          /* En la vista normal, si ese día cambió contra el inicial, la nota dice cuánto. */
          if (!cmb && d.vista === "vigente") {
            const dv = (f.vig[i] ?? 0) - (f.ini[i] ?? 0);
            if (Math.abs(dv) > (d.decimales ? 0.05 : 0.5)) c.note = `Inicial ${fmtTxt(f.ini[i] ?? 0)} → vigente ${fmtTxt(f.vig[i] ?? 0)} (${dv > 0 ? "+" : ""}${fmtTxt(dv)} ${d.unidad})`;
          }
        });
        const s = x.getCell(cSem);
        s.value = { formula: `SUM(${L(3)}${r}:${L(2 + nd)}${r})`, result: suma(d.dias.map((_, i) => val(f, i))) };
        s.numFmt = cmb ? S : N; s.font = letra(10.5, TINTA, true); s.alignment = { horizontal: "right", vertical: "middle" };
        s.border = { left: { style: "medium", color: { argb: BANDA } }, bottom: raya() };
        if (!cmb) { const p = x.getCell(cPct); p.value = { formula: `IFERROR(${L(cSem)}${r}/$${L(cSem)}$TOTAL,0)`, result: 0 }; p.numFmt = "0.0%"; p.font = letra(9, GRIS); p.alignment = { horizontal: "right", vertical: "middle" } }
        for (let c = 1; c <= ancho; c++) if (c !== cSem) x.getCell(c).border = { bottom: raya() };
        if (k % 2 === 1) for (const c of [1, 2]) x.getCell(c).fill = relleno(FONDO);
        r++;
      });
    }
    const fin = r - 1;
    /* Total (amarillo, como los demás libros): SUBTOTAL no suma los subtotales de las líneas. */
    const T = h.getRow(r); T.height = 24;
    for (let c = 1; c <= ancho; c++) {
      const x = T.getCell(c); x.fill = relleno(BANDA); x.font = letra(11, TINTA, true);
      x.border = { top: { style: "medium", color: { argb: TINTA } } }; x.alignment = { vertical: "middle", horizontal: "right" };
    }
    T.getCell(1).value = cmb ? "VARIACIÓN TOTAL" : "TOTAL"; T.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    h.mergeCells(r, 1, r, 2);
    for (let c = 3; c <= cSem; c++) {
      const v = c === cSem ? totSem : totDia[c - 3];
      T.getCell(c).value = { formula: `SUBTOTAL(109,${L(c)}${inicio}:${L(c)}${fin})`, result: v }; T.getCell(c).numFmt = cmb ? S : N;
    }
    if (!cmb) { T.getCell(cPct).value = 1; T.getCell(cPct).numFmt = "0%" }
    /* Las fórmulas de % apuntan a la celda del total. */
    for (let f = inicio; f <= fin; f++) {
      const x = h.getRow(f).getCell(cPct);
      if (x.value && typeof x.value === "object" && "formula" in x.value) {
        const fo = (x.value as ExcelJS.CellFormulaValue).formula.replace("TOTAL", String(r));
        const sv = h.getRow(f).getCell(cSem).value as ExcelJS.CellFormulaValue;
        x.value = { formula: fo, result: totSem ? Number(sv?.result ?? 0) / totSem : 0 };
      }
    }
    const nota = h.getCell(r + 2, 1);
    nota.value = cmb
      ? "Cada celda es vigente − inicial: verde si el plan subió, rojo si bajó. Las líneas se pliegan con los botones − / + de la izquierda."
      : `El color de cada celda dice cuánto pesa (más amarillo = más ${d.unidad}). Las celdas con nota (triángulo rojo) cambiaron contra el plan inicial: pasa el mouse para ver cuánto. Las líneas se pliegan con los botones − / + de la izquierda.`;
    h.mergeCells(r + 2, 1, r + 2, ancho); nota.font = letra(8.5, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top", indent: 1 }; h.getRow(r + 2).height = 26;
    h.views = [{ state: "frozen", xSplit: 2, ySplit: H + 1, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${H}:${H + 1}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    h.headerFooter = { oddFooter: `&L&8CONTROL · ${sem} · ${nomVista}&R&8Página &P de &N` };
  }

  /* ============================== 2 · QUÉ CAMBIÓ ============================== */
  {
    const h = wb.addWorksheet("Qué cambió", { properties: { tabColor: { argb: ROJO } } });
    const ancho = 2 + nd + 3;
    h.columns = [{ width: 11 }, { width: 40 }, ...d.dias.map(() => ({ width: 11.5 })), { width: 13 }, { width: 13 }, { width: 13 }];
    banda(h, ancho, `Qué cambió del inicial al vigente · ${sem}`, `${cambian.length} SKU con cambios · ${sub}`, logo);
    const H = 7, r0 = h.getRow(H); r0.height = 26;
    ["SKU", "Descripción", ...d.dias, "Inicial total", "Vigente total", "Variación"].forEach((t, i) => {
      const x = r0.getCell(i + 1); x.value = t; x.font = letra(9.5, BLANCO, true); x.fill = relleno(TINTA);
      x.alignment = { vertical: "middle", horizontal: i < 2 ? "left" : "center", wrapText: true, indent: i < 2 ? 1 : 0 };
    });
    const lista = [...cambian].sort((a, b) => Math.abs(suma(b.vig) - suma(b.ini)) - Math.abs(suma(a.vig) - suma(a.ini)));
    lista.forEach((f, k) => {
      const x = h.getRow(H + 1 + k); x.height = 18;
      x.getCell(1).value = f.sku; x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { indent: 1 };
      x.getCell(2).value = f.nombre; x.getCell(2).font = letra(9.5, TINTA);
      d.dias.forEach((_, i) => {
        const v = (f.vig[i] ?? 0) - (f.ini[i] ?? 0), c = x.getCell(3 + i);
        c.value = Math.abs(v) < 1e-9 ? 0 : v; c.numFmt = S; c.font = letra(10, v > 0 ? VERDE : v < 0 ? ROJO : GRIS_CLARO, !!v);
        if (Math.abs(v) > 1e-9) { c.fill = relleno(v > 0 ? VERDE_F : ROJO_F); c.note = `Inicial ${fmtTxt(f.ini[i] ?? 0)} → vigente ${fmtTxt(f.vig[i] ?? 0)}` }
      });
      const a = x.getCell(3 + nd), b = x.getCell(4 + nd), c = x.getCell(5 + nd);
      a.value = suma(f.ini); b.value = suma(f.vig); c.value = { formula: `${h.getColumn(4 + nd).letter}${H + 1 + k}-${h.getColumn(3 + nd).letter}${H + 1 + k}`, result: suma(f.vig) - suma(f.ini) };
      a.numFmt = N; b.numFmt = N; c.numFmt = S; c.font = letra(10.5, suma(f.vig) - suma(f.ini) >= 0 ? VERDE : ROJO, true);
      a.border = { left: { style: "medium", color: { argb: BANDA } } };
      for (let col = 1; col <= ancho; col++) { const y = x.getCell(col); y.border = { ...(y.border ?? {}), bottom: raya() } }
    });
    const ult = H + lista.length;
    if (lista.length) {
      const T = h.getRow(ult + 1); T.height = 22;
      for (let col = 1; col <= ancho; col++) { const y = T.getCell(col); y.fill = relleno(BANDA); y.font = letra(10.5, TINTA, true); y.border = { top: { style: "medium", color: { argb: TINTA } } } }
      T.getCell(1).value = "TOTAL"; T.getCell(1).alignment = { indent: 1 };
      for (let col = 3; col <= ancho; col++) {
        const Lc = h.getColumn(col).letter;
        const res = lista.reduce((a, f) => a + (col <= 2 + nd ? (f.vig[col - 3] ?? 0) - (f.ini[col - 3] ?? 0) : col === 3 + nd ? suma(f.ini) : col === 4 + nd ? suma(f.vig) : suma(f.vig) - suma(f.ini)), 0);
        T.getCell(col).value = { formula: `SUBTOTAL(109,${Lc}${H + 1}:${Lc}${ult})`, result: res }; T.getCell(col).numFmt = col <= 2 + nd || col === ancho ? S : N;
      }
      h.autoFilter = `A${H}:${h.getColumn(ancho).letter}${ult}`;
    } else { const x = h.getCell(H + 1, 1); x.value = "Ningún SKU cambió del plan inicial al vigente esta semana."; x.font = letra(10.5, VERDE, true) }
    h.views = [{ state: "frozen", xSplit: 2, ySplit: H, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${H}:${H}` };
  }

  /* ============================== 3 · DETALLE (para filtrar y tablas dinámicas) ============================== */
  {
    const h = wb.addWorksheet("Detalle", { properties: { tabColor: { argb: TINTA } } });
    const cols = [["Fecha", 12], ["Día", 9], ["Línea", 10], ["SKU", 10], ["Descripción", 40], [`Inicial (${d.unidad})`, 14], [`Vigente (${d.unidad})`, 14], ["Variación", 12], ["De dónde sale", 22]] as const;
    h.columns = cols.map(([, w]) => ({ width: w }));
    banda(h, cols.length, `Detalle día por día · ${sem}`, `una fila por día, línea y SKU · con filtros, para tablas dinámicas · ${sub}`, logo);
    const H = 7, r0 = h.getRow(H); r0.height = 24;
    cols.forEach(([t], i) => { const x = r0.getCell(i + 1); x.value = t; x.font = letra(9.5, BLANCO, true); x.fill = relleno(TINTA); x.alignment = { vertical: "middle", horizontal: "center", wrapText: true } });
    let r = H + 1;
    d.fechas.forEach((fe, i) => {
      for (const f of [...d.filas].sort((a, b) => a.tren.localeCompare(b.tren, "es", { numeric: true }) || (b.vig[i] ?? 0) - (a.vig[i] ?? 0))) {
        const ini = f.ini[i] ?? 0, vig = f.vig[i] ?? 0;
        if (Math.abs(ini) < 1e-9 && Math.abs(vig) < 1e-9) continue;
        const x = h.getRow(r);
        x.values = [new Date(fe + "T12:00:00Z"), d.dias[i].split(" ")[0], linea(f.tren), f.sku, f.nombre, ini, vig, vig - ini, d.fuente[i] ?? ""];
        x.getCell(1).numFmt = "dd/mm/yyyy"; x.getCell(6).numFmt = N; x.getCell(7).numFmt = N; x.getCell(8).numFmt = S;
        x.getCell(8).font = letra(10, vig - ini > 0 ? VERDE : vig - ini < 0 ? ROJO : GRIS_CLARO, Math.abs(vig - ini) > 1e-9);
        for (let c = 1; c <= cols.length; c++) { const y = x.getCell(c); y.border = { bottom: raya() }; if (c !== 8) y.font = letra(9.5, TINTA, c === 4); if ((i % 2) === 1) y.fill = relleno(FONDO) }
        r++;
      }
    });
    if (r > H + 1) h.autoFilter = `A${H}:I${r - 1}`;
    h.views = [{ state: "frozen", ySplit: H, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${H}:${H}` };
  }

  return ordenarSheetPr(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
