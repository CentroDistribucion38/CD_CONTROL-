/**
 * LOS EXPORTABLES DE USUARIOS, EN EXCEL — con el sello, la banda y los
 * colores del tema de quien exporta.
 *
 * «Todos los exportables deben tener logo y el diseño: nada puede
 * descargarse así horrible.»
 *
 *   armarPases     al crear varios (o darles clave nueva): una hoja
 *                  «Pases» con un pase por persona para imprimir y
 *                  recortar —sello, rol, usuario, clave y el QR de la
 *                  entrada— y una hoja «Lista» de respaldo. Los pases leen
 *                  de la lista: si se corrige una clave allá, el pase cambia.
 *   armarUsuarios  la gente de CONTROL: rol, estado, clave, último
 *                  ingreso, registros; y una hoja por rol.
 *
 * Se arma en el navegador (las claves solo existen ahí, una vez) y con
 * datos de prueba en el arnés. Nada de aquí lee la base.
 */
import ExcelJS from "exceljs";
import qrcode from "qrcode-generator";

import { colorRol, MARCA, type ColoresLibro } from "./colores-rol";
export { colorRol, type ColoresLibro };

/* ---------- colores ---------- */
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const aclarar = (h: string, t: number) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
const oscurecer = (h: string, k: number) => aHex(hex(h).map((c) => c * k));
const BLANCO = "FFFFFFFF", VERDE = "FF00B050", GRIS_FIJO = "FF8A8E8A";

type Paleta = { TINTA: string; BANDA: string; GRIS: string; LINEA: string; FONDO: string; PAGINA: string; SUAVE: string; HONDO: string };
function paleta(c?: ColoresLibro): Paleta {
  const ok = (x?: string) => !!x && /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c?.tinta) ? c!.tinta : MARCA.tinta, b = ok(c?.banda) ? c!.banda : MARCA.banda;
  return {
    TINTA: aHex(hex(t)), BANDA: aHex(hex(b)),
    GRIS: aclarar(t, 0.64), LINEA: aclarar(t, 0.13), FONDO: aclarar(t, 0.045), PAGINA: aclarar(t, 0.09),
    SUAVE: aclarar(b, 0.22), HONDO: oscurecer(b, 0.45),
  };
}
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (size: number, color: string, bold = false, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> =>
  ({ name: "Calibri", size, bold, color: { argb: color }, ...extra });
const MONO = "Consolas";
/** Dónde va una imagen, EN PÍXELES desde la esquina de una celda. Con
 *  columnas fraccionarias exceljs mide el corrimiento en una unidad que
 *  no es la de Excel y la imagen queda pegada a la izquierda («el cuadro
 *  del QR está descuadrado»). col y fila empiezan en 0. */
const EMU = 9525;
const en = (col: number, dx: number, fila: number, dy: number) =>
  ({ nativeCol: col, nativeColOff: Math.round(dx * EMU), nativeRow: fila, nativeRowOff: Math.round(dy * EMU) }) as unknown as ExcelJS.Anchor;
/** Ancho en píxeles de una columna de Excel (Calibri 11). */
const pxCol = (ancho: number) => Math.trunc(ancho * 7 + 5);
const pxFila = (pt: number) => pt * 4 / 3;
const hoy = (d: Date) => d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

/** El QR de la entrada como GIF: exceljs lo pega sin canvas, en el
 *  navegador y en el arnés. */
function qr(texto: string): string {
  const q = qrcode(0, "M"); q.addData(texto); q.make();
  return q.createDataURL(8, 2).split(",")[1];
}

/** Banda, sello, título y subtítulo de una hoja. B..(ancho) */
function cabecera(h: ExcelJS.Worksheet, P: Paleta, sello: number | null, titulo: string, sub: string, ancho: number) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= ancho; c++) h.getCell(1, c).fill = relleno(P.BANDA);
  h.getRow(2).height = 9.75; h.getRow(3).height = 30; h.getRow(4).height = 16; h.getRow(5).height = 9.75;
  if (sello != null) h.addImage(sello, { tl: en(1, 4, 2, 0), ext: { width: 40, height: 40 } });
  const t = h.getCell(3, 3); t.value = titulo; t.font = letra(18, P.TINTA, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 3); s.value = sub; s.font = letra(9.5, P.GRIS);
}

