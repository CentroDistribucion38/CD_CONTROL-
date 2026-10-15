/**
 * REVISIÓN AI, EN EXCEL — «quiero poder exportar la data de toda esta revisión, con evidencia de foto y todo».
 *
 * Cuatro hojas, con la misma cara de los libros de CONTROL (banda negra, ojo amarillo, logo):
 *   RESUMEN      los KPI (revisiones, revisadas, defectos que cobran, % AI, no abono) y las barras:
 *                defectos, % AI por socio, por envase, por origen, por tipo, quién revisó, y lo que hay que mirar.
 *   REVISIONES   una fila por revisión con TODO: fecha, turno, clase, placa, material, envase, canal, socio,
 *                recibidas, revisadas, defectos, % AI, no abono, abono SAP, HL, ZCL3, comentarios, quién y cuándo.
 *                La foto salta a su tarjeta en Evidencias.
 *   DEFECTOS     la revisión × cada defecto del maestro, en unidades (los que cobran en rojo).
 *   EVIDENCIAS   una tarjeta por revisión: la ficha con sus defectos y la foto.
 *
 * NADA SE RECALCULA POR REVISIÓN: el índice, el no abono y los HL vienen de `v_sider_ai`. Lo único que se
 * calcula aquí es el % AI del conjunto, que es Σ defectos ÷ Σ revisadas (no el promedio de los índices).
 *
 * Se arma EN EL NAVEGADOR: con fotos, el libro pasa fácil del tope de 4,5 MB de una respuesta del servidor.
 */
import ExcelJS from "exceljs";
import type { Defecto, DetalleAi, Revision } from "./ai";
import { NOMBRE_TIPO, letraTurno, type TipoRevision } from "./comun";

export type RevisionLibro = Revision & { sku?: string | null; material?: string | null; cd_origen?: string | null };
export type FotoRevision = { base64: string; ancho: number; alto: number };

export type InsumosRevisionAi = {
  revisiones: RevisionLibro[];
  detalle: DetalleAi[];
  defectos: Defecto[];
  fotos: Record<string, FotoRevision>;
  /** Revisiones con foto en la app que no se pudieron bajar. */
  fotosFallaron: number;
  nombres: Record<string, string>;
  periodo: string;
  filtros: string;
  quien: string;
};

const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", GRIS_CLARO = "FFB9B9B9";
const FONDO = "FFF6F6F4", RAYA = "FFE3E3E0", ENLACE = "FF1A4FA0", ROJO = "FFC0392B", ROJO_F = "FFFBE0DD", VERDE = "FF1B7A3A";
const TIPO_COLOR: Record<TipoRevision, { fondo: string; tinta: string; barra: string }> = {
  ai: { fondo: "FFEEE6F7", tinta: "FF5B2A86", barra: "FF7B3FB0" },
  sorting: { fondo: "FFFBE4EE", tinta: "FF9D1950", barra: "FFC2185B" },
};
const NUM = "#,##0", DEC = "#,##0.00", PCT = "0.00%";

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
const raya = (argb = RAYA): ExcelJS.Border => ({ style: "thin", color: { argb } });
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
const COL_MS = 5 * 3_600_000;
const aFecha = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) - COL_MS) : null);
const aDia = (dia: string) => new Date(`${dia}T00:00:00Z`);
const barra = (v: number, max: number, largo = 20) => (v > 0 && max > 0 ? "█".repeat(Math.max(1, Math.round((v / max) * largo))) : "");
const vinculo = (hoja: string, celda: string, texto: string) =>
  ({ formula: `HYPERLINK("#'${hoja}'!${celda}","${texto.replace(/"/g, '""')}")`, result: texto });
