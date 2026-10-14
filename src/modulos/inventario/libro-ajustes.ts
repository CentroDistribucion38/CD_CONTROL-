/**
 * EL EXCEL DE LOS AJUSTES (análisis de diferencia · paso 2), super detallado.
 *
 * «Que en otra hoja me salgan los sobrantes, los faltantes, todo super detallado.»
 *   RESUMEN     los totales y las tres compensaciones R ↔ NR nuevo, par por par.
 *   AJUSTES     todos los códigos: diferencia, compensación, ajuste, sentido y observación.
 *   SOBRANTES   solo lo que sobra (sube SAP), del más grande al más chico, con su total.
 *   FALTANTES   solo lo que falta (baja SAP), del más grande al más chico, con su total.
 *   DETALLE     cada código que se ajusta o se compensa, abierto partida por partida: de dónde sale el
 *               SAP (ZEXI, novedades, balance…) y de dónde sale el CONTEO (conteo, depa, pasivos…).
 *
 * Se arma en el navegador (exceljs se carga al pedirlo): no importa nada del servidor.
 */
import ExcelJS from "exceljs";
import type { FilaAnalisis } from "./analisis-dif";
import type { FilaAjuste } from "./analisis-ajustes";
import { COMPENSA } from "./compensa";

const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", GRIS_CLARO = "FFBDBDBD";
const FONDO = "FFF6F6F4", RAYA = "FFE3E3E0", VERDE = "FF0F7A4A", VERDE_F = "FFE3F4EA", ROJO = "FFB42318", ROJO_F = "FFFDE7EA";
const AZUL = "FF1B4F8F", AZUL_F = "FFE6EEF9";
const NUM = '#,##0;[Red]-#,##0;"0"';
const SIG = '+#,##0;[Red]-#,##0;"0"';

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
const raya = (argb = RAYA): ExcelJS.Border => ({ style: "thin", color: { argb } });
const sentido = (v: number) => (v > 0 ? "SOBRANTE · sube SAP" : v < 0 ? "FALTANTE · baja SAP" : "CUADRADO");

export type InsumosLibroAjustes = {
  fecha: string; fechaLarga: string; guardadoEn: string; guardadoPor: string | null;
  ajustes: FilaAjuste[]; analisis: FilaAnalisis[];
};

/** La banda negra de arriba: ojo amarillo, título y de qué día es. */
function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string) {
  h.views = [{ showGridLines: false }];
  for (let f = 1; f <= 4; f++) for (let c = 1; c <= ancho; c++) h.getRow(f).getCell(c).fill = relleno(TINTA);
  h.getRow(1).height = 16; h.getRow(2).height = 28; h.getRow(3).height = 16; h.getRow(4).height = 8;
  const o = h.getCell(1, 1); o.value = "INVENTARIO · BALANCE · ANÁLISIS DE DIFERENCIA · BODEGA 38"; o.font = letra(8.5, BANDA, true); o.alignment = { vertical: "bottom", indent: 1 };
  const t = h.getCell(2, 1); t.value = titulo; t.font = letra(18, BLANCO, true); t.alignment = { vertical: "middle", indent: 1 };
  const s = h.getCell(3, 1); s.value = sub; s.font = letra(9, GRIS_CLARO); s.alignment = { indent: 1 };
  const r5 = h.getRow(5); r5.height = 4;
  for (let c = 1; c <= ancho; c++) r5.getCell(c).fill = relleno(BANDA);
}

