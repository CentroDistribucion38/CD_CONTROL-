import ExcelJS from "exceljs";
import { TOL_EST, TOL_HL, type Cuadre, type SitioResultado } from "./cuadre";

/**
 * CASCO DE VIDRIO · REGISTRAR · EXPORTAR — el libro de Excel de la validación «ayer + bajas = hoy».
 *
 * Una hoja de RESUMEN, una hoja por tabla de Control (AG22, AG18…) con la cuenta fila por fila, y la hoja con las
 * BAJAS DEL DÍA tal como están registradas. Lo leído de Control va como número; lo calculado (esperado, diferencias,
 * estado) va como FÓRMULA, para poder cambiar una cifra y que todo se recalcule. Es una función pura: la ruta de
 * descarga solo le pasa el cuadre y escribe el archivo.
 */
const NEGRO = "FF111111", AMARILLO = "FFFFC400", CREMA = "FFFFF6D6", GRIS = "FFEDEDED", GRIS_T = "FF5B5B5B", ROJO = "FFD71920";
const LINEA = "FFBDBDBD", AZUL = "FF1F4E9E", VERDE_F = "FFE3F3EA", VERDE_T = "FF0E5C35", ROJO_F = "FFFDE7EB", ROJO_T = "FFA4102A";
const borde = { style: "thin" as const, color: { argb: LINEA } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const relleno = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const FMT_EST = "#,##0.00;[Red]-#,##0.00;-";
const FMT_DIF = "+#,##0.00;[Red]-#,##0.00;0.00";

const letra = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s };
const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const nombreHoja = (txt: string, usados: Set<string>) => {
  const base = txt.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Tabla";
  let n = base, i = 2;
  while (usados.has(n.toLowerCase())) n = base.slice(0, 28) + " " + i++;
  usados.add(n.toLowerCase());
  return n;
};

function banda(ws: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string) {
  ws.mergeCells(1, 1, 1, ancho);
  const t = ws.getCell(1, 1);
  t.value = titulo; t.font = { bold: true, size: 17, color: { argb: AMARILLO } }; t.fill = relleno(NEGRO);
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 34;
  ws.mergeCells(2, 1, 2, ancho);
  const s = ws.getCell(2, 1);
  s.value = sub; s.font = { size: 11, color: { argb: "FFFFFFFF" } }; s.fill = relleno(NEGRO);
  s.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  ws.getRow(2).height = 34;
  for (let c = 1; c <= ancho; c++) ws.getCell(3, c).fill = relleno(ROJO);
  ws.getRow(3).height = 4;
}
function encabezado(ws: ExcelJS.Worksheet, fila: number, textos: string[], calculadas: Set<number> = new Set()) {
  const e = ws.getRow(fila);
  e.height = 44;
  textos.forEach((h, i) => {
    const c = e.getCell(i + 1);
    c.value = h; c.font = { bold: true, size: 10.5, color: { argb: calculadas.has(i + 1) ? NEGRO : "FFFFFFFF" } };
    c.fill = relleno(calculadas.has(i + 1) ? AMARILLO : "FF3A3A3A");
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = BORDES;
  });
}

type Col = { k: string; h: string; w: number; fmt?: string; calc?: boolean; texto?: boolean };

