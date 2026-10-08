/**
 * LA HOJA «TABLERO» DEL LIBRO DE INVENTARIO — la de gerencia.
 *
 * «Lo necesito así, con nuestro logo, algo bien pro, a nivel de gerencia.»
 * El diseño (negro y amarillo, rejilla de 48 columnas, tarjetas, donas,
 * barras de ocupación, focos de atención) viene de la plantilla
 * `tablero-plantilla.ts`; aquí se le escribe QUÉ DICE cada celda.
 *
 * Todas las cifras son FÓRMULAS sobre «Base consolidada» y «Por ubicación»
 * (con su resultado ya calculado, para que se vea bien aunque el programa
 * no recalcule al abrir). Lo único que no sale de la base son los
 * recorridos (los trae la aplicación) y el total de ubicaciones activas.
 *
 * Las dos donas son gráficas de verdad (se meten en el zip al final, porque
 * exceljs no sabe dibujarlas) y leen sus datos de unas celdas de apoyo que
 * quedan a la derecha del área de impresión (columnas AZ:BA).
 */
import type ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";
import { PLANTILLA_TABLERO, type EstiloTablero } from "./tablero-plantilla";
import { FRANJAS } from "./riesgo";

export type FilaTablero = { clase: string; tipo: string; franja: string; tieneVenc: boolean; fisicas: number; cajas: number; plast: number; unid: number; hl: number };
export type UbiTablero = { calle: string | null; capacidad: number | null; estibas: number; envase: number; producto: number; libre: number };
export type RecorridoTablero = { codigo: string; enviado: string; renglones: number; ubicaciones: number; cajas: number };
export type DonaDatos = { hoja: string; cat: string; val: string; nombres: string[]; valores: number[]; colores: string[]; borde: string; fondo: string; hueco: number; ancla: string; lado: number };

export type InsumosTablero = {
  wb: ExcelJS.Workbook;
  logoId: number | null;
  titulo: string;          // ya en mayúsculas
  sub: string;
  bodega: string;
  activas: number;         // ubicaciones activas del almacén
  contadas: number;        // ubicaciones que se caminaron
  filas: FilaTablero[];
  us: UbiTablero[];
  recorridos: RecorridoTablero[];
  graves: number;
  /** Rangos de las hojas de datos, tal como los arma libro.ts. */
  rb: (k: string) => string;       // columna de «Base consolidada»
  ru: (c: number) => string;       // columna (número) de «Por ubicación»
  rv: string;                      // columna «Grave» de «Validar»
  vinculo: (hoja: string, texto: string) => { formula: string; result: string };
  clases: string[];                // Producto, Envase, Libre, Otro envase
  natural: (a: string, b: string) => number;
};

const NUM = "#,##0;\\-#,##0;\\–", HL1 = "#,##0.0;\\-#,##0.0;\\–";
const ROJO = "FFE4002B", AMBAR = "FF8A5A00", VERDE = "FF13804A";

/** Aplica la plantilla (columnas, filas, uniones y estilos de cada celda). */
function aplicarPlantilla(h: ExcelJS.Worksheet, col: (n: number) => string) {
  const P = PLANTILLA_TABLERO;
  const anchos = [2.2, ...Array(48).fill(3.4), 2.2, 3, 16, 11];
  h.columns = anchos.map((width) => ({ width }));
  for (const [f, v] of Object.entries(P.altos)) h.getRow(Number(f)).height = v;
  for (const u of P.uniones) h.mergeCells(u);
  const cache = new Map<number, Partial<ExcelJS.Style>>();
  const estilo = (i: number): Partial<ExcelJS.Style> => {
    let s = cache.get(i); if (s) return s;
    const [fill, [nombre, size, b, it, color], bordes, [hor, ver, aj, sang], nf] = P.estilos[i] as EstiloTablero;
    const lado = (x: [string, string] | null) => (x ? { style: x[0] as ExcelJS.BorderStyle, color: { argb: "FF" + x[1] } } : undefined);
    s = {
      font: { name: nombre, size, bold: !!b, italic: !!it, ...(color && /^[0-9A-F]{6}$/i.test(color) ? { color: { argb: "FF" + color } } : {}) },
      ...(fill ? { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + fill } } as ExcelJS.Fill } : {}),
      border: { left: lado(bordes[0]), right: lado(bordes[1]), top: lado(bordes[2]), bottom: lado(bordes[3]) },
      alignment: { ...(hor && hor !== "general" ? { horizontal: hor as ExcelJS.Alignment["horizontal"] } : {}), ...(ver ? { vertical: (ver === "center" ? "middle" : ver) as ExcelJS.Alignment["vertical"] } : {}), ...(aj ? { wrapText: true } : {}), ...(sang ? { indent: sang } : {}) },
      ...(nf && nf !== "General" ? { numFmt: nf } : {}),
    };
    cache.set(i, s); return s;
  };
  P.filas.forEach((par, r) => {
    let c = 1;
    for (const [id, n] of par) for (let k = 0; k < n; k++, c++) h.getCell(r + 1, c).style = estilo(id);
  });
  void col;
}

