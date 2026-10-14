/**
 * EL TABLERO DE ROTURAS EN SITIO, EN EXCEL.
 *
 * «Que en Quiebra · En sitio yo pueda exportar este consolidado y que quede
 *  brutal, así como el informe de la base: con foto, con indicador, estado, todo.»
 *
 * Tres hojas, como el libro de la Base:
 *   RESUMEN     la banda, los KPI y las barras (estado, turno, causa, proceso,
 *               material, área) y lo que hay que mirar (sin foto, sin precio…).
 *   DETALLE     una fila por rotura con TODO: cuándo, turno, cantidades, cobro,
 *               causa, quién y el estado en su color. El código de las fotos
 *               salta a su tarjeta en Evidencias.
 *   EVIDENCIAS  una tarjeta por rotura: la ficha a la izquierda y hasta tres
 *               fotos al lado.
 *
 * SALE LO QUE ESTÁ FILTRADO EN LA PANTALLA (estado, búsqueda, fecha y turno):
 * la ruta recibe los id de lo que se ve. Un Excel que trae otra cosa que la
 * pantalla es un Excel en el que nadie confía.
 *
 * Las barras son texto (█) y no gráficas de Excel: se ven igual en Excel, en
 * el visor del correo y en el teléfono, y no se rompen al filtrar.
 */
import ExcelJS from "exceljs";
import type { Rotura } from "./datos";
import { etiquetaRotura, faseRotura, turnoYDia, ORIGEN_TXT, type OrigenR } from "./cierre";

type BufferDeExcel = Parameters<ExcelJS.Workbook["addImage"]>[0]["buffer"];

export type FotoLibro = {
  rotura_id: string; papel: "rotura" | "descargo"; foto: Buffer;
  ancho: number | null; alto: number | null; extension: "jpeg" | "png";
};

export type InsumosRoturas = {
  roturas: Rotura[];
  nombres: Record<string, string>;
  /** Las fotos que entraron (ya achicadas). */
  fotos: FotoLibro[];
  /** Cuántas fotos de más tiene cada rotura en la app (no entraron al libro). */
  fotosFuera: number;
  periodo: string;
  filtros: string;
  quien: string;
  logo: Buffer | null;
};

/* ---- La paleta de CONTROL: tinta negra, banda amarilla. ---- */
const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", GRIS_CLARO = "FFB9B9B9";
const FONDO = "FFF6F6F4", RAYA = "FFE3E3E0", ENLACE = "FF1A4FA0", ROJO = "FFC0392B";
const ESTADO: Record<string, { fondo: string; tinta: string; barra: string }> = {
  "tb-ok":   { fondo: "FFDDF3E4", tinta: "FF1B7A3A", barra: "FF1B7A3A" },
  "tb-esp":  { fondo: "FFFFF1C2", tinta: "FF8A6200", barra: "FFC99700" },
  "tb-mal":  { fondo: "FFFBE0DD", tinta: "FFB42318", barra: "FFC0392B" },
  "tb-gris": { fondo: "FFECECEC", tinta: "FF555555", barra: "FF8C8C8C" },
};
const PESOS = '"$" #,##0';
const NUM = "#,##0";

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
const raya = (argb = RAYA): ExcelJS.Border => ({ style: "thin", color: { argb } });
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
/** La hora de Colombia escrita como fecha de Excel (Excel no sabe de zonas). */
const COL_MS = 5 * 3_600_000;
const aFecha = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) - COL_MS) : null);
const aDia = (dia: string) => new Date(`${dia}T00:00:00Z`);
const cajasDe = (r: Rotura) => (Number(r.unidades) || 0) + (Number(r.contaminadas) || 0);
const barra = (v: number, max: number, largo = 22) => (v > 0 && max > 0 ? "█".repeat(Math.max(1, Math.round((v / max) * largo))) : "");
const vinculo = (hoja: string, celda: string, texto: string) =>
  ({ formula: `HYPERLINK("#'${hoja}'!${celda}","${texto.replace(/"/g, '""')}")`, result: texto });

