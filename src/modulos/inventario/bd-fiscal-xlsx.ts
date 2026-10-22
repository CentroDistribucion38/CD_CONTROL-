/**
 * EL EXCEL DE LA BD DEL FISCAL, con el mismo diseño del Excel del análisis de diferencia
 * (banda negra con el ojo amarillo, encabezado negro, filas en cebra, totales en amarillo, sello de la B).
 *   RESUMEN        los totales y una fila por hoja del inventario.
 *   COMPARATIVO    una fila por módulo y código: lo del operador, lo de Bavaria, la diferencia y el estado.
 *   DIFERENCIAS    solo lo que sigue sin cuadrar, de la diferencia más grande a la más chica.
 *   COMPENSADOS    lo que se dio por compensado (mismo código, cantidades que se anulan).
 *   RENGLONES      lo que anotó cada persona, renglón por renglón: quién, hora real, estibas, saldo, cajas, avería, foto.
 * Se arma en el navegador (exceljs se carga al pedirlo).
 */
import ExcelJS from "exceljs";
import { textoVenc } from "./fiscal-cruce";
import { TEXTO_MOD, type Modulo, type RenglonBd, type SkuMod } from "./bd-fiscal";

export type HojaExcelBd = { numero: number; calle: string; ol: string; bavaria: string; modulos: Modulo[]; renglones: RenglonBd[] };

const TINTA = "FF111111", BANDA = "FFFFC20E", BLANCO = "FFFFFFFF", GRIS = "FF6B6B6B", GRIS_CLARO = "FFBDBDBD";
const FONDO = "FFF6F6F4", RAYA = "FFE3E3E0", VERDE = "FF0F7A4A", VERDE_F = "FFE3F4EA", ROJO = "FFB42318", ROJO_F = "FFFDE7EA";
const AZUL = "FF1B4F8F", AZUL_F = "FFE6EEF9", AMBAR = "FFB7791F", AMBAR_F = "FFFFF1D6";
const NUM = '#,##0;[Red]-#,##0;"0"';
const SIG = '+#,##0;[Red]-#,##0;"0"';

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
const raya = (argb = RAYA): ExcelJS.Border => ({ style: "thin", color: { argb } });

/* EL SELLO DE LA B, arriba a la derecha de cada hoja. Si no llega, el libro sale igual sin él. */
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

