/**
 * EL EXCEL DE PET — con la cara de los libros de CONTROL (banda negra, ojo amarillo, sello de la B, encabezado negro,
 * total en amarillo), para mandarlo o imprimirlo tal cual.
 *
 *   1. «PET por formato»: cada Vh del periodo con los SKU y la descripción de lo que trasladó, cuánto de cada formato
 *      (200, 330, 1.000, 1.500 ml) y su total, agrupado por día con el subtotal (los días se pliegan con − / +).
 *   2. «Por SKU»: qué SKU se movieron, de qué formato, en cuántos Vhs y cuánto, de mayor a menor (con filtros).
 *   3. «Promedios»: Vhs al día y por turno de cada formato (promedio y lo que da para programar, como en Programar),
 *      los Vhs y la cantidad de cada día base, con el promedio en fórmula.
 * Las sumas son fórmulas (SUBTOTAL / AVERAGE), así lo que se filtre o se pliegue sigue cuadrando.
 */
import ExcelJS from "exceljs";
import {
  BANDA, BLANCO, FONDO, GRIS, GRIS_CLARO, GRUPO, TINTA, VERDE,
  banda, cargarLogo, cifra, cuando, fechaLarga, letra, ordenarSheetPr, raya, relleno,
} from "@/modulos/inventario/envase/libro-plan";
import {
  cantidad, colorFormato, formatosDe, masDias, nombreFormato, programar, TURNOS_PET, DIAS,
  type FilaPet, type Unidad,
} from "./pet";

export type InsumosLibroPet = {
  filas: FilaPet[]; unidad: Unidad; desde: string; hasta: string; hoy: string;
  /** Lo que se filtró en pantalla («Origen FABRICA · Placa NLW428»), o vacío. */
  filtro: string;
};