/** La banda negra de arriba de cada hoja: ojo amarillo, título y de qué es. */
function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string, logoId: number | null) {
  h.views = [{ showGridLines: false }];
  for (let f = 1; f <= 5; f++) {
    const r = h.getRow(f);
    for (let c = 1; c <= ancho; c++) r.getCell(c).fill = relleno(TINTA);
  }
  h.getRow(1).height = 10; h.getRow(2).height = 16; h.getRow(3).height = 30; h.getRow(4).height = 16; h.getRow(5).height = 10;
  const ojo = h.getCell(2, 2); ojo.value = "ROTURAS  ·  EN SITIO  ·  CONSOLIDADO"; ojo.font = letra(8.5, BANDA, true);
  const t = h.getCell(3, 2); t.value = titulo; t.font = letra(20, BLANCO, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 2); s.value = sub; s.font = letra(9, GRIS_CLARO);
  const r6 = h.getRow(6); r6.height = 5;
  for (let c = 1; c <= ancho; c++) r6.getCell(c).fill = relleno(BANDA);
  if (logoId != null) h.addImage(logoId, { tl: { col: ancho - 1.15, row: 1.1 } as ExcelJS.Anchor, ext: { width: 46, height: 46 }, editAs: "oneCell" });
}

type Conteo = { nombre: string; n: number; cajas: number; color?: string };
function agrupar(rs: Rotura[], clave: (r: Rotura) => string, color?: (r: Rotura) => string): Conteo[] {
  const m = new Map<string, Conteo>();
  for (const r of rs) {
    const k = clave(r) || "—";
    const c = m.get(k) ?? { nombre: k, n: 0, cajas: 0, color: color?.(r) };
    c.n++; c.cajas += cajasDe(r); m.set(k, c);
  }
  return [...m.values()];
}