const tipoDe = (r: Revision): TipoRevision => (r.tipo ?? "ai");
const pct = (n: number) => `${(n * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

async function cargarLogo(wb: ExcelJS.Workbook): Promise<number | null> {
  try {
    const r = await fetch("/marca/logo-b.png");
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = ""; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return wb.addImage({ base64: "data:image/png;base64," + btoa(bin), extension: "png" });
  } catch { return null }
}

function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string, logoId: number | null, logoCol?: number) {
  h.views = [{ showGridLines: false }];
  for (let f = 1; f <= 5; f++) { const r = h.getRow(f); for (let c = 1; c <= ancho; c++) r.getCell(c).fill = relleno(TINTA) }
  h.getRow(1).height = 10; h.getRow(2).height = 16; h.getRow(3).height = 30; h.getRow(4).height = 16; h.getRow(5).height = 10;
  const ojo = h.getCell(2, 2); ojo.value = "SIDER  ·  REVISIÓN AI  ·  CONSOLIDADO"; ojo.font = letra(8.5, BANDA, true);
  const t = h.getCell(3, 2); t.value = titulo; t.font = letra(20, BLANCO, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 2); s.value = sub; s.font = letra(9, GRIS_CLARO);
  const r6 = h.getRow(6); r6.height = 5;
  for (let c = 1; c <= ancho; c++) r6.getCell(c).fill = relleno(BANDA);
  if (logoId != null) h.addImage(logoId, { tl: { col: logoCol ?? ancho - 1.15, row: 1.1 } as ExcelJS.Anchor, ext: { width: 46, height: 46 }, editAs: "oneCell" });
}

type Grupo = { nombre: string; rev: number; revisadas: number; defectos: number; color?: string };
function agrupar(rs: Revision[], clave: (r: Revision) => string, color?: (r: Revision) => string): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const r of rs) {
    const k = clave(r) || "—";
    const g = m.get(k) ?? { nombre: k, rev: 0, revisadas: 0, defectos: 0, color: color?.(r) };
    g.rev++; g.revisadas += Number(r.revisadas) || 0; g.defectos += Number(r.defectos) || 0; m.set(k, g);
  }
  return [...m.values()];
}
const indiceDe = (g: { revisadas: number; defectos: number }) => (g.revisadas > 0 ? g.defectos / g.revisadas : 0);

export async function armarLibroRevisionAi(d: InsumosRevisionAi): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Revisión AI"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = await cargarLogo(wb);

  const todas = [...d.revisiones].sort((a, b) => (b.fecha.localeCompare(a.fecha) || String(b.revisado_en).localeCompare(String(a.revisado_en))));
  const quien = (id: string | null) => (id ? d.nombres[id] ?? "—" : "—");
  const ahora = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const sub = `${d.periodo}${d.filtros ? ` · ${d.filtros}` : ""} · exportó ${d.quien} el ${ahora}`;

  const detDe = new Map<string, DetalleAi[]>();
  for (const x of d.detalle) { const l = detDe.get(x.revision_id) ?? []; l.push(x); detDe.set(x.revision_id, l) }
  const conFoto = todas.filter((r) => d.fotos[r.id]);
  const filaEvid = new Map(todas.map((r, i) => [r.id, 9 + i]));

  const sum = (k: (r: Revision) => number) => todas.reduce((s, r) => s + (Number(k(r)) || 0), 0);
  const T = { recibidas: sum((r) => r.recibidas), revisadas: sum((r) => r.revisadas), defectos: sum((r) => r.defectos),
    otros: sum((r) => r.otros), noAbono: sum((r) => r.no_abono), abono: sum((r) => r.abono_sap), hl: sum((r) => r.hl_defectos) };
  const indice = T.revisadas > 0 ? T.defectos / T.revisadas : 0;
  const nCert = todas.filter((r) => tipoDe(r) === "ai").length;

  /* ======================= 1 · RESUMEN ======================= */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    const W = 12;
    h.columns = [2, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 2].map((w) => ({ width: w }));
    banda(h, W, "Revisión AI · todo lo revisado", sub, logoId);

    const fichas: { rot: string; num: number; fmt: string; pie: string; amarilla?: boolean; roja?: boolean }[] = [
      { rot: "REVISIONES", num: todas.length, fmt: NUM, pie: `${nCert} certificada${nCert === 1 ? "" : "s"} · ${todas.length - nCert} normal${todas.length - nCert === 1 ? "" : "es"}`, amarilla: true },
      { rot: "REVISADAS", num: T.revisadas, fmt: NUM, pie: `de ${T.recibidas.toLocaleString("es-CO")} recibidas` },
      { rot: "DEFECTOS QUE COBRAN", num: T.defectos, fmt: NUM, pie: `+ ${T.otros.toLocaleString("es-CO")} que no cobran` },
      { rot: "% AI", num: indice, fmt: PCT, pie: "defectos ÷ revisadas", roja: indice > 0.05 },
      { rot: "NO ABONO", num: T.noAbono, fmt: NUM, pie: `${T.hl.toLocaleString("es-CO", { maximumFractionDigits: 2 })} HL en defectos` },
    ];
    const pares: [number, number][] = [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
    h.getRow(8).height = 16; h.getRow(9).height = 34; h.getRow(10).height = 16;
    fichas.forEach((f, i) => {
      const [c1, c2] = pares[i];
      for (const fila of [8, 9, 10]) {
        h.mergeCells(fila, c1, fila, c2);
        const cel = h.getCell(fila, c1);
        cel.fill = relleno(f.amarilla ? BANDA : FONDO);
        cel.border = { left: { style: "thick", color: { argb: BLANCO } } };
        cel.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      }
      h.getCell(8, c1).value = f.rot; h.getCell(8, c1).font = letra(8, f.amarilla ? TINTA : GRIS, true);
      const n = h.getCell(9, c1); n.value = f.num; n.numFmt = f.fmt; n.font = letra(22, f.roja ? ROJO : TINTA, true);
      h.getCell(10, c1).value = f.pie; h.getCell(10, c1).font = letra(8.5, f.amarilla ? TINTA : GRIS);
      h.getCell(8, c1).border = { top: { style: "medium", color: { argb: f.roja ? ROJO : TINTA } }, left: { style: "thick", color: { argb: BLANCO } } };
    });

    type Item = { nombre: string; v: number; pie?: string; color?: string };
    const panel = (fila: number, c: number, titulo: string, cab: string, items: Item[], fmt: string, colorBarra: string, tope = 10, ordenar = true) => {
      const t = h.getCell(fila, c); t.value = titulo; t.font = letra(8.5, TINTA, true); t.alignment = { indent: c > 2 ? 1 : 0 };
      const k = h.getCell(fila, c + 4); k.value = cab; k.font = letra(8, GRIS, true); k.alignment = { horizontal: "right" };
      for (let x = c; x <= c + 4; x++) h.getCell(fila, x).border = { bottom: { style: "medium", color: { argb: TINTA } } };
      const lista = ordenar ? [...items].sort((a, b) => b.v - a.v) : items;
      const vis = lista.slice(0, tope);
      const max = Math.max(1e-9, ...vis.map((x) => x.v));
      vis.forEach((x, i) => {
        const f = fila + 1 + i;
        h.getRow(f).height = 17;
        h.mergeCells(f, c, f, c + 1);
        const nom = h.getCell(f, c); nom.value = x.pie ? { richText: [{ text: x.nombre, font: letra(9.5, TINTA) }, { text: `  ${x.pie}`, font: letra(8, GRIS) }] } : x.nombre;
        if (!x.pie) nom.font = letra(9.5, TINTA);
        nom.alignment = { vertical: "middle", shrinkToFit: true, indent: c > 2 ? 1 : 0 };
        h.mergeCells(f, c + 2, f, c + 3);
        const b = h.getCell(f, c + 2); b.value = barra(x.v, max); b.font = letra(9, x.color ?? colorBarra); b.alignment = { vertical: "middle" };
        const v = h.getCell(f, c + 4); v.value = x.v; v.numFmt = fmt; v.font = letra(9.5, TINTA, true); v.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        for (let z = c; z <= c + 4; z++) h.getCell(f, z).border = { bottom: raya() };
      });
      if (!vis.length) { const v = h.getCell(fila + 1, c); v.value = "Nada en lo exportado."; v.font = letra(9, GRIS, false, true) }
      if (c > 2) for (let f = fila; f <= fila + Math.max(1, vis.length); f++) {
        const cel = h.getCell(f, c); cel.border = { ...(cel.border ?? {}), left: { style: "thick", color: { argb: BLANCO } } };
      }
      return fila + 1 + Math.max(1, vis.length);
    };
    const comoIndice = (gs: Grupo[]): Item[] => gs.map((g) => ({ nombre: g.nombre, v: indiceDe(g), pie: `${g.rev} rev.` }));

    /* Defectos por unidades, del maestro (los que cobran en rojo). */
    const porDefecto = new Map<string, Item>();
    for (const x of d.detalle) {
      const it = porDefecto.get(x.defecto) ?? { nombre: x.defecto_nombre, v: 0, color: x.cobra ? ROJO : GRIS };
      it.v += Number(x.unidades) || 0; porDefecto.set(x.defecto, it);
    }
    const porTipo: Item[] = (["ai", "sorting"] as TipoRevision[]).map((t) => {
      const rs = todas.filter((r) => tipoDe(r) === t);
      const g = { revisadas: rs.reduce((s, r) => s + Number(r.revisadas), 0), defectos: rs.reduce((s, r) => s + Number(r.defectos), 0) };
      return { nombre: NOMBRE_TIPO[t], v: indiceDe(g), pie: `${rs.length} rev.`, color: TIPO_COLOR[t].barra };
    });

    let f1 = 12, f2 = 12;
    f1 = panel(f1, 2, "DEFECTOS (ROJO = COBRA)", "UNIDADES", [...porDefecto.values()].filter((x) => x.v > 0), NUM, ROJO, 12);
    f2 = panel(f2, 7, "% AI POR CLASE", "% AI", porTipo, PCT, TINTA, 2, false);
    f2 = panel(f2 + 1, 7, "% AI POR SOCIO", "% AI", comoIndice(agrupar(todas, (r) => r.socio_nombre ?? r.socio ?? "Sin socio")), PCT, "FF8A6200", 8);
    f1 = Math.max(f1, f2) + 1; f2 = f1;
    f1 = panel(f1, 2, "% AI POR ENVASE", "% AI", comoIndice(agrupar(todas, (r) => r.envase_nombre ?? r.envase)), PCT, TINTA);
    f2 = panel(f2, 7, "% AI POR ORIGEN (PLANTA)", "% AI", comoIndice(agrupar(todas, (r) => r.planta)), PCT, TINTA);
    f1 = Math.max(f1, f2) + 1; f2 = f1;
    f1 = panel(f1, 2, "% AI POR CANAL", "% AI", comoIndice(agrupar(todas, (r) => r.canal_nombre ?? r.canal)), PCT, GRIS);
    f2 = panel(f2, 7, "QUIÉN REVISÓ", "REVISIONES", agrupar(todas, (r) => quien(r.revisado_por)).map((g) => ({ nombre: g.nombre, v: g.rev })), NUM, GRIS);
    let f = Math.max(f1, f2) + 1;

    /* ---- PARA MIRAR ---- */
    const peores = [...todas].filter((r) => Number(r.revisadas) > 0).sort((a, b) => Number(b.indice) - Number(a.indice)).slice(0, 5).filter((r) => Number(r.indice) > 0);
    const sinFoto = todas.filter((r) => !d.fotos[r.id]);
    const corregidas = todas.filter((r) => Number(r.ediciones) > 0);
    const mirar: [string, string, boolean][] = [
      ["Las 5 con el % AI más alto", peores.map((r) => `${r.placa} ${pct(Number(r.indice))}`).join(" · ") || "Ninguna ✓", peores.length > 0],
      ["Sin foto de evidencia", sinFoto.length ? `${sinFoto.length}: ${sinFoto.map((r) => r.placa).join(", ")}` : "Ninguna ✓", sinFoto.length > 0],
      ["Corregidas después de cerrar", corregidas.length ? `${corregidas.length}: ${corregidas.map((r) => `${r.placa} (${r.ediciones})`).join(", ")}` : "Ninguna ✓", corregidas.length > 0],
    ];
    const t = h.getCell(f, 2); t.value = "PARA MIRAR"; t.font = letra(8.5, ROJO, true);
    for (let x = 2; x <= 11; x++) h.getCell(f, x).border = { bottom: { style: "medium", color: { argb: ROJO } } };
    f++;
    for (const [txt, val, malo] of mirar) {
      h.getRow(f).height = val.length > 110 ? 32 : 18;
      h.mergeCells(f, 2, f, 4);
      const a = h.getCell(f, 2); a.value = txt; a.font = letra(9.5, TINTA, malo); a.alignment = { vertical: "middle", wrapText: true };
      h.mergeCells(f, 5, f, 11);
      const b = h.getCell(f, 5); b.value = val; b.font = letra(9, malo ? ROJO : VERDE, malo); b.alignment = { vertical: "middle", wrapText: true };
      for (let z = 2; z <= 11; z++) h.getCell(f, z).border = { bottom: raya() };
      f++;
    }
    f++;
    const nota = h.getCell(f, 2);
    nota.value = "% AI = defectos que cobran ÷ unidades revisadas (del conjunto, no el promedio de los índices). No abono = recibidas × % AI de cada revisión. Certificada = camión de Sider que el administrador pidió revisar; normal = Vh Interno creado por control.";
    h.mergeCells(f, 2, f, 11); nota.font = letra(8.5, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top" }; h.getRow(f).height = 30;
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 } };
  }

  /* ======================= 2 · REVISIONES ======================= */
  {
    const h = wb.addWorksheet("Revisiones", { properties: { tabColor: { argb: TINTA } } });
    const C: [string, number][] = [
      ["Fecha", 10], ["Turno", 7], ["Clase", 12], ["Placa", 10], ["Origen", 20], ["SKU", 10], ["Material", 28],
      ["Envase", 18], ["Canal", 14], ["Socio", 22], ["Recibidas", 10], ["Revisadas", 10], ["Defectos (cobran)", 11],
      ["Otros (no cobran)", 11], ["% AI", 9], ["No abono", 10], ["Abono SAP", 10], ["HL defectos", 10], ["ZCL3", 12],
      ["Revisó", 14], ["Cerró", 15], ["Correcciones", 10], ["Foto", 9], ["Comentarios", 40],
    ];
    const N = C.length;
    h.columns = C.map(([, w]) => ({ width: w }));
    banda(h, N, `Revisiones · ${todas.length}`, sub, logoId);
    const nums = [11, 12, 13, 14, 15, 16, 17, 18, 22];
    const cab = h.getRow(8); cab.height = 30;
    C.forEach(([t], i) => {
      const c = cab.getCell(i + 1); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA);
      c.alignment = { vertical: "middle", horizontal: nums.includes(i + 1) ? "right" : "left", wrapText: true, indent: 1 };
    });
    todas.forEach((r, i) => {
      const fila = 9 + i;
      const row = h.getRow(fila);
      const tp = tipoDe(r);
      row.values = [
        aDia(r.fecha), letraTurno(r.turno), NOMBRE_TIPO[tp], r.placa, r.cd_origen ? `${r.planta} · ${r.cd_origen}` : r.planta, r.sku ?? "", r.material ?? "",
        r.envase_nombre ?? r.envase, r.canal_nombre ?? r.canal, r.socio_nombre ?? r.socio ?? "",
        Number(r.recibidas) || 0, Number(r.revisadas) || 0, Number(r.defectos) || 0, Number(r.otros) || 0, Number(r.indice) || 0,
        Number(r.no_abono) || 0, Number(r.abono_sap) || 0, Number(r.hl_defectos) || 0, r.zcl3 ?? "",
        quien(r.revisado_por), aFecha(r.revisado_en), Number(r.ediciones) || 0, "", r.comentarios ?? "",
      ];
      row.height = 18;
      for (let c = 1; c <= N; c++) {
        const cel = row.getCell(c);
        cel.font = letra(9.5, TINTA);
        cel.border = { bottom: raya() };
        cel.alignment = { vertical: "middle", horizontal: nums.includes(c) ? "right" : "left", indent: 1 };
        if (i % 2 === 1) cel.fill = relleno(FONDO);
      }
      row.getCell(1).numFmt = "dd/mm/yy"; row.getCell(21).numFmt = "dd/mm/yy hh:mm";
      for (const c of [11, 12, 13, 14, 16, 17, 22]) row.getCell(c).numFmt = NUM;
      row.getCell(15).numFmt = PCT; row.getCell(18).numFmt = DEC;
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(4).font = letra(9.5, TINTA, true);
      const tc = TIPO_COLOR[tp]; row.getCell(3).fill = relleno(tc.fondo); row.getCell(3).font = letra(8.5, tc.tinta, true);
      if (Number(r.indice) > 0.05) { row.getCell(15).font = letra(9.5, ROJO, true); row.getCell(15).fill = relleno(ROJO_F) }
      else row.getCell(15).font = letra(9.5, TINTA, true);
      const fe = filaEvid.get(r.id);
      if (d.fotos[r.id] && fe) { row.getCell(23).value = vinculo("Evidencias", `A${fe}`, "Ver ↗"); row.getCell(23).font = letra(9.5, ENLACE, true) }
      else { row.getCell(23).value = "Sin foto"; row.getCell(23).font = letra(9, GRIS, false, true) }
      if (Number(r.ediciones) > 0) row.getCell(22).font = letra(9.5, ROJO, true);
    });
    const ult = 8 + todas.length;
    const tot = h.getRow(ult + 1); tot.height = 22;
    for (let c = 1; c <= N; c++) { const cel = tot.getCell(c); cel.fill = relleno(BANDA); cel.font = letra(9.5, TINTA, true); cel.border = { top: { style: "medium", color: { argb: TINTA } } } }
    tot.getCell(1).value = "TOTAL (lo filtrado)";
    const tv: Record<number, number> = { 11: T.recibidas, 12: T.revisadas, 13: T.defectos, 14: T.otros, 16: T.noAbono, 17: T.abono, 18: T.hl };
    for (const [c, v] of Object.entries(tv)) {
      const n = Number(c);
      const cel = tot.getCell(n); cel.value = { formula: `SUBTOTAL(109,${col(n)}9:${col(n)}${Math.max(9, ult)})`, result: v };
      cel.numFmt = n === 18 ? DEC : NUM; cel.alignment = { horizontal: "right", vertical: "middle" };
    }
    const ci = tot.getCell(15); ci.value = { formula: `IFERROR(M${ult + 1}/L${ult + 1},0)`, result: indice }; ci.numFmt = PCT; ci.alignment = { horizontal: "right", vertical: "middle" };
    h.autoFilter = `A8:${col(N)}${Math.max(9, ult)}`;
    h.views = [{ state: "frozen", xSplit: 4, ySplit: 8, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "8:8" };
  }

  /* ======================= 3 · DEFECTOS (revisión × defecto) ======================= */
  {
    const h = wb.addWorksheet("Defectos", { properties: { tabColor: { argb: ROJO } } });
    const usados = new Set(d.detalle.filter((x) => Number(x.unidades) > 0).map((x) => x.defecto));
    const defs = [...d.defectos].filter((x) => x.activo || usados.has(x.clave))
      .sort((a, b) => (a.cobra === b.cobra ? (a.orden ?? 999) - (b.orden ?? 999) : a.cobra ? -1 : 1));
    /* Defectos que vienen en el detalle pero ya no están en el maestro activo. */
    for (const x of d.detalle) if (!defs.some((y) => y.clave === x.defecto)) defs.push({ clave: x.defecto, nombre: x.defecto_nombre, cobra: x.cobra, orden: x.orden, activo: false });
    const base: [string, number][] = [["Fecha", 10], ["Clase", 12], ["Placa", 10], ["Envase", 18], ["Revisadas", 10]];
    const N = base.length + defs.length + 2;
    h.columns = [...base.map(([, w]) => ({ width: w })), ...defs.map(() => ({ width: 11 })), { width: 11 }, { width: 9 }];
    banda(h, N, "Defectos por revisión (unidades)", `${sub} · rojo = cobra, gris = se cuenta pero no cobra`, logoId);
    const cab = h.getRow(8); cab.height = 44;
    [...base.map(([t]) => t), ...defs.map((x) => x.nombre), "Total cobran", "% AI"].forEach((t, i) => {
      const c = cab.getCell(i + 1); c.value = t;
      const dfx = defs[i - base.length];
      c.fill = relleno(dfx ? (dfx.cobra ? ROJO : "FF8C8C8C") : TINTA);
      c.font = letra(8.5, BLANCO, true);
      c.alignment = { vertical: "middle", horizontal: i >= 4 ? "center" : "left", wrapText: true, indent: i < 4 ? 1 : 0 };
    });
    todas.forEach((r, i) => {
      const fila = 9 + i;
      const row = h.getRow(fila);
      const m = new Map((detDe.get(r.id) ?? []).map((x) => [x.defecto, Number(x.unidades) || 0]));
      const tp = tipoDe(r);
      row.values = [aDia(r.fecha), NOMBRE_TIPO[tp], r.placa, r.envase_nombre ?? r.envase, Number(r.revisadas) || 0,
        ...defs.map((x) => m.get(x.clave) || null), Number(r.defectos) || 0, Number(r.indice) || 0];
      row.height = 17;
      for (let c = 1; c <= N; c++) {
        const cel = row.getCell(c); cel.font = letra(9.5, TINTA); cel.border = { bottom: raya() };
        cel.alignment = { vertical: "middle", horizontal: c >= 5 ? "center" : "left", indent: c < 5 ? 1 : 0 };
        if (i % 2 === 1) cel.fill = relleno(FONDO);
        if (c >= 5) cel.numFmt = NUM;
      }
      row.getCell(1).numFmt = "dd/mm/yy"; row.getCell(3).font = letra(9.5, TINTA, true);
      const tc = TIPO_COLOR[tp]; row.getCell(2).fill = relleno(tc.fondo); row.getCell(2).font = letra(8.5, tc.tinta, true);
      defs.forEach((x, k) => { const v = m.get(x.clave); if (v) row.getCell(base.length + 1 + k).font = letra(9.5, x.cobra ? ROJO : TINTA, true) });
      row.getCell(N - 1).font = letra(9.5, TINTA, true);
      row.getCell(N).numFmt = PCT; row.getCell(N).font = letra(9.5, Number(r.indice) > 0.05 ? ROJO : TINTA, true);
    });
    const ult = 8 + todas.length;
    const tot = h.getRow(ult + 1); tot.height = 22;
    for (let c = 1; c <= N; c++) { const cel = tot.getCell(c); cel.fill = relleno(BANDA); cel.font = letra(9.5, TINTA, true); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.alignment = { horizontal: c >= 5 ? "center" : "left", vertical: "middle" } }
    tot.getCell(1).value = "TOTAL";
    for (let c = 5; c <= N - 1; c++) {
      const cel = tot.getCell(c); cel.value = { formula: `SUBTOTAL(109,${col(c)}9:${col(c)}${Math.max(9, ult)})` }; cel.numFmt = NUM;
    }
    const ci = tot.getCell(N); ci.value = { formula: `IFERROR(${col(N - 1)}${ult + 1}/E${ult + 1},0)`, result: indice }; ci.numFmt = PCT;
    /* La fila de % de cada defecto sobre lo revisado. */
    const pr = h.getRow(ult + 2); pr.height = 18;
    pr.getCell(1).value = "% sobre revisadas"; pr.getCell(1).font = letra(9, GRIS, true, true);
    for (let c = base.length + 1; c <= N - 1; c++) {
      const cel = pr.getCell(c); cel.value = { formula: `IFERROR(${col(c)}${ult + 1}/$E$${ult + 1},0)` }; cel.numFmt = PCT; cel.font = letra(9, GRIS, false, true); cel.alignment = { horizontal: "center" };
    }
    h.autoFilter = `A8:${col(N)}${Math.max(9, ult)}`;
    h.views = [{ state: "frozen", xSplit: 3, ySplit: 8, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "8:8" };
  }

  /* ======================= 4 · EVIDENCIAS ======================= */
  {
    const h = wb.addWorksheet("Evidencias", { properties: { tabColor: { argb: "FF7B3FB0" } } });
    /* A placa · B ficha · C defectos · D foto (≈ 360 px). */
    h.columns = [13, 46, 34, 52].map((w) => ({ width: w }));
    banda(h, 4, `Evidencias · ${conFoto.length} foto${conFoto.length === 1 ? "" : "s"}`,
      `${todas.length - conFoto.length} ${todas.length - conFoto.length === 1 ? "revisión" : "revisiones"} sin foto${d.fotosFallaron ? ` · ${d.fotosFallaron} no se pudieron bajar (se ven en la app)` : ""} · ${sub}`, logoId, 3.82);
    const cab = h.getRow(8); cab.height = 24;
    ["Placa", "Ficha", "Defectos encontrados", "Foto"].forEach((t, i) => {
      const c = cab.getCell(i + 1); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA); c.alignment = { vertical: "middle", indent: 1 };
    });
    todas.forEach((r, i) => {
      const fila = 9 + i;
      const row = h.getRow(fila);
      const foto = d.fotos[r.id];
      row.height = foto ? 200 : 96;
      const tp = tipoDe(r); const tc = TIPO_COLOR[tp];
      const ficha: ExcelJS.RichText[] = [
        { text: `${NOMBRE_TIPO[tp].toUpperCase()}\n`, font: letra(8.5, tc.tinta, true) },
        { text: `${r.material ?? r.envase_nombre ?? r.envase}\n`, font: letra(10.5, TINTA, true) },
        { text: `${r.sku ? `${r.sku} · ` : ""}${r.envase_nombre ?? r.envase}\n`, font: letra(9, GRIS) },
        { text: `${r.fecha.split("-").reverse().join("/")} · turno ${letraTurno(r.turno)} · ${r.planta}\n`, font: letra(9, GRIS) },
        { text: `${r.canal_nombre ?? r.canal}${r.socio_nombre ? ` · ${r.socio_nombre}` : ""}\n`, font: letra(9.5, TINTA) },
        { text: `% AI ${pct(Number(r.indice))}`, font: letra(11, Number(r.indice) > 0.05 ? ROJO : TINTA, true) },
        { text: `  ·  ${Number(r.defectos).toLocaleString("es-CO")} de ${Number(r.revisadas).toLocaleString("es-CO")} revisadas · no abono ${Number(r.no_abono).toLocaleString("es-CO")}\n`, font: letra(9.5, TINTA) },
        { text: `Revisó ${quien(r.revisado_por)} · ${new Date(r.revisado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${Number(r.ediciones) > 0 ? ` · corregida ${r.ediciones}×` : ""}\n`, font: letra(9, GRIS) },
      ];
      if (r.zcl3) ficha.push({ text: `ZCL3 ${r.zcl3}\n`, font: letra(9, GRIS) });
      if (r.comentarios) ficha.push({ text: `«${r.comentarios}»`, font: letra(9, TINTA, false, true) });
      const dets = (detDe.get(r.id) ?? []).filter((x) => Number(x.unidades) > 0).sort((a, b) => (a.cobra === b.cobra ? Number(b.unidades) - Number(a.unidades) : a.cobra ? -1 : 1));
      const lista: ExcelJS.RichText[] = dets.length
        ? dets.flatMap((x) => [
          { text: `${x.cobra ? "●" : "○"} ${x.defecto_nombre}`, font: letra(9.5, x.cobra ? ROJO : GRIS, x.cobra) },
          { text: `  ${Number(x.unidades).toLocaleString("es-CO")} · ${pct(Number(x.pct))}\n`, font: letra(9, TINTA) },
        ])
        : [{ text: "Sin defectos marcados ✓", font: letra(9.5, VERDE, true) }];
      row.getCell(1).value = r.placa; row.getCell(1).font = letra(12, TINTA, true);
      row.getCell(2).value = { richText: ficha };
      row.getCell(3).value = { richText: lista };
      if (!foto) { row.getCell(4).value = "Sin foto de evidencia"; row.getCell(4).font = letra(9, GRIS, false, true) }
      for (let c = 1; c <= 4; c++) {
        const cel = row.getCell(c);
        cel.alignment = { vertical: "top", wrapText: true, indent: 1 };
        cel.border = { bottom: raya(GRIS_CLARO) };
      }
      row.getCell(1).border = { bottom: raya(GRIS_CLARO), left: { style: "thick", color: { argb: tc.barra } } };
      if (foto) {
        const esc = Math.min(362 / foto.ancho, 254 / foto.alto);
        const id = wb.addImage({ base64: foto.base64, extension: "jpeg" });
        h.addImage(id, { tl: { col: 3 + 0.04, row: fila - 1 + 0.04 } as ExcelJS.Anchor, ext: { width: Math.round(foto.ancho * esc), height: Math.round(foto.alto * esc) }, editAs: "oneCell" });
      }
    });
    h.views = [{ state: "frozen", ySplit: 8, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