/* =====================================================================
   PASES DE ACCESO
   ===================================================================== */
export type Pase = { nombre: string; usuario: string; clave: string; rol: string; rolNombre: string };

export async function armarPases(o: {
  pases: Pase[]; roles: { clave: string; manda: boolean }[]; url: string; lugar: string;
  sello: ArrayBuffer | Uint8Array | null; colores?: ColoresLibro; emitido?: Date;
}): Promise<ArrayBuffer> {
  const P = paleta(o.colores), C = { tinta: P.TINTA.slice(2), banda: P.BANDA.slice(2) };
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Usuarios"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const sello = o.sello ? wb.addImage({ buffer: o.sello as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const cuando = o.emitido ?? new Date();
  const corto = cuando.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, "·");
  const qrId = wb.addImage({ base64: qr(o.url), extension: "gif" });
  const host = o.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  /* Los pases primero: es lo que se imprime. La lista va detrás y los
     pases la leen. */
  const H = wb.addWorksheet("Pases", { properties: { tabColor: { argb: P.BANDA } } });

  /* ---------- LISTA ---------- */
  const L = wb.addWorksheet("Lista", { properties: { tabColor: { argb: P.TINTA } } });
  L.columns = [2, 24, 20, 18, 18, 28, 2].map((w) => ({ width: w }));
  cabecera(L, P, sello, "Accesos a CONTROL", `Respaldo para quien entrega los pases · no se reparte · ${o.pases.length} ${o.pases.length === 1 ? "persona" : "personas"} · ${hoy(cuando)}`, 7);
  const cab = ["Nombre", "Usuario", "Clave provisional", "Rol", "Entregado a la persona"];
  L.getRow(6).height = 24;
  cab.forEach((t, i) => { const c = L.getCell(6, 2 + i); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(P.TINTA); c.alignment = { vertical: "middle", indent: 1 } });
  o.pases.forEach((p, i) => {
    const f = 7 + i, r = L.getRow(f); r.height = 24;
    const rc = colorRol(p.rol, o.roles, C);
    const vals: [string, Partial<ExcelJS.Font>][] = [
      [p.nombre, letra(10.5, P.TINTA, true)], [p.usuario, letra(10.5, P.TINTA, false, { name: MONO })],
      [p.clave, letra(13, P.TINTA, true, { name: MONO })], [p.rolNombre.toUpperCase(), letra(9, "FF" + rc.letra, true)],
      ["☐  sí   ·   fecha: ______", letra(9.5, P.GRIS)],
    ];
    vals.forEach(([v, fu], k) => {
      const c = r.getCell(2 + k); c.value = v; c.font = fu;
      c.alignment = { vertical: "middle", indent: 1, horizontal: k === 2 || k === 3 ? "center" : "left" };
      c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } };
    });
    /* La clave en el color de la banda, lleno; el rol en su color vivo. */
    r.getCell(4).fill = relleno(P.BANDA); r.getCell(4).numFmt = "@";
    r.getCell(5).fill = relleno("FF" + rc.fondo);
    r.getCell(4).border = r.getCell(5).border = { bottom: { style: "thin", color: { argb: BLANCO } } };
  });
  const nota = L.getCell(8 + o.pases.length, 2);
  nota.value = "Las claves van como texto para no perder los ceros de la izquierda. Si corriges una aquí, su pase se actualiza.";
  nota.font = letra(8.5, P.GRIS, false, { italic: true });
  L.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true };

  /* ---------- PASES: uno por persona, tres por hoja ---------- */
  const ANCHOS = [3, 11, 10, 13, 10, 11, 10, 2, 12, 11, 3];
  H.columns = ANCHOS.map((w) => ({ width: w }));
  H.views = [{ showGridLines: false }];
  const pintar = (f: number, c1: number, c2: number, argb: string) => { for (let c = c1; c <= c2; c++) H.getCell(f, c).fill = relleno(argb) };
  const unir = (f1: number, c1: number, f2: number, c2: number) => H.mergeCells(f1, c1, f2, c2);
  const pon = (f: number, c: number, v: ExcelJS.CellValue, fu: Partial<ExcelJS.Font>, al: Partial<ExcelJS.Alignment> = {}) => {
    const x = H.getCell(f, c); x.value = v; x.font = fu; x.alignment = { vertical: "middle", ...al }; return x;
  };
  H.getRow(1).height = 7.5; H.getRow(2).height = 30; H.getRow(3).height = 18; H.getRow(4).height = 13.5;
  pon(2, 2, "Pases de acceso a CONTROL", letra(16, P.TINTA, true));
  pon(3, 2, `${o.pases.length} ${o.pases.length === 1 ? "persona" : "personas"}  ·  emitidos el ${hoy(cuando)}  ·  imprime, recorta por la línea punteada y entrega cada pase en la mano`, letra(9.5, P.GRIS));
  const ALTOS = [25.5, 19.5, 9.75, 13.5, 27.75, 9.75, 45.75, 13.5, 18];
  const fin = 4 + o.pases.length * 9;
  for (let f = 1; f <= fin; f++) pintar(f, 1, 11, P.PAGINA);
  o.pases.forEach((p, i) => {
    const r0 = 5 + i * 9, fl = 7 + i;             // su fila en Lista
    ALTOS.forEach((a, k) => (H.getRow(r0 + k).height = a));
    const rc = colorRol(p.rol, o.roles, C);
    for (let f = r0; f <= r0 + 7; f++) { pintar(f, 2, 7, BLANCO); pintar(f, 9, 10, BLANCO) }
    /* la franja de arriba: banda, sello, CONTROL y el rol */
    pintar(r0, 2, 5, P.BANDA); pintar(r0 + 1, 2, 5, P.BANDA);
    /* el sello, centrado en la franja (dos filas) */
    const franja = pxFila(ALTOS[0] + ALTOS[1]);
    if (sello != null) H.addImage(sello, { tl: en(1, 10, r0 - 1, (franja - 38) / 2), ext: { width: 38, height: 38 } });
    unir(r0, 3, r0, 5); pon(r0, 3, "CONTROL", letra(16, P.TINTA, true), { vertical: "bottom" });
    unir(r0 + 1, 3, r0 + 1, 5); pon(r0 + 1, 3, `PASE DE ACCESO · ${o.lugar.toUpperCase()}`, letra(8.5, P.HONDO, true), { vertical: "top" });
    unir(r0, 6, r0 + 1, 7);
    const rol = pon(r0, 6, { formula: `UPPER(Lista!E${fl})`, result: p.rolNombre.toUpperCase() }, letra(11, "FF" + rc.letra, true), { horizontal: "center" });
    rol.fill = relleno("FF" + rc.fondo);
    /* nombre, usuario, emitido */
    ([["NOMBRE", 2, 3], ["USUARIO", 4, 5], ["EMITIDO", 6, 7]] as const).forEach(([t, a, b]) => {
      unir(r0 + 3, a, r0 + 3, b); pon(r0 + 3, a, t, letra(7.5, GRIS_FIJO, true), { indent: 1, vertical: "bottom" });
      unir(r0 + 4, a, r0 + 4, b);
    });
    pon(r0 + 4, 2, { formula: `Lista!B${fl}`, result: p.nombre }, letra(15, P.TINTA, true), { indent: 1, shrinkToFit: true });
    pon(r0 + 4, 4, { formula: `Lista!C${fl}`, result: p.usuario }, letra(12, P.TINTA, false, { name: MONO }), { indent: 1, shrinkToFit: true });
    pon(r0 + 4, 6, corto, letra(12, P.TINTA, false, { name: MONO }), { indent: 1 });
    /* la clave, grande, en el color suave de la banda */
    pintar(r0 + 6, 2, 7, P.SUAVE);
    pon(r0 + 6, 2, "CLAVE\nPROVISIONAL", letra(7.5, P.HONDO, true), { wrapText: true, indent: 1 });
    unir(r0 + 6, 3, r0 + 6, 5);
    const cl = pon(r0 + 6, 3, { formula: `Lista!D${fl}`, result: p.clave }, letra(28, P.TINTA, true, { name: MONO }), { horizontal: "center" });
    cl.numFmt = "@";
    unir(r0 + 6, 6, r0 + 7, 7);
    pon(r0 + 6, 6, "Válida hasta el primer ingreso. Ahí la cambias por una tuya.", letra(8, P.GRIS), { wrapText: true, vertical: "top" });
    pintar(r0 + 7, 2, 7, P.SUAVE);
    /* el talón: QR y la dirección, del otro lado de la línea punteada */
    for (let f = r0; f <= r0 + 7; f++) H.getCell(f, 9).border = { left: { style: "dashed", color: { argb: "FFB5B5B0" } } };
    /* el QR, centrado en el talón: a lo ancho de I:J y a lo alto de las
       seis filas de arriba */
    const anchoTalon = pxCol(ANCHOS[8]) + pxCol(ANCHOS[9]);
    const altoTalon = pxFila(ALTOS.slice(0, 6).reduce((a, b) => a + b, 0));
    const lado = Math.min(128, altoTalon - 12, anchoTalon - 20);
    H.addImage(qrId, { tl: en(8, (anchoTalon - lado) / 2, r0 - 1, (altoTalon - lado) / 2 + 4), ext: { width: lado, height: lado } });
    unir(r0 + 6, 9, r0 + 6, 10); pon(r0 + 6, 9, "ESCANEA Y ENTRA", letra(9, P.TINTA, true), { horizontal: "center", vertical: "bottom" });
    unir(r0 + 7, 9, r0 + 7, 10); pon(r0 + 7, 9, host, letra(7.5, P.GRIS), { horizontal: "center", vertical: "top" });
    if ((i + 1) % 3 === 0 && i + 1 < o.pases.length) H.getRow(r0 + 8).addPageBreak();
  });
  H.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/* =====================================================================
   LA GENTE DE CONTROL
   ===================================================================== */
