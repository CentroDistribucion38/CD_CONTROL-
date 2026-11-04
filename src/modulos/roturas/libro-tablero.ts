import type ExcelJS from "exceljs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { SIN_OPM } from "./medidas";

/**
 * LA HOJA «TABLERO» DEL EXCEL DE EN SITIO — los Paretos que se recalculan.
 *
 * «Cuando exporte el tablero en el Excel que esté en HL, en unidades y en cajas, y que estén esos
 * Paretos, que sean dinámicos.»
 *
 * DINÁMICO QUIERE DECIR FÓRMULAS, no una foto: arriba hay cuatro casillas amarillas (medir en,
 * desde, hasta, incluir). Al cambiarlas se recalculan los totales, los cuatro Paretos y sus gráficas
 * —que son gráficas NATIVAS de Excel, no imágenes—. Todo sale de la hoja «Detalle» (una fila por rotura)
 * con fórmulas clásicas (SUMPRODUCT, LARGE, INDEX/MATCH): funcionan en cualquier Excel, no piden
 * Microsoft 365 ni macros.
 *
 * CÓMO FUNCIONA, EN CORTO
 *   Detalle  lleva por fila: Cajas · Unidades · HL, si «cuenta», los cuatro nombres (causa, área,
 *            quién registró, OPM) y dos columnas ocultas: «en el filtro» (1/0) y «valor» (la medida escogida).
 *   _calc    (oculta) por cada Pareto: la lista de nombres, su suma, la clave para ordenar y las 10 barras
 *            ya ordenadas (9 + «Otros») con su % y su acumulado.
 *   Tablero  lo muestra, y las gráficas leen de _calc.
 *
 * LO QUE EXCEL NO SABE HACER SOLO (gráficas de combinación con línea acumulada) se escribe a mano en
 * `inyectarGraficas`, después de que ExcelJS arma el libro.
 */

export type Medida = "HL" | "Unidades" | "Cajas";
export const INCLUIR = ["Solo las que cuentan", "Todas menos anuladas", "Todas"] as const;
export type Incluir = (typeof INCLUIR)[number];
export type Seleccion = { medida: Medida; desde: string; hasta: string; incluir: Incluir };
export type DimT = "causa" | "area" | "registro" | "opm";

/** Una fila del Detalle, tal como la necesitan las fórmulas (y su equivalente en JS para los valores guardados). */
export type FilaTab = {
  diaISO: string; cajas: number; unidades: number | null; hl: number | null;
  cuenta: "Sí" | "No" | "Anulada";
  causa: string; area: string; registro: string; opm: string;
};

/** Columnas nuevas del Detalle (1-based). Las ocultas van al final. */
export const DET = { CAJAS: 27, UNID: 28, HL: 29, CUENTA: 30, CAUSA: 31, AREA: 32, REG: 33, OPM: 34, FILTRO: 35, VALOR: 36 } as const;
export const DET_PRIMERA = 9;

const L = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/* ----- Dónde viven las casillas de Tablero ----- */
const CEL = { MED: "Tablero!$C$10", DESDE: "Tablero!$D$10", HASTA: "Tablero!$E$10", INCL: "Tablero!$H$10" };

/** La fórmula de «en el filtro» y la de «valor» de una fila del Detalle. */
export function formulasFila(fila: number) {
  const dia = `INT($D${fila})`;
  const cu = `$${L(DET.CUENTA)}${fila}`;
  const filtro = `IF(AND(${dia}>=${CEL.DESDE},${dia}<=${CEL.HASTA},OR(${CEL.INCL}="Todas",AND(${CEL.INCL}="Todas menos anuladas",${cu}<>"Anulada"),${cu}="Sí")),1,0)`;
  const valor = `$${L(DET.FILTRO)}${fila}*IF(${CEL.MED}="HL",N($${L(DET.HL)}${fila}),IF(${CEL.MED}="Unidades",N($${L(DET.UNID)}${fila}),N($${L(DET.CAJAS)}${fila})))`;
  return { filtro, valor };
}

