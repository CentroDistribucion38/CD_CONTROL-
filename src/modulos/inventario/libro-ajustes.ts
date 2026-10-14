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
import { COMPENSA, analisisFinal, type FilaAjuste, type FilaFinal } from "./compensa";

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
  fecha: string; fechaLarga: string;
  /** Vacío = el análisis en vivo, sin guardar. */
  guardadoEn: string | null; guardadoPor: string | null;
  ajustes: FilaAjuste[]; analisis: FilaAnalisis[];
};

/* EL SELLO DE LA B, arriba a la derecha de cada hoja, como en los demás libros. Se baja de /marca/logo-b.png
   (el libro se arma en el navegador); si no llega, el libro sale igual sin él. */
const anchoDe = new Map<ExcelJS.Worksheet, number>();
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
/** Pone el sello en todas las hojas que tienen banda, pegado al borde derecho de la banda. */
function ponerLogos(wb: ExcelJS.Workbook, logoId: number | null) {
  if (logoId == null) return;
  for (const h of wb.worksheets) {
    const ancho = anchoDe.get(h);
    if (!ancho) continue;
    const px = (h.getColumn(ancho).width ?? 9) * 7 + 5;
    const desde = Math.max(0, 1 - 62 / px);
    h.addImage(logoId, { tl: { col: ancho - 1 + desde, row: 0.3 } as ExcelJS.Anchor, ext: { width: 52, height: 52 }, editAs: "oneCell" });
  }
}

/** La banda negra de arriba: ojo amarillo, título y de qué día es. */
function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string) {
  anchoDe.set(h, ancho);
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

const libroNuevo = () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Análisis de diferencia"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  return wb;
};
const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const subDe = (d: { fechaLarga: string; guardadoEn: string | null; guardadoPor: string | null }) =>
  `${d.fechaLarga} · ${d.guardadoEn ? `análisis guardado el ${cuando(d.guardadoEn)}${d.guardadoPor ? ` por ${d.guardadoPor}` : ""}` : `análisis en vivo (sin guardar) · exportado el ${cuando(new Date().toISOString())}`}`;