export type FilaUsuario = {
  nombre: string; usuario: string; rol: string; rolNombre: string; activo: boolean; provisional: boolean;
  ingreso: string | null; registros: number | null; aMano: number;
};

export async function armarUsuarios(o: {
  gente: FilaUsuario[]; roles: { clave: string; nombre: string; manda: boolean; descripcion?: string | null; pantallas: number }[];
  quien: string; filtro?: string; sello: ArrayBuffer | Uint8Array | null; colores?: ColoresLibro;
}): Promise<ArrayBuffer> {
  const P = paleta(o.colores), C = { tinta: P.TINTA.slice(2), banda: P.BANDA.slice(2) };
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Usuarios"; wb.created = new Date();
  const sello = o.sello ? wb.addImage({ buffer: o.sello as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const g = o.gente, activos = g.filter((p) => p.activo).length;
  const prov = g.filter((p) => p.activo && p.provisional).length, nunca = g.filter((p) => p.activo && !p.ingreso).length;
  const sub = `${hoy(new Date())}  ·  ${g.length} ${g.length === 1 ? "persona" : "personas"}${o.filtro ? `  ·  ${o.filtro}` : ""}  ·  exportó ${o.quien}`;

  /* ---------- USUARIOS ---------- */
  const h = wb.addWorksheet("Usuarios", { properties: { tabColor: { argb: P.BANDA } } });
  const COL = ["Nombre", "Usuario", "Rol", "Estado", "Clave", "Último ingreso", "Registros", "Pantallas a mano"];
  h.columns = [2, 26, 18, 18, 12, 13, 18, 11, 14, 2].map((w) => ({ width: w }));
  cabecera(h, P, sello, "Usuarios de CONTROL", sub, 10);
  /* las cuatro cifras */
  const cifras: [string, number, string][] = [["PERSONAS", g.length, P.BANDA], ["ACTIVAS", activos, VERDE],
    ["CLAVE PROVISIONAL", prov, prov ? "FFFF6A00" : VERDE], ["NUNCA HAN ENTRADO", nunca, nunca ? "FFFF2D78" : VERDE]];
  h.getRow(6).height = 15; h.getRow(7).height = 30; h.getRow(8).height = 12;
  const pares = [[2, 2], [3, 4], [5, 7], [8, 9]];
  cifras.forEach(([t, v, raya], i) => {
    const [a, b] = pares[i];
    if (b > a) { h.mergeCells(6, a, 6, b); h.mergeCells(7, a, 7, b) }
    for (let c = a; c <= b; c++) { h.getCell(6, c).fill = relleno(P.FONDO); h.getCell(7, c).fill = relleno(P.FONDO) }
    const lado: Partial<ExcelJS.Borders> = { left: { style: "thick", color: { argb: raya } }, right: { style: "thick", color: { argb: BLANCO } } };
    const x = h.getCell(6, a); x.value = t; x.font = letra(7.5, P.GRIS, true); x.alignment = { indent: 1, vertical: "bottom" }; x.border = lado;
    const y = h.getCell(7, a); y.value = v; y.font = letra(20, P.TINTA, true); y.alignment = { indent: 1, vertical: "middle", horizontal: "left" }; y.border = lado;
  });
  const F0 = 9;
  h.getRow(F0).height = 24;
  COL.forEach((t, i) => { const c = h.getCell(F0, 2 + i); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(P.TINTA); c.alignment = { vertical: "middle", indent: 1, wrapText: true } });
  g.forEach((p, i) => {
    const f = F0 + 1 + i, r = h.getRow(f); r.height = 21;
    const rc = colorRol(p.rol, o.roles, C);
    const ing = p.ingreso ? new Date(p.ingreso) : null;
    const vals: ExcelJS.CellValue[] = [p.nombre, p.usuario, p.rolNombre.toUpperCase(), p.activo ? "ACTIVO" : "INACTIVO",
      p.provisional ? "Provisional" : "Propia", ing, p.registros, p.aMano || null];
    vals.forEach((v, k) => {
      const c = r.getCell(2 + k); c.value = v;
      c.font = letra(10, P.TINTA, k === 0, k === 1 ? { name: MONO } : {});
      c.alignment = { vertical: "middle", indent: 1, horizontal: k === 2 || k === 3 ? "center" : k >= 6 ? "right" : "left" };
      c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } };
      if (i % 2 === 1) c.fill = relleno(P.FONDO);
    });
    r.getCell(4).fill = relleno("FF" + rc.fondo); r.getCell(4).font = letra(9, "FF" + rc.letra, true);
    r.getCell(5).fill = relleno(p.activo ? VERDE : "FF8A8E8A"); r.getCell(5).font = letra(9, BLANCO, true);
    if (p.provisional && p.activo) r.getCell(6).font = letra(10, "FFFF6A00", true);
    r.getCell(7).numFmt = "dd/mm/yyyy hh:mm"; r.getCell(8).numFmt = "#,##0;-#,##0;–"; r.getCell(9).numFmt = "0";
    if (!ing) { r.getCell(7).value = "Nunca"; r.getCell(7).font = letra(10, P.GRIS, false, { italic: true }) }
  });
  const ult = F0 + Math.max(g.length, 1);
  h.autoFilter = { from: { row: F0, column: 2 }, to: { row: ult, column: 9 } };
  h.views = [{ state: "frozen", ySplit: F0, showGridLines: false }];
  h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${F0}:${F0}`, horizontalCentered: true };

  /* ---------- POR ROL ---------- */
  const R = wb.addWorksheet("Por rol", { properties: { tabColor: { argb: P.TINTA } } });
  R.columns = [2, 22, 48, 12, 12, 14, 2].map((w) => ({ width: w }));
  cabecera(R, P, sello, "Por rol", sub, 7);
  const CR = ["Rol", "Qué hace", "Personas", "Activas", "Pantallas"];
  R.getRow(6).height = 24;
  CR.forEach((t, i) => { const c = R.getCell(6, 2 + i); c.value = t; c.font = letra(9, BLANCO, true); c.fill = relleno(P.TINTA); c.alignment = { vertical: "middle", indent: 1 } });
  o.roles.forEach((rl, i) => {
    const f = 7 + i, r = R.getRow(f); r.height = 24;
    const rc = colorRol(rl.clave, o.roles, C);
    const de = g.filter((p) => p.rol === rl.clave);
    [rl.nombre.toUpperCase(), rl.manda ? "Administra la plataforma: entra a todo." : (rl.descripcion ?? ""), de.length, de.filter((p) => p.activo).length, rl.pantallas]
      .forEach((v, k) => {
        const c = r.getCell(2 + k); c.value = v; c.font = letra(10, P.TINTA, false);
        c.alignment = { vertical: "middle", indent: 1, wrapText: k === 1, horizontal: k === 0 ? "center" : k >= 2 ? "right" : "left" };
        c.border = { bottom: { style: "thin", color: { argb: P.LINEA } } };
      });
    r.getCell(2).fill = relleno("FF" + rc.fondo); r.getCell(2).font = letra(9.5, "FF" + rc.letra, true);
  });
  R.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  R.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