export async function armarLibroRoturas(d: InsumosRoturas): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Roturas"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = d.logo ? wb.addImage({ buffer: d.logo as unknown as BufferDeExcel, extension: "png" }) : null;

  const todas = [...d.roturas].sort((a, b) => b.reportada_en.localeCompare(a.reportada_en));
  const vivas = todas.filter((r) => r.estado !== "anulada");
  const quien = (r: Rotura) => d.nombres[r.reportada_por ?? ""] ?? "—";
  const ahora = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const sub = `${d.periodo}${d.filtros ? ` · ${d.filtros}` : ""} · exportó ${d.quien} el ${ahora}`;

  /* Las fotos por rotura, en el orden en que se pegan: primero las de la rotura, luego el descargo. */
  const fotosDe = new Map<string, FotoLibro[]>();
  for (const f of d.fotos) { const l = fotosDe.get(f.rotura_id) ?? []; l.push(f); fotosDe.set(f.rotura_id, l) }
  for (const l of fotosDe.values()) l.sort((a, b) => (a.papel === b.papel ? 0 : a.papel === "rotura" ? -1 : 1));
  const conFoto = todas.filter((r) => (fotosDe.get(r.id) ?? []).length > 0);
  /* Dónde queda la tarjeta de cada rotura en Evidencias: para el vínculo del Detalle. */
  const filaEvid = new Map(conFoto.map((r, i) => [r.id, 9 + i]));

  /* ======================= 1 · RESUMEN ======================= */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    const W = 12; // A margen · B..K contenido · L margen
    /* Diez columnas iguales (B..K): cinco fichas de dos, o dos paneles de cinco. */
    h.columns = [2, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 2].map((w) => ({ width: w }));
    banda(h, W, "Todo lo registrado", sub, logoId);

    /* ---- LOS KPI: cinco fichas de dos columnas. ---- */
    const rotas = vivas.reduce((s, r) => s + (Number(r.unidades) || 0), 0);
    const contam = vivas.reduce((s, r) => s + (Number(r.contaminadas) || 0), 0);
    const aCobro = vivas.filter((r) => faseRotura(r) === "cobro");
    const plata = aCobro.reduce((s, r) => s + (Number(r.cobro_total) || 0), 0);
    const sinFoto = vivas.filter((r) => r.le_falta_foto);
    const anuladas = todas.length - vivas.length;
    const fichas: { rot: string; num: number; fmt: string; pie: string; amarilla?: boolean; roja?: boolean }[] = [
      { rot: "REGISTRADAS", num: vivas.length, fmt: NUM, pie: anuladas ? `${anuladas} anulada${anuladas === 1 ? "" : "s"} aparte` : "sin anuladas", amarilla: true },
      { rot: "ROTAS", num: rotas, fmt: NUM, pie: "cajas" },
      { rot: "CONTAMINADAS", num: contam, fmt: NUM, pie: "cajas" },
      { rot: "A COBRO", num: plata, fmt: PESOS, pie: `${aCobro.length} rotura${aCobro.length === 1 ? "" : "s"}` },
      { rot: "SIN FOTO", num: sinFoto.length, fmt: NUM, pie: "la causa exige foto", roja: sinFoto.length > 0 },
    ];
    const pares: [number, number][] = [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
    h.getRow(8).height = 16; h.getRow(9).height = 34; h.getRow(10).height = 16;
    fichas.forEach((f, i) => {
      const [c1, c2] = pares[i];
      for (const fila of [8, 9, 10]) {
        if (c2 > c1) h.mergeCells(fila, c1, fila, c2);
        const cel = h.getCell(fila, c1);
        cel.fill = relleno(f.amarilla ? BANDA : FONDO);
        /* Una raya blanca entre ficha y ficha. */
        cel.border = { ...(cel.border ?? {}), left: { style: "thick", color: { argb: BLANCO } } };
        cel.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      }
      h.getCell(8, c1).value = f.rot; h.getCell(8, c1).font = letra(8, f.amarilla ? TINTA : GRIS, true);
      const n = h.getCell(9, c1); n.value = f.num; n.numFmt = f.fmt; n.font = letra(f.fmt === PESOS ? 17 : 22, f.roja ? ROJO : TINTA, true);
      h.getCell(10, c1).value = f.pie; h.getCell(10, c1).font = letra(8.5, f.amarilla ? TINTA : GRIS);
      h.getCell(8, c1).border = { top: { style: "medium", color: { argb: f.roja ? ROJO : TINTA } }, left: { style: "thick", color: { argb: BLANCO } } };
    });

    /* ---- LAS BARRAS: dos columnas de paneles. ---- */
    const panel = (fila: number, c: number, titulo: string, cab: string, datos: Conteo[], valor: (x: Conteo) => number, colorBarra: string, tope = 8, fijo = false) => {
      const t = h.getCell(fila, c); t.value = titulo; t.font = letra(8.5, TINTA, true); t.alignment = { indent: c > 2 ? 1 : 0 };
      const k = h.getCell(fila, c + 4); k.value = cab; k.font = letra(8, GRIS, true); k.alignment = { horizontal: "right" };
      for (let x = c; x <= c + 4; x++) h.getCell(fila, x).border = { bottom: { style: "medium", color: { argb: TINTA } } };
      const lista = fijo ? datos : datos.filter((x) => valor(x) > 0 || datos.length <= tope).sort((a, b) => valor(b) - valor(a));
      const vis = lista.slice(0, tope);
      const resto = lista.slice(tope);
      if (resto.length) vis.push({ nombre: `Otras ${resto.length}`, n: resto.reduce((s, x) => s + x.n, 0), cajas: resto.reduce((s, x) => s + x.cajas, 0), color: GRIS_CLARO });
      const max = Math.max(1, ...vis.map(valor));
      vis.forEach((x, i) => {
        const f = fila + 1 + i;
        h.getRow(f).height = 17;
        h.mergeCells(f, c, f, c + 1);
        const nom = h.getCell(f, c); nom.value = x.nombre; nom.font = letra(9.5, TINTA); nom.alignment = { vertical: "middle", shrinkToFit: true, indent: c > 2 ? 1 : 0 };
        h.mergeCells(f, c + 2, f, c + 3);
        const b = h.getCell(f, c + 2); b.value = barra(valor(x), max, 20); b.font = letra(9, x.color ?? colorBarra); b.alignment = { vertical: "middle" };
        const v = h.getCell(f, c + 4); v.value = valor(x); v.numFmt = NUM; v.font = letra(9.5, TINTA, true); v.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        for (let z = c; z <= c + 4; z++) h.getCell(f, z).border = { bottom: raya() };
      });
      if (!vis.length) { const v = h.getCell(fila + 1, c); v.value = "Nada en lo exportado."; v.font = letra(9, GRIS, false, true) }
      /* El panel de la derecha se separa del de la izquierda con una raya blanca gruesa. */
      if (c > 2) for (let f = fila; f <= fila + Math.max(1, vis.length); f++) {
        const cel = h.getCell(f, c); cel.border = { ...(cel.border ?? {}), left: { style: "thick", color: { argb: BLANCO } } };
      }
      return fila + 1 + Math.max(1, vis.length);
    };

    const ORDEN_FASE = ["A COBRO", "A COBRO · ENCONTRADA", "ESPERA AL OL", "EN DESACUERDO", "NO SE COBRA", "ANULADA"];
    const porEstado = agrupar(todas, (r) => etiquetaRotura(r).txt, (r) => ESTADO[etiquetaRotura(r).clase]?.barra ?? TINTA)
      .sort((a, b) => ORDEN_FASE.indexOf(a.nombre) - ORDEN_FASE.indexOf(b.nombre));
    const porTurno = ["C", "A", "B"].map((t) => {
      const rs = vivas.filter((r) => turnoYDia(r.reportada_en).turno === t);
      return { nombre: `Turno ${t}`, n: rs.length, cajas: rs.reduce((s, r) => s + cajasDe(r), 0) };
    });
    let f1 = 12, f2 = 12;
    /* Paneles: el izquierdo en B..F y el derecho en G..K (con sangría para que respiren). */
    /* El estado va por cantidad de roturas y en su color, en el orden de la cadena; lo demás, por cajas. */
    {
      const t = h.getCell(f1, 2); t.value = "POR ESTADO"; t.font = letra(8.5, TINTA, true);
      const k = h.getCell(f1, 6); k.value = "ROTURAS"; k.font = letra(8, GRIS, true); k.alignment = { horizontal: "right" };
      for (let x = 2; x <= 6; x++) h.getCell(f1, x).border = { bottom: { style: "medium", color: { argb: TINTA } } };
      const max = Math.max(1, ...porEstado.map((x) => x.n));
      porEstado.forEach((x, i) => {
        const f = f1 + 1 + i; h.getRow(f).height = 17;
        h.mergeCells(f, 2, f, 3);
        const est = Object.entries(ESTADO).find(([, v]) => v.barra === x.color)?.[1];
        const nom = h.getCell(f, 2); nom.value = x.nombre; nom.font = letra(8.5, est?.tinta ?? TINTA, true);
        if (est) nom.fill = relleno(est.fondo);
        nom.alignment = { vertical: "middle", indent: 1 };
        h.mergeCells(f, 4, f, 5);
        const b = h.getCell(f, 4); b.value = barra(x.n, max, 20); b.font = letra(9, x.color ?? TINTA); b.alignment = { vertical: "middle" };
        const v = h.getCell(f, 6); v.value = x.n; v.numFmt = NUM; v.font = letra(9.5, TINTA, true); v.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        for (let z = 2; z <= 6; z++) h.getCell(f, z).border = { bottom: raya() };
      });
      f1 = f1 + 1 + Math.max(1, porEstado.length);
    }
    f2 = panel(f2, 7, "POR TURNO (C 22-06 · A 06-14 · B 14-22)", "CAJAS", porTurno, (x) => x.cajas, BANDA, 8, true);
    f1 = Math.max(f1, f2) + 1; f2 = f1;
    f1 = panel(f1, 2, "CAUSAS", "CAJAS", agrupar(vivas, (r) => r.causa_nombre), (x) => x.cajas, TINTA);
    f2 = panel(f2, 7, "PROCESO", "CAJAS", agrupar(vivas, (r) => r.proceso_nombre), (x) => x.cajas, TINTA);
    f1 = Math.max(f1, f2) + 1; f2 = f1;
    f1 = panel(f1, 2, "MATERIAL", "CAJAS", agrupar(vivas, (r) => r.material_nombre), (x) => x.cajas, "FF8A6200");
    f2 = panel(f2, 7, "ÁREA", "CAJAS", agrupar(vivas, (r) => r.area_nombre ?? "Sin área"), (x) => x.cajas, "FF8A6200");
    f1 = Math.max(f1, f2) + 1; f2 = f1;
    f1 = panel(f1, 2, "QUIÉN LA REPORTÓ", "CAJAS", agrupar(vivas, quien), (x) => x.cajas, GRIS);
    f2 = panel(f2, 7, "ORIGEN", "ROTURAS", agrupar(vivas, (r) => ORIGEN_TXT[(r.origen ?? "sin") as OrigenR]), (x) => x.n, GRIS);
    let f = Math.max(f1, f2) + 1;

    /* ---- PARA MIRAR: lo que hace que un cobro se caiga. ---- */
    const sinPrecio = aCobro.filter((r) => r.cobro_total == null);
    const sinOrigen = vivas.filter((r) => !r.origen);
    const mirar: [string, Rotura[]][] = [
      ["Sin foto y la causa la exige", sinFoto],
      ["A cobro sin precio o sin unid. por caja (cobro vacío)", sinPrecio],
      ["Sin origen (no dice si fue OPM o encontrada)", sinOrigen],
    ];
    const t = h.getCell(f, 2); t.value = "PARA MIRAR"; t.font = letra(8.5, ROJO, true);
    for (let x = 2; x <= 11; x++) h.getCell(f, x).border = { bottom: { style: "medium", color: { argb: ROJO } } };
    f++;
    for (const [txt, rs] of mirar) {
      h.getRow(f).height = rs.length > 12 ? 30 : 17;
      h.mergeCells(f, 2, f, 5);
      const a = h.getCell(f, 2); a.value = txt; a.font = letra(9.5, TINTA, rs.length > 0); a.alignment = { vertical: "middle", wrapText: true };
      h.mergeCells(f, 6, f, 11);
      const b = h.getCell(f, 6);
      b.value = rs.length ? `${rs.length}: ${rs.map((r) => r.codigo).join(", ")}` : "Ninguna ✓";
      b.font = letra(9, rs.length ? ROJO : "FF1B7A3A", rs.length > 0); b.alignment = { vertical: "middle", wrapText: true };
      for (let z = 2; z <= 11; z++) h.getCell(f, z).border = { bottom: raya() };
      f++;
    }
    f++;
    const nota = h.getCell(f, 2);
    nota.value = "Rotas y contaminadas en cajas. El cobro es cajas × unid. por caja × precio (la rota, solo el envase; la contaminada, envase y producto). Las anuladas no suman en los KPI ni en las barras, salvo en «Por estado».";
    h.mergeCells(f, 2, f, 11); nota.font = letra(8.5, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top" }; h.getRow(f).height = 26;
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };
  }

  /* ======================= 2 · DETALLE ======================= */
  {
    const h = wb.addWorksheet("Detalle", { properties: { tabColor: { argb: TINTA } } });
    const C: [string, number][] = [
      ["Código", 11], ["Fecha y hora", 15], ["Turno", 7], ["Día de turno", 11], ["Cód. material", 11], ["Material", 30],
      ["Tipo", 13], ["Rotas (cajas)", 10], ["Contaminadas", 11], ["Unid. por caja", 9], ["Cobro rotas", 13], ["Cobro contam.", 13],
      ["Cobro total", 14], ["Causa", 26], ["Asumida", 11], ["Proceso", 16], ["Área", 16], ["Origen", 12], ["Reportó", 14],
      ["OPM", 16], ["Estado", 22], ["Fotos", 8], ["Qué pasó", 40], ["Dice el OL", 30], ["Decisión", 30], ["Anulada porque", 30],
    ];
    const N = C.length;
    h.columns = C.map(([, w]) => ({ width: w }));
    banda(h, N, `Detalle · ${todas.length} rotura${todas.length === 1 ? "" : "s"}`, sub, null);
    const nums = [8, 9, 10, 11, 12, 13, 22];
    const cab = h.getRow(8); cab.height = 30;
    C.forEach(([t], i) => {
      const c = cab.getCell(i + 1); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA);
      c.alignment = { vertical: "middle", horizontal: nums.includes(i + 1) ? "right" : "left", wrapText: true, indent: 1 };
    });
    todas.forEach((r, i) => {
      const fila = 9 + i;
      const row = h.getRow(fila);
      const td = turnoYDia(r.reportada_en);
      const e = etiquetaRotura(r);
      const eer = r.tipo === "eer";
      const nFotos = Number(r.fotos) || 0;
      row.values = [
        r.codigo, aFecha(r.reportada_en), td.turno, aDia(td.dia), r.material, r.material_nombre,
        eer ? "Envase (EER)" : "Producto terminado", Number(r.unidades) || 0, eer ? null : Number(r.contaminadas) || 0,
        r.factor_caja ?? null, r.cobro_rotas ?? null, r.cobro_contaminadas ?? null, r.cobro_total ?? null,
        r.causa_nombre, r.grupo === "no_asumida" ? "No asumida" : "Asumida", r.proceso_nombre, r.area_nombre ?? "",
        ORIGEN_TXT[(r.origen ?? "sin") as OrigenR], quien(r), r.opm_nombre ?? "", e.txt,
        nFotos, r.descripcion ?? "", r.ol_nota ?? "", r.nota_decision ?? "", r.motivo_anulacion ?? "",
      ];
      row.height = 18;
      for (let c = 1; c <= N; c++) {
        const cel = row.getCell(c);
        cel.font = letra(9.5, r.estado === "anulada" ? GRIS : TINTA);
        cel.border = { bottom: raya() };
        cel.alignment = { vertical: "middle", horizontal: nums.includes(c) ? "right" : "left", indent: 1 };
        if (i % 2 === 1) cel.fill = relleno(FONDO);
      }
      row.getCell(1).font = letra(9.5, TINTA, true);
      row.getCell(2).numFmt = "dd/mm/yy hh:mm"; row.getCell(4).numFmt = "dd/mm/yy";
      for (const c of [8, 9, 10]) row.getCell(c).numFmt = NUM;
      for (const c of [11, 12, 13]) row.getCell(c).numFmt = PESOS;
      row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(3).font = letra(9.5, TINTA, true);
      if (r.grupo === "no_asumida") row.getCell(15).font = letra(9.5, ROJO, true);
      const est = ESTADO[e.clase] ?? ESTADO["tb-gris"];
      const ce = row.getCell(21); ce.fill = relleno(est.fondo); ce.font = letra(8.5, est.tinta, true);
      /* Las fotos saltan a su tarjeta en Evidencias. */
      const fe = filaEvid.get(r.id);
      if (fe && nFotos > 0) { row.getCell(22).value = vinculo("Evidencias", `A${fe}`, `${nFotos} ↗`); row.getCell(22).font = letra(9.5, ENLACE, true) }
      else if (r.le_falta_foto) { row.getCell(22).value = "Falta"; row.getCell(22).font = letra(9.5, ROJO, true) }
      if (r.cobro_total == null && faseRotura(r) === "cobro" && r.estado !== "anulada") { row.getCell(13).value = "sin precio"; row.getCell(13).font = letra(9, ROJO, true, true) }
    });
    const ult = 8 + todas.length;
    /* Totales que siguen al filtro (SUBTOTAL 109): filtras y la cifra cambia. */
    const tot = h.getRow(ult + 1); tot.height = 22;
    for (let c = 1; c <= N; c++) { const cel = tot.getCell(c); cel.fill = relleno(BANDA); cel.font = letra(9.5, TINTA, true); cel.border = { top: { style: "medium", color: { argb: TINTA } } } }
    tot.getCell(1).value = "TOTAL (lo filtrado)";
    for (const c of [8, 9, 11, 12, 13]) {
      let s = 0; for (const r of todas) { const v = c === 8 ? r.unidades : c === 9 ? r.contaminadas : c === 11 ? r.cobro_rotas : c === 12 ? r.cobro_contaminadas : r.cobro_total; s += Number(v) || 0 }
      const cel = tot.getCell(c); cel.value = { formula: `SUBTOTAL(109,${col(c)}9:${col(c)}${Math.max(9, ult)})`, result: s };
      cel.numFmt = c >= 11 ? PESOS : NUM; cel.alignment = { horizontal: "right", vertical: "middle" };
    }
    h.autoFilter = `A8:${col(N)}${Math.max(9, ult)}`;
    h.views = [{ state: "frozen", xSplit: 1, ySplit: 8, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "8:8" };
  }

  /* ======================= 3 · EVIDENCIAS ======================= */
  {
    const h = wb.addWorksheet("Evidencias", { properties: { tabColor: { argb: "FFDC2626" } } });
    /* A código · B ficha · C estado · D E F tres fotos (≈ 270 px de ancho cada una). */
    h.columns = [12, 44, 18, 38, 38, 38].map((w) => ({ width: w }));
    const sinFoto = todas.filter((r) => !(fotosDe.get(r.id) ?? []).length);
    banda(h, 6, `Evidencias · ${d.fotos.length} foto${d.fotos.length === 1 ? "" : "s"}`,
      `${conFoto.length} rotura${conFoto.length === 1 ? "" : "s"} con foto${d.fotosFuera ? ` · otras ${d.fotosFuera} fotos no entraron por peso: se ven en la app` : ""} · ${sub}`, null);
    const cab = h.getRow(8); cab.height = 24;
    ["Código", "Ficha", "Estado", "Foto 1", "Foto 2", "Foto 3"].forEach((t, i) => {
      const c = cab.getCell(i + 1); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA); c.alignment = { vertical: "middle", indent: 1 };
    });
    conFoto.forEach((r, i) => {
      const fila = 9 + i;
      const row = h.getRow(fila);
      row.height = 168; // ≈ 224 px
      const td = turnoYDia(r.reportada_en);
      const e = etiquetaRotura(r);
      const est = ESTADO[e.clase] ?? ESTADO["tb-gris"];
      const fs = fotosDe.get(r.id) ?? [];
      const enApp = (Number(r.fotos) || 0) + (Number(r.fotos_descargo) || 0);
      const lineas: ExcelJS.RichText[] = [
        { text: `${r.material_nombre}\n`, font: letra(10.5, TINTA, true) },
        { text: `${r.unidades} caja${r.unidades === 1 ? "" : "s"} ${r.tipo === "eer" ? "de envase" : "rotas"}`, font: letra(9.5, TINTA, true) },
        { text: r.contaminadas ? ` · ${r.contaminadas} contaminada${r.contaminadas === 1 ? "" : "s"}\n` : "\n", font: letra(9.5, TINTA, true) },
        { text: `${r.causa_nombre}`, font: letra(9.5, r.grupo === "no_asumida" ? ROJO : TINTA) },
        { text: ` · ${r.proceso_nombre}${r.area_nombre ? ` · ${r.area_nombre}` : ""}\n`, font: letra(9.5, TINTA) },
        { text: `${td.dia.split("-").reverse().join("/")} ${td.hhmm} · turno ${td.turno} · ${quien(r)}\n`, font: letra(9, GRIS) },
      ];
      if (r.cobro_total != null) lineas.push({ text: `Cobro ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(r.cobro_total))}\n`, font: letra(9.5, TINTA, true) });
      if (r.descripcion) lineas.push({ text: `«${r.descripcion}»\n`, font: letra(9, TINTA, false, true) });
      if (r.ol_nota) lineas.push({ text: `OL: «${r.ol_nota}»\n`, font: letra(9, GRIS, false, true) });
      if (fs.some((x) => x.papel === "descargo")) lineas.push({ text: "Incluye foto del descargo del OL\n", font: letra(8.5, GRIS, false, true) });
      if (enApp > fs.length) lineas.push({ text: `+${enApp - fs.length} foto${enApp - fs.length === 1 ? "" : "s"} más en la app`, font: letra(8.5, GRIS, false, true) });
      row.getCell(1).value = r.codigo; row.getCell(1).font = letra(11, TINTA, true);
      row.getCell(2).value = { richText: lineas };
      row.getCell(3).value = e.txt; row.getCell(3).font = letra(8.5, est.tinta, true); row.getCell(3).fill = relleno(est.fondo);
      for (let c = 1; c <= 6; c++) {
        const cel = row.getCell(c);
        cel.alignment = { vertical: "top", wrapText: true, indent: 1 };
        cel.border = { bottom: raya(GRIS_CLARO) };
      }
      row.getCell(3).alignment = { vertical: "top", horizontal: "center", wrapText: true };
      fs.slice(0, 3).forEach((x, k) => {
        const aw = x.ancho && x.alto ? x.ancho : 4, ah = x.ancho && x.alto ? x.alto : 3;
        const esc = Math.min(262 / aw, 212 / ah);
        const id = wb.addImage({ buffer: x.foto as unknown as BufferDeExcel, extension: x.extension });
        h.addImage(id, { tl: { col: 3 + k + 0.03, row: fila - 1 + 0.03 } as ExcelJS.Anchor, ext: { width: Math.round(aw * esc), height: Math.round(ah * esc) }, editAs: "oneCell" });
      });
    });
    let f = 9 + conFoto.length + 1;
    if (sinFoto.length) {
      const a = h.getCell(f, 1); a.value = "SIN FOTO"; a.font = letra(8.5, ROJO, true);
      h.mergeCells(f, 2, f, 6);
      const b = h.getCell(f, 2); b.value = sinFoto.map((r) => r.codigo).join(", "); b.font = letra(9, TINTA); b.alignment = { wrapText: true, vertical: "top" };
      h.getRow(f).height = Math.min(120, 18 + Math.floor(sinFoto.length / 14) * 14);
      f++;
    }
    h.views = [{ state: "frozen", ySplit: 8, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