const NOM_U: Record<Unidad, string> = { estibas: "estibas", pacas: "pacas", hl: "HL" };
const OJO = "TRASPASOS · PET";
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
/** El color del formato aclarado (para el fondo de su celda). */
const tinte = (hex: string, t = 0.16) => {
  const h = hex.replace("#", ""), c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `FF${c.map((x) => Math.round(255 + (x - 255) * t).toString(16).padStart(2, "0").toUpperCase()).join("")}`;
};
const diaCorto = (f: string) => {
  const d = new Date(f + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${d.toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "")}`;
};
const fecha = (f: string) => new Date(f + "T12:00:00Z");
const ORDEN_T: Record<string, number> = { C: 0, A: 1, B: 2 };

/** El encabezado negro de una tabla (con la raya de color del formato debajo de cada columna de formato). */
function cabeza(h: ExcelJS.Worksheet, fila: number, titulos: string[], izq: number, colores: (string | null)[] = []) {
  const r = h.getRow(fila); r.height = 26;
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t; c.font = letra(10, BLANCO, true); c.fill = relleno(TINTA);
    c.alignment = { vertical: "middle", horizontal: i < izq ? "left" : "center", indent: i < izq ? 1 : 0, wrapText: true };
    if (colores[i]) c.border = { bottom: { style: "thick", color: { argb: argb(colores[i]!) } } };
  });
}

/** El renglón amarillo del total. */
function total(h: ExcelJS.Worksheet, fila: number, ancho: number, rotulo: string, unir: number) {
  const T = h.getRow(fila); T.height = 24;
  for (let c = 1; c <= ancho; c++) {
    const x = T.getCell(c); x.fill = relleno(BANDA); x.font = letra(11, TINTA, true);
    x.border = { top: { style: "medium", color: { argb: TINTA } } }; x.alignment = { vertical: "middle", horizontal: "right" };
  }
  T.getCell(1).value = rotulo; T.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  if (unir > 1) h.mergeCells(fila, 1, fila, unir);
  return T;
}

/** Un título de bloque (texto negro grande con la raya amarilla) dentro de la hoja. */
function tituloBloque(h: ExcelJS.Worksheet, fila: number, ancho: number, texto: string, nota: string) {
  h.mergeCells(fila, 1, fila, ancho); h.mergeCells(fila + 1, 1, fila + 1, ancho);
  const a = h.getCell(fila, 1); a.value = texto.toUpperCase(); a.font = letra(11, TINTA, true); a.alignment = { indent: 1, vertical: "bottom" };
  const b = h.getCell(fila + 1, 1); b.value = nota; b.font = letra(9, GRIS); b.alignment = { indent: 1, vertical: "top", wrapText: true };
  h.getRow(fila).height = 20; h.getRow(fila + 1).height = 28;
  for (let c = 1; c <= ancho; c++) h.getCell(fila + 1, c).border = { bottom: { style: "medium", color: { argb: BANDA } } };
}

const impresion = (h: ExcelJS.Worksheet, filaTitulos: string, pie: string) => {
  h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: filaTitulos, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  h.headerFooter = { oddFooter: `&L&8CONTROL · ${pie}&R&8Página &P de &N` };
};

export async function armarLibroPet(d: InsumosLibroPet): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Traspasos · PET"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logo = await cargarLogo(wb);
  const u = d.unidad, nu = NOM_U[u];
  const N = u === "hl" ? '#,##0.00;-#,##0.00;"—"' : '#,##0.#;-#,##0.#;"—"';
  const N1 = '#,##0.0;-#,##0.0;"—"', N0 = '#,##0;-#,##0;"—"';
  const periodo = `${fechaLarga(d.desde)} – ${fechaLarga(d.hasta)}`;
  const deFiltro = d.filtro ? ` · ${d.filtro}` : "";

  const todos = formatosDe(d.filas);
  const fmts = todos.filter((fm, i) => i < 4 || d.filas.some((f) => f.formato_ml === fm));
  const filas = [...d.filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || (ORDEN_T[a.turno] ?? 9) - (ORDEN_T[b.turno] ?? 9)
    || (a.hora ?? "").localeCompare(b.hora ?? "") || a.viaje.localeCompare(b.viaje) || (a.sku ?? "").localeCompare(b.sku ?? ""));
  const vhs = [...new Set(filas.map((f) => f.viaje))];
  const tot = filas.reduce((a, f) => a + cantidad(f, u), 0);
  const porFmt = fmts.map((fm) => ({ fm, q: filas.filter((f) => f.formato_ml === fm).reduce((a, f) => a + cantidad(f, u), 0), vhs: new Set(filas.filter((f) => f.formato_ml === fm).map((f) => f.viaje)).size }));
  const mayor = [...porFmt].sort((a, b) => b.q - a.q)[0];

  /* SKU: lo que se trasladó */
  const skus = new Map<string, { sku: string; desc: string; fm: number | null; q: number; vhs: Set<string>; placas: Set<string> }>();
  for (const f of filas) {
    const k = f.sku || "—";
    const x = skus.get(k) ?? { sku: f.sku || "Sin SKU", desc: f.descripcion || "", fm: f.formato_ml, q: 0, vhs: new Set(), placas: new Set() };
    x.q += cantidad(f, u); x.vhs.add(f.viaje); if (f.placa) x.placas.add(f.placa); skus.set(k, x);
  }
  const listaSku = [...skus.values()].sort((a, b) => b.q - a.q);
  const fmtTxt = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: u === "hl" ? 2 : 1 });

  /* ============================== 1 · PET POR FORMATO ============================== */
  {
    const h = wb.addWorksheet("PET por formato", { properties: { tabColor: { argb: BANDA }, outlineProperties: { summaryBelow: false, summaryRight: true } } });
    const cF = 9, cT = cF + fmts.length, ancho = cT;
    h.columns = [{ width: 11 }, { width: 7 }, { width: 7.5 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 11 }, { width: 42 }, ...fmts.map(() => ({ width: 11.5 })), { width: 12.5 }];
    banda(h, ancho, `PET por formato · ${periodo}`, `Cada Vh de PET con los SKU que trasladó · en ${nu}${deFiltro} · exportado el ${cuando()}`, logo, `${OJO} · VHS POR FORMATO`);

    h.getRow(6).height = 8;
    const placas = [...new Set(filas.map((f) => f.placa).filter(Boolean))] as string[];
    const sk = listaSku[0];
    cifra(h, 7, 1, 3, "Vhs de PET", String(vhs.length), `${fmtTxt(tot)} ${nu} en el periodo`);
    cifra(h, 7, 4, 6, "Formato que más pesa", mayor ? nombreFormato(mayor.fm) : "—", mayor && tot ? `${Math.round((mayor.q / tot) * 100)} % del PET · en ${mayor.vhs} Vhs` : "", mayor ? argb(colorFormato(mayor.fm)) : BANDA);
    cifra(h, 7, 7, 8, "SKU más trasladado", sk ? sk.sku : "—", sk ? `${sk.desc.slice(0, 44)} · ${fmtTxt(sk.q)} ${nu} en ${sk.vhs.size} Vhs` : "", VERDE);
    cifra(h, 7, 9, ancho, "Placas", String(placas.length), placas.slice(0, 4).join(" · ") + (placas.length > 4 ? " …" : ""));
    for (let f = 7; f <= 9; f++) h.getRow(f).height = f === 8 ? 26 : 15;
    h.getRow(10).height = 10;

    const H = 11;
    cabeza(h, H, ["Fecha", "Turno", "Hora", "Placa", "Origen", "Destino", "SKU", "Descripción", ...fmts.map(nombreFormato), `Total (${nu})`], 8, [null, null, null, null, null, null, null, null, ...fmts.map(colorFormato), null]);
    h.getCell(H, cT).border = { left: { style: "medium", color: { argb: BANDA } } };
    const L = (c: number) => h.getColumn(c).letter;

    let r = H + 1;
    const dias = [...new Set(filas.map((f) => f.fecha))];
    for (const dia of dias) {
      const del = filas.filter((f) => f.fecha === dia);
      const nv = new Set(del.map((f) => f.viaje)).size;
      const g = h.getRow(r), a = r + 1, b = r + del.length;
      g.height = 20;
      for (let c = 1; c <= ancho; c++) {
        const x = g.getCell(c); x.fill = relleno(GRUPO); x.font = letra(10, TINTA, true);
        x.border = { top: { style: "medium", color: { argb: TINTA } }, bottom: raya() }; x.alignment = { vertical: "middle", horizontal: "right" };
      }
      g.getCell(1).value = `${diaCorto(dia).toUpperCase()}  ·  ${nv} ${nv === 1 ? "Vh" : "Vhs"}  ·  ${del.length} ${del.length === 1 ? "SKU" : "renglones"}`;
      g.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      h.mergeCells(r, 1, r, 8);
      for (let c = cF; c <= cT; c++) {
        const v = c === cT ? del.reduce((s, f) => s + cantidad(f, u), 0) : del.filter((f) => f.formato_ml === fmts[c - cF]).reduce((s, f) => s + cantidad(f, u), 0);
        const x = g.getCell(c); x.value = { formula: `SUBTOTAL(109,${L(c)}${a}:${L(c)}${b})`, result: v }; x.numFmt = N;
      }
      g.getCell(cT).border = { top: { style: "medium", color: { argb: TINTA } }, left: { style: "medium", color: { argb: BANDA } }, bottom: raya() };
      r++;

      let antes = "";
      for (const f of del) {
        const x = h.getRow(r); x.height = 18; x.outlineLevel = 1;
        const mismoVh = f.viaje === antes; antes = f.viaje;
        const tenue = mismoVh ? GRIS_CLARO : TINTA;
        const vals: (string | Date | null)[] = [fecha(f.fecha), f.turno, f.hora?.slice(0, 5) ?? "", f.placa ?? "", f.origen ?? "", f.destino ?? ""];
        vals.forEach((v, i) => {
          const c = x.getCell(i + 1); c.value = v; c.font = letra(10, tenue, i === 3 && !mismoVh);
          c.alignment = { vertical: "middle", horizontal: i < 3 ? "center" : "left", indent: i >= 3 ? 1 : 0 };
        });
        x.getCell(1).numFmt = "dd/mm/yyyy";
        x.getCell(7).value = f.sku || "Sin SKU"; x.getCell(7).font = letra(10, f.sku ? TINTA : GRIS, true); x.getCell(7).alignment = { vertical: "middle", indent: 1 };
        x.getCell(8).value = f.descripcion || (f.sku ? "" : "Vh registrado antes de pedir SKU"); x.getCell(8).font = letra(9.5, f.descripcion ? TINTA : GRIS, false, !f.descripcion);
        x.getCell(8).alignment = { vertical: "middle" };
        fmts.forEach((fm, i) => {
          const c = x.getCell(cF + i), v = f.formato_ml === fm ? cantidad(f, u) : 0;
          c.value = v; c.numFmt = N; c.alignment = { horizontal: "right", vertical: "middle" };
          c.font = letra(10, v ? TINTA : GRIS_CLARO, !!v);
          if (v) c.fill = relleno(tinte(colorFormato(fm)));
        });
        const t = x.getCell(cT);
        t.value = { formula: `SUM(${L(cF)}${r}:${L(cT - 1)}${r})`, result: cantidad(f, u) }; t.numFmt = N; t.font = letra(10, TINTA, true);
        t.alignment = { horizontal: "right", vertical: "middle" }; t.fill = relleno(FONDO); t.border = { left: { style: "medium", color: { argb: BANDA } } };
        if (!mismoVh) for (let c = 1; c <= ancho; c++) { const cel = x.getCell(c); cel.border = { ...(cel.border ?? {}), top: raya() } }
        r++;
      }
    }
    const fin = r - 1;
    const T = total(h, r, ancho, `TOTAL  ·  ${vhs.length} Vhs de PET  ·  ${listaSku.length} SKU`, 8);
    for (let c = cF; c <= cT; c++) {
      const v = c === cT ? tot : porFmt[c - cF].q;
      T.getCell(c).value = { formula: `SUBTOTAL(109,${L(c)}${H + 1}:${L(c)}${fin})`, result: v }; T.getCell(c).numFmt = N;
    }
    /* % de cada formato, debajo del total */
    const P = h.getRow(r + 1); P.height = 16;
    P.getCell(1).value = "% del total"; P.getCell(1).font = letra(9, GRIS, true); P.getCell(1).alignment = { indent: 1 };
    for (let c = cF; c <= cT; c++) {
      const x = P.getCell(c); x.value = { formula: `IFERROR(${L(c)}${r}/${L(cT)}${r},0)`, result: tot ? (c === cT ? 1 : porFmt[c - cF].q / tot) : 0 };
      x.numFmt = "0.0%"; x.font = letra(9, GRIS, true); x.alignment = { horizontal: "right" };
    }
    h.views = [{ state: "frozen", xSplit: 0, ySplit: H, showGridLines: false }];
    impresion(h, `${H}:${H}`, `PET por formato · ${periodo}`);
  }

  /* ============================== 2 · POR SKU ============================== */
  {
    const h = wb.addWorksheet("Por SKU", { properties: { tabColor: { argb: TINTA } } });
    const ancho = 7;
    h.columns = [{ width: 12 }, { width: 46 }, { width: 12 }, { width: 10 }, { width: 22 }, { width: 14 }, { width: 11 }];
    banda(h, ancho, `Qué SKU se trasladaron · ${periodo}`, `De mayor a menor · en ${nu}${deFiltro} · exportado el ${cuando()}`, logo, `${OJO} · POR SKU`);
    h.getRow(6).height = 10;
    const H = 7;
    cabeza(h, H, ["SKU", "Descripción", "Formato", "Vhs", "Placas", `Total (${nu})`, "% del total"], 2);
    h.getCell(H, 5).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    let r = H + 1;
    for (const s of listaSku) {
      const x = h.getRow(r); x.height = 18;
      x.getCell(1).value = s.sku; x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { indent: 1, vertical: "middle" };
      x.getCell(2).value = s.desc; x.getCell(2).font = letra(10, TINTA); x.getCell(2).alignment = { vertical: "middle" };
      x.getCell(3).value = nombreFormato(s.fm); x.getCell(3).font = letra(10, TINTA, true); x.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      x.getCell(3).fill = relleno(tinte(colorFormato(s.fm), 0.22)); x.getCell(3).border = { left: { style: "thick", color: { argb: argb(colorFormato(s.fm)) } } };
      x.getCell(4).value = s.vhs.size; x.getCell(4).numFmt = N0;
      x.getCell(5).value = [...s.placas].join(" · "); x.getCell(5).font = letra(9, GRIS); x.getCell(5).alignment = { vertical: "middle", indent: 1 };
      x.getCell(6).value = s.q; x.getCell(6).numFmt = N; x.getCell(6).font = letra(10, TINTA, true); x.getCell(6).fill = relleno(FONDO);
      x.getCell(7).value = { formula: `IFERROR(F${r}/F$${H + 1 + listaSku.length},0)`, result: tot ? s.q / tot : 0 }; x.getCell(7).numFmt = "0.0%";
      x.getCell(4).alignment = { horizontal: "center", vertical: "middle" }; x.getCell(4).font = letra(10, TINTA);
      for (const c of [6, 7]) x.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
      for (let c = 1; c <= ancho; c++) { const cel = x.getCell(c); cel.border = { ...(cel.border ?? {}), bottom: raya() } }
      r++;
    }
    const T = total(h, r, ancho, `TOTAL  ·  ${listaSku.length} SKU`, 3);
    T.getCell(4).value = vhs.length; T.getCell(4).numFmt = N0; T.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    T.getCell(6).value = { formula: `SUBTOTAL(109,F${H + 1}:F${r - 1})`, result: tot }; T.getCell(6).numFmt = N;
    T.getCell(7).value = 1; T.getCell(7).numFmt = "0.0%";
    h.autoFilter = { from: { row: H, column: 1 }, to: { row: r - 1, column: ancho } };
    h.views = [{ state: "frozen", ySplit: H, showGridLines: false }];
    impresion(h, `${H}:${H}`, `PET por SKU · ${periodo}`);
  }

  /* ============================== 3 · PROMEDIOS ============================== */
  {
    const corte = d.hasta < d.hoy ? masDias(d.hasta, 1) : d.hoy;
    const p = programar(d.filas, masDias(d.hasta, 1), { modo: "dias", n: 400 }, corte);
    const dias = p.dias, nd = dias.length;
    const ancho = Math.max(10, 1 + nd + 3);
    const h = wb.addWorksheet("Promedios", { properties: { tabColor: { argb: VERDE } } });
    h.columns = [{ width: 24 }, ...Array.from({ length: ancho - 1 }, (_, i) => ({ width: i === 8 ? 14 : 12 }))];
    const rango = nd ? `${diaCorto(dias[0])} – ${diaCorto(dias[nd - 1])}` : "sin días cerrados";
    banda(h, ancho, `Promedios de PET · ${rango}`, `Vhs al día y por turno, por formato · ${nd} ${nd === 1 ? "día" : "días"} con PET${deFiltro} · exportado el ${cuando()}`, logo, `${OJO} · PROMEDIOS`);
    h.getRow(6).height = 8;

    if (!nd) {
      h.mergeCells(7, 1, 7, ancho);
      const c = h.getCell(7, 1); c.value = "No hay días cerrados del periodo con PET y con el formato registrado (el día de hoy no cuenta hasta que cierre).";
      c.font = letra(10, GRIS, false, true); c.alignment = { indent: 1, wrapText: true }; h.getRow(7).height = 30;
    } else {
      const t = p.total;
      cifra(h, 7, 1, 1, "A programar al día", `${t.dia.sugerido} Vhs`, `promedio ${t.dia.promedio.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`);
      cifra(h, 7, 2, 4, "Por turno", `C ${t.turnos.C.sugerido} · A ${t.turnos.A.sugerido} · B ${t.turnos.B.sugerido}`, "los turnos suman el día");
      const fm1 = [...p.formatos].sort((a, b) => b.dia.promedio - a.dia.promedio)[0];
      cifra(h, 7, 5, 7, "Formato que más sale", fm1 ? nombreFormato(fm1.formato) : "—", fm1 ? `${fm1.dia.sugerido} Vhs al día` : "", fm1 ? argb(colorFormato(fm1.formato)) : BANDA);
      cifra(h, 7, 8, ancho, "Días que entran", String(nd), rango, VERDE);
      for (let f = 7; f <= 9; f++) h.getRow(f).height = f === 8 ? 26 : 15;

      /* --- Bloque B primero en el cálculo (A le apunta), pero se dibuja debajo --- */
      const A0 = 11;                        // título bloque A
      const filasA = p.formatos.length + 1; // + total
      const B0 = A0 + 3 + filasA + 2;       // título bloque B
      const BH = B0 + 2;                    // encabezado B
      const C0 = BH + 1 + filasA + 2;       // título bloque C
      const CH = C0 + 2;
      const Lc = (c: number) => h.getColumn(c).letter;
      const filasDe = [...p.formatos, t];
      const nombre = (i: number) => (i === p.formatos.length ? "Total Vhs de PET" : nombreFormato(p.formatos[i].formato));

      /* A · Vhs al día y por turno */
      tituloBloque(h, A0, ancho, "Vhs al día y por turno", "Promedio de los días que entran y lo que da para programar (el promedio redondeado; los turnos se reparten para que sumen el día). Es lo mismo que PET › Programar.");
      const AH = A0 + 2;
      cabeza(h, AH, ["Formato", "Prom. turno C", "Prom. turno A", "Prom. turno B", "Prom. día", "Programar C", "Programar A", "Programar B", "Programar día", "Máx. en un día"], 1);
      filasDe.forEach((f, i) => {
        const r = AH + 1 + i, x = h.getRow(r), esT = i === p.formatos.length; x.height = 20;
        x.getCell(1).value = nombre(i); x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { indent: 1, vertical: "middle" };
        if (!esT) x.getCell(1).border = { left: { style: "thick", color: { argb: argb(colorFormato(f.formato)) } } };
        TURNOS_PET.forEach((tu, k) => { const c = x.getCell(2 + k); c.value = f.turnos[tu].promedio; c.numFmt = N1 });
        const filaB = BH + 1 + i;
        x.getCell(5).value = { formula: `IFERROR(AVERAGE(${Lc(2)}${filaB}:${Lc(1 + nd)}${filaB}),0)`, result: f.dia.promedio }; x.getCell(5).numFmt = N1;
        TURNOS_PET.forEach((tu, k) => { const c = x.getCell(6 + k); c.value = f.turnos[tu].sugerido; c.numFmt = N0 });
        x.getCell(9).value = f.dia.sugerido; x.getCell(9).numFmt = N0;
        x.getCell(10).value = { formula: `MAX(${Lc(2)}${filaB}:${Lc(1 + nd)}${filaB})`, result: Math.max(0, ...f.porDia.map((z) => z.vhs)) }; x.getCell(10).numFmt = N0;
        for (let c = 2; c <= 10; c++) {
          const cel = x.getCell(c); cel.alignment = { horizontal: "center", vertical: "middle" };
          const prog = c >= 6 && c <= 9;
          cel.font = letra(prog ? 12 : 10, TINTA, prog || esT);
          if (prog) cel.fill = relleno(c === 9 ? BANDA : "FFFFF3CF");
          cel.border = { ...(cel.border ?? {}), bottom: raya(), ...(c === 6 ? { left: { style: "medium", color: { argb: TINTA } } } : {}) };
        }
        if (esT) for (let c = 1; c <= 10; c++) { const cel = x.getCell(c); cel.border = { ...(cel.border ?? {}), top: { style: "medium", color: { argb: TINTA } } }; if (!(c >= 6 && c <= 9)) cel.fill = relleno(GRUPO) }
      });

      /* B · Vhs de cada día */
      tituloBloque(h, B0, ancho, "Vhs de cada día", "Cuántos Vhs llevaron cada formato en cada día que entra al promedio (un Vh que llevó dos formatos cuenta en los dos). El promedio es fórmula: si cambias un número, se recalcula.");
      cabeza(h, BH, ["Formato", ...dias.map(diaCorto), "Promedio", "Máximo"], 1);
      filasDe.forEach((f, i) => {
        const r = BH + 1 + i, x = h.getRow(r), esT = i === p.formatos.length; x.height = 18;
        x.getCell(1).value = nombre(i); x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { indent: 1 };
        if (!esT) x.getCell(1).border = { left: { style: "thick", color: { argb: argb(colorFormato(f.formato)) } } };
        f.porDia.forEach((z, k) => { const c = x.getCell(2 + k); c.value = z.vhs; c.numFmt = N0; c.font = letra(10, z.vhs ? TINTA : GRIS_CLARO, esT); if (z.vhs && !esT) c.fill = relleno(tinte(colorFormato(f.formato))) });
        const cp = x.getCell(2 + nd), cm = x.getCell(3 + nd);
        cp.value = { formula: `IFERROR(AVERAGE(${Lc(2)}${r}:${Lc(1 + nd)}${r}),0)`, result: f.dia.promedio }; cp.numFmt = N1; cp.font = letra(10, TINTA, true); cp.fill = relleno("FFFFF3CF");
        cm.value = { formula: `MAX(${Lc(2)}${r}:${Lc(1 + nd)}${r})`, result: Math.max(0, ...f.porDia.map((z) => z.vhs)) }; cm.numFmt = N0; cm.font = letra(10, TINTA);
        for (let c = 2; c <= 3 + nd; c++) { const cel = x.getCell(c); cel.alignment = { horizontal: "center" }; cel.border = { bottom: raya(), ...(c === 2 + nd ? { left: { style: "medium", color: { argb: BANDA } } } : {}) } }
        if (esT) for (let c = 1; c <= 3 + nd; c++) { const cel = x.getCell(c); cel.border = { ...(cel.border ?? {}), top: { style: "medium", color: { argb: TINTA } } }; if (c !== 2 + nd) cel.fill = relleno(GRUPO); cel.font = letra(10, TINTA, true) }
      });

      /* C · cantidad de cada día */
      tituloBloque(h, C0, ancho, `${nu} de cada día`, `Cuánto se trasladó de cada formato cada día (${nu}) y su promedio al día y por Vh.`);
      cabeza(h, CH, ["Formato", ...dias.map(diaCorto), "Promedio día", `Prom. por Vh`], 1);
      filasDe.forEach((f, i) => {
        const r = CH + 1 + i, x = h.getRow(r), esT = i === p.formatos.length; x.height = 18;
        x.getCell(1).value = esT ? `Total PET (${nu})` : nombre(i); x.getCell(1).font = letra(10, TINTA, true); x.getCell(1).alignment = { indent: 1 };
        if (!esT) x.getCell(1).border = { left: { style: "thick", color: { argb: argb(colorFormato(f.formato)) } } };
        const qs = dias.map((dia) => d.filas.filter((z) => z.fecha === dia && (esT || z.formato_ml === f.formato)).reduce((a, z) => a + cantidad(z, u), 0));
        qs.forEach((q, k) => { const c = x.getCell(2 + k); c.value = q; c.numFmt = N; c.font = letra(10, q ? TINTA : GRIS_CLARO, esT); if (q && !esT) c.fill = relleno(tinte(colorFormato(f.formato))) });
        const cp = x.getCell(2 + nd), cv = x.getCell(3 + nd);
        const pq = qs.reduce((a, b) => a + b, 0) / nd;
        cp.value = { formula: `IFERROR(AVERAGE(${Lc(2)}${r}:${Lc(1 + nd)}${r}),0)`, result: pq }; cp.numFmt = N; cp.font = letra(10, TINTA, true); cp.fill = relleno("FFFFF3CF");
        const filaB = BH + 1 + i;
        cv.value = { formula: `IFERROR(SUM(${Lc(2)}${r}:${Lc(1 + nd)}${r})/SUM(${Lc(2)}${filaB}:${Lc(1 + nd)}${filaB}),0)`, result: f.dia.promedio ? pq / f.dia.promedio : 0 }; cv.numFmt = N; cv.font = letra(10, TINTA);
        for (let c = 2; c <= 3 + nd; c++) { const cel = x.getCell(c); cel.alignment = { horizontal: "center" }; cel.border = { bottom: raya(), ...(c === 2 + nd ? { left: { style: "medium", color: { argb: BANDA } } } : {}) } }
        if (esT) for (let c = 1; c <= 3 + nd; c++) { const cel = x.getCell(c); cel.border = { ...(cel.border ?? {}), top: { style: "medium", color: { argb: TINTA } } }; if (c !== 2 + nd) cel.fill = relleno(GRUPO); cel.font = letra(10, TINTA, true) }
      });

      const nota = CH + 1 + filasA + 1;
      h.mergeCells(nota, 1, nota, ancho);
      const c = h.getCell(nota, 1);
      c.value = `Entran los días ya cerrados del periodo con PET y con el formato registrado${d.hasta >= d.hoy ? " (hoy no, porque no ha cerrado)" : ""}. Los días sin PET (domingos, paros) no bajan el promedio.`;
      c.font = letra(9, GRIS, false, true); c.alignment = { indent: 1, wrapText: true }; h.getRow(nota).height = 28;
    }
    h.views = [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }];
    impresion(h, "1:5", `PET promedios · ${rango}`);
  }

  return ordenarSheetPr(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