type Col = { t: string; w: number; fmt?: string; centro?: boolean; texto?: boolean };
function encabezado(h: ExcelJS.Worksheet, fila: number, cols: Col[]) {
  h.columns = cols.map((c) => ({ width: c.w }));
  const r = h.getRow(fila); r.height = 28;
  cols.forEach((c, i) => {
    const x = r.getCell(i + 1); x.value = c.t; x.font = letra(9, BLANCO, true); x.fill = relleno(TINTA);
    x.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}
function fila(h: ExcelJS.Worksheet, n: number, cols: Col[], valores: ExcelJS.CellValue[], par: boolean) {
  const r = h.getRow(n); r.values = valores; r.height = 18;
  cols.forEach((c, i) => {
    const x = r.getCell(i + 1);
    x.font = letra(9.5, TINTA); x.border = { bottom: raya() };
    x.alignment = { vertical: "middle", horizontal: c.texto ? "left" : "center", wrapText: !!c.texto, indent: c.texto ? 1 : 0 };
    if (c.fmt) x.numFmt = c.fmt;
    if (par) x.fill = relleno(FONDO);
  });
  return r;
}
function pintarSentido(x: ExcelJS.Cell, v: number) {
  x.fill = relleno(v > 0 ? VERDE_F : v < 0 ? ROJO_F : FONDO);
  x.font = letra(8.5, v > 0 ? VERDE : v < 0 ? ROJO : GRIS, true);
}
function total(h: ExcelJS.Worksheet, n: number, ancho: number, rotulo: string, sumas: Record<number, { desde: number; hasta: number; valor: number; fmt: string }>) {
  const r = h.getRow(n); r.height = 22;
  for (let c = 1; c <= ancho; c++) {
    const x = r.getCell(c); x.fill = relleno(BANDA); x.font = letra(10, TINTA, true);
    x.border = { top: { style: "medium", color: { argb: TINTA } } }; x.alignment = { vertical: "middle", horizontal: "center" };
  }
  r.getCell(1).value = rotulo; r.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (const [c, s] of Object.entries(sumas)) {
    const L = h.getColumn(Number(c)).letter;
    const x = r.getCell(Number(c));
    x.value = s.hasta >= s.desde ? { formula: `SUBTOTAL(109,${L}${s.desde}:${L}${s.hasta})`, result: s.valor } : 0;
    x.numFmt = s.fmt;
  }
}

export async function armarLibroAjustes(d: InsumosLibroAjustes): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Análisis de diferencia"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const guardado = new Date(d.guardadoEn).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const sub = `${d.fechaLarga} · análisis guardado el ${guardado}${d.guardadoPor ? ` por ${d.guardadoPor}` : ""}`;
  const A = d.ajustes;
  const sobran = A.filter((f) => f.ajuste > 0).sort((a, b) => b.ajuste - a.ajuste);
  const faltan = A.filter((f) => f.ajuste < 0).sort((a, b) => a.ajuste - b.ajuste);
  const sum = (xs: FilaAjuste[], k: (f: FilaAjuste) => number) => xs.reduce((t, f) => t + k(f), 0);
  const obsDe = (f: FilaAjuste) => f.observacion || "";

  /* ======================= RESUMEN ======================= */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    const W = 7;
    h.columns = [16, 34, 16, 16, 16, 16, 18].map((w) => ({ width: w }));
    banda(h, W, "Ajustes del día", sub);
    const k: [string, number, string, string][] = [
      ["Diferencia del análisis (conteo − SAP)", sum(A, (f) => f.diferencia), SIG, TINTA],
      ["Compensado (retornable ↔ NR nuevo)", sum(A, (f) => Math.max(0, f.compensa)), NUM, AZUL],
      [`Sobrante · sube SAP (${sobran.length} códigos)`, sum(sobran, (f) => f.ajuste), SIG, VERDE],
      [`Faltante · baja SAP (${faltan.length} códigos)`, sum(faltan, (f) => f.ajuste), SIG, ROJO],
      ["Ajuste neto", sum(A, (f) => f.ajuste), SIG, TINTA],
    ];
    let n = 7;
    const t = h.getCell(n, 1); t.value = "LOS TOTALES"; t.font = letra(9, TINTA, true);
    for (let c = 1; c <= 3; c++) h.getCell(n, c).border = { bottom: { style: "medium", color: { argb: TINTA } } };
    n++;
    for (const [rot, v, fmt, color] of k) {
      h.mergeCells(n, 1, n, 2);
      const a = h.getCell(n, 1); a.value = rot; a.font = letra(10.5, TINTA, rot === "Ajuste neto"); a.alignment = { vertical: "middle", indent: 1 };
      const b = h.getCell(n, 3); b.value = v; b.numFmt = fmt; b.font = letra(13, color, true); b.alignment = { horizontal: "center", vertical: "middle" };
      h.getRow(n).height = 24;
      for (let c = 1; c <= 3; c++) h.getCell(n, c).border = { bottom: raya() };
      if (rot === "Ajuste neto") for (let c = 1; c <= 3; c++) h.getCell(n, c).fill = relleno(BANDA);
      n++;
    }
    n += 1;
    const t2 = h.getCell(n, 1); t2.value = "LAS COMPENSACIONES · RETORNABLE ↔ NR NUEVO"; t2.font = letra(9, AZUL, true);
    for (let c = 1; c <= W; c++) h.getCell(n, c).border = { bottom: { style: "medium", color: { argb: AZUL } } };
    n++;
    const cols: Col[] = [{ t: "Retornable", w: 16 }, { t: "Descripción", w: 34, texto: true }, { t: "Diferencia R", w: 16, fmt: SIG }, { t: "NR nuevo", w: 16 }, { t: "Diferencia NR", w: 16, fmt: SIG }, { t: "Se compensa", w: 16, fmt: NUM }, { t: "Queda por ajustar", w: 18, texto: true }];
    const r = h.getRow(n); r.height = 26;
    cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = c.t; x.font = letra(9, BLANCO, true); x.fill = relleno(AZUL); x.alignment = { horizontal: "center", vertical: "middle", wrapText: true } });
    n++;
    const por = new Map(A.map((f) => [f.codigo, f]));
    COMPENSA.forEach(([rc, nr], i) => {
      const a = por.get(rc), b = por.get(nr);
      const queda = [a && a.ajuste ? `${rc}: ${a.ajuste > 0 ? "+" : "−"}${Math.abs(a.ajuste).toLocaleString("es-CO")}` : "", b && b.ajuste ? `${nr}: ${b.ajuste > 0 ? "+" : "−"}${Math.abs(b.ajuste).toLocaleString("es-CO")}` : ""].filter(Boolean).join(" · ") || "Nada: cuadra";
      fila(h, n, cols, [rc, a?.descripcion ?? "(no está en el análisis)", a?.diferencia ?? 0, nr, b?.diferencia ?? 0, Math.abs(a?.compensa ?? 0), queda], i % 2 === 1);
      h.getCell(n, 6).font = letra(10, AZUL, true);
      n++;
    });
    n++;
    const nota = h.getCell(n, 1);
    nota.value = "Ajuste = diferencia + compensación. Si el retornable sobra y su NR nuevo falta (o al revés), se cruza lo que coincide y solo se ajusta lo que queda. Positivo = sobrante (hay más de lo que dice SAP: sube SAP). Negativo = faltante (baja SAP). Todo en unidades; cajas plásticas y estibas por unidad.";
    h.mergeCells(n, 1, n, W); nota.font = letra(9, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top", indent: 1 }; h.getRow(n).height = 42;
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ======================= AJUSTES / SOBRANTES / FALTANTES ======================= */
  const COLS: Col[] = [
    { t: "Familia", w: 26, texto: true }, { t: "Código", w: 11 }, { t: "Descripción", w: 38, texto: true },
    { t: "SAP", w: 13, fmt: NUM }, { t: "Conteo", w: 13, fmt: NUM }, { t: "Diferencia", w: 13, fmt: SIG },
    { t: "Compensa con", w: 30, texto: true }, { t: "Compensación", w: 14, fmt: SIG }, { t: "Ajuste", w: 13, fmt: SIG },
    { t: "Sentido", w: 21 }, { t: "Observación", w: 50, texto: true },
  ];
  const hojaLista = (nombre: string, titulo: string, color: string, xs: FilaAjuste[], vacio: string) => {
    const h = wb.addWorksheet(nombre, { properties: { tabColor: { argb: color } } });
    banda(h, COLS.length, titulo, `${xs.length} código${xs.length === 1 ? "" : "s"} · ${sub}`);
    encabezado(h, 7, COLS);
    xs.forEach((f, i) => {
      const r = fila(h, 8 + i, COLS, [f.familia, f.codigo, f.descripcion, f.sap, f.conteo, f.diferencia,
        f.par ? `${f.par} · ${f.parDescripcion ?? ""}` : "", f.compensa || null, f.ajuste, sentido(f.ajuste), obsDe(f)], i % 2 === 1);
      r.getCell(2).font = letra(9.5, TINTA, true);
      r.getCell(9).font = letra(10, f.ajuste > 0 ? VERDE : f.ajuste < 0 ? ROJO : TINTA, true);
      if (f.compensa) { r.getCell(8).font = letra(9.5, AZUL, true); r.getCell(7).font = letra(9, AZUL) }
      pintarSentido(r.getCell(10), f.ajuste);
      if (obsDe(f)) r.height = Math.min(60, 18 + Math.floor(obsDe(f).length / 60) * 13);
    });
    const ult = 7 + xs.length;
    if (!xs.length) { const x = h.getCell(8, 1); x.value = vacio; x.font = letra(10, GRIS, false, true) }
    total(h, Math.max(9, ult + 1), COLS.length, "TOTAL (lo filtrado)", {
      4: { desde: 8, hasta: ult, valor: sum(xs, (f) => f.sap), fmt: NUM }, 5: { desde: 8, hasta: ult, valor: sum(xs, (f) => f.conteo), fmt: NUM },
      6: { desde: 8, hasta: ult, valor: sum(xs, (f) => f.diferencia), fmt: SIG }, 8: { desde: 8, hasta: ult, valor: sum(xs, (f) => f.compensa), fmt: SIG },
      9: { desde: 8, hasta: ult, valor: sum(xs, (f) => f.ajuste), fmt: SIG },
    });
    if (xs.length) h.autoFilter = `A7:K${ult}`;
    h.views = [{ state: "frozen", ySplit: 7, xSplit: 2, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "7:7" };
  };
  hojaLista("Ajustes", "Todos los códigos", TINTA, A, "No hay análisis guardado.");
  hojaLista("Sobrantes", `Sobrantes · sube SAP · ${sum(sobran, (f) => f.ajuste).toLocaleString("es-CO")}`, VERDE, sobran, "No hay sobrantes.");
  hojaLista("Faltantes", `Faltantes · baja SAP · −${Math.abs(sum(faltan, (f) => f.ajuste)).toLocaleString("es-CO")}`, ROJO, faltan, "No hay faltantes.");

  /* ======================= DETALLE PARTIDA POR PARTIDA ======================= */
  {
    const h = wb.addWorksheet("Detalle", { properties: { tabColor: { argb: AZUL } } });
    const W = 6;
    h.columns = [12, 40, 10, 44, 15, 50].map((w) => ({ width: w }));
    const abiertos = [...sobran, ...faltan, ...A.filter((f) => f.ajuste === 0 && f.compensa !== 0)];
    banda(h, W, "Detalle partida por partida", `${abiertos.length} códigos: primero los sobrantes, luego los faltantes · ${sub}`);
    const porCod = new Map(d.analisis.map((f) => [f.codigo, f]));
    let n = 7;
    const linea = (lado: string, nombre: string, v: number, color: string) => {
      const r = h.getRow(n); r.height = 17;
      r.getCell(3).value = lado; r.getCell(3).font = letra(8.5, color, true); r.getCell(3).alignment = { horizontal: "center" };
      r.getCell(3).fill = relleno(lado === "SAP" ? "FFFFF3CC" : AZUL_F);
      r.getCell(4).value = nombre; r.getCell(4).font = letra(9.5, TINTA); r.getCell(4).alignment = { indent: 1 };
      r.getCell(5).value = v; r.getCell(5).numFmt = NUM; r.getCell(5).font = letra(9.5, TINTA); r.getCell(5).alignment = { horizontal: "center" };
      for (let c = 3; c <= 5; c++) r.getCell(c).border = { bottom: raya() };
      n++;
    };
    const cifra = (rot: string, v: number, fmt: string, color: string, fondo?: string) => {
      const r = h.getRow(n); r.height = 18;
      r.getCell(4).value = rot; r.getCell(4).font = letra(9.5, color, true); r.getCell(4).alignment = { horizontal: "right", indent: 1 };
      r.getCell(5).value = v; r.getCell(5).numFmt = fmt; r.getCell(5).font = letra(10, color, true); r.getCell(5).alignment = { horizontal: "center" };
      if (fondo) { r.getCell(4).fill = relleno(fondo); r.getCell(5).fill = relleno(fondo) }
      n++;
    };
    for (const f of abiertos) {
      const a = porCod.get(f.codigo);
      /* La cabecera del código. */
      const r = h.getRow(n); r.height = 24;
      for (let c = 1; c <= W; c++) { r.getCell(c).fill = relleno(TINTA); r.getCell(c).font = letra(10.5, BLANCO, true); r.getCell(c).alignment = { vertical: "middle" } }
      r.getCell(1).value = f.codigo; r.getCell(1).alignment = { vertical: "middle", indent: 1 };
      r.getCell(2).value = f.descripcion;
      r.getCell(4).value = f.familia; r.getCell(4).font = letra(9, GRIS_CLARO);
      r.getCell(5).value = sentido(f.ajuste); r.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(5).font = letra(9, f.ajuste > 0 ? "FF7EE0A8" : f.ajuste < 0 ? "FFFF9AA5" : GRIS_CLARO, true);
      n++;
      const ini = n;
      for (const p of a?.deSap ?? []) linea("SAP", p.nombre, p.cantidad, "FF5E4100");
      if (!(a?.deSap ?? []).length) linea("SAP", "— no está en la ZEXI ni en el balance", 0, "FF5E4100");
      cifra("Total SAP", f.sap, NUM, TINTA, FONDO);
      for (const p of a?.deConteo ?? []) linea("CONTEO", p.nombre, p.cantidad, AZUL);
      if (!(a?.deConteo ?? []).length) linea("CONTEO", "— no se contó", 0, AZUL);
      cifra("Total CONTEO", f.conteo, NUM, TINTA, FONDO);
      cifra("Diferencia (conteo − SAP)", f.diferencia, SIG, TINTA);
      if (f.compensa) cifra(`Compensación con ${f.par} ${f.parDescripcion ?? ""}`.trim(), f.compensa, SIG, AZUL, AZUL_F);
      cifra("AJUSTE", f.ajuste, SIG, f.ajuste > 0 ? VERDE : f.ajuste < 0 ? ROJO : TINTA, f.ajuste > 0 ? VERDE_F : f.ajuste < 0 ? ROJO_F : FONDO);
      /* La observación, al lado, a lo alto de todo el bloque. */
      if (n - 1 > ini) h.mergeCells(ini, 6, n - 1, 6);
      const o = h.getCell(ini, 6); o.value = obsDe(f) ? `Observación: ${obsDe(f)}` : "Sin observación";
      o.font = letra(9.5, obsDe(f) ? TINTA : GRIS, false, !obsDe(f)); o.alignment = { vertical: "top", wrapText: true, indent: 1 };
      o.border = { left: { style: "medium", color: { argb: BANDA } } };
      n += 1;
    }
    if (!abiertos.length) { const x = h.getCell(7, 1); x.value = "Nada que ajustar: todo cuadra."; x.font = letra(10, GRIS, false, true) }
    h.views = [{ showGridLines: false }];
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