/* ----- El mismo cálculo en JS: da los valores guardados con las fórmulas (lo que se ve sin recalcular) y es contra lo que se prueba ----- */
export const enFiltro = (f: FilaTab, s: Seleccion) =>
  f.diaISO >= s.desde && f.diaISO <= s.hasta && (s.incluir === "Todas" || (s.incluir === "Todas menos anuladas" && f.cuenta !== "Anulada") || f.cuenta === "Sí");
export const valorEn = (f: FilaTab, s: Seleccion) =>
  !enFiltro(f, s) ? 0 : s.medida === "HL" ? f.hl ?? 0 : s.medida === "Unidades" ? f.unidades ?? 0 : f.cajas;

export type BarraT = { nombre: string; valor: number; pct: number; acum: number | null };
export type ParetoT = { cats: string[]; valores: number[]; claves: number[]; barras: BarraT[]; total: number };

export function calcPareto(filas: FilaTab[], dim: DimT, s: Seleccion, cats: string[]): ParetoT {
  const valores = cats.map((c) => r3(filas.reduce((t, f) => t + (f[dim] === c ? valorEn(f, s) : 0), 0)));
  const claves = valores.map((v, i) => (v > 0 ? v + (1000 - (i + 2)) / 1e8 : 0));
  const total = valores.reduce((t, v) => t + v, 0);
  const orden = claves.map((k, i) => [k, i] as const).filter(([k]) => k > 0).sort((a, b) => b[0] - a[0]).slice(0, 9);
  const top = orden.map(([, i]) => ({ nombre: cats[i], valor: valores[i] }));
  const otros = r3(Math.max(0, total - top.reduce((t, x) => t + x.valor, 0)));
  const nPos = valores.filter((v) => v > 0).length;
  const lista = [...top];
  while (lista.length < 9) lista.push({ nombre: "", valor: 0 });
  lista.push({ nombre: otros > 0 ? `Otros (${nPos - 9} más)` : "", valor: otros > 0 ? otros : 0 });
  let acc = 0;
  const barras = lista.map((x) => {
    acc += x.valor;
    return { nombre: x.nombre, valor: x.valor, pct: total ? x.valor / total : 0, acum: x.nombre === "" || !total ? null : acc / total };
  });
  return { cats, valores, claves, barras, total };
}

export const TITULOS: Record<DimT, string> = {
  causa: "POR CAUSA · QUÉ PASÓ",
  area: "POR ÁREA · DÓNDE PASÓ",
  registro: "POR QUIÉN REGISTRÓ · USUARIO DE LA PLATAFORMA",
  opm: "POR OPM · QUIÉN LA REPORTÓ EN PISO",
};
const DIMS: DimT[] = ["causa", "area", "registro", "opm"];
const DET_DIM: Record<DimT, number> = { causa: DET.CAUSA, area: DET.AREA, registro: DET.REG, opm: DET.OPM };

export type Estilos = {
  banda: (h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string, logoId: number | null) => void;
  relleno: (argb: string) => ExcelJS.Fill;
  letra: (size: number, color: string, bold?: boolean, italic?: boolean) => Partial<ExcelJS.Font>;
  raya: (argb?: string) => ExcelJS.Border;
  TINTA: string; BANDA: string; BLANCO: string; GRIS: string; FONDO: string; RAYA: string;
};

export type GraficaSpec = {
  titulo: string; hojaCalc: string; c0: number; filaTab: number; hdrCelda: string;
  nombres: string[]; valores: number[]; acums: (number | null)[];
  anclaje: { c0: number; f0: number; c1: number; f1: number };
};

const FMT_NUM = "#,##0";
const FMT_DEC = "#,##0.00";

/**
 * Arma «Tablero» y «_calc». El Detalle (con sus columnas nuevas) lo arma quien llama; aquí solo se
 * conoce cuántas filas tiene (`n`) para escribir los rangos.
 */
