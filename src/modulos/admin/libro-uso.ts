/**
 * EL EXCEL DE «USO DE LA APP» — con el sello, la banda y los colores del
 * tema de quien exporta.
 *
 *   Resumen      cuatro cifras y una fila por persona (también quien no entró)
 *   Por módulo   visitas de cada persona a cada módulo
 *   Por día      minutos activos de cada persona, día por día
 *   Pantallas    cada pantalla que abrió cada persona: veces, minutos, última vez
 *
 * Se arma en el navegador con lo que la pantalla tiene a la vista (el
 * periodo y los filtros elegidos). Nada de aquí lee la base.
 */
import ExcelJS from "exceljs";

import { BLANCO, MONO, VERDE, cabecera, hoy, letra, paleta, relleno, type Paleta } from "./libro-accesos";
import type { ColoresLibro } from "./colores-rol";
import { diasDelRango, duracion, moduloTop, nombreModulo, nombrePantalla, num, type UsoDia, type UsoPantalla, type UsoUsuario } from "@/modulos/uso/uso";

export type PersonaUso = UsoUsuario & { rolNombre: string };

const ROJO = "FFE4002B";
const nom = (p: { nombre: string | null; usuario: string | null }) => p.nombre || p.usuario || "—";
const dd = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}` };
const dm = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}` };