export async function armarLibroAjustes(d: InsumosLibroAjustes): Promise<ArrayBuffer> {
  const wb = libroNuevo();
  const logo = await cargarLogo(wb);
  agregarHojasAjustes(wb, d);
  ponerLogos(wb, logo);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Las hojas de los ajustes (Resumen, Ajustes, Sobrantes, Faltantes, Detalle) sobre un libro que ya existe. */
function agregarHojasAjustes(wb: ExcelJS.Workbook, d: InsumosLibroAjustes) {
  const sub = subDe(d);
  const A = d.ajustes;
  const sobran = A.filter((f) => f.ajuste > 0).sort((a, b) => b.ajuste - a.ajuste);
  const faltan = A.filter((f) => f.ajuste < 0).sort((a, b) => a.ajuste - b.ajuste);
  const sum = (xs: FilaAjuste[], k: (f: FilaAjuste) => number) => xs.reduce((t, f) => t + k(f), 0);
  const obsDe = (f: FilaAjuste) => f.observacion || "";

  /* ======================= RESUMEN ======================= */
  {
    const h = wb.addWorksheet("Resumen ajustes", { properties: { tabColor: { argb: BANDA } } });
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
}

/* =====================================================================
   EL LIBRO DEL ANÁLISIS (paso 1): «que se baje la data donde está la información, de dónde sale el
   análisis, y la otra hoja de ajustes; todo súper presentable».
     Análisis   la tabla dinámica: por familia, con su total y el total general, la diferencia en color.
     Base       la data de donde sale: una fila por código · lado · partida (ZEXI, novedades, balance, conteo,
                depa, pasivos…), con filtro, lista para hacerle una dinámica propia.
     Fuentes    qué alimentó el día y cómo quedó cada fuente.
     + las hojas de los ajustes (Resumen ajustes, Ajustes, Sobrantes, Faltantes, Detalle).
   ===================================================================== */
export type InsumosLibroAnalisis = InsumosLibroAjustes & {
  fuentes: { nombre: string; ok: boolean; detalle: string }[];
  noEntran: string[];
};

export async function armarLibroAnalisis(d: InsumosLibroAnalisis): Promise<ArrayBuffer> {
  const wb = libroNuevo();
  const logo = await cargarLogo(wb);
  const sub = subDe(d);
  const F = d.analisis;
  const sum = (xs: FilaAnalisis[], k: (f: FilaAnalisis) => number) => xs.reduce((t, f) => t + k(f), 0);

  /* ---------------- ANÁLISIS: la dinámica ---------------- */
  {
    const h = wb.addWorksheet("Análisis", { properties: { tabColor: { argb: BANDA } } });
    const cols: Col[] = [{ t: "Familia", w: 30, texto: true }, { t: "Código", w: 12 }, { t: "Descripción", w: 44, texto: true }, { t: "SAP", w: 16, fmt: NUM }, { t: "Conteo", w: 16, fmt: NUM }, { t: "Diferencia", w: 16, fmt: SIG }];
    banda(h, cols.length, "Análisis de diferencia", sub);
    /* Las tres cifras grandes, arriba. */
    const tS = sum(F, (f) => f.sap), tC = sum(F, (f) => f.conteo);
    const kpi: [string, number, string, string][] = [["SAP", tS, NUM, TINTA], ["CONTEO", tC, NUM, TINTA], ["DIFERENCIA (CONTEO − SAP)", tC - tS, SIG, tC - tS < 0 ? ROJO : VERDE]];
    h.getRow(7).height = 16; h.getRow(8).height = 30;
    kpi.forEach(([rot, v, fmt, color], i) => {
      const c = [1, 3, 5][i], c2 = [2, 4, 6][i];
      h.mergeCells(7, c, 7, c2); h.mergeCells(8, c, 8, c2);
      const a = h.getCell(7, c); a.value = rot; a.font = letra(8.5, i === 2 ? BANDA : GRIS, true); a.alignment = { indent: 1, vertical: "bottom" };
      const b = h.getCell(8, c); b.value = v; b.numFmt = fmt; b.font = letra(18, i === 2 ? (tC - tS < 0 ? "FFFF9AA5" : BANDA) : TINTA, true); b.alignment = { indent: 1, vertical: "middle" };
      for (const f of [7, 8]) { const x = h.getCell(f, c); x.fill = relleno(i === 2 ? TINTA : FONDO); x.border = { bottom: f === 8 ? { style: "medium", color: { argb: i === 2 ? BANDA : TINTA } } : undefined } as ExcelJS.Borders }
      void color;
    });
    encabezado(h, 10, cols);
    let n = 11;
    const fams = [...new Set(F.map((f) => f.familia))];
    for (const fam of fams) {
      const xs = F.filter((f) => f.familia === fam);
      const ini = n;
      xs.forEach((f, i) => {
        const r = fila(h, n, cols, [i === 0 ? fam : "", f.codigo, f.descripcion, f.sap, f.conteo, f.diferencia], false);
        r.getCell(1).font = letra(9.5, AZUL, true); r.getCell(1).fill = relleno(AZUL_F);
        r.getCell(2).font = letra(9.5, TINTA, true);
        r.getCell(6).font = letra(10, f.diferencia < 0 ? ROJO : f.diferencia > 0 ? AZUL : GRIS, true);
        n++;
      });
      if (xs.length > 1) h.mergeCells(ini, 1, n - 1, 1);
      h.getCell(ini, 1).alignment = { vertical: "top", indent: 1, wrapText: true };
      /* El total de la familia. */
      const r = h.getRow(n); r.height = 20;
      const vs = [`Total ${fam.split(" · ")[0]}`, "", "", sum(xs, (f) => f.sap), sum(xs, (f) => f.conteo), sum(xs, (f) => f.diferencia)];
      vs.forEach((v, i) => {
        const x = r.getCell(i + 1); x.value = v as ExcelJS.CellValue; x.fill = relleno("FFC9D8EE"); x.font = letra(9.5, TINTA, true);
        x.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
        if (i >= 3) x.numFmt = i === 5 ? SIG : NUM;
      });
      n++;
    }
    const r = h.getRow(n); r.height = 24;
    ["TOTAL GENERAL", "", "", tS, tC, tC - tS].forEach((v, i) => {
      const x = r.getCell(i + 1); x.value = v as ExcelJS.CellValue; x.fill = relleno(TINTA); x.font = letra(10.5, i === 5 ? BANDA : BLANCO, true);
      x.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
      if (i >= 3) x.numFmt = i === 5 ? SIG : NUM;
    });
    n += 2;
    const nota = h.getCell(n, 1);
    nota.value = `En unidades; cajas plásticas y estibas por unidad. Diferencia = CONTEO − SAP. De dónde sale cada cifra: hoja «Base» (y «Detalle» para lo que se ajusta).${d.noEntran.length ? ` No entran: ${d.noEntran.join(", ")}.` : ""}`;
    h.mergeCells(n, 1, n, cols.length); nota.font = letra(9, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top", indent: 1 }; h.getRow(n).height = 30;
    h.views = [{ state: "frozen", ySplit: 10, showGridLines: false }];
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "10:10" };
  }

  /* ---------------- BASE: la data de donde sale ---------------- */
  {
    const h = wb.addWorksheet("Base", { properties: { tabColor: { argb: AZUL } } });
    const cols: Col[] = [{ t: "Familia", w: 28, texto: true }, { t: "Código", w: 11 }, { t: "Descripción", w: 40, texto: true }, { t: "Lado", w: 10 }, { t: "Partida (de dónde sale)", w: 46, texto: true }, { t: "Unidades", w: 15, fmt: NUM }];
    const base = F.flatMap((f) => [
      ...f.deSap.map((p) => [f.familia, f.codigo, f.descripcion, "SAP", p.nombre, p.cantidad] as ExcelJS.CellValue[]),
      ...f.deConteo.map((p) => [f.familia, f.codigo, f.descripcion, "CONTEO", p.nombre, p.cantidad] as ExcelJS.CellValue[]),
    ]);
    banda(h, cols.length, "Base del análisis", `${base.length} partidas · una fila por código, lado y partida · ${sub}`);
    encabezado(h, 7, cols);
    base.forEach((v, i) => {
      const r = fila(h, 8 + i, cols, v, i % 2 === 1);
      const sap = v[3] === "SAP";
      r.getCell(4).fill = relleno(sap ? "FFFFF3CC" : AZUL_F); r.getCell(4).font = letra(8.5, sap ? "FF5E4100" : AZUL, true);
      r.getCell(2).font = letra(9.5, TINTA, true);
    });
    const ult = 7 + base.length;
    total(h, ult + 1, cols.length, "TOTAL (lo filtrado) · filtra por Lado para ver SAP o CONTEO", { 6: { desde: 8, hasta: ult, valor: base.reduce((t, v) => t + (Number(v[5]) || 0), 0), fmt: NUM } });
    if (base.length) h.autoFilter = `A7:F${ult}`;
    h.views = [{ state: "frozen", ySplit: 7, showGridLines: false }];
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "7:7" };
  }

  /* ---------------- FUENTES: qué alimentó el día ---------------- */
  {
    const h = wb.addWorksheet("Fuentes", { properties: { tabColor: { argb: GRIS } } });
    const cols: Col[] = [{ t: "Fuente", w: 26, texto: true }, { t: "Estado", w: 14 }, { t: "Detalle", w: 80, texto: true }];
    banda(h, cols.length, "De dónde sale el análisis", sub);
    encabezado(h, 7, cols);
    d.fuentes.forEach((x, i) => {
      const r = fila(h, 8 + i, cols, [x.nombre, x.ok ? "OK" : "FALTA", x.detalle], i % 2 === 1);
      r.getCell(1).font = letra(10, TINTA, true);
      r.getCell(2).fill = relleno(x.ok ? VERDE_F : ROJO_F); r.getCell(2).font = letra(9, x.ok ? VERDE : ROJO, true);
    });
    h.views = [{ showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  agregarHojasAjustes(wb, d);
  ponerLogos(wb, logo);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/* =====================================================================
   EL HISTÓRICO: cada día guardado, código por código, y la matriz código × día.
   ===================================================================== */
export type DiaLibro = { fecha: string; guardado_en: string; guardado_por: string | null; sap: number; conteo: number; diferencia: number; compensado: number; sobrante: number; faltante: number; neto: number; nSobra: number; nFalta: number; nObs: number; final?: { en: string; diferencia: number; pendientes: number } | null };
export type FilaLibroHist = { fecha: string; familia: string; codigo: string; descripcion: string; sap: number; conteo: number; diferencia: number; compensa: number; ajuste: number; observacion: string };

export async function armarLibroHistorico(dias: DiaLibro[], detalle: FilaLibroHist[]): Promise<ArrayBuffer> {
  const wb = libroNuevo();
  const logo = await cargarLogo(wb);
  const dd = (iso: string) => iso.split("-").reverse().join("/");
  const sub = `${dias.length} día${dias.length === 1 ? "" : "s"} guardado${dias.length === 1 ? "" : "s"} · exportado el ${cuando(new Date().toISOString())}`;
  {
    const h = wb.addWorksheet("Histórico", { properties: { tabColor: { argb: BANDA } } });
    const cols: Col[] = [{ t: "Día", w: 12 }, { t: "SAP", w: 15, fmt: NUM }, { t: "Conteo", w: 15, fmt: NUM }, { t: "Diferencia", w: 14, fmt: SIG }, { t: "Compensado", w: 14, fmt: NUM }, { t: "Sobrante", w: 14, fmt: SIG }, { t: "Faltante", w: 14, fmt: SIG }, { t: "Ajuste neto", w: 14, fmt: SIG }, { t: "Diferencia final", w: 14, fmt: SIG }, { t: "Pendientes", w: 11 }, { t: "Códigos que sobran", w: 11 }, { t: "Códigos que faltan", w: 11 }, { t: "Con observación", w: 11 }, { t: "Guardado", w: 32, texto: true }];
    banda(h, cols.length, "Histórico de ajustes", sub);
    encabezado(h, 7, cols);
    const xs = [...dias].sort((a, b) => b.fecha.localeCompare(a.fecha));
    xs.forEach((x, i) => {
      const r = fila(h, 8 + i, cols, [dd(x.fecha), x.sap, x.conteo, x.diferencia, x.compensado, x.sobrante, x.faltante, x.neto, x.final ? x.final.diferencia : "Sin final", x.final ? x.final.pendientes : "", x.nSobra, x.nFalta, x.nObs, `${cuando(x.guardado_en)}${x.guardado_por ? ` · ${x.guardado_por}` : ""}`], i % 2 === 1);
      r.getCell(9).font = letra(10, !x.final ? GRIS : x.final.diferencia === 0 ? VERDE : ROJO, true);
      r.getCell(1).font = letra(10, TINTA, true);
      r.getCell(6).font = letra(9.5, VERDE, true); r.getCell(7).font = letra(9.5, ROJO, true);
      r.getCell(8).font = letra(10, x.neto < 0 ? ROJO : x.neto > 0 ? VERDE : GRIS, true);
    });
    const ult = 7 + xs.length;
    total(h, ult + 1, cols.length, "TOTAL (lo filtrado)", {
      5: { desde: 8, hasta: ult, valor: dias.reduce((t, x) => t + x.compensado, 0), fmt: NUM },
      6: { desde: 8, hasta: ult, valor: dias.reduce((t, x) => t + x.sobrante, 0), fmt: SIG },
      7: { desde: 8, hasta: ult, valor: dias.reduce((t, x) => t + x.faltante, 0), fmt: SIG },
      8: { desde: 8, hasta: ult, valor: dias.reduce((t, x) => t + x.neto, 0), fmt: SIG },
    });
    if (xs.length) h.autoFilter = `A7:N${ult}`;
    h.views = [{ state: "frozen", ySplit: 7, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }
  {
    const h = wb.addWorksheet("Por código", { properties: { tabColor: { argb: AZUL } } });
    const cols: Col[] = [{ t: "Día", w: 12 }, { t: "Familia", w: 26, texto: true }, { t: "Código", w: 11 }, { t: "Descripción", w: 38, texto: true }, { t: "SAP", w: 14, fmt: NUM }, { t: "Conteo", w: 14, fmt: NUM }, { t: "Diferencia", w: 13, fmt: SIG }, { t: "Compensación", w: 13, fmt: SIG }, { t: "Ajuste", w: 13, fmt: SIG }, { t: "Sentido", w: 21 }, { t: "Observación", w: 50, texto: true }];
    const xs = [...detalle].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.familia.localeCompare(b.familia) || a.codigo.localeCompare(b.codigo));
    banda(h, cols.length, "Histórico código por código", `${xs.length} filas · ${sub}`);
    encabezado(h, 7, cols);
    xs.forEach((f, i) => {
      const r = fila(h, 8 + i, cols, [dd(f.fecha), f.familia, f.codigo, f.descripcion, f.sap, f.conteo, f.diferencia, f.compensa || null, f.ajuste, sentido(f.ajuste), f.observacion], i % 2 === 1);
      r.getCell(3).font = letra(9.5, TINTA, true);
      r.getCell(9).font = letra(10, f.ajuste > 0 ? VERDE : f.ajuste < 0 ? ROJO : GRIS, true);
      pintarSentido(r.getCell(10), f.ajuste);
    });
    const ult = 7 + xs.length;
    total(h, ult + 1, cols.length, "TOTAL (lo filtrado)", {
      7: { desde: 8, hasta: ult, valor: xs.reduce((t, f) => t + f.diferencia, 0), fmt: SIG },
      8: { desde: 8, hasta: ult, valor: xs.reduce((t, f) => t + f.compensa, 0), fmt: SIG },
      9: { desde: 8, hasta: ult, valor: xs.reduce((t, f) => t + f.ajuste, 0), fmt: SIG },
    });
    if (xs.length) h.autoFilter = `A7:K${ult}`;
    h.views = [{ state: "frozen", ySplit: 7, xSplit: 3, showGridLines: false }];
  }
  {
    /* LA MATRIZ: cada código en una fila, cada día en una columna, el ajuste en la celda. Se ve qué código
       se ajusta todos los días y cuál fue cosa de un día. */
    const h = wb.addWorksheet("Código × día", { properties: { tabColor: { argb: VERDE } } });
    const fechas = [...new Set(detalle.map((f) => f.fecha))].sort();
    const codigos = [...new Map(detalle.map((f) => [f.codigo, f])).values()].sort((a, b) => a.familia.localeCompare(b.familia) || a.codigo.localeCompare(b.codigo));
    const cols: Col[] = [{ t: "Familia", w: 24, texto: true }, { t: "Código", w: 11 }, { t: "Descripción", w: 34, texto: true }, ...fechas.map((f) => ({ t: dd(f), w: 12, fmt: SIG })), { t: "Total", w: 14, fmt: SIG }, { t: "Días con ajuste", w: 10 }];
    banda(h, cols.length, "Ajuste por código y por día", `Positivo = sobrante (sube SAP) · negativo = faltante (baja SAP) · ${sub}`);
    encabezado(h, 7, cols);
    const v = new Map(detalle.map((f) => [`${f.codigo}|${f.fecha}`, f.ajuste]));
    codigos.forEach((c, i) => {
      const vals = fechas.map((f) => v.get(`${c.codigo}|${f}`) ?? null);
      const tot = vals.reduce<number>((t, x) => t + (x ?? 0), 0);
      const r = fila(h, 8 + i, cols, [c.familia, c.codigo, c.descripcion, ...vals.map((x) => (x ? x : null)), tot, vals.filter((x) => x).length], i % 2 === 1);
      r.getCell(2).font = letra(9.5, TINTA, true);
      vals.forEach((x, k) => { if (x) { const cel = r.getCell(4 + k); cel.fill = relleno(x > 0 ? VERDE_F : ROJO_F); cel.font = letra(9, x > 0 ? VERDE : ROJO, true) } });
      r.getCell(4 + fechas.length).font = letra(10, tot > 0 ? VERDE : tot < 0 ? ROJO : GRIS, true);
    });
    h.views = [{ state: "frozen", ySplit: 7, xSplit: 3, showGridLines: false }];
  }
  ponerLogos(wb, logo);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/* =====================================================================
   EL LIBRO DEL ANÁLISIS FINAL (paso 3): cómo quedó SAP con lo hecho.
     Análisis final  SAP inicial · compensación hecha · ajuste hecho · SAP final · conteo · diferencia final,
                     por familia, con el estado de cada código.
     Pendientes      lo que sigue con diferencia (lo que falta por hacer).
     + las hojas de los ajustes.
   ===================================================================== */
export async function armarLibroFinal(d: InsumosLibroAjustes & { finalEn: string | null }): Promise<ArrayBuffer> {
  const wb = libroNuevo();
  const logo = await cargarLogo(wb);
  const sub = `${subDe(d)}${d.finalEn ? ` · análisis final guardado el ${cuando(d.finalEn)}` : " · análisis final sin guardar"}`;
  const F = analisisFinal(d.ajustes);
  const sum = (xs: FilaFinal[], k: (f: FilaFinal) => number) => xs.reduce((t, f) => t + k(f), 0);
  const cols: Col[] = [
    { t: "Familia", w: 26, texto: true }, { t: "Código", w: 11 }, { t: "Descripción", w: 38, texto: true }, { t: "SAP inicial", w: 15, fmt: NUM },
    { t: "Compensación hecha", w: 14, fmt: SIG }, { t: "Ajuste hecho", w: 14, fmt: SIG }, { t: "SAP final", w: 15, fmt: NUM },
    { t: "Conteo", w: 15, fmt: NUM }, { t: "Diferencia inicial", w: 14, fmt: SIG }, { t: "Diferencia final", w: 14, fmt: SIG }, { t: "Estado", w: 15 }, { t: "Observación", w: 44, texto: true },
  ];
  const estado = (f: FilaFinal) => (f.difFinal === 0 ? (f.diferencia === 0 ? "CUADRABA" : "CUADRADO ✓") : "PENDIENTE");
  const pintar = (x: ExcelJS.Cell, f: FilaFinal) => {
    const ok = f.difFinal === 0;
    x.fill = relleno(ok ? (f.diferencia === 0 ? FONDO : VERDE_F) : ROJO_F); x.font = letra(8.5, ok ? (f.diferencia === 0 ? GRIS : VERDE) : ROJO, true);
  };
  const hoja = (nombre: string, titulo: string, color: string, xs: FilaFinal[], conFamilias: boolean) => {
    const h = wb.addWorksheet(nombre, { properties: { tabColor: { argb: color } } });
    banda(h, cols.length, titulo, sub);
    /* Las cifras grandes. */
    const ini = sum(F, (f) => f.diferencia), fin = sum(F, (f) => f.difFinal), mov = sum(F, (f) => f.movComp + f.movAjuste);
    const kp: [string, number, string][] = [["DIFERENCIA INICIAL", ini, SIG], ["MOVIDO EN SAP", mov, SIG], ["DIFERENCIA FINAL", fin, SIG], ["CÓDIGOS PENDIENTES", F.filter((f) => f.difFinal !== 0).length, NUM]];
    h.getRow(7).height = 16; h.getRow(8).height = 30;
    kp.forEach(([rot, v, fmt], i) => {
      const c = 1 + i * 3, c2 = c + 2;
      h.mergeCells(7, c, 7, c2); h.mergeCells(8, c, 8, c2);
      const oscuro = i === 2;
      const a = h.getCell(7, c); a.value = rot; a.font = letra(8.5, oscuro ? BANDA : GRIS, true); a.alignment = { indent: 1, vertical: "bottom" };
      const b = h.getCell(8, c); b.value = v; b.numFmt = fmt; b.alignment = { indent: 1, vertical: "middle" };
      b.font = letra(18, oscuro ? (v === 0 ? "FF7EE0A8" : "FFFF9AA5") : i === 3 && v > 0 ? ROJO : TINTA, true);
      for (const f of [7, 8]) { const x = h.getCell(f, c); x.fill = relleno(oscuro ? TINTA : FONDO); if (f === 8) x.border = { bottom: { style: "medium", color: { argb: oscuro ? BANDA : TINTA } } } }
    });
    encabezado(h, 10, cols);
    let n = 11;
    const grupos = conFamilias ? [...new Set(xs.map((f) => f.familia))].map((fam) => [fam, xs.filter((f) => f.familia === fam)] as const) : [["", xs] as const];
    for (const [fam, ys] of grupos) {
      const ini0 = n;
      ys.forEach((f, i) => {
        const r = fila(h, n, cols, [conFamilias ? (i === 0 ? fam : "") : f.familia, f.codigo, f.descripcion, f.sap, f.movComp || null, f.movAjuste || null, f.sapFinal, f.conteo, f.diferencia, f.difFinal, estado(f), f.observacion], !conFamilias && i % 2 === 1);
        if (conFamilias) { r.getCell(1).font = letra(9.5, AZUL, true); r.getCell(1).fill = relleno(AZUL_F) }
        r.getCell(2).font = letra(9.5, TINTA, true);
        r.getCell(7).font = letra(10, TINTA, true);
        r.getCell(10).font = letra(10, f.difFinal < 0 ? ROJO : f.difFinal > 0 ? AZUL : VERDE, true);
        pintar(r.getCell(11), f);
        n++;
      });
      if (conFamilias) {
        if (ys.length > 1) h.mergeCells(ini0, 1, n - 1, 1);
        h.getCell(ini0, 1).alignment = { vertical: "top", indent: 1, wrapText: true };
        const r = h.getRow(n); r.height = 20;
        const vs = [`Total ${fam.split(" · ")[0]}`, "", "", sum(ys as FilaFinal[], (f) => f.sap), sum(ys as FilaFinal[], (f) => f.movComp), sum(ys as FilaFinal[], (f) => f.movAjuste), sum(ys as FilaFinal[], (f) => f.sapFinal), sum(ys as FilaFinal[], (f) => f.conteo), sum(ys as FilaFinal[], (f) => f.diferencia), sum(ys as FilaFinal[], (f) => f.difFinal), "", ""];
        vs.forEach((v, i) => {
          const x = r.getCell(i + 1); x.value = v as ExcelJS.CellValue; x.fill = relleno("FFC9D8EE"); x.font = letra(9.5, TINTA, true);
          x.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
          if (i >= 3 && i <= 9) x.numFmt = [4, 5, 8, 9].includes(i) ? SIG : NUM;
        });
        n++;
      }
    }
    const r = h.getRow(n); r.height = 24;
    ["TOTAL GENERAL", "", "", sum(xs, (f) => f.sap), sum(xs, (f) => f.movComp), sum(xs, (f) => f.movAjuste), sum(xs, (f) => f.sapFinal), sum(xs, (f) => f.conteo), sum(xs, (f) => f.diferencia), sum(xs, (f) => f.difFinal), "", ""].forEach((v, i) => {
      const x = r.getCell(i + 1); x.value = v as ExcelJS.CellValue; x.fill = relleno(TINTA); x.font = letra(10.5, i === 9 ? BANDA : BLANCO, true);
      x.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
      if (i >= 3 && i <= 9) x.numFmt = [4, 5, 8, 9].includes(i) ? SIG : NUM;
    });
    if (!xs.length) { const x = h.getCell(11, 1); x.value = "Nada pendiente: todo cuadra."; x.font = letra(10, VERDE, true) }
    h.views = [{ state: "frozen", ySplit: 10, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "10:10" };
  };
  hoja("Análisis final", "Análisis final", BANDA, F, true);
  hoja("Pendientes", "Lo que sigue con diferencia", ROJO, F.filter((f) => f.difFinal !== 0).sort((a, b) => Math.abs(b.difFinal) - Math.abs(a.difFinal)), false);
  agregarHojasAjustes(wb, d);
  ponerLogos(wb, logo);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