export function armarTablero(wb: ExcelJS.Workbook, E: Estilos, d: {
  filas: FilaTab[]; sel: Seleccion; categorias: Record<DimT, string[]>; sub: string;
}): { graficas: GraficaSpec[]; hojas: { tablero: ExcelJS.Worksheet; calc: ExcelJS.Worksheet } } {
  const { relleno, letra, raya, TINTA, BANDA, BLANCO, GRIS, FONDO, RAYA } = E;
  const n = Math.max(1, d.filas.length);
  const ultima = DET_PRIMERA + n - 1;
  const rango = (c: number) => `Detalle!$${L(c)}$${DET_PRIMERA}:$${L(c)}$${ultima}`;
  const sel = d.sel;

  const h = wb.addWorksheet("Tablero", { properties: { tabColor: { argb: BANDA } } });
  const calc = wb.addWorksheet("_calc", { state: "hidden" });

  /* ---------- _calc ---------- */
  const calcs: ParetoT[] = [];
  const graficas: GraficaSpec[] = [];
  DIMS.forEach((dim, p) => {
    const c0 = p * 8 + 1;
    const cats = d.categorias[dim].length ? d.categorias[dim] : ["Sin dato"];
    const K = cats.length, K1 = K + 1;
    const calcP = calcPareto(d.filas, dim, sel, cats);
    calcs.push(calcP);
    const a = (k: number, f: number) => `${L(c0 + k)}${f}`;
    const rN = `$${L(c0)}$2:$${L(c0)}$${K1}`, rV = `$${L(c0 + 1)}$2:$${L(c0 + 1)}$${K1}`, rK = `$${L(c0 + 2)}$2:$${L(c0 + 2)}$${K1}`;
    ["Nombre", "Valor", "Clave", "80 %", "Barra", "Valor barra", "%", "Acum."].forEach((t, i) => { calc.getCell(1, c0 + i).value = `${dim}·${t}` });
    cats.forEach((c, i) => {
      const f = i + 2;
      calc.getCell(f, c0).value = c;
      calc.getCell(f, c0 + 1).value = { formula: `ROUND(SUMPRODUCT(--(${rango(DET_DIM[dim])}=${a(0, f)}),${rango(DET.VALOR)}),3)`, result: calcP.valores[i] };
      calc.getCell(f, c0 + 2).value = { formula: `IF(${a(1, f)}>0,${a(1, f)}+(1000-ROW())/100000000,0)`, result: calcP.claves[i] };
    });
    const tot = `$${L(c0 + 5)}$13`;
    const top9 = `${L(c0 + 5)}2:${L(c0 + 5)}10`;
    for (let k = 1; k <= 10; k++) {
      const f = k + 1, b = calcP.barras[k - 1];
      calc.getCell(f, c0 + 3).value = 0.8;
      if (k <= 9) {
        const lg = `LARGE(${rK},${k})`;
        calc.getCell(f, c0 + 4).value = { formula: `IF(IFERROR(${lg},0)>0,INDEX(${rN},MATCH(${lg},${rK},0)),"")`, result: b.nombre };
        calc.getCell(f, c0 + 5).value = { formula: `IF(${a(4, f)}="",0,INDEX(${rV},MATCH(${lg},${rK},0)))`, result: b.valor };
      } else {
        const otros = `ROUND(MAX(0,${tot}-SUM(${top9})),3)`;
        calc.getCell(f, c0 + 4).value = { formula: `IF(${otros}>0,"Otros ("&(COUNTIF(${rV},">0")-9)&" más)","")`, result: b.nombre };
        calc.getCell(f, c0 + 5).value = { formula: `IF(${a(4, f)}="",0,${otros})`, result: b.valor };
      }
      calc.getCell(f, c0 + 6).value = { formula: `IF(${tot}=0,0,${a(5, f)}/${tot})`, result: b.pct };
      calc.getCell(f, c0 + 7).value = {
        formula: `IF(OR(${a(4, f)}="",${tot}=0),NA(),SUM(${L(c0 + 5)}$2:${a(5, f)})/${tot})`,
        result: b.acum == null ? { error: "#N/A" } : b.acum,
      };
    }
    calc.getCell(13, c0 + 4).value = "Total";
    calc.getCell(13, c0 + 5).value = { formula: `SUM(${rV})`, result: calcP.total };
  });

  /* ---------- Tablero ---------- */
  h.columns = [2, 5, 38, 14, 11, 11, 3, ...Array(10).fill(11), 2].map((w) => ({ width: w }));
  const ANCHO = 18;
  E.banda(h, ANCHO, "Tablero · Paretos", d.sub, null);

  h.getCell("C8").value = "Cambia lo amarillo y todo se recalcula —totales, Paretos y gráficas—. Las gráficas son de Excel, no fotos.";
  h.getCell("C8").font = letra(9.5, GRIS, false, true);
  const etiq = (celda: string, t: string) => { const c = h.getCell(celda); c.value = t; c.font = letra(8.5, GRIS, true) };
  etiq("C9", "MEDIR EN"); etiq("D9", "DESDE"); etiq("E9", "HASTA"); etiq("H9", "INCLUIR");
  const entrada = (celda: string) => {
    const c = h.getCell(celda);
    c.fill = relleno("FFFFF1C2"); c.font = letra(11, TINTA, true);
    c.border = { top: raya(TINTA), bottom: raya(TINTA), left: raya(TINTA), right: raya(TINTA) };
    c.alignment = { vertical: "middle", horizontal: "center" };
  };
  h.getRow(10).height = 24;
  h.getCell("C10").value = sel.medida; entrada("C10");
  h.getCell("C10").dataValidation = { type: "list", allowBlank: false, formulae: ['"HL,Unidades,Cajas"'], showErrorMessage: true, errorTitle: "Medir en", error: "Escoge HL, Unidades o Cajas." };
  const aF = (iso: string) => new Date(`${iso}T00:00:00Z`);
  h.getCell("D10").value = aF(sel.desde); h.getCell("E10").value = aF(sel.hasta);
  for (const c of ["D10", "E10"]) {
    entrada(c); h.getCell(c).numFmt = "dd/mm/yyyy";
    h.getCell(c).dataValidation = { type: "date", operator: "greaterThan", allowBlank: false, formulae: [aF("2020-01-01")], showErrorMessage: true, errorTitle: "Fecha", error: "Escribe una fecha (dd/mm/aaaa)." };
  }
  h.mergeCells("H10:K10");
  h.getCell("H10").value = sel.incluir; entrada("H10");
  for (const c of ["I10", "J10", "K10"]) entrada(c);
  h.getCell("H10").dataValidation = { type: "list", allowBlank: false, formulae: ['"Solo las que cuentan,Todas menos anuladas,Todas"'], showErrorMessage: true, errorTitle: "Incluir", error: "Escoge una de las tres." };

  /* Los totales del filtro, siempre en las TRES medidas. */
  const fil = rango(DET.FILTRO);
  const enF = filas(d.filas, sel);
  const kpi = (celda: string, tit: string, f: string, res: number, fmt: string) => {
    const t = h.getCell(celda.replace(/\d+/, "12")); t.value = tit; t.font = letra(8.5, GRIS, true);
    const v = h.getCell(celda); v.value = { formula: f, result: res }; v.font = letra(16, TINTA, true); v.numFmt = fmt;
    v.alignment = { horizontal: "left", vertical: "middle" };
  };
  h.getRow(13).height = 26;
  kpi("C13", "ROTURAS EN EL FILTRO", `SUM(${fil})`, enF.length, FMT_NUM);
  kpi("D13", "CAJAS", `SUMPRODUCT(${fil},${rango(DET.CAJAS)})`, enF.reduce((t, f) => t + f.cajas, 0), FMT_NUM);
  kpi("E13", "UNIDADES", `SUMPRODUCT(${fil},${rango(DET.UNID)})`, enF.reduce((t, f) => t + (f.unidades ?? 0), 0), FMT_NUM);
  kpi("F13", "HL", `SUMPRODUCT(${fil},${rango(DET.HL)})`, r3(enF.reduce((t, f) => t + (f.hl ?? 0), 0)), FMT_DEC);
  h.getCell("D13").alignment = h.getCell("E13").alignment = h.getCell("F13").alignment = { horizontal: "right", vertical: "middle" };
  for (const c of ["D12", "E12", "F12"]) h.getCell(c).alignment = { horizontal: "right" };

  /* LA FRASE DE QUIÉN REPORTA, con números. */
  const reg = calcs[2];
  const conOpm = enF.filter((f) => f.opm !== SIN_OPM && f.opm !== "Sin dato").length;
  const pctOpm = enF.length ? conOpm / enF.length : 0;
  const cReg = 2 * 8 + 1;
  h.mergeCells("C14:Q14");
  const fr = h.getCell("C14");
  const top = reg.barras[0];
  const textoQuien = (nom: string, pctReg: number, po: number) => `Quién más registra: ${nom} (${Math.round(pctReg * 100)}% de lo medido) · roturas que reportó un OPM con su PIN: ${Math.round(po * 100)}%`;
  const totReg = `_calc!$${L(cReg + 5)}$13`;
  const noOpm = (c: string) => `--(${rango(DET.OPM)}<>"${c}")`;
  fr.value = {
    formula: `IF(${totReg}=0,"Sin roturas en este filtro.","Quién más registra: "&_calc!$${L(cReg + 4)}$2&" ("&TEXT(_calc!$${L(cReg + 6)}$2,"0%")&" de lo medido) · roturas que reportó un OPM con su PIN: "&TEXT(IFERROR(SUMPRODUCT(${fil},${noOpm(SIN_OPM)},${noOpm("Sin dato")})/SUM(${fil}),0),"0%"))`,
    result: reg.total === 0 ? "Sin roturas en este filtro." : textoQuien(top.nombre, top.pct, pctOpm),
  };
  fr.font = letra(10.5, TINTA, true); fr.fill = relleno("FFFFF8E1");
  fr.alignment = { vertical: "middle", indent: 1 };
  h.getRow(14).height = 22;
  
  /* Los cuatro Paretos: tabla a la izquierda, gráfica a la derecha. */
  DIMS.forEach((dim, p) => {
    const c0 = p * 8 + 1, r0 = 16 + p * 19;
    const cp = calcs[p];
    const cr = (k: number, f: number) => `_calc!$${L(c0 + k)}$${f}`;
    /* título */
    h.mergeCells(r0, 2, r0, 6);
    const t = h.getCell(r0, 2); t.value = `${p + 1} · ${TITULOS[dim]}`; t.font = letra(10, TINTA, true);
    for (let c = 2; c <= 6; c++) h.getCell(r0, c).border = { bottom: { style: "medium", color: { argb: TINTA } } };
    h.getRow(r0).height = 22; t.alignment = { vertical: "middle" };
    /* la respuesta, en palabras */
    h.mergeCells(r0 + 1, 2, r0 + 1, 6);
    const nBar = cp.barras.filter((b) => b.acum != null).length;
    const hasta = Math.min(nBar, cp.barras.filter((b) => b.acum != null && (b.acum as number) < 0.8).length + 1);
    const medTxt = sel.medida.toLowerCase();
    const resp = h.getCell(r0 + 1, 2);
    const acR = `${cr(7, 2)}:$${L(c0 + 7)}$11`;
    const totP = cr(5, 13);
    resp.value = {
      formula: `IF(COUNT(${acR})=0,"Sin datos en este filtro.",MIN(COUNT(${acR}),COUNTIF(${acR},"<0.8")+1)&" de "&COUNT(${acR})&" explican el 80 % de "&FIXED(${totP},IF(${CEL.MED}="HL",1,0))&" "&LOWER(${CEL.MED})&".")`,
      result: nBar === 0 ? "Sin datos en este filtro." : `${hasta} de ${nBar} explican el 80 % de ${cp.total.toLocaleString("en-US", { minimumFractionDigits: sel.medida === "HL" ? 1 : 0, maximumFractionDigits: sel.medida === "HL" ? 1 : 0 })} ${medTxt}.`,
    };
    resp.font = letra(9.5, GRIS); resp.alignment = { vertical: "middle", wrapText: true };
    /* encabezados */
    const hd = r0 + 2;
    ["#", "QUÉ", "", "%", "ACUM."].forEach((tx, i) => {
      const c = h.getCell(hd, 2 + i); c.value = tx; c.font = letra(8.5, BLANCO, true); c.fill = relleno(TINTA);
      c.alignment = { vertical: "middle", horizontal: i >= 2 ? "right" : "left", indent: 1 };
    });
    h.getCell(hd, 4).value = { formula: `UPPER(${CEL.MED})`, result: sel.medida.toUpperCase() };
    h.getRow(hd).height = 20;
    /* las 10 barras */
    for (let k = 1; k <= 10; k++) {
      const f = hd + k, b = cp.barras[k - 1], cf = k + 1;
      const nom = cr(4, cf);
      const set = (c: number, val: ExcelJS.CellFormulaValue) => { h.getCell(f, c).value = val };
      set(2, { formula: `IF(${nom}="","",${k})`, result: b.nombre ? k : "" });
      set(3, { formula: `${nom}&""`, result: b.nombre });
      set(4, { formula: `IF(${nom}="","",FIXED(${cr(5, cf)},IF(${CEL.MED}="HL",2,0)))`, result: b.nombre ? fijo(b.valor, sel.medida) : "" });
      set(5, { formula: `IF(${nom}="","",${cr(6, cf)})`, result: b.nombre ? b.pct : "" });
      set(6, { formula: `IF(OR(${nom}="",${cr(5, 13)}=0),"",${cr(7, cf)})`, result: b.nombre && b.acum != null ? b.acum : "" });
      h.getRow(f).height = 18;
      for (let c = 2; c <= 6; c++) {
        const cel = h.getCell(f, c);
        cel.font = letra(10, TINTA, c === 3 && k === 1); cel.border = { bottom: raya(RAYA) };
        cel.alignment = { vertical: "middle", horizontal: c >= 4 ? "right" : "left", indent: 1 };
        if (k % 2 === 0) cel.fill = relleno(FONDO);
      }
      h.getCell(f, 5).numFmt = "0%"; h.getCell(f, 6).numFmt = "0%";
    }
    /* total */
    const ft = hd + 11;
    h.getCell(ft, 3).value = "TOTAL";
    h.getCell(ft, 4).value = { formula: `FIXED(${cr(5, 13)},IF(${CEL.MED}="HL",2,0))`, result: fijo(cp.total, sel.medida) };
    for (let c = 2; c <= 6; c++) { const cel = h.getCell(ft, c); cel.fill = relleno(BANDA); cel.font = letra(10, TINTA, true); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.alignment = { vertical: "middle", horizontal: c >= 4 ? "right" : "left", indent: 1 } }
    h.getRow(ft).height = 20;
    graficas.push({
      titulo: TITULOS[dim], hojaCalc: "_calc", c0, filaTab: hd, hdrCelda: `Tablero!$D$${hd}`,
      nombres: cp.barras.map((b) => b.nombre), valores: cp.barras.map((b) => b.valor), acums: cp.barras.map((b) => b.acum),
      anclaje: { c0: 7, f0: r0, c1: 17, f1: r0 + 16 },
    });
  });

  h.views = [{ showGridLines: false, state: "frozen", ySplit: 10 }];
  h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return { graficas, hojas: { tablero: h, calc } };
}