export async function armarUso(o: {
  desde: string; hasta: string; filtro?: string;
  personas: PersonaUso[]; dias: UsoDia[]; pantallas: UsoPantalla[];
  sello: ArrayBuffer | Uint8Array | null; colores?: ColoresLibro; quien?: string;
}): Promise<ArrayBuffer> {
  const P = paleta(o.colores);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Uso de la app"; wb.created = new Date();
  const sello = o.sello ? wb.addImage({ buffer: o.sello as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const ps = o.personas;
  const porId = new Map(ps.map((p) => [p.id, p]));
  const dias = diasDelRango(o.desde, o.hasta);
  const sub = `${dd(o.desde)} → ${dd(o.hasta)}  ·  ${dias.length} días  ·  ${ps.length} ${ps.length === 1 ? "persona" : "personas"}${o.filtro ? `  ·  ${o.filtro}` : ""}  ·  generado ${hoy(new Date())}`;

  const volver = (h: ExcelJS.Worksheet) => {
    h.getRow(5).height = 16;
    const v = h.getCell(5, 3); v.value = { formula: `HYPERLINK("#'Resumen'!A1","← volver al resumen")`, result: "← volver al resumen" };
    v.font = letra(9, "FF0563C1", false, { underline: true });
  };
  const encabezado = (h: ExcelJS.Worksheet, fila: number, cols: string[], desde = 2) => {
    h.getRow(fila).height = 24;
    cols.forEach((t, i) => { const c = h.getCell(fila, desde + i); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(P.TINTA); c.alignment = { vertical: "middle", indent: 1, wrapText: true } });
  };
  const celda = (h: ExcelJS.Worksheet, f: number, c: number, v: ExcelJS.CellValue, i: number, o2: { bold?: boolean; der?: boolean; mono?: boolean; fmt?: string; color?: string } = {}) => {
    const x = h.getCell(f, c); x.value = v;
    x.font = letra(10, o2.color ?? P.TINTA, !!o2.bold, o2.mono ? { name: MONO } : {});
    x.alignment = { vertical: "middle", indent: 1, horizontal: o2.der ? "right" : "left" };
    x.border = { bottom: { style: "thin", color: { argb: P.LINEA } } };
    if (o2.fmt) x.numFmt = o2.fmt;
    if (i % 2 === 1) x.fill = relleno(P.FONDO);
  };

  /* ---------- RESUMEN ---------- */
  const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: P.BANDA } } });
  const COL = ["Persona", "Usuario", "Rol", "Último uso", "Días con uso", "Visitas", "Minutos activos", "Tiempo activo", "Módulo que más usa"];
  const ANCHO = [2, 28, 18, 18, 20, 13, 11, 14, 14, 26, 2];
  h.columns = ANCHO.map((w) => ({ width: w }));
  cabecera(h, P, sello, "Uso de CONTROL", sub, ANCHO.length);
  h.getRow(5).height = 16;
  [["Por módulo", 3], ["Por día", 5], ["Pantallas", 7]].forEach(([t, c], k) => {
    const x = h.getCell(5, (c as number) + (k === 0 ? 0 : 0)); x.value = { formula: `HYPERLINK("#'${t}'!A1","→ ${t}")`, result: `→ ${t}` };
    x.font = letra(9, "FF0563C1", false, { underline: true });
  });
  const usaron = ps.filter((p) => p.visitas > 0).length, sin = ps.length - usaron;
  const totVis = ps.reduce((s, p) => s + p.visitas, 0), totMin = ps.reduce((s, p) => s + num(p.minutos), 0);
  const cifras: [string, string | number, string][] = [
    ["ENTRARON", `${usaron} de ${ps.length}`, P.BANDA], ["VISITAS", totVis, P.BANDA],
    ["TIEMPO ACTIVO", duracion(totMin), P.BANDA], ["NO LA USAN", sin, sin ? ROJO : VERDE]];
  h.getRow(6).height = 15; h.getRow(7).height = 30; h.getRow(8).height = 12;
  const pares = [[2, 3], [4, 5], [6, 8], [9, 11 - 1]];
  cifras.forEach(([t, v, raya], i) => {
    const [a, b] = pares[i];
    h.mergeCells(6, a, 6, b); h.mergeCells(7, a, 7, b);
    for (let c = a; c <= b; c++) { h.getCell(6, c).fill = relleno(P.FONDO); h.getCell(7, c).fill = relleno(P.FONDO) }
    const lado: Partial<ExcelJS.Borders> = { left: { style: "thick", color: { argb: raya } }, right: { style: "thick", color: { argb: BLANCO } } };
    const x = h.getCell(6, a); x.value = t; x.font = letra(7.5, P.GRIS, true); x.alignment = { indent: 1, vertical: "bottom" }; x.border = lado;
    const y = h.getCell(7, a); y.value = v; y.font = letra(20, P.TINTA, true); y.alignment = { indent: 1, vertical: "middle", horizontal: "left" }; y.border = lado;
  });
  const F0 = 9;
  encabezado(h, F0, COL);
  ps.forEach((p, i) => {
    const f = F0 + 1 + i; h.getRow(f).height = 21;
    const top = moduloTop(p.modulos);
    celda(h, f, 2, nom(p), i, { bold: true });
    celda(h, f, 3, p.usuario ?? "—", i, { mono: true });
    celda(h, f, 4, p.rolNombre, i);
    celda(h, f, 5, p.ultimo_uso ? new Date(p.ultimo_uso) : "Nunca ha entrado", i, { fmt: "dd/mm/yyyy hh:mm", color: p.ultimo_uso ? P.TINTA : ROJO, bold: !p.ultimo_uso });
    celda(h, f, 6, p.dias_activos, i, { der: true });
    celda(h, f, 7, p.visitas, i, { der: true });
    celda(h, f, 8, num(p.minutos), i, { der: true, fmt: "0.0" });
    celda(h, f, 9, duracion(num(p.minutos)), i, { der: true });
    celda(h, f, 10, top ? nombreModulo(top) : "—", i);
  });
  const fin = F0 + ps.length;
  h.autoFilter = { from: { row: F0, column: 2 }, to: { row: F0, column: 10 } };
  h.views = [{ showGridLines: false, state: "frozen", ySplit: F0 }];
  const N0 = fin + 2;
  const notas = ["CÓMO LEERLO",
    "• Visitas: cada pantalla que la persona abrió. Días con uso: en cuántos días del periodo entró al menos una vez (día de Colombia).",
    "• Tiempo activo: solo suma los momentos en que la pantalla estaba a la vista y la persona la estaba usando; una pestaña olvidada abierta no cuenta.",
    "• Se anota dónde estuvo cada persona, nunca lo que escribió ni lo que vio. Lo anterior al día en que se activó el registro no se puede reconstruir.",
    "• «Nunca ha entrado» significa que no hay ninguna visita anotada desde que se activó el registro."];
  notas.forEach((t, k) => { const c = h.getCell(N0 + k, 2); c.value = t; c.font = k === 0 ? letra(9, P.GRIS, true) : letra(9.5, P.GRIS) });

  /* ---------- POR MÓDULO ---------- */
  const hm = wb.addWorksheet("Por módulo", { properties: { tabColor: { argb: P.SUAVE } } });
  const tot: Record<string, number> = {};
  for (const p of ps) for (const [k, n] of Object.entries(p.modulos ?? {})) tot[k] = (tot[k] ?? 0) + n;
  const mods = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
  const anchoM = [2, 28, 18, ...mods.map(() => 14), 12, 2];
  hm.columns = anchoM.map((w) => ({ width: w }));
  cabecera(hm, P, sello, "Visitas por módulo", sub, anchoM.length); volver(hm);
  const FM = 7;
  encabezado(hm, FM, ["Persona", "Rol", ...mods.map(nombreModulo), "Total"]);
  ps.forEach((p, i) => {
    const f = FM + 1 + i; hm.getRow(f).height = 20;
    celda(hm, f, 2, nom(p), i, { bold: true }); celda(hm, f, 3, p.rolNombre, i);
    mods.forEach((m, k) => celda(hm, f, 4 + k, p.modulos?.[m] || null, i, { der: true }));
    const l1 = hm.getColumn(4).letter, l2 = hm.getColumn(3 + mods.length).letter;
    celda(hm, f, 4 + mods.length, mods.length ? { formula: `SUM(${l1}${f}:${l2}${f})`, result: p.visitas } : p.visitas, i, { der: true, bold: true });
  });
  const fT = FM + 1 + ps.length; hm.getRow(fT).height = 22;
  celda(hm, fT, 2, "TOTAL", 0, { bold: true }); celda(hm, fT, 3, "", 0);
  mods.forEach((m, k) => {
    const l = hm.getColumn(4 + k).letter;
    celda(hm, fT, 4 + k, ps.length ? { formula: `SUM(${l}${FM + 1}:${l}${fT - 1})`, result: tot[m] } : 0, 0, { der: true, bold: true });
  });
  celda(hm, fT, 4 + mods.length, totVis, 0, { der: true, bold: true });
  for (let c = 2; c <= 4 + mods.length; c++) { const x = hm.getCell(fT, c); x.fill = relleno(P.PAGINA); x.border = { top: { style: "medium", color: { argb: P.TINTA } } } }
  hm.views = [{ showGridLines: false, state: "frozen", xSplit: 3, ySplit: FM }];

  /* ---------- POR DÍA ---------- */
  const hd = wb.addWorksheet("Por día", { properties: { tabColor: { argb: P.SUAVE } } });
  const anchoD = [2, 28, 18, ...dias.map(() => 6.2), 12, 2];
  hd.columns = anchoD.map((w) => ({ width: w }));
  cabecera(hd, P, sello, "Minutos activos por día", sub, anchoD.length); volver(hd);
  encabezado(hd, FM, ["Persona", "Rol", ...dias.map(dm), "Total (min)"]);
  hd.getRow(FM).height = 30;
  const mapa = new Map<string, number>();
  for (const d of o.dias) mapa.set(d.usuario + "|" + d.dia, num(d.minutos));
  ps.forEach((p, i) => {
    const f = FM + 1 + i; hd.getRow(f).height = 20;
    celda(hd, f, 2, nom(p), i, { bold: true }); celda(hd, f, 3, p.rolNombre, i);
    dias.forEach((d, k) => {
      const m = mapa.get(p.id + "|" + d) ?? 0;
      celda(hd, f, 4 + k, m || null, i, { der: true, fmt: "0.#" });
      if (m > 0) { const x = hd.getCell(f, 4 + k); x.fill = relleno(P.SUAVE); x.font = letra(9, P.HONDO, true) }
    });
    const l1 = hd.getColumn(4).letter, l2 = hd.getColumn(3 + dias.length).letter;
    celda(hd, f, 4 + dias.length, dias.length ? { formula: `SUM(${l1}${f}:${l2}${f})`, result: num(p.minutos) } : 0, i, { der: true, bold: true, fmt: "0.0" });
  });
  hd.views = [{ showGridLines: false, state: "frozen", xSplit: 3, ySplit: FM }];

  /* ---------- PANTALLAS ---------- */
  const hp = wb.addWorksheet("Pantallas", { properties: { tabColor: { argb: P.SUAVE } } });
  const anchoP = [2, 28, 18, 38, 34, 10, 12, 20, 2];
  hp.columns = anchoP.map((w) => ({ width: w }));
  cabecera(hp, P, sello, "Pantallas que abre cada persona", sub, anchoP.length); volver(hp);
  encabezado(hp, FM, ["Persona", "Módulo", "Pantalla", "Ruta", "Veces", "Minutos activos", "Última vez"]);
  const filas = o.pantallas.filter((x) => porId.has(x.usuario))
    .sort((a, b) => nom(porId.get(a.usuario)!).localeCompare(nom(porId.get(b.usuario)!), "es") || b.visitas - a.visitas);
  filas.forEach((x, i) => {
    const f = FM + 1 + i, p = porId.get(x.usuario)!; hp.getRow(f).height = 20;
    celda(hp, f, 2, nom(p), i, { bold: true }); celda(hp, f, 3, nombreModulo(x.modulo), i);
    celda(hp, f, 4, nombrePantalla(x.ruta), i); celda(hp, f, 5, x.ruta, i, { mono: true });
    celda(hp, f, 6, x.visitas, i, { der: true }); celda(hp, f, 7, num(x.minutos), i, { der: true, fmt: "0.0" });
    celda(hp, f, 8, new Date(x.ultima), i, { fmt: "dd/mm/yyyy hh:mm" });
  });
  if (filas.length) hp.autoFilter = { from: { row: FM, column: 2 }, to: { row: FM, column: 8 } };
  hp.views = [{ showGridLines: false, state: "frozen", ySplit: FM }];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