export function armarTablero(d: InsumosTablero): DonaDatos[] {
  const { wb, filas, us, rb, ru, vinculo, clases } = d;
  const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
  const h = wb.addWorksheet("Tablero", { properties: { tabColor: { argb: "FFFFC400" } }, views: [{ showGridLines: false, state: "normal", zoomScale: 100 }] });
  aplicarPlantilla(h, col);
  const V = (a: string, v: ExcelJS.CellValue, fmt?: string) => { const c = h.getCell(a); c.value = v; if (fmt) c.numFmt = fmt; return c };
  const fx = (formula: string, result: number | string) => ({ formula, result });
  const suma = (k: keyof FilaTablero, ok: (x: FilaTablero) => boolean = () => true) => filas.filter(ok).reduce((a, x) => a + Number(x[k]), 0);
  const fm = (n: number) => Math.round(n).toLocaleString("en-US");   // TEXT(n,"#,##0")
  const pc0 = (x: number) => Math.round(x * 100) + "%";

  /* ---------- LA BANDA NEGRA: el sello, el título, el día ---------- */
  if (d.logoId != null) h.addImage(d.logoId, { tl: { col: 1, row: 1 } as ExcelJS.Anchor, ext: { width: 46, height: 46 }, editAs: "oneCell" });
  V("F2", "BAVARIA");
  /* Los rótulos que no cambian nunca. */
  const ROTULOS: Record<string, string> = {
    AO2: "UBICACIONES DEL ALMACÉN", I8: "AVANCE DEL CONTEO", R8: "CAJAS", W8: "UNIDADES", AB8: "ESTIBAS FÍSICAS", AG8: "CAJAS PLÁSTICAS", I13: "pendientes", M13: "renglones",
    R10: "total contado", AB10: "completas + saldos", C15: "Composición del inventario", N15: "por cajas", V15: "Estibas de los módulos contados", AK15: "Espacio de los módulos contados", AR15: "en estibas",
    V17: "Con envase", V18: "Libres", V19: "Con producto", V20: "Total", AK17: "Capacidad", AK18: "Sin usar", AU18: "libre", AK19: "Sobre capacidad", AU19: "mód.", AK20: "Por validar", AU20: "rengl.",
    C23: "Del conteo a cajas, plástico y unidades", T23: "por clase", AB23: "Ocupación por calle", AR23: "rojo = más de 120 %", AA24: "CALLE", AD24: "CAPACIDAD", AH24: "OCUPADAS", AL24: "OCUPACIÓN", AU24: "%",
    C36: "Riesgo de vencimiento", K36: "solo producto terminado", S36: "Recorridos en la base", AB36: "último por ubicación", AJ36: "Focos de atención", AR36: "lo primero a revisar",
    R37: "RECORRIDO", X37: "ENVIADO", AA37: "RENGL.", AC37: "UBIC.", AE37: "CAJAS", R41: "Total", AJ37: "1", AJ40: "2", AJ43: "3", AJ46: "4", AL43: "Vencimiento sin fecha", AL46: "Conteo pendiente",
  };
  for (const [a, t] of Object.entries(ROTULOS)) V(a, t);
  V("M2", d.titulo);
  V("M3", d.sub);
  V("AO3", fx("$BA$3", d.activas));
  [["B6", "Tablero"], ["E6", "Base consolidada"], ["K6", "Base envase"], ["P6", "Base producto"], ["U6", "Análisis"], ["Y6", "Por material"], ["AD6", "Por ubicación"], ["AI6", "Validar"], ["AM6", "Sin contar"]]
    .forEach(([a, hoja]) => { if (hoja !== "Tablero") V(a, vinculo(hoja, hoja)); else V(a, hoja); });

  /* ---------- CELDAS DE APOYO (fuera del área de impresión) ---------- */
  const apoyo = (a: string, v: ExcelJS.CellValue, fmt?: string) => { const c = V(a, v, fmt); c.font = { name: "Arial", size: 8, color: { argb: "FF9A9A95" } }; c.fill = { type: "pattern", pattern: "none" }; c.border = {}; c.alignment = { horizontal: "left", vertical: "middle" }; return c };
  const pendientes = Math.max(0, d.activas - d.contadas);
  apoyo("AZ2", "Apoyo de gráficas y focos (no se imprime)");
  apoyo("AZ3", "Ubicaciones activas"); apoyo("BA3", d.activas, "#,##0");
  apoyo("AZ4", "Contadas"); apoyo("BA4", d.contadas, "#,##0");
  apoyo("AZ5", "Pendientes"); apoyo("BA5", fx("MAX(0,$BA$3-$BA$4)", pendientes), "#,##0");

  /* ---------- LAS CIFRAS GRANDES ---------- */
  const totCajas = suma("cajas"), totUnid = suma("unid"), totFis = suma("fisicas"), totPl = suma("plast");
  const avance = d.activas ? d.contadas / d.activas : 0;
  V("I9", fx("IF($BA$3=0,0,$BA$4/$BA$3)", avance));
  V("N9", fx('"/ "&TEXT($BA$3,"#,##0")', "/ " + fm(d.activas)));
  V("I10", fx('TEXT($BA$4,"#,##0")&" ubicaciones contadas"', fm(d.contadas) + " ubicaciones contadas"));
  V("I12", fx("$BA$5", pendientes));
  V("M12", fx(`COUNTA(${rb("cod")})`, filas.length));
  V("R9", fx(`SUM(${rb("cajas")})`, totCajas));
  V("W9", fx(`SUM(${rb("unid")})`, totUnid));
  const pEnv = totUnid ? suma("unid", (x) => x.tipo === "ENVASE") / totUnid : 0;
  V("W10", fx(`TEXT(IF(SUM(${rb("unid")})=0,0,SUMIFS(${rb("unid")},${rb("tipo")},"ENVASE")/SUM(${rb("unid")})),"0%")&" es envase"`, pc0(pEnv) + " es envase"));
  V("AB9", fx(`SUM(${rb("fisicas")})`, totFis));
  V("AG9", fx(`SUM(${rb("plast")})`, totPl));
  V("AG10", "sin barril ni madera");

  /* LA OCUPACIÓN: estibas de los módulos que TIENEN capacidad contra esa
     capacidad (mismo universo arriba y abajo: así el % no se infla con
     módulos sin capacidad cargada). */
  const capT = us.reduce((a, x) => a + (x.capacidad ?? 0), 0);
  const estCap = us.filter((x) => x.capacidad).reduce((a, x) => a + x.estibas, 0);
  const ocup = capT ? estCap / capT : 0;
  const sobre = us.filter((x) => x.capacidad && x.estibas > x.capacidad).length;
  V("AM8", fx('IF($AM$9>1,"⚠ OCUPACIÓN","OCUPACIÓN")', ocup > 1 ? "⚠ OCUPACIÓN" : "OCUPACIÓN"));
  V("AM9", fx(`IF(SUM(${ru(5)})=0,0,SUMIFS(${ru(9)},${ru(5)},">0")/SUM(${ru(5)}))`, ocup));
  V("AM10", fx(`TEXT(SUMIFS(${ru(9)},${ru(5)},">0"),"#,##0")&" estibas / "&TEXT(SUM(${ru(5)}),"#,##0")&" de capacidad"`, `${fm(estCap)} estibas / ${fm(capT)} de capacidad`));
  V("AM12", fx('REPT("█",MIN(22,ROUND($AM$9*17,0)))', "█".repeat(Math.min(22, Math.round(ocup * 17)))));
  V("AM13", fx(`COUNTIF(${ru(11)},">1")&" módulos sobre capacidad"`, `${sobre} módulos sobre capacidad`));

  /* ---------- LA TABLA POR CLASE (fila 24 = encabezado; 25..28 clases; 29 total) ---------- */
  const cl = (c: string, k: keyof FilaTablero) => suma(k, (x) => x.clase === c);
  const colsT: { L: string; k: keyof FilaTablero | "pct" | "reng"; t: string; fmt: string }[] = [
    { L: "E", k: "fisicas", t: "ESTIBAS", fmt: NUM }, { L: "H", k: "cajas", t: "CAJAS", fmt: NUM }, { L: "K", k: "plast", t: "PLÁSTICAS", fmt: NUM },
    { L: "N", k: "unid", t: "UNIDADES", fmt: NUM }, { L: "R", k: "hl", t: "HL", fmt: HL1 }, { L: "U", k: "pct", t: "% CAJAS", fmt: "0.0%" }, { L: "X", k: "reng", t: "RENGL.", fmt: NUM },
  ];
  V("B24", "CLASE"); colsT.forEach((c) => V(`${c.L}24`, c.t));
  const crit: Record<string, string> = { fisicas: "fisicas", cajas: "cajas", plast: "plast", unid: "unid", hl: "hl" };
  clases.forEach((c, i) => {
    const r = 25 + i;
    V(`B${r}`, c);
    for (const t of colsT) {
      if (t.k === "pct") V(`${t.L}${r}`, fx(`IF($H$29=0,0,$H${r}/$H$29)`, totCajas ? cl(c, "cajas") / totCajas : 0), t.fmt);
      else if (t.k === "reng") V(`${t.L}${r}`, fx(`COUNTIFS(${rb("clase")},$B${r})`, filas.filter((x) => x.clase === c).length), t.fmt);
      else V(`${t.L}${r}`, fx(`SUMIFS(${rb(crit[t.k])},${rb("clase")},$B${r})`, cl(c, t.k)), t.fmt);
    }
  });
  const ult = 24 + clases.length;
  V("B29", "Total");
  for (const t of colsT) {
    const r = t.k === "pct" ? (totCajas ? 1 : 0) : t.k === "reng" ? filas.length : suma(t.k as keyof FilaTablero);
    V(`${t.L}29`, fx(`SUM(${t.L}25:${t.L}${ult})`, r), t.fmt);
  }

  /* ---------- COMPOSICIÓN (dona 1 · por cajas), ESTIBAS, ESPACIO ---------- */
  const orden4 = ["Envase", "Producto", "Libre", "Otro envase"];
  orden4.forEach((c, i) => {
    const r = 17 + i, rt = 25 + clases.indexOf(c);
    V(`J${r}`, c);
    V(`M${r}`, fx(`IF($H$29=0,0,H${rt}/$H$29)`, totCajas ? cl(c, "cajas") / totCajas : 0));
    V(`P${r}`, fx(`H${rt}`, cl(c, "cajas")), NUM);
    apoyo(`AZ${8 + i}`, c); apoyo(`BA${8 + i}`, fx(`H${rt}`, cl(c, "cajas")), "#,##0");
  });
  apoyo("AZ7", "Composición por cajas");
  V("AC15", fx('TEXT($AA$20,"#,##0")&" físicas"', fm(suma("fisicas")) + " físicas"));
  const est = { envase: us.reduce((a, x) => a + x.envase, 0), libre: us.reduce((a, x) => a + x.libre, 0), producto: us.reduce((a, x) => a + x.producto, 0) };
  const estT = est.envase + est.libre + est.producto;
  V("AA17", fx(`SUM(${ru(6)})`, est.envase)); V("AA18", fx(`SUM(${ru(8)})`, est.libre)); V("AA19", fx(`SUM(${ru(7)})`, est.producto));
  V("AA20", fx("SUM(AA17:AA19)", estT));
  [[17, est.envase], [18, est.libre], [19, est.producto]].forEach(([r, v]) => V(`AE${r}`, fx(`IF($AA$20=0,0,AA${r}/$AA$20)`, estT ? v / estT : 0)));
  V("AE20", fx("IF($AA$20=0,0,1)", estT ? 1 : 0));
  V("AQ17", fx(`SUM(${ru(5)})`, capT));
  const sinUsar = us.reduce((a, x) => a + (x.capacidad ? Math.max(0, x.capacidad - x.estibas) : 0), 0);
  V("AQ18", fx(`SUM(${ru(10)})`, sinUsar));
  V("AQ19", fx(`COUNTIF(${ru(11)},">1")`, sobre));
  V("AQ20", fx(`COUNTIF(${d.rv},"Sí")`, d.graves));

  /* ---------- OCUPACIÓN POR CALLE (7 renglones, fila 25..31; la 32 = sin capacidad) ---------- */
  type Calle = { nombre: string; cap: number; ocu: number };
  const porCalle = new Map<string, Calle>();
  for (const x of us) { const k = x.calle ?? ""; const c = porCalle.get(k) ?? { nombre: k || "(sin calle)", cap: 0, ocu: 0 }; c.cap += x.capacidad ?? 0; if (x.capacidad) c.ocu += x.estibas; porCalle.set(k, c) }
  const conCap = [...porCalle.entries()].filter(([, c]) => c.cap > 0).sort((a, b) => d.natural(a[0], b[0])).map(([, c]) => c);
  const slots: Calle[] = conCap.length > 7 ? conCap.slice(0, 6) : conCap;
  slots.forEach((c, i) => {
    const r = 25 + i, rr = (ratio: number) => "█".repeat(Math.max(1, Math.round(Math.min(ratio, 4) / 4 * 24)));
    V(`AA${r}`, c.nombre);
    V(`AD${r}`, fx(`SUMIFS(${ru(5)},${ru(2)},$AA${r})`, c.cap), NUM);
    V(`AH${r}`, fx(`SUMIFS(${ru(9)},${ru(2)},$AA${r},${ru(5)},">0")`, c.ocu), NUM);
    V(`AU${r}`, fx(`IF(AD${r}=0,0,AH${r}/AD${r})`, c.cap ? c.ocu / c.cap : 0), "0%");
    V(`AL${r}`, fx(`REPT("█",MAX(1,ROUND(MIN(AU${r},4)/4*24,0)))`, rr(c.cap ? c.ocu / c.cap : 0)));
    apoyo(`AZ${r}`, fx(`IF(AD${r}>0,AU${r}+ROW()/1000000000,-1)`, (c.cap ? c.ocu / c.cap : 0) + r / 1e9));
  });
  const calleSlots = slots.map((c, i) => ({ ...c, r: 25 + i, ratio: c.cap ? c.ocu / c.cap : 0 }));
  if (conCap.length > 7) {
    const resto = conCap.slice(6), cap = resto.reduce((a, c) => a + c.cap, 0), ocu = resto.reduce((a, c) => a + c.ocu, 0);
    V("AA31", `Otras (${resto.length})`);
    V("AD31", fx(`SUM(${ru(5)})-SUM(AD25:AD30)`, cap), NUM);
    V("AH31", fx(`SUMIFS(${ru(9)},${ru(5)},">0")-SUM(AH25:AH30)`, ocu), NUM);
    V("AU31", fx("IF(AD31=0,0,AH31/AD31)", cap ? ocu / cap : 0), "0%");
    V("AL31", fx('REPT("█",MAX(1,ROUND(MIN(AU31,4)/4*24,0)))', "█".repeat(Math.max(1, Math.round(Math.min(cap ? ocu / cap : 0, 4) / 4 * 24)))));
    apoyo("AZ31", fx("IF(AD31>0,AU31+ROW()/1000000000,-1)", (cap ? ocu / cap : 0) + 31 / 1e9));
    calleSlots.push({ nombre: `Otras (${resto.length})`, cap, ocu, r: 31, ratio: cap ? ocu / cap : 0 });
  }
  /* Lo que está en módulos sin capacidad cargada: una fila gris al final. */
  const sinCapMods = us.filter((x) => !x.capacidad);
  const sinCapEst = sinCapMods.reduce((a, x) => a + x.estibas, 0);
  if (sinCapMods.length) {
    V("AA32", "SIN CAPACIDAD");
    V("AH32", fx(`SUM(${ru(9)})-SUMIFS(${ru(9)},${ru(5)},">0")`, sinCapEst), NUM);
    V("AL32", fx(`COUNTBLANK(${ru(5)})+COUNTIF(${ru(5)},0)&" módulos sin capacidad cargada"`, `${sinCapMods.length} módulos sin capacidad cargada`));
  }

  /* ---------- RIESGO DE VENCIMIENTO (solo producto) ---------- */
  const franjas6 = FRANJAS.slice(0, 6);
  const riesgoCajas = franjas6.map((f) => suma("cajas", (x) => x.tipo === "PRODUCTO" && x.franja === f.rot));
  franjas6.forEach((f, i) => {
    V(`D${37 + i}`, f.rot);
    V(`N${37 + i}`, fx(`SUMIFS(${rb("cajas")},${rb("franja")},"${f.rot}",${rb("tipo")},"PRODUCTO")`, riesgoCajas[i]), NUM);
  });
  /* La 7.ª franja —producto SIN fecha— va en la fila 43, con el estilo de la 42:
     sin ella, esas cajas no aparecerían en ningún lado de la tabla. */
  const sf = FRANJAS[6], cajasSinFecha = suma("cajas", (x) => x.tipo === "PRODUCTO" && x.franja === sf.rot);
  for (let c = 2; c <= 16; c++) {
    const o = h.getCell(42, c), n = h.getCell(43, c);
    n.style = { ...o.style, ...(o.fill && "fgColor" in o.fill && o.fill.fgColor?.argb === "FF13804A" ? { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFB5B7B1" } } as ExcelJS.Fill } : {}) };
  }
  h.mergeCells("D43:M43"); h.mergeCells("N43:O43");
  V("D43", sf.rot);
  V("N43", fx(`SUMIFS(${rb("cajas")},${rb("franja")},"${sf.rot}",${rb("tipo")},"PRODUCTO")`, cajasSinFecha), NUM);
  const riesgoT = riesgoCajas.reduce((a, b) => a + b, 0);
  const sinFecha = filas.filter((x) => x.tipo === "PRODUCTO" && !x.tieneVenc).length;
  const nProducto = filas.filter((x) => x.tipo === "PRODUCTO").length;
  apoyo("AZ13", "Producto sin fecha"); apoyo("BA13", fx(`COUNTIFS(${rb("tipo")},"PRODUCTO",${rb("venc")},"")`, sinFecha), "#,##0");
  apoyo("AZ14", "Renglones de producto"); apoyo("BA14", fx(`COUNTIFS(${rb("tipo")},"PRODUCTO")`, nProducto), "#,##0");
  const margenOk = riesgoT ? riesgoCajas[5] / riesgoT : 0;
  const msgRiesgo = riesgoT ? `Con datos: ${pc0(margenOk)} de las cajas de producto tiene más de 30 días de cobertura.`
    : nProducto ? `Sin datos: hay ${nProducto} renglones de producto pero ninguno trae fecha de vencimiento. Revisar antes de enviar.` : "Sin producto terminado en este conteo: el envase no se vence.";
  V("C44", fx(`IF(SUM($N$37:$N$42)>0,"Con datos: "&TEXT($N$42/SUM($N$37:$N$42),"0%")&" de las cajas de producto tiene más de 30 días de cobertura.",IF($BA$14>0,"Sin datos: hay "&$BA$14&" renglones de producto pero ninguno trae fecha de vencimiento. Revisar antes de enviar.","Sin producto terminado en este conteo: el envase no se vence."))`, msgRiesgo));

  /* ---------- RECORRIDOS QUE ENTRAN EN LA BASE (3 renglones) ---------- */
  let rec = d.recorridos;
  if (rec.length > 3) {
    const resto = rec.slice(2);
    rec = [...rec.slice(0, 2), { codigo: `+ ${resto.length} recorridos más`, enviado: "", renglones: resto.reduce((a, x) => a + x.renglones, 0), ubicaciones: resto.reduce((a, x) => a + x.ubicaciones, 0), cajas: resto.reduce((a, x) => a + x.cajas, 0) }];
  }
  rec.forEach((x, i) => {
    const r = 38 + i;
    V(`R${r}`, x.codigo); V(`X${r}`, x.enviado); V(`AA${r}`, x.renglones, NUM); V(`AC${r}`, x.ubicaciones, NUM); V(`AE${r}`, x.cajas, NUM);
  });
  const rT = rec.reduce((a, x) => ({ r: a.r + x.renglones, u: a.u + x.ubicaciones, c: a.c + x.cajas }), { r: 0, u: 0, c: 0 });
  V("AA41", fx("SUM(AA38:AA40)", rT.r), NUM); V("AC41", fx("SUM(AC38:AC40)", rT.u), NUM); V("AE41", fx("SUM(AE38:AE40)", rT.c), NUM);
  /* EL CUADRE: los recorridos traen todo lo que se caminó; la base, lo último
     de cada ubicación. La diferencia es lo que se volvió a contar. */
  const dif = rT.c - totCajas;
  apoyo("AZ15", "Recorridos − consolidado (cajas)"); apoyo("BA15", fx(`$AE$41-SUM(${rb("cajas")})`, dif), "#,##0");
  const msgCuadre = dif === 0 ? `✓ Cuadra con el consolidado · ${fm(rT.c)} = ${fm(totCajas)}`
    : dif > 0 ? `Se volvió a contar: ${fm(dif)} cajas de los recorridos las reemplazó un recorrido más reciente (${fm(rT.c)} − ${fm(totCajas)})`
      : `✗ No cuadra: faltan ${fm(-dif)} cajas (${fm(rT.c)} en los recorridos, ${fm(totCajas)} en el consolidado)`;
  V("R43", fx(`IF($BA$15=0,"✓ Cuadra con el consolidado · "&TEXT($AE$41,"#,##0")&" = "&TEXT(SUM(${rb("cajas")}),"#,##0"),IF($BA$15>0,"Se volvió a contar: "&TEXT($BA$15,"#,##0")&" cajas de los recorridos las reemplazó un recorrido más reciente ("&TEXT($AE$41,"#,##0")&" − "&TEXT(SUM(${rb("cajas")}),"#,##0")&")","✗ No cuadra: faltan "&TEXT(-$BA$15,"#,##0")&" cajas ("&TEXT($AE$41,"#,##0")&" en los recorridos, "&TEXT(SUM(${rb("cajas")}),"#,##0")&" en el consolidado)"))`, msgCuadre));
  h.getCell("R43").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  h.getRow(43).height = 28;

  /* ---------- FOCOS DE ATENCIÓN ---------- */
  const rank = [...calleSlots].sort((a, b) => b.ratio + b.r / 1e9 - (a.ratio + a.r / 1e9));
  [1, 2].forEach((k, i) => {
    const fila = 37 + i * 3, c = rank[k - 1];
    const m = `MATCH(LARGE($AZ$25:$AZ$31,${k}),$AZ$25:$AZ$31,0)`;
    V(`AL${fila}`, fx(`IFERROR("Calle "&INDEX($AA$25:$AA$31,${m}),"—")`, c ? "Calle " + c.nombre : "—"));
    V(`AU${fila}`, fx(`IFERROR(INDEX($AU$25:$AU$31,${m}),"")`, c ? c.ratio : ""), "0%");
    V(`AL${fila + 1}`, fx(`IFERROR(TEXT(INDEX($AH$25:$AH$31,${m}),"#,##0")&" estibas en "&TEXT(INDEX($AD$25:$AD$31,${m}),"#,##0")&" de capacidad","")`, c ? `${fm(c.ocu)} estibas en ${fm(c.cap)} de capacidad` : ""));
  });
  V("AU43", fx('IF($BA$13>0,"!","✓")', sinFecha > 0 ? "!" : "✓"));
  V("AL44", fx('$BA$13&" renglones de producto sin dato"', `${sinFecha} renglones de producto sin dato`));
  V("AU46", fx("$BA$5", pendientes), "#,##0");
  V("AL47", fx('TEXT($BA$5,"#,##0")&" ubicaciones · "&TEXT(IF($BA$3=0,0,$BA$5/$BA$3),"0.0%")&" del almacén"', `${fm(pendientes)} ubicaciones · ${(d.activas ? pendientes / d.activas * 100 : 0).toFixed(1)}% del almacén`));

  /* ---------- EL PIE ---------- */
  V("B50", `BAVARIA · ${d.bodega} · CONTROL`);
  V("AD50", "Solo cuenta lo ya enviado · horas de Colombia");

  /* La tabla por clase: el nombre más largo cabe, y la última columna no pega con el borde. */
  for (let r = 25; r <= 29; r++) { const c = h.getCell(`B${r}`); c.font = { ...c.font, size: 9 } }
  for (let r = 24; r <= 29; r++) { const c = h.getCell(`X${r}`); c.alignment = { ...c.alignment, horizontal: "right", indent: 1 } }
  /* El % de los focos: un punto más chico para que "220%" quepa en su celda. */
  for (const a of ["AU37", "AU40"]) { const c = h.getCell(a); c.font = { ...c.font, size: 12 } }

  /* ---------- SEMÁFOROS (formato condicional) ---------- */
  const f = (argb: string, bold?: boolean) => ({ font: { color: { argb }, ...(bold ? { bold: true } : {}) } });
  h.addConditionalFormatting({ ref: "AL25:AL31", rules: [
    { type: "expression", formulae: ["$AU25>1.2"], priority: 1, style: f(ROJO) },
    { type: "expression", formulae: ["AND($AU25>0.9,$AU25<=1.2)"], priority: 2, style: f("FFFFC400") }] });
  h.addConditionalFormatting({ ref: "AU25:AU31", rules: [{ type: "expression", formulae: ["$AU25>1.2"], priority: 3, style: f(ROJO, true) }] });
  for (const a of ["AU37", "AU40"]) h.addConditionalFormatting({ ref: a, rules: [
    { type: "expression", formulae: [`AND(ISNUMBER(${a}),${a}>1.2)`], priority: 4, style: f(ROJO) },
    { type: "expression", formulae: [`AND(ISNUMBER(${a}),${a}>0.9,${a}<=1.2)`], priority: 5, style: f(AMBAR) },
    { type: "expression", formulae: [`AND(ISNUMBER(${a}),${a}<=0.9)`], priority: 6, style: f(VERDE) }] });
  h.addConditionalFormatting({ ref: "AM8:AW13", rules: [{ type: "expression", formulae: ["$AM$9<=1"], priority: 7,
    style: { font: { color: { argb: VERDE } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEAF5EE" } } } }] });
  h.addConditionalFormatting({ ref: "N37:N43", rules: [{ type: "expression", formulae: ["N37>0"], priority: 8, style: f("FF0D0D0D", true) }] });
  h.addConditionalFormatting({ ref: "C44:O46", rules: [{ type: "expression", formulae: ["SUM($N$37:$N$42)>0"], priority: 9,
    style: { font: { color: { argb: VERDE } }, fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFEAF5EE" } } } }] });
  h.addConditionalFormatting({ ref: "R43", rules: [
    { type: "expression", formulae: ["$BA$15<0"], priority: 10, style: f(ROJO, true) },
    { type: "expression", formulae: ["$BA$15>0"], priority: 11, style: f(AMBAR, true) }] });
  h.addConditionalFormatting({ ref: "AU43", rules: [{ type: "expression", formulae: ["$BA$13=0"], priority: 12, style: f(VERDE) }] });

  h.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, verticalCentered: false,
    margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 }, printArea: "A1:AX52" };

  /* ---------- LAS DONAS (se dibujan al final, en el zip) ---------- */
  return [
    { hoja: "Tablero", cat: "$AZ$4:$AZ$5", val: "$BA$4:$BA$5", nombres: ["Contadas", "Pendientes"], valores: [d.contadas, pendientes], colores: ["FFC400", "2E2E2E"], borde: "0D0D0D", fondo: "0D0D0D", hueco: 50, ancla: "C8", lado: 1187640 },
    { hoja: "Tablero", cat: "$AZ$8:$AZ$11", val: "$BA$8:$BA$11", nombres: orden4, valores: orden4.map((c) => cl(c, "cajas")), colores: ["FFC400", "0D0D0D", "B5B7B1", "E3E4E0"], borde: "FFFFFF", fondo: "FFFFFF", hueco: 55, ancla: "C16", lado: 1223640 },
  ];
}

/* ====================== LAS DONAS EN EL ZIP ====================== */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function chartXml(g: DonaDatos): string {
  const dpt = g.colores.map((c, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${g.borde}"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join("");
  const cat = g.nombres.map((n, i) => `<c:pt idx="${i}"><c:v>${esc(n)}</c:v></c:pt>`).join("");
  const val = g.valores.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/><c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:spPr><a:solidFill><a:srgbClr val="${g.colores[0]}"/></a:solidFill></c:spPr>${dpt}<c:cat><c:strRef><c:f>${g.hoja}!${g.cat}</c:f><c:strCache><c:ptCount val="${g.nombres.length}"/>${cat}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${g.hoja}!${g.val}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${g.valores.length}"/>${val}</c:numCache></c:numRef></c:val></c:ser><c:firstSliceAng val="0"/><c:holeSize val="${g.hueco}"/></c:doughnutChart><c:spPr><a:solidFill><a:srgbClr val="${g.fondo}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="${g.fondo}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>`;
}
const celdaDe = (a: string) => { const m = a.match(/^([A-Z]+)(\d+)$/)!; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return { col: c - 1, row: Number(m[2]) - 1 } };

/** Mete las gráficas en el dibujo de la hoja «Tablero» (la primera). */
export function inyectarDonas(zip: Buffer, donas: DonaDatos[]): Buffer {
  if (!donas.length) return zip;
  try {
    const p = unzipSync(new Uint8Array(zip));
    const txt = (k: string) => new TextDecoder().decode(p[k]);
    const poner = (k: string, s: string) => { p[k] = new TextEncoder().encode(s) };
    const relsHoja = "xl/worksheets/_rels/sheet1.xml.rels";
    let dibujo: string | null = null;
    if (p[relsHoja]) {
      const m = txt(relsHoja).match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/);
      if (m) dibujo = "xl/drawings/" + m[1];
    }
    let ct = txt("[Content_Types].xml");
    if (!dibujo) {
      /* Sin logo no hay dibujo: se crea uno y se cuelga de la hoja. */
      let n = 1; while (p[`xl/drawings/drawing${n}.xml`]) n++;
      dibujo = `xl/drawings/drawing${n}.xml`;
      poner(dibujo, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`);
      ct = ct.replace("</Types>", `<Override PartName="/${dibujo}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
      const rel = `<Relationship Id="rIdTab1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/>`;
      if (p[relsHoja]) poner(relsHoja, txt(relsHoja).replace("</Relationships>", rel + "</Relationships>"));
      else poner(relsHoja, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);
      let hoja = txt("xl/worksheets/sheet1.xml");
      if (!/xmlns:r=/.test(hoja)) hoja = hoja.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
      const tag = '<drawing r:id="rIdTab1"/>';
      hoja = /<(legacyDrawing|tableParts|extLst)\b/.test(hoja) ? hoja.replace(/<(legacyDrawing|tableParts|extLst)\b/, tag + "<$1") : hoja.replace("</worksheet>", tag + "</worksheet>");
      poner("xl/worksheets/sheet1.xml", hoja);
    }
    const relsDib = dibujo.replace("drawings/", "drawings/_rels/") + ".rels";
    let rels = p[relsDib] ? txt(relsDib) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    let xml = txt(dibujo);
    if (!/xmlns:r=/.test(xml)) xml = xml.replace("<xdr:wsDr ", '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    let anclas = "";
    donas.forEach((g, i) => {
      const n = i + 1, parte = `xl/charts/chart${n}.xml`;
      poner(parte, chartXml(g));
      ct = ct.replace("</Types>", `<Override PartName="/${parte}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      rels = rels.replace("</Relationships>", `<Relationship Id="rIdDona${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
      const c = celdaDe(g.ancla);
      anclas += `<xdr:oneCellAnchor><xdr:from><xdr:col>${c.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${g.lado}" cy="${g.lado}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${100 + n}" name="Dona ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDona${n}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`;
    });
    xml = xml.replace("</xdr:wsDr>", anclas + "</xdr:wsDr>");
    poner(dibujo, xml); poner(relsDib, rels); poner("[Content_Types].xml", ct);
    /* exceljs escribe el área de impresión como $A1:$AX52 (sin el $ de la fila): se corrige. */
    poner("xl/workbook.xml", txt("xl/workbook.xml").replace(/(Tablero&apos;|'Tablero')!\$A1:\$AX52/, (_m, n) => `${n}!$A$1:$AX$52`));
    return Buffer.from(zipSync(p));
  } catch {
    return zip;                    // sin donas el libro igual sirve
  }
}