function filas(fs: FilaTab[], s: Seleccion) { return fs.filter((f) => enFiltro(f, s)) }
const fijo = (v: number, m: Medida) => v.toLocaleString("en-US", { minimumFractionDigits: m === "HL" ? 2 : 0, maximumFractionDigits: m === "HL" ? 2 : 0 });

/* =====================================================================
   LAS GRÁFICAS: se escriben a mano en el .xlsx ya armado (ExcelJS no sabe de gráficas).
   Una combinación: columnas (la medida) + línea del acumulado y línea del 80 % en el eje derecho.
   ===================================================================== */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function cadena(f: string, v: string[]) {
  return `<c:strRef><c:f>${esc(f)}</c:f><c:strCache><c:ptCount val="${v.length}"/>${v.map((x, i) => `<c:pt idx="${i}"><c:v>${esc(x)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef>`;
}
function numeros(f: string, v: (number | null)[], fmt: string) {
  return `<c:numRef><c:f>${esc(f)}</c:f><c:numCache><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${v.length}"/>${v.map((x, i) => (x == null ? "" : `<c:pt idx="${i}"><c:v>${x}</c:v></c:pt>`)).join("")}</c:numCache></c:numRef>`;
}
const texto = (sz: number, bold = false, color = "444444") =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr>`;

export function xmlGrafica(g: GraficaSpec, medida: Medida) {
  const cal = `'${g.hojaCalc}'`;
  const col = (k: number) => L(g.c0 + k);
  const rng = (k: number) => `${cal}!$${col(k)}$2:$${col(k)}$11`;
  const cat = `<c:cat>${cadena(rng(4), g.nombres)}</c:cat>`;
  const fmtVal = "General"; void medida;
  const ejes = { cat: 50010, val: 50020, cat2: 50030, val2: 50040 };
  const linea = (idx: number, nombreTx: string, rango: string, vals: (number | null)[], color: string, dash: boolean, marcador: boolean) => `
      <c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${esc(nombreTx)}</c:v></c:tx>
        <c:spPr><a:ln w="${dash ? 19050 : 28575}" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ""}<a:round/></a:ln></c:spPr>
        ${marcador
          ? `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>`
          : `<c:marker><c:symbol val="none"/></c:marker>`}
        ${cat}<c:val>${numeros(rango, vals, "0%")}</c:val><c:smooth val="0"/></c:ser>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="es-CO" sz="1100" b="1"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:rPr><a:t>${esc(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea><c:layout/>
      <c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
        <c:ser><c:idx val="0"/><c:order val="0"/><c:tx>${cadena(g.hdrCelda, [medida.toUpperCase()])}</c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="FFC20E"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:ln></c:spPr>
          <c:invertIfNegative val="0"/>
          <c:dPt><c:idx val="9"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="B9B9B9"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:ln></c:spPr></c:dPt>
          <c:dLbls><c:numFmt formatCode="General;;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texto(900, true, "111111")}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>
          ${cat}<c:val>${numeros(rng(5), g.valores, fmtVal)}</c:val></c:ser>
        <c:gapWidth val="45"/><c:axId val="${ejes.cat}"/><c:axId val="${ejes.val}"/>
      </c:barChart>
      <c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>
        ${linea(1, "Acumulado", rng(7), g.acums, "111111", false, true)}
        ${linea(2, "80 %", rng(3), g.acums.map(() => 0.8), "C0392B", true, false)}
        <c:marker val="1"/><c:axId val="${ejes.cat2}"/><c:axId val="${ejes.val2}"/>
      </c:lineChart>
      <c:catAx><c:axId val="${ejes.cat}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
        <c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="777777"/></a:solidFill></a:ln></c:spPr>
        <c:txPr><a:bodyPr rot="-2400000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"><a:solidFill><a:srgbClr val="333333"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr>
        <c:crossAx val="${ejes.val}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
      <c:valAx><c:axId val="${ejes.val}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E3E0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="${fmtVal}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${texto(800)}
        <c:crossAx val="${ejes.cat}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>
      <c:valAx><c:axId val="${ejes.val2}"/><c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="r"/>
        <c:numFmt formatCode="0%" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${texto(800)}
        <c:crossAx val="${ejes.cat2}"/><c:crosses val="max"/><c:crossBetween val="between"/><c:majorUnit val="0.2"/></c:valAx>
      <c:catAx><c:axId val="${ejes.cat2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${ejes.val2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
      <c:spPr><a:noFill/></c:spPr>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/>${texto(900)}</c:legend>
    <c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E3E3E0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`;
}

/**
 * Mete las gráficas en la hoja «Tablero» del .xlsx que ya armó ExcelJS: un dibujo nuevo (con sus relaciones y
 * tipos de contenido) y la etiqueta <drawing> en la hoja. Si algo no cuadra devuelve el libro tal cual
 * —sin gráficas pero con todas las tablas y fórmulas— antes que un archivo que Excel tenga que «reparar».
 */
export function inyectarGraficas(buf: ArrayBuffer, graficas: GraficaSpec[], medida: Medida): ArrayBuffer {
  try {
    const z = unzipSync(new Uint8Array(buf));
    const leer = (p: string) => (z[p] ? strFromU8(z[p]) : null);
    const wbXml = leer("xl/workbook.xml"), wbRels = leer("xl/_rels/workbook.xml.rels"), ct = leer("[Content_Types].xml");
    if (!wbXml || !wbRels || !ct) return buf;
    const rid = new RegExp(`<sheet\\b[^>]*\\bname="Tablero"[^>]*\\br:id="([^"]+)"`).exec(wbXml)?.[1]
      ?? new RegExp(`<sheet\\b[^>]*\\br:id="([^"]+)"[^>]*\\bname="Tablero"`).exec(wbXml)?.[1];
    if (!rid) return buf;
    const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(wbRels)?.[0];
    const destino = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (!destino) return buf;
    const rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\//, "")}`;
    const hoja = leer(rutaHoja);
    if (!hoja || /<drawing\b/.test(hoja)) return buf;       // si ya trae un dibujo no se mezcla: no se toca

    const nombreHoja = rutaHoja.split("/").pop()!;
    const rutaRels = `xl/worksheets/_rels/${nombreHoja}.rels`;
    const RID = "rIdTableroGraficas";
    const relsHoja = leer(rutaRels);
    const nuevaRel = `<Relationship Id="${RID}" Type="${NS_R}/drawing" Target="../drawings/drawingTablero.xml"/>`;
    z[rutaRels] = strToU8(relsHoja
      ? relsHoja.replace("</Relationships>", `${nuevaRel}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nuevaRel}</Relationships>`);

    /* la etiqueta <drawing> va antes de legacyDrawing / tableParts / extLst, o al final */
    const marca = `<drawing r:id="${RID}"/>`;
    let h2 = hoja;
    const tras = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(h2);
    h2 = tras ? h2.slice(0, tras.index) + marca + h2.slice(tras.index) : h2.replace("</worksheet>", `${marca}</worksheet>`);
    if (!/xmlns:r=/.test(h2)) h2 = h2.replace("<worksheet ", `<worksheet xmlns:r="${NS_R}" `);
    z[rutaHoja] = strToU8(h2);

    /* dibujo + gráficas */
    const anc = graficas.map((g, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.anclaje.c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.anclaje.f0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.anclaje.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.anclaje.f1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Pareto ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join("");
    z["xl/drawings/drawingTablero.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${anc}</xdr:wsDr>`);
    z["xl/drawings/_rels/drawingTablero.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${graficas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/chart" Target="../charts/chartTablero${i + 1}.xml"/>`).join("")}</Relationships>`);
    graficas.forEach((g, i) => { z[`xl/charts/chartTablero${i + 1}.xml`] = strToU8(xmlGrafica(g, medida)) });

    const add = `<Override PartName="/xl/drawings/drawingTablero.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
      + graficas.map((_, i) => `<Override PartName="/xl/charts/chartTablero${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("");
    z["[Content_Types].xml"] = strToU8(ct.replace("</Types>", `${add}</Types>`));
    const salida = zipSync(z, { level: 6 });
    return salida.buffer.slice(salida.byteOffset, salida.byteOffset + salida.byteLength) as ArrayBuffer;
  } catch { return buf }
}