function hojaSitio(wb: ExcelJS.Workbook, r: SitioResultado, fecha: string, nombre: string) {
  const conBaja = r.filas.some((f) => f.ayerBaja || f.hoyBaja || f.bajasBaja || f.movBaja);
  const rot = r.sitio.baja_rotulo || "Con baja";
  const cols: Col[] = [
    { k: "sku", h: "Material", w: 12, texto: true }, { k: "desc", h: "Descripción", w: 34, texto: true },
    { k: "ayerInv", h: "Inventario ayer", w: 12, fmt: FMT_EST },
    { k: "bajasInv", h: "+ Bajas registradas", w: 13, fmt: FMT_EST },
    { k: "movInv", h: "± Movimientos y ajustes", w: 14, fmt: FMT_EST },
    { k: "espInv", h: "Inventario esperado", w: 13, fmt: FMT_EST, calc: true },
    { k: "hoyInv", h: "Inventario hoy (Control)", w: 14, fmt: FMT_EST },
    { k: "difInv", h: "Diferencia inventario", w: 13, fmt: FMT_DIF, calc: true },
    ...(conBaja ? [
      { k: "ayerBaja", h: `${rot} ayer`, w: 12, fmt: FMT_EST },
      { k: "movBaja", h: "± Bajas y movimientos", w: 13, fmt: FMT_EST },
      { k: "espBaja", h: `${rot} esperado`, w: 13, fmt: FMT_EST, calc: true },
      { k: "hoyBaja", h: `${rot} hoy (Control)`, w: 14, fmt: FMT_EST },
      { k: "difBaja", h: `Diferencia ${rot.toLowerCase()}`, w: 13, fmt: FMT_DIF, calc: true },
    ] : []),
    { k: "fac", h: "HL por estiba (maestro)", w: 12, fmt: "0.000" },
    { k: "hlHoy", h: "HL hoy (Control)", w: 12, fmt: "#,##0.0" },
    { k: "hlEsp", h: "HL esperado", w: 12, fmt: "#,##0.0", calc: true },
    { k: "difHl", h: "Diferencia HL", w: 12, fmt: FMT_DIF, calc: true },
    { k: "estado", h: "Estado", w: 11, calc: true, texto: true },
    { k: "obs", h: "Qué mirar", w: 54, texto: true },
  ];
  const L: Record<string, string> = {};
  cols.forEach((c, i) => { L[c.k] = letra(i + 1) });
  const n = cols.length;
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }], properties: { tabColor: { argb: r.revisar ? ROJO : AMARILLO } } });
  ws.columns = cols.map((c) => ({ width: c.w }));
  banda(ws, n, `${r.sitio.nombre} · ayer + bajas = hoy`,
    `Control del ${fechaLarga(fecha)}. «Ayer» = ${r.diaAyer ? "el último día anterior con registros (" + fechaLarga(r.diaAyer) + ")" : "no hay un día anterior"}. ` +
    `Esperado = ayer + bajas registradas + movimientos y ajustes de ese día. Azul = lo leído de Control · negro = fórmula. Lo que dice «Revisar» no cuadra.`);
  encabezado(ws, 4, cols.map((c) => c.h), new Set(cols.map((c, i) => (c.calc ? i + 1 : 0)).filter(Boolean)));

  const p = 5, u = p + r.filas.length - 1, tot = u + 1;
  r.filas.forEach((f, i) => {
    const fila = p + i, row = ws.getRow(fila);
    row.height = f.motivo ? 44 : 20;
    const a = (k: string) => `${L[k]}${fila}`;
    const val: Record<string, ExcelJS.CellValue> = {
      sku: f.sku, desc: f.descripcion,
      ayerInv: f.ayerInv, bajasInv: f.bajasInv, movInv: f.movInv, hoyInv: f.hoyInv,
      espInv: { formula: `ROUND(${a("ayerInv")}+${a("bajasInv")}+${a("movInv")},2)`, result: f.esperadoInv },
      difInv: { formula: `ROUND(${a("hoyInv")}-${a("espInv")},2)`, result: f.difInv },
      hlHoy: f.hlHoy, obs: f.motivo || (f.soloRegistro ? `${f.soloRegistro} fila(s) «solo registro»: constan pero no mueven nada.` : ""),
    };
    if (conBaja) {
      val.ayerBaja = f.ayerBaja; val.movBaja = r2(f.bajasBaja + f.movBaja); val.hoyBaja = f.hoyBaja;
      val.espBaja = { formula: `ROUND(${a("ayerBaja")}+${a("movBaja")},2)`, result: f.esperadoBaja };
      val.difBaja = { formula: `ROUND(${a("hoyBaja")}-${a("espBaja")},2)`, result: f.difBaja };
    }
    const sumEsp = conBaja ? `${a("espInv")}+${a("espBaja")}` : a("espInv");
    if (f.hlEstiba != null) {
      val.fac = f.hlEstiba;
      val.hlEsp = { formula: `ROUND((${sumEsp})*${a("fac")},2)`, result: f.hlEsperado ?? 0 };
      val.difHl = { formula: `ROUND(${a("hlHoy")}-${a("hlEsp")},2)`, result: f.difHl ?? 0 };
    } else { val.fac = "—"; val.hlEsp = "—"; val.difHl = "—" }
    const okEst = `ABS(${a("difInv")})<=${TOL_EST}` + (conBaja ? `,ABS(${a("difBaja")})<=${TOL_EST}` : "");
    const okHl = f.hlEstiba != null ? `,ABS(${a("difHl")})<=${TOL_HL}` : "";
    val.estado = { formula: `IF(AND(${okEst}${okHl}),"Cuadra","Revisar")`, result: f.estado === "cuadra" ? "Cuadra" : "Revisar" };

    cols.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      cell.value = val[c.k] ?? null;
      cell.border = BORDES;
      const dato = ["ayerInv", "bajasInv", "movInv", "hoyInv", "ayerBaja", "movBaja", "hoyBaja", "hlHoy", "fac"].includes(c.k);
      cell.font = { size: 11, color: { argb: dato && typeof val[c.k] === "number" ? AZUL : NEGRO }, bold: c.k === "estado" };
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { vertical: "middle", horizontal: c.k === "estado" ? "center" : c.texto ? "left" : "right", wrapText: c.k === "obs" };
      if (c.k === "sku") cell.numFmt = "@";
    });
  });

  // Totales de la tabla.
  const t = ws.getRow(tot);
  t.height = 24;
  const suma = (k: string) => ({ formula: `ROUND(SUM(${L[k]}${p}:${L[k]}${u}),2)` });
  cols.forEach((c, j) => {
    const cell = t.getCell(j + 1);
    cell.fill = relleno(CREMA); cell.border = BORDES; cell.font = { bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: c.texto ? "left" : "right" };
    if (c.fmt) cell.numFmt = c.fmt;
  });
  t.getCell(2).value = "TOTAL";
  if (r.filas.length) {
    for (const k of ["ayerInv", "bajasInv", "movInv", "espInv", "hoyInv", "difInv", "ayerBaja", "movBaja", "espBaja", "hoyBaja", "difBaja", "hlHoy", "hlEsp", "difHl"]) {
      if (L[k]) t.getCell(cols.findIndex((c) => c.k === k) + 1).value = suma(k);
    }
    const ce = t.getCell(cols.findIndex((c) => c.k === "estado") + 1);
    ce.value = { formula: `COUNTIF(${L.estado}${p}:${L.estado}${u},"Cuadra")&" de "&COUNTA(${L.estado}${p}:${L.estado}${u})`, result: `${r.cuadran} de ${r.filas.length}` };
    ce.alignment = { horizontal: "center", vertical: "middle" };
  } else {
    ws.mergeCells(p, 1, p, n);
    const c = ws.getCell(p, 1);
    c.value = "Esta tabla no tiene registros ese día ni bajas o movimientos que los hubieran creado.";
    c.font = { italic: true, color: { argb: GRIS_T } };
  }

  // Colores que reaccionan: rojo lo que no cuadra, verde lo que sí.
  if (r.filas.length) {
    const rango = (k: string) => `${L[k]}${p}:${L[k]}${u}`;
    ws.addConditionalFormatting({ ref: rango("estado"), rules: [
      { type: "expression", formulae: [`${L.estado}${p}="Revisar"`], style: { font: { bold: true, color: { argb: ROJO_T } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: ROJO_F } } }, priority: 1 },
      { type: "expression", formulae: [`${L.estado}${p}="Cuadra"`], style: { font: { bold: true, color: { argb: VERDE_T } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: VERDE_F } } }, priority: 2 },
    ] });
    for (const k of ["difInv", "difBaja"]) {
      if (!L[k]) continue;
      ws.addConditionalFormatting({ ref: rango(k), rules: [
        { type: "expression", formulae: [`ABS(${L[k]}${p})>${TOL_EST}`], style: { font: { bold: true, color: { argb: ROJO_T } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: ROJO_F } } }, priority: 3 },
      ] });
    }
  }
  ws.autoFilter = r.filas.length ? { from: { row: 4, column: 1 }, to: { row: u, column: n } } : undefined;
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function construirLibroCuadre(c: Cuadre): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Casco de vidrio"; wb.created = new Date();
  const usados = new Set<string>(["resumen", "bajas del día"]);

  // ---- RESUMEN ----
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }], properties: { tabColor: { argb: NEGRO } } });
  const H = ["Tabla de Control", "Estibas ayer", "Bajas que suman", "Movimientos y ajustes", "Estibas esperadas", "Estibas hoy (Control)", "Diferencia", "HL ayer", "HL hoy (Control)", "HL esperado", "Celdas que cuadran", "Estado"];
  ws.columns = [30, 13, 13, 14, 13, 14, 12, 12, 14, 12, 14, 12].map((w) => ({ width: w }));
  banda(ws, H.length, "¿Cuadra lo de ayer + las bajas con lo de hoy?",
    `Casco de vidrio · Control del ${fechaLarga(c.fecha)} · ${c.revisar ? `${c.revisar} celda${c.revisar === 1 ? "" : "s"} por revisar` : "todo cuadra"}`);
  encabezado(ws, 4, H, new Set([5, 7, 10, 12]));
  let fila = 5;
  const filasResumen: number[] = [];
  const hojas: { r: SitioResultado; nombre: string }[] = [];
  for (const r of c.sitios) {
    const t = r.totales, row = ws.getRow(fila), a = (col: string) => `${col}${fila}`;
    row.height = 22;
    const hay = r.filas.length > 0;
    row.getCell(1).value = r.sitio.nombre;
    if (hay) {
      row.getCell(2).value = r2(t.ayerInv + t.ayerBaja);
      row.getCell(3).value = r2(t.bajasInv + t.bajasBaja);
      row.getCell(4).value = r2(t.movInv + t.movBaja);
      row.getCell(5).value = { formula: `ROUND(${a("B")}+${a("C")}+${a("D")},2)`, result: r2(t.esperadoInv + t.esperadoBaja) };
      row.getCell(6).value = r2(t.hoyInv + t.hoyBaja);
      row.getCell(7).value = { formula: `ROUND(${a("F")}-${a("E")},2)`, result: r2(t.hoyInv + t.hoyBaja - t.esperadoInv - t.esperadoBaja) };
      row.getCell(8).value = t.hlAyer; row.getCell(9).value = t.hlHoy;
      row.getCell(10).value = t.hlEsperado;
      row.getCell(11).value = `${r.cuadran} de ${r.filas.length}`;
      row.getCell(12).value = r.revisar ? "Revisar" : "Cuadra";
    } else {
      row.getCell(2).value = "Sin registros ese día";
      ws.mergeCells(fila, 2, fila, 12);
    }
    for (let j = 1; j <= H.length; j++) {
      const cell = row.getCell(j);
      cell.border = BORDES; cell.font = { size: 11, bold: j === 1 || j === 12, color: { argb: j >= 2 && j <= 4 || j === 6 || j >= 8 && j <= 9 ? AZUL : hay ? NEGRO : GRIS_T } };
      cell.alignment = { vertical: "middle", horizontal: j === 1 ? "left" : j >= 11 ? "center" : "right" };
      if ([2, 3, 4, 5, 6].includes(j)) cell.numFmt = FMT_EST;
      if (j === 7) cell.numFmt = FMT_DIF;
      if ([8, 9, 10].includes(j)) cell.numFmt = "#,##0.0";
    }
    if (hay) { filasResumen.push(fila); hojas.push({ r, nombre: nombreHoja(r.sitio.nombre, usados) }) }
    fila++;
  }
  if (filasResumen.length) {
    const row = ws.getRow(fila), s = (col: string) => ({ formula: `ROUND(${filasResumen.map((f) => `${col}${f}`).join("+")},2)` });
    row.height = 24; row.getCell(1).value = "TOTAL";
    ["B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach((col, i) => { row.getCell(i + 2).value = s(col) });
    row.getCell(11).value = `${c.cuadran} de ${c.cuadran + c.revisar}`;
    row.getCell(12).value = c.revisar ? "Revisar" : "Cuadra";
    for (let j = 1; j <= H.length; j++) {
      const cell = row.getCell(j);
      cell.fill = relleno(CREMA); cell.border = BORDES; cell.font = { bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: j === 1 ? "left" : j >= 11 ? "center" : "right" };
      if ([2, 3, 4, 5, 6].includes(j)) cell.numFmt = FMT_EST;
      if (j === 7) cell.numFmt = FMT_DIF;
      if ([8, 9, 10].includes(j)) cell.numFmt = "#,##0.0";
    }
    fila++;
  }
  const rg = `L5:L${fila}`;
  ws.addConditionalFormatting({ ref: rg, rules: [
    { type: "expression", formulae: ['L5="Revisar"'], style: { font: { bold: true, color: { argb: ROJO_T } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: ROJO_F } } }, priority: 1 },
    { type: "expression", formulae: ['L5="Cuadra"'], style: { font: { bold: true, color: { argb: VERDE_T } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: VERDE_F } } }, priority: 2 },
  ] });

  fila += 1;
  const notas = [
    "Cómo leerlo",
    "Esperado = lo que había el último día anterior con registros + las bajas registradas ese día + los movimientos y ajustes de ese día (llegan suman, salen restan).",
    "Cuadra = Control tiene exactamente lo esperado (se permite 0,01 est. por el redondeo de cada baja) y el HL coincide con el del maestro. Revisar = algo se sumó de más o no llegó.",
    "«Solo registro» (rotura de máquina, ajuste de inventario, obsoletos…) consta en la lista de bajas pero no mueve Control, por eso no entra en la cuenta.",
    "Cada tabla tiene su hoja con la cuenta material por material. Los números azules son lo leído de Control; los de fondo amarillo en el encabezado son fórmulas.",
  ];
  notas.forEach((txt, i) => {
    ws.mergeCells(fila, 1, fila, H.length);
    const cell = ws.getCell(fila, 1);
    cell.value = txt; cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = i === 0 ? { bold: true, size: 12 } : { size: 11, color: { argb: GRIS_T } };
    if (i) ws.getRow(fila).height = 32;
    fila++;
  });
  if (c.sinTabla.length) {
    ws.mergeCells(fila, 1, fila, H.length);
    const cell = ws.getCell(fila, 1);
    cell.value = `Atención: ${c.sinTabla.length} baja(s) caen en un almacén que no tiene tabla en Control y no entran en la cuenta (ver «Bajas del día»).`;
    cell.font = { bold: true, color: { argb: ROJO_T } };
  }
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ---- UNA HOJA POR TABLA ----
  for (const h of hojas) hojaSitio(wb, h.r, c.fecha, h.nombre);

  // ---- BAJAS DEL DÍA ----
  const wb2 = wb.addWorksheet("Bajas del día", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const HB = ["Tabla de Control", "Material", "Descripción", "Texto", "Va a", "Unidades", "Estibas", "Documento", "Fecha SAP"];
  wb2.columns = [24, 12, 34, 30, 16, 12, 11, 16, 13].map((w) => ({ width: w }));
  banda(wb2, HB.length, `Bajas registradas · Control del ${fechaLarga(c.fecha)}`, `${c.bajas.length} fila${c.bajas.length === 1 ? "" : "s"} tal como están en «Bajas registradas».`);
  encabezado(wb2, 4, HB);
  const nombreSitio = new Map(c.sitios.map((s) => [s.sitio.clave, s.sitio.nombre]));
  c.bajas.forEach((b, i) => {
    const row = wb2.getRow(5 + i);
    const va = b.destino === "baja" ? "Con baja" : b.destino === "registro" ? "Solo registro" : "Inventario";
    const v: ExcelJS.CellValue[] = [nombreSitio.get(b.ubicacion) ?? b.ubicacion, b.sku, b.descripcion ?? "", b.texto ?? "", va,
      Number(b.unidades) || 0, b.destino === "registro" ? 0 : (b.destino === "baja" ? Number(b.signo || 1) : 1) * Number(b.estibas || 0), b.documento ?? "", b.fecha_sap ?? ""];
    v.forEach((x, j) => {
      const cell = row.getCell(j + 1);
      cell.value = x; cell.border = BORDES; cell.font = { size: 11, color: { argb: b.destino === "registro" ? GRIS_T : NEGRO } };
      cell.alignment = { vertical: "middle", horizontal: j === 5 || j === 6 ? "right" : "left" };
      if (j === 1 || j === 7) cell.numFmt = "@";
      if (j === 5) cell.numFmt = "#,##0";
      if (j === 6) cell.numFmt = "#,##0.00;[Red]-#,##0.00;0";
    });
  });
  if (!c.bajas.length) {
    wb2.mergeCells(5, 1, 5, HB.length);
    wb2.getCell(5, 1).value = "Ese día no hay bajas registradas.";
    wb2.getCell(5, 1).font = { italic: true, color: { argb: GRIS_T } };
  } else wb2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + c.bajas.length, column: HB.length } };
  wb2.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return wb;
}