function banda(h: ExcelJS.Worksheet, ancho: number, titulo: string, sub: string) {
  anchoDe.set(h, ancho);
  h.views = [{ showGridLines: false }];
  for (let f = 1; f <= 4; f++) for (let c = 1; c <= ancho; c++) h.getRow(f).getCell(c).fill = relleno(TINTA);
  h.getRow(1).height = 16; h.getRow(2).height = 28; h.getRow(3).height = 16; h.getRow(4).height = 8;
  const o = h.getCell(1, 1); o.value = "INVENTARIO · FISCAL · BD DEL FISCAL · BODEGA 38"; o.font = letra(8.5, BANDA, true); o.alignment = { vertical: "bottom", indent: 1 };
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
function pie(h: ExcelJS.Worksheet, ult: number, cols: number, texto: string, filaEnc = 7) {
  const nota = h.getCell(ult + 3, 1);
  nota.value = texto;
  h.mergeCells(ult + 3, 1, ult + 3, cols); nota.font = letra(9, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top", indent: 1 }; h.getRow(ult + 3).height = 32;
  h.views = [{ state: "frozen", ySplit: filaEnc, showGridLines: false }];
  h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: `${filaEnc}:${filaEnc}` };
}
function pintarEstado(x: ExcelJS.Cell, tipo: "ok" | "comp" | "mal" | "ambar" | "neutro") {
  const [f, c] = tipo === "ok" ? [VERDE_F, VERDE] : tipo === "comp" ? [AZUL_F, AZUL] : tipo === "mal" ? [ROJO_F, ROJO] : tipo === "ambar" ? [AMBAR_F, AMBAR] : [FONDO, GRIS];
  x.fill = relleno(f); x.font = letra(8.5, c, true);
}

const cuando = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const es = (v: number) => Math.round(v).toLocaleString("es-CO");

type FilaSku = { hoja: number; calle: string; ol: string; bav: string; m: Modulo; s: SkuMod };
function estadoSku(s: SkuMod): { texto: string; tipo: "ok" | "comp" | "mal" } {
  if (s.dif === 0) return { texto: "Coincide", tipo: "ok" };
  if (s.compensado) return { texto: "Compensado", tipo: "comp" };
  return { texto: s.solo === "OL" ? "Solo el operador" : s.solo === "BAVARIA" ? "Solo Bavaria" : "Difiere", tipo: "mal" };
}
function lectura(f: FilaSku): string {
  const { s } = f;
  if (s.dif === 0) return "Las dos personas contaron lo mismo.";
  if (s.compensado) return "Se compensa con otro módulo o material del mismo código: las cantidades se anulan.";
  if (s.solo === "OL") return `Solo lo contó ${f.ol || "el operador"} (${es(s.sumOl)} cajas); Bavaria no lo anotó.`;
  if (s.solo === "BAVARIA") return `Solo lo contó ${f.bav || "Bavaria"} (${es(s.sumBav)} cajas); el operador no lo anotó.`;
  return s.dif > 0 ? `El operador contó ${es(s.dif)} cajas de más que Bavaria.` : `Bavaria contó ${es(-s.dif)} cajas de más que el operador.`;
}

export async function armarBdExcel(o: { nombre: string; fecha: string; quien?: string; hojas: HojaExcelBd[] }): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Inventario fiscal"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logo = await cargarLogo(wb);
  const fechaLarga = o.fecha.split("-").reverse().join("/");
  const sub = `${o.nombre} · inventario del ${fechaLarga} · exportado el ${cuando(new Date().toISOString())}${o.quien ? ` por ${o.quien}` : ""}`;

  const todas: FilaSku[] = [];
  for (const h of o.hojas) for (const m of h.modulos) for (const s of m.skus) todas.push({ hoja: h.numero, calle: h.calle, ol: h.ol, bav: h.bavaria, m, s });
  const suma = (xs: FilaSku[], k: (f: FilaSku) => number) => xs.reduce((t, f) => t + k(f), 0);

  /* ======================= RESUMEN ======================= */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    const cols: Col[] = [
      { t: "Hoja", w: 8, centro: true }, { t: "Calle", w: 9, centro: true }, { t: "Operador", w: 22, texto: true }, { t: "Bavaria", w: 22, texto: true },
      { t: "Módulos", w: 11, fmt: NUM }, { t: "Coinciden", w: 11, fmt: NUM }, { t: "Por resolver", w: 12, fmt: NUM }, { t: "Compensados", w: 13, fmt: NUM }, { t: "Aprobados", w: 11, fmt: NUM },
      { t: "Cajas operador", w: 15, fmt: NUM }, { t: "Cajas Bavaria", w: 15, fmt: NUM }, { t: "Diferencia neta", w: 15, fmt: SIG },
    ];
    banda(h, cols.length, "BD del fiscal · resumen", sub);
    h.columns = cols.map((c) => ({ width: c.w }));
    const mods = o.hojas.flatMap((x) => x.modulos);
    const cuenta = (ms: Modulo[], e: string) => ms.filter((m) => m.estado === e).length;
    const porResolver = (ms: Modulo[]) => cuenta(ms, "difiere") + cuenta(ms, "validando") + cuenta(ms, "respondida");
    const tOl = suma(todas, (f) => f.s.sumOl), tBav = suma(todas, (f) => f.s.sumBav);
    const k: [string, number, string, string][] = [
      ["Módulos contados", mods.length, NUM, TINTA],
      ["Coinciden", cuenta(mods, "coincide"), NUM, VERDE],
      ["Por resolver (difieren o en validación)", porResolver(mods), NUM, ROJO],
      ["Compensados", cuenta(mods, "compensado"), NUM, AZUL],
      ["Aprobados por el fiscal", cuenta(mods, "aprobado"), NUM, VERDE],
      ["Cajas contadas · operador", tOl, NUM, TINTA],
      ["Cajas contadas · Bavaria", tBav, NUM, TINTA],
      ["Diferencia neta (operador − Bavaria)", tOl - tBav, SIG, tOl - tBav === 0 ? VERDE : ROJO],
    ];
    let n = 7;
    const t = h.getCell(n, 1); t.value = "LOS TOTALES"; t.font = letra(9, TINTA, true);
    for (let c = 1; c <= 4; c++) h.getCell(n, c).border = { bottom: { style: "medium", color: { argb: TINTA } } };
    n++;
    for (const [rot, v, fmt, color] of k) {
      h.mergeCells(n, 1, n, 3);
      const a = h.getCell(n, 1); a.value = rot; a.font = letra(10.5, TINTA, rot.startsWith("Diferencia neta")); a.alignment = { vertical: "middle", indent: 1 };
      const b = h.getCell(n, 4); b.value = v; b.numFmt = fmt; b.font = letra(13, color, true); b.alignment = { horizontal: "center", vertical: "middle" };
      h.getRow(n).height = 24;
      for (let c = 1; c <= 4; c++) h.getCell(n, c).border = { bottom: raya() };
      if (rot.startsWith("Diferencia neta")) for (let c = 1; c <= 4; c++) h.getCell(n, c).fill = relleno(BANDA);
      n++;
    }
    n += 1;
    const t2 = h.getCell(n, 1); t2.value = "UNA FILA POR HOJA DEL INVENTARIO"; t2.font = letra(9, TINTA, true);
    for (let c = 1; c <= cols.length; c++) h.getCell(n, c).border = { bottom: { style: "medium", color: { argb: TINTA } } };
    n++;
    const enc = h.getRow(n); enc.height = 28;
    cols.forEach((c, i) => { const x = enc.getCell(i + 1); x.value = c.t; x.font = letra(9, BLANCO, true); x.fill = relleno(TINTA); x.alignment = { vertical: "middle", horizontal: "center", wrapText: true } });
    const ini = n + 1;
    o.hojas.forEach((hj, i) => {
      n++;
      const fs = todas.filter((f) => f.hoja === hj.numero);
      const ol = suma(fs, (f) => f.s.sumOl), bv = suma(fs, (f) => f.s.sumBav);
      const r = fila(h, n, cols, [hj.numero, hj.calle || "", hj.ol || "—", hj.bavaria || "—", hj.modulos.length, cuenta(hj.modulos, "coincide"), porResolver(hj.modulos),
        cuenta(hj.modulos, "compensado"), cuenta(hj.modulos, "aprobado"), ol, bv, ol - bv], i % 2 === 1);
      r.getCell(1).font = letra(10, TINTA, true);
      r.getCell(7).font = letra(10, porResolver(hj.modulos) > 0 ? ROJO : VERDE, true);
      r.getCell(12).font = letra(10, ol - bv === 0 ? VERDE : ROJO, true);
    });
    const ult = n;
    if (o.hojas.length) {
      const S = (c: number, v: number, fmt: string) => ({ desde: ini, hasta: ult, valor: v, fmt });
      total(h, ult + 1, cols.length, "TOTAL", {
        5: S(5, mods.length, NUM), 6: S(6, cuenta(mods, "coincide"), NUM), 7: S(7, porResolver(mods), NUM), 8: S(8, cuenta(mods, "compensado"), NUM),
        9: S(9, cuenta(mods, "aprobado"), NUM), 10: S(10, tOl, NUM), 11: S(11, tBav, NUM), 12: S(12, tOl - tBav, SIG),
      });
    }
    const nota = h.getCell(ult + 3, 1);
    nota.value = "Se compara por módulo y código de material (sin lado ni vencimiento), igual que el cruce del fiscal. «Compensado»: mismo código con cantidades que se anulan. «Por resolver»: difiere o está en validación. Cajas = estibas × cajas por estiba + saldo + cajas sueltas.";
    h.mergeCells(ult + 3, 1, ult + 3, cols.length); nota.font = letra(9, GRIS, false, true); nota.alignment = { wrapText: true, vertical: "top", indent: 1 }; h.getRow(ult + 3).height = 32;
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ======================= COMPARATIVO ======================= */
  const COLS: Col[] = [
    { t: "Hoja", w: 7, centro: true }, { t: "Calle", w: 8, centro: true }, { t: "Módulo", w: 13 }, { t: "Código", w: 11 }, { t: "Material", w: 40, texto: true },
    { t: "Operador (cajas)", w: 15, fmt: NUM }, { t: "Bavaria (cajas)", w: 15, fmt: NUM }, { t: "Diferencia", w: 13, fmt: SIG },
    { t: "Estado del código", w: 18 }, { t: "Estado del módulo", w: 30, texto: true }, { t: "Cuenta · operador", w: 22, texto: true }, { t: "Cuenta · Bavaria", w: 22, texto: true },
  ];
  const lista = (nombre: string, titulo: string, tab: string, xs: FilaSku[], vacio: string, nota: string, conLectura = false) => {
    const h = wb.addWorksheet(nombre, { properties: { tabColor: { argb: tab } } });
    const cols = conLectura ? [...COLS.slice(0, 10), { t: "Qué significa", w: 54, texto: true } as Col] : COLS;
    banda(h, cols.length, titulo, `${xs.length} ${xs.length === 1 ? "código" : "códigos"} · ${sub}`);
    encabezado(h, 7, cols);
    xs.forEach((f, i) => {
      const e = estadoSku(f.s);
      const base: ExcelJS.CellValue[] = [f.hoja, f.calle || "", f.m.clave, f.s.sku, f.s.material, f.s.sumOl, f.s.sumBav, f.s.dif, e.texto, TEXTO_MOD[f.m.estado]];
      const vals = conLectura ? [...base, lectura(f)] : [...base, f.ol, f.bav];
      const r = fila(h, 8 + i, cols, vals, i % 2 === 1);
      r.getCell(4).font = letra(9.5, TINTA, true);
      r.getCell(8).font = letra(10, f.s.dif === 0 ? VERDE : f.s.compensado ? AZUL : ROJO, true);
      pintarEstado(r.getCell(9), e.tipo);
      pintarEstado(r.getCell(10), f.m.estado === "aprobado" || f.m.estado === "coincide" ? "ok" : f.m.estado === "compensado" ? "comp" : f.m.estado === "difiere" ? "mal" : f.m.estado === "contando" ? "neutro" : "ambar");
    });
    const ult = 7 + xs.length;
    if (xs.length) {
      total(h, ult + 1, cols.length, "TOTAL (lo filtrado)", {
        6: { desde: 8, hasta: ult, valor: suma(xs, (f) => f.s.sumOl), fmt: NUM }, 7: { desde: 8, hasta: ult, valor: suma(xs, (f) => f.s.sumBav), fmt: NUM },
        8: { desde: 8, hasta: ult, valor: suma(xs, (f) => f.s.dif), fmt: SIG },
      });
      h.autoFilter = `A7:${h.getColumn(cols.length).letter}${ult}`;
    } else { const x = h.getCell(8, 1); x.value = vacio; x.font = letra(10, VERDE, true) }
    pie(h, ult, cols.length, nota);
  };
  const ordenar = (xs: FilaSku[]) => [...xs].sort((a, b) => a.hoja - b.hoja || a.m.clave.localeCompare(b.m.clave, "es", { numeric: true }) || a.s.sku.localeCompare(b.s.sku, "es", { numeric: true }));
  lista("Comparativo", "Comparativo · operador contra Bavaria", TINTA, ordenar(todas), "Todavía no hay renglones contados.",
    "Una fila por módulo y código. Diferencia = operador − Bavaria. Verde: coincide o ya aprobado · Azul: compensado · Rojo: sigue sin cuadrar · Ámbar: en validación o esperando al fiscal.");
  lista("Diferencias", "Lo que sigue sin cuadrar", ROJO,
    [...todas].filter((f) => f.s.dif !== 0 && !f.s.compensado && f.m.estado !== "aprobado").sort((a, b) => Math.abs(b.s.dif) - Math.abs(a.s.dif)),
    "Nada por resolver: todo coincide, está compensado o ya lo aprobó el fiscal.",
    "Solo lo que no cuadra y aún no está aprobado, de la diferencia más grande a la más chica. «Qué significa» explica en palabras quién contó de más o quién no anotó el código.", true);
  lista("Compensados", "Lo que se dio por compensado", AZUL,
    ordenar(todas.filter((f) => f.s.compensado && f.s.dif !== 0)),
    "No hay nada compensado.",
    "Mismo código con cantidades iguales y contrarias (o que suman cero en total): una diferencia anula a la otra, por eso no cuentan como diferencia.");

  /* ======================= RENGLONES ======================= */
  {
    const h = wb.addWorksheet("Renglones", { properties: { tabColor: { argb: GRIS } } });
    const cols: Col[] = [
      { t: "Hoja", w: 7, centro: true }, { t: "Módulo", w: 13 }, { t: "Ubicación", w: 13 }, { t: "Equipo", w: 12, centro: true }, { t: "Persona", w: 22, texto: true }, { t: "Hora", w: 17, fmt: "dd/mm/yyyy hh:mm" },
      { t: "Código", w: 11 }, { t: "Material", w: 40, texto: true }, { t: "Vence", w: 14 }, { t: "Estibas", w: 9, fmt: NUM }, { t: "Saldo", w: 9, fmt: NUM },
      { t: "Cajas sueltas", w: 12, fmt: NUM }, { t: "Total cajas", w: 13, fmt: NUM }, { t: "Avería", w: 8, centro: true }, { t: "PNC", w: 7, centro: true }, { t: "Estado envase", w: 14 },
      { t: "Nota", w: 34, texto: true }, { t: "Con foto", w: 9, centro: true }, { t: "Ya en La base", w: 12, centro: true },
    ];
    const rs = o.hojas.flatMap((x) => x.renglones.map((r) => ({ hoja: x.numero, r })));
    banda(h, cols.length, "Renglones contados", `${rs.length} renglones · lo que anotó cada persona · ${sub}`);
    encabezado(h, 7, cols);
    rs.forEach(({ hoja, r }, i) => {
      const f = fila(h, 8 + i, cols, [hoja, r.modulo, r.ubicacion, r.equipo === "OL" ? "Operador" : "Bavaria", r.persona, r.contadoEn ? new Date(r.contadoEn) : null, r.sku, r.material,
        textoVenc(r.vencDia, r.vencMes, r.vencAnio), r.estibas, r.saldo, r.cajas, r.total, r.averia ? "Sí" : "", r.pnc ? "Sí" : "", r.estadoEnvase ?? "", r.nota ?? "", r.ruta ? "Sí" : "", r.enBase ? "Sí" : ""], i % 2 === 1);
      f.getCell(7).font = letra(9.5, TINTA, true);
      f.getCell(13).font = letra(10, TINTA, true);
      f.getCell(4).font = letra(9, r.equipo === "OL" ? AZUL : AMBAR, true);
      if (r.averia) pintarEstado(f.getCell(14), "mal");
      if (r.pnc) pintarEstado(f.getCell(15), "ambar");
      if (r.enBase) pintarEstado(f.getCell(19), "ok");
    });
    const ult = 7 + rs.length;
    if (rs.length) {
      total(h, ult + 1, cols.length, "TOTAL (lo filtrado)", { 13: { desde: 8, hasta: ult, valor: rs.reduce((t, x) => t + x.r.total, 0), fmt: NUM } });
      h.autoFilter = `A7:${h.getColumn(cols.length).letter}${ult}`;
    } else { const x = h.getCell(8, 1); x.value = "Todavía no hay renglones contados."; x.font = letra(10, GRIS, false, true) }
    pie(h, ult, cols.length, "La hora es la real en que se guardó cada renglón (hora de Bogotá). «Con foto»: el renglón tiene foto de evidencia. «Ya en La base»: el fiscal ya lo pasó al conteo definitivo.");
  }

  ponerLogos(wb, logo);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
