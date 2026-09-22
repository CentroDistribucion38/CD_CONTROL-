/**
 * EL CONSOLIDADO DEL DÍA EN EXCEL — inventario.
 *
 * «Consolidar los inventarios del día en una base y exportar la data,
 * espectacular, con el logo, como lo del sider: un Excel donde yo pueda
 * validar todo.»
 *
 * UNA BASE, NO LA SUMA DE LOS RECORRIDOS. Si ese día se caminó la calle A
 * dos veces, vale el último recorrido que pasó por cada ubicación (la
 * misma regla del tablero, medirRiesgo). Los renglones que quedaron
 * reemplazados no se pierden: salen en «Validar», para ver qué cambió.
 *
 * Seis hojas:
 *   Resumen          logo, cifras del día, franjas, recorridos y el
 *                    semáforo de la validación.
 *   Base             la base consolidada, renglón por renglón, con filtro,
 *                    encabezado fijo, totales que siguen al filtro y la
 *                    franja pintada.
 *   Por material     la base agrupada por código.
 *   Por ubicación    lo que hay en cada módulo contra lo que cabe.
 *   Validar          todo lo que alguien tiene que mirar, con el porqué.
 *   Sin contar       las posiciones activas que ese día nadie caminó.
 *
 * Puro de datos: recibe los renglones y el maestro, no lee la base. Se
 * corre con datos de prueba y se abre el archivo para ver cómo quedó.
 */
import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";
import type { Renglon, ConteoFefo, Material, Ubicacion } from "./fefo";
import { medirRiesgo, franja, FRANJAS, type Franja } from "./riesgo";

type BufferDeExcel = Parameters<ExcelJS.Workbook["addImage"]>[0]["buffer"];

export type InsumosDia = {
  fecha: string;               // YYYY-MM-DD
  bodega: string;
  quien: string;
  conteos: ConteoFefo[];       // los ENVIADOS de ese día
  lineas: Renglon[];           // sus renglones
  materiales: Material[];
  ubicaciones: Ubicacion[];    // de la bodega
  logo: Buffer | null;         // public/marca/logo-b.png (el sello de la B)
  /** Los colores del tema de quien exporta; sin ellos, los de la marca. */
  colores?: ColoresLibro;
  /** Cuántos FEFO se enviaron ese día, si se escogieron solo algunos. */
  totalDelDia?: number;
};

/* ---------- La paleta: la del tema de quien exporta ----------
   «Que quede así (el gris claro)… con el tema de ámbar y así: sabes que
   varía dependiendo la preferencia.» Del tema llegan dos colores —la
   tinta y el de la banda— y de la tinta salen los grises: con un pelo de
   su tono, así el gris de pizarra tira a verde y el de la marca a azul.
   Los colores que dicen algo (vencido, con margen…) no cambian. */
export type ColoresLibro = { tinta: string; banda: string };   // RRGGBB
export const COLORES_MARCA: ColoresLibro = { tinta: "12263A", banda: "FFC000" };
const hex = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const aHex = (c: number[]) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** La tinta llevada hacia el blanco: t = cuánto de tinta queda. */
const aclarar = (h: string, t: number) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
const oscurecer = (h: string, k: number) => aHex(hex(h).map((c) => c * k));
const BLANCO = "FFFFFFFF", ROJO = "FFC6202A", VERDE = "FF1F7A45", ROSA = "FFFFF4F4", MENTA = "FFEFF8F2";
let TINTA = "", BANDA = "", GRIS = "", LINEA = "", FONDO = "", CAJA = "", PANEL = "", CABEZA = "", ENLACE = "";
function usarColores(c: ColoresLibro) {
  const ok = (x: string) => /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c.tinta) ? c.tinta : COLORES_MARCA.tinta, b = ok(c.banda) ? c.banda : COLORES_MARCA.banda;
  TINTA = aHex(hex(t)); BANDA = aHex(hex(b));
  GRIS = aclarar(t, 0.64);      // rótulos y notas
  LINEA = aclarar(t, 0.12);     // la raya entre renglones
  FONDO = aclarar(t, 0.045);    // rayado y fila de totales
  CAJA = aclarar(t, 0.035);     // las tarjetas
  PANEL = aclarar(t, 0.055);    // el avance del conteo
  CABEZA = aclarar(t, 0.15);    // encabezado claro de las tablas del resumen
  ENLACE = oscurecer(b, 0.54);  // el dorado hondo de los vínculos
}
const FR: Record<Franja, { fondo: string; tinta: string }> = {
  vencido: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  pasado: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  semana: { fondo: "FFFDEBDB", tinta: "FFB4530A" },
  quince: { fondo: "FFFFF4D1", tinta: "FF8A6A00" },
  mes: { fondo: "FFF1F6DC", tinta: "FF5E7314" },
  ok: { fondo: "FFE3F2E8", tinta: "FF1F7A45" },
  sinfecha: { fondo: "FFF0F0EE", tinta: "FF6B6B66" },
};
const rotFr = (f: Franja) => FRANJAS.find((x) => x.clave === f)!.rot;
const NUM = "#,##0;\\-#,##0;\\–", PCT = "0.0%;\\-0.0%;\\–";

const raya = () => ({ style: "thin" as const, color: { argb: LINEA } });
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fechaLarga = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const aFecha = (s: string | null) => (s ? new Date((s.length === 10 ? s + "T12:00:00" : s)) : null);
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
const letra = (size: number, color: string, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
/** Un vínculo a otra hoja que se ve bien aunque no se recalcule. */
const vinculo = (hoja: string, texto: string) => ({ formula: `HYPERLINK("#'${hoja}'!A1","${texto.replace(/"/g, '""')}")`, result: texto });

/** Lo de arriba de cada hoja de datos: la banda del tema, el título, el
 *  día y el vínculo de vuelta al resumen. */
function cabecera(h: ExcelJS.Worksheet, titulo: string, sub: string, ancho: number) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= ancho; c++) h.getRow(1).getCell(c).fill = relleno(BANDA);
  h.getRow(2).height = 8; h.getRow(3).height = 26; h.getRow(4).height = 16; h.getRow(5).height = 16;
  const t = h.getCell(3, 1); t.value = titulo; t.font = letra(16, TINTA, true); t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 1); s.value = sub; s.font = letra(9.5, GRIS);
  const v = h.getCell(5, 1); v.value = vinculo("Resumen", "← volver al resumen"); v.font = letra(9.5, ENLACE, true);
}

/** Encabezado de tabla: la tinta del tema con letra blanca. */
function encabezado(h: ExcelJS.Worksheet, fila: number, titulos: string[]) {
  const r = h.getRow(fila); r.height = 26;
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1); c.value = t;
    c.font = letra(9, BLANCO, true); c.fill = relleno(TINTA);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

/** Rayado suave, raya fina abajo y formatos de una fila de datos. */
function filaDatos(r: ExcelJS.Row, n: number, par: boolean, fmts: Record<number, string>) {
  r.height = 18;
  for (let c = 1; c <= n; c++) {
    const cel = r.getCell(c);
    cel.border = { bottom: raya() }; cel.font = letra(9.5, TINTA);
    cel.alignment = { vertical: "middle" };
    if (par) cel.fill = relleno(FONDO);
    if (fmts[c]) cel.numFmt = fmts[c];
  }
}

/** Totales que SIGUEN AL FILTRO (SUBTOTAL 109): filtras y la cifra cambia. */
function totales(h: ExcelJS.Worksheet, fila: number, desde: number, hasta: number, cols: number[], ancho: number, rotulo = "TOTAL (lo filtrado)") {
  const r = h.getRow(fila); r.height = 22;
  for (let c = 1; c <= ancho; c++) { const cel = r.getCell(c); cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } }; cel.font = letra(9.5, TINTA, true); cel.alignment = { vertical: "middle" } }
  r.getCell(1).value = rotulo;
  for (const c of cols) {
    const L = col(c);
    /* El resultado va calculado: así se ve bien aunque el programa no
       recalcule al abrir (vista previa del correo, LibreOffice). */
    let suma = 0;
    for (let f = desde; f <= hasta; f++) { const v = h.getRow(f).getCell(c).value; if (typeof v === "number") suma += v }
    r.getCell(c).value = { formula: `SUBTOTAL(109,${L}${desde}:${L}${hasta})`, result: suma };
    r.getCell(c).numFmt = NUM;
  }
}

function pintarFranja(cel: ExcelJS.Cell, f: Franja) {
  cel.fill = relleno(FR[f].fondo);
  cel.font = letra(9.5, FR[f].tinta, true);
}

const siNo = (b: boolean | null | undefined) => (b ? "Sí" : "");

export async function armarLibroDia(d: InsumosDia): Promise<Buffer> {
  usarColores(d.colores ?? COLORES_MARCA);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Inventario"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = d.logo ? wb.addImage({ buffer: d.logo as unknown as BufferDeExcel, extension: "png" }) : null;

  const uxc = Object.fromEntries(d.materiales.map((m) => [m.sku, m.unidades_por_caja]));
  const { foto, franjas, materiales, totalCajas, totalUnidades, ubicaciones: nUbi } = medirRiesgo(d.lineas, d.conteos, uxc);
  const enFoto = new Set(foto.map((l) => l.id));
  const reemplazados = d.lineas.filter((l) => !enFoto.has(l.id));
  const matPorSku = new Map(d.materiales.map((m) => [m.sku, m]));
  const orden = (a: Renglon, b: Renglon) => (a.ubicacion_combinada ?? a.ubicacion ?? "").localeCompare(b.ubicacion_combinada ?? b.ubicacion ?? "", "es", { numeric: true }) || a.codigo.localeCompare(b.codigo);
  const base = [...foto].sort(orden);
  const titulo = `Inventario consolidado · ${d.bodega}`;
  const parcial = d.totalDelDia != null && d.totalDelDia > d.conteos.length;
  const sub = `${fechaLarga(d.fecha).replace(/^./, (c) => c.toUpperCase())}  ·  ` +
    (parcial ? `${d.conteos.length} de ${d.totalDelDia} FEFO del día (escogidos: ${d.conteos.map((c) => c.codigo).join(", ")})`
             : `${d.conteos.length} FEFO enviado${d.conteos.length === 1 ? "" : "s"}`) + ` · exportó ${d.quien}`;

  /* ================= VALIDAR (se arma primero: el resumen la cuenta) ================= */
  type Ojo = { tipo: string; grave: boolean; ubicacion: string; codigo: string; material: string; detalle: string; recorrido: string };
  const ojos: Ojo[] = [];
  const ub = (l: Renglon) => l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicación";
  const vistos = new Map<string, Renglon>();
  for (const l of base) {
    const k = `${ub(l)}|${l.codigo}|${l.vencimiento ?? ""}`;
    if (vistos.has(k)) ojos.push({ tipo: "Repetido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Mismo material y vencimiento anotado dos veces en la misma ubicación.", recorrido: l.conteo });
    vistos.set(k, l);
    const f = franja(l);
    if (l.tipo_material !== "ENVASE" && !l.vencimiento) ojos.push({ tipo: "Sin fecha", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Producto sin fecha de vencimiento: no se puede saber cuándo sale.", recorrido: l.conteo });
    if (f === "vencido") ojos.push({ tipo: "Vencido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Venció hace ${-(l.dias_para_vencer ?? 0)} día(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    else if (f === "pasado") ojos.push({ tipo: "Pasó de salida", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Debió salir hace ${-(l.dias_para_salir ?? 0)} día(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    if (!matPorSku.has(l.codigo)) ojos.push({ tipo: "Código fuera del maestro", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El código no está en el maestro de materiales.", recorrido: l.conteo });
    else if (l.tipo_material !== "ENVASE" && !uxc[l.codigo]) ojos.push({ tipo: "Sin unidades por caja", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El maestro no trae unidades por caja: no suma en unidades.", recorrido: l.conteo });
    if (l.averia || l.pnc) ojos.push({ tipo: l.averia ? "Avería" : "PNC", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: l.nota ?? "Marcado en el conteo.", recorrido: l.conteo });
  }
  /* Módulos por encima de su capacidad (en estibas, como el maestro). */
  const porUbi = new Map<string, { ubicacion: string; calle: string | null; modulo: string | null; lado: string | null; capacidad: number | null; estibas: number; cajas: number; renglones: number; materiales: Set<string> }>();
  for (const l of base) {
    const k = ub(l);
    const x = porUbi.get(k) ?? { ubicacion: k, calle: l.calle, modulo: l.modulo, lado: l.lado, capacidad: l.capacidad, estibas: 0, cajas: 0, renglones: 0, materiales: new Set<string>() };
    x.estibas += Number(l.total_estibas ?? 0); x.cajas += Number(l.total_cajas ?? 0); x.renglones += 1; x.materiales.add(l.codigo);
    porUbi.set(k, x);
  }
  for (const x of porUbi.values()) if (x.capacidad && x.estibas > x.capacidad)
    ojos.push({ tipo: "Sobre capacidad", grave: false, ubicacion: x.ubicacion, codigo: "", material: "", detalle: `Hay ${x.estibas} estibas y caben ${x.capacidad}.`, recorrido: "" });
  for (const l of reemplazados)
    ojos.push({ tipo: "Reemplazado", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Esa ubicación se volvió a contar ese día: vale el recorrido más reciente. Aquí decía ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
  const graves = ojos.filter((o) => o.grave).length;

  /* Lo que nadie caminó ese día. */
  const contadas = new Set(foto.map((l) => l.ubicacion_id).filter(Boolean));
  const sinContar = d.ubicaciones.filter((u) => u.activa && !contadas.has(u.id))
    .sort((a, b) => a.clave.localeCompare(b.clave, "es", { numeric: true }));
  const activas = d.ubicaciones.filter((u) => u.activa).length;

  /* ================= 1 · RESUMEN =================
     Como el que mandó «gris claro»: la banda, el sello, el avance del
     conteo con su barra, dos filas de tarjetas, las franjas con su barrita,
     los recorridos con el cuadre de cajas y el aviso de lo que hay que
     validar. A = margen; B..I = ocho columnas; J = margen. */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    h.columns = [2, 13.5, 11, 11.5, 11.5, 11, 11.5, 11, 11, 2].map((w) => ({ width: w }));
    h.views = [{ showGridLines: false }];
    const alto = (f: number, v: number) => { h.getRow(f).height = v };
    const pon = (f: number, c: number, v: ExcelJS.CellValue, fuente: Partial<ExcelJS.Font>, extra: Partial<ExcelJS.Cell> = {}) => {
      const cel = h.getCell(f, c); cel.value = v; cel.font = fuente; Object.assign(cel, extra); return cel;
    };
    const pintar = (f: number, c1: number, c2: number, argb: string) => { for (let c = c1; c <= c2; c++) h.getCell(f, c).fill = relleno(argb) };
    const unir = (f: number, c1: number, c2: number) => { if (c2 > c1) h.mergeCells(f, c1, f, c2) };

    /* LA BANDA, EL SELLO, EL TÍTULO */
    [6, 9.75, 33.75, 18, 13.5].forEach((v, i) => alto(i + 1, v));
    pintar(1, 1, 10, BANDA);
    if (logoId != null) h.addImage(logoId, { tl: { col: 1.05, row: 2.08 }, ext: { width: 42, height: 42 } });
    pon(3, 3, titulo, letra(22, TINTA, true), { alignment: { vertical: "middle" } });
    pon(4, 3, sub, letra(9.5, GRIS));
    unir(3, 8, 9); pon(3, 8, "UBICACIONES DEL ALMACÉN", letra(7.5, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    unir(4, 8, 9); pon(4, 8, activas, letra(12, TINTA, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "top" } });

    /* EL AVANCE DEL CONTEO: cuánto del almacén se caminó ese día. */
    const avance = activas ? nUbi / activas : 0, bloques = Math.max(avance > 0 ? 1 : 0, Math.round(avance * 18));
    [15.75, 43.5, 19.5, 12].forEach((v, i) => alto(6 + i, v));
    for (let f = 6; f <= 9; f++) { pintar(f, 2, 9, PANEL); h.getCell(f, 2).border = { left: { style: "thick", color: { argb: BANDA } } } }
    pon(6, 2, "  AVANCE DEL CONTEO", letra(8.5, GRIS, true), { alignment: { vertical: "bottom" } });
    unir(7, 2, 4); pon(7, 2, avance, letra(40, TINTA, true), { numFmt: "0.0%", alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
    unir(8, 2, 4); pon(8, 2, `${nUbi.toLocaleString("es-CO")} de ${activas.toLocaleString("es-CO")} ubicaciones`, letra(10, GRIS, true), { alignment: { vertical: "bottom", indent: 1 } });
    unir(7, 5, 7); pon(7, 5, "█".repeat(bloques) + "░".repeat(18 - bloques), letra(20, BANDA), { alignment: { vertical: "middle" } });
    unir(8, 5, 7); pon(8, 5, `cada bloque ≈ ${Math.max(1, Math.round(activas / 18))} ubicaciones`, letra(9, GRIS), { alignment: { vertical: "middle" } });
    unir(7, 8, 9); pon(7, 8, sinContar.length, letra(32, sinContar.length ? ROJO : VERDE, true), { numFmt: "#,##0", alignment: { horizontal: "right", vertical: "middle", indent: 1 } });
    unir(8, 8, 9); pon(8, 8, "SIN CONTAR  ", letra(9, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });

    /* LAS TARJETAS: rótulo chiquito arriba, la cifra grande abajo, y la
       raya de la izquierda que dice de qué color es la noticia. */
    const tarjetas = (f: number, titulo: string, cs: [string, number, string, string, string?][]) => {
      alto(f - 1, 13.5); alto(f, 15.75); alto(f + 1, 18); alto(f + 2, 33.75);
      pon(f, 2, titulo, letra(8, TINTA, true));
      cs.forEach(([rot, v, fmt, raya, color], i) => {
        const c0 = 2 + i * 2;
        unir(f + 1, c0, c0 + 1); unir(f + 2, c0, c0 + 1);
        pintar(f + 1, c0, c0 + 1, CAJA); pintar(f + 2, c0, c0 + 1, CAJA);
        const lados: Partial<ExcelJS.Borders> = { left: { style: "thick", color: { argb: raya } }, right: { style: "thick", color: { argb: BLANCO } } };
        pon(f + 1, c0, rot, letra(7.5, GRIS, true), { border: lados, alignment: { horizontal: "left", vertical: "bottom", indent: 1 } });
        pon(f + 2, c0, v, letra(22, color ?? TINTA, true), { numFmt: fmt, border: lados, alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
      });
    };
    const estibas = base.reduce((a, l) => a + Number(l.total_estibas ?? 0), 0);
    tarjetas(11, "LO CONTADO", [["CAJAS", totalCajas, NUM, BANDA], ["UNIDADES", totalUnidades, NUM, BANDA], ["ESTIBAS", estibas, NUM, BANDA], ["RENGLONES", base.length, NUM, BANDA]]);
    const vencidas = franjas.vencido.cajas + franjas.pasado.cajas;
    const margen = totalCajas ? franjas.ok.cajas / totalCajas : 0;
    tarjetas(15, "PARA REVISAR", [
      ["MATERIALES", materiales.length, NUM, BANDA],
      ["VENCIDAS · CAJAS", vencidas, NUM, vencidas ? ROJO : VERDE, vencidas ? ROJO : VERDE],
      ["POR VALIDAR", graves, NUM, graves ? ROJO : VERDE, graves ? ROJO : VERDE],
      ["CON MARGEN", margen, PCT, VERDE, VERDE],
    ]);
    alto(18, 13.5); alto(19, 6);

    /* Una tabla del resumen: encabezado claro, raya fina, total con la
       raya de la tinta encima. B:C van juntas en la primera columna. */
    const cols = [[2, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9]];
    const fila = (f: number, vals: (ExcelJS.CellValue | undefined)[], tipo: "cabeza" | "dato" | "total", fmts: (string | undefined)[] = []) => {
      alto(f, tipo === "dato" ? 19.5 : 21.75);
      vals.forEach((v, i) => {
        const [a, b] = cols[i]; unir(f, a, b);
        const cel = h.getCell(f, a);
        if (v !== undefined) cel.value = v;
        cel.font = tipo === "cabeza" ? letra(9, TINTA, true) : letra(9.5, TINTA, tipo === "total");
        if (fmts[i]) cel.numFmt = fmts[i]!;
        cel.alignment = { vertical: "middle", horizontal: i === 0 || (tipo === "cabeza" && i === 6) ? "left" : "right", indent: 1 };
      });
      for (let c = 2; c <= 9; c++) {
        const cel = h.getCell(f, c);
        if (tipo === "cabeza") cel.fill = relleno(CABEZA);
        else if (tipo === "total") { cel.fill = relleno(FONDO); cel.border = { top: { style: "medium", color: { argb: TINTA } } } }
        else cel.border = { bottom: raya() };
      }
    };

    /* EL RIESGO DE VENCIMIENTO, por franja, con su barrita. */
    alto(20, 19.5); pon(20, 2, "Riesgo de vencimiento", letra(11, TINTA, true));
    fila(21, ["Franja", "Cajas", "Unidades", "Materiales", "Ubicaciones", "% de cajas", ""], "cabeza");
    let f = 21;
    for (const x of FRANJAS) {
      f += 1; const s = franjas[x.clave], pc = totalCajas ? s.cajas / totalCajas : 0;
      fila(f, [x.rot, s.cajas, s.unidades, s.materiales, s.renglones, pc, pc > 0 ? "█".repeat(Math.max(1, Math.round(pc * 8))) : ""], "dato", [, NUM, NUM, NUM, NUM, PCT]);
      pintarFranja(h.getCell(f, 2), x.clave);
      h.getCell(f, 8).font = letra(9.5, TINTA, true);
      const barra = h.getCell(f, 9); barra.font = letra(10, FR[x.clave].tinta); barra.alignment = { horizontal: "left", vertical: "middle" };
    }
    const d1 = 22, d2 = f; f += 1;
    fila(f, ["Total", { formula: `SUM(D${d1}:D${d2})`, result: totalCajas }, { formula: `SUM(E${d1}:E${d2})`, result: totalUnidades },
      `${materiales.length} distintos`, undefined, { formula: `SUM(H${d1}:H${d2})`, result: totalCajas ? 1 : 0 }, undefined], "total", [, NUM, NUM, , , PCT]);
    h.getCell(f, 6).font = letra(8.5, GRIS);
    const filaTotal = f;

    /* LOS RECORRIDOS QUE ENTRAN, y el cuadre: lo que sumaban contra lo
       que quedó en la base (la diferencia es lo que se volvió a contar). */
    f += 1; alto(f, 13.5);
    f += 1; alto(f, 19.5); pon(f, 2, "Recorridos que entran en la base", letra(11, TINTA, true));
    f += 1; fila(f, ["Recorrido", "Contó", "Enviado", "Renglones", "Ubicaciones", "Cajas", ""], "cabeza");
    for (const c of [3, 4]) h.getCell(f, c + 1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    const r1 = f + 1;
    for (const c of d.conteos) {
      f += 1;
      const env = aFecha(c.enviado_en);
      fila(f, [c.codigo, c.responsable ?? "—", env ? env.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).replace(",", "") : "—",
        c.renglones, c.ubicaciones, Number(c.total_cajas), ""], "dato", [, , , NUM, NUM, NUM]);
      for (const k of [4, 5]) h.getCell(f, k).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    }
    const r2 = f, cajasRec = d.conteos.reduce((a, c) => a + Number(c.total_cajas), 0);
    f += 1;
    fila(f, ["Total", undefined, undefined,
      { formula: `SUM(F${r1}:F${r2})`, result: d.conteos.reduce((a, c) => a + c.renglones, 0) },
      { formula: `SUM(G${r1}:G${r2})`, result: d.conteos.reduce((a, c) => a + c.ubicaciones, 0) },
      { formula: `SUM(H${r1}:H${r2})`, result: cajasRec }, undefined], "total", [, , , NUM, NUM, NUM]);
    const filaRec = f;
    f += 1; alto(f, 21.75);
    unir(f, 2, 3); pon(f, 2, "Cuadre de cajas", letra(9, GRIS, true), { alignment: { vertical: "middle", indent: 1 } });
    unir(f, 4, 7); pon(f, 4, `${cajasRec.toLocaleString("es-CO")} en los recorridos  −  ${totalCajas.toLocaleString("es-CO")} en el consolidado (lo que se volvió a contar)`, letra(9, GRIS), { alignment: { vertical: "middle", wrapText: true } });
    const dif = cajasRec - totalCajas;
    pon(f, 8, { formula: `H${filaRec}-D${filaTotal}`, result: dif }, letra(10, dif ? ROJO : VERDE, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "middle", indent: 1 } });

    /* EL AVISO: rojo con vínculo a «Validar», o verde si no hay nada. */
    f += 1; alto(f, 12);
    f += 1; alto(f, 27.75); unir(f, 2, 9); pintar(f, 2, 9, graves ? ROSA : MENTA);
    pon(f, 2, graves ? vinculo("Validar", `  ⚠  ${graves} renglón${graves === 1 ? "" : "es"} por validar  →  abrir la hoja Validar`) : "  ✓  Nada grave por validar",
      letra(10, graves ? ROJO : VERDE, true, false), { alignment: { vertical: "middle" }, border: { left: { style: "thick", color: { argb: graves ? ROJO : VERDE } } } });
    if (graves) h.getCell(f, 2).font = { ...letra(10, ROJO, true), underline: true };
    f += 1; alto(f, 31.5); unir(f, 2, 9);
    pon(f, 2, "La base toma, de cada ubicación, el ÚLTIMO recorrido del día que pasó por ella: una calle caminada dos veces no se suma dos veces. El detalle está en las hojas Base, Por material, Por ubicación y Sin contar.",
      letra(8, GRIS, false, true), { alignment: { wrapText: true, vertical: "top" } });
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true };
    h.pageSetup.printArea = `A1:J${f}`;
  }

  /* ================= 2 · BASE ================= */
  {
    const h = wb.addWorksheet("Base", { properties: { tabColor: { argb: TINTA } } });
    const C = ["Recorrido", "Contó", "Contado", "Calle", "Módulo", "Lado", "Ubicación", "Código", "Material", "Tipo", "Familia",
      "Estibas", "Cajas sueltas", "Saldo", "Total cajas", "Unidades", "Fabricación", "Vencimiento", "Días p/vencer", "Días p/salir",
      "Franja", "Rota", "Avería", "PNC", "Estado envase", "Nota"];
    h.columns = [12, 18, 16, 7, 8, 7, 13, 10, 34, 11, 14, 9, 10, 8, 11, 12, 12, 12, 10, 10, 18, 6, 7, 6, 14, 30].map((w) => ({ width: w }));
    cabecera(h, "Base consolidada del día", sub, C.length);
    encabezado(h, 6, C);
    base.forEach((l, i) => {
      const u = uxc[l.codigo];
      const r = h.getRow(7 + i);
      r.values = [l.conteo, l.conto ?? "", aFecha(l.contado_en), l.calle ?? "", l.modulo ?? "", l.lado ?? "", ub(l), l.codigo, l.material,
        l.tipo_material, l.familia ?? "", Number(l.estibas ?? 0), Number(l.cajas ?? 0), Number(l.saldo ?? 0), Number(l.total_cajas),
        u ? Number(l.total_cajas) * u : null, aFecha(l.fabricacion), aFecha(l.vencimiento), l.dias_para_vencer, l.dias_para_salir,
        rotFr(franja(l)), siNo(l.rotacion), siNo(l.averia), siNo(l.pnc), l.estado_envase ?? "", l.nota ?? ""];
      filaDatos(r, C.length, i % 2 === 1, { 3: "dd/mm/yy hh:mm", 12: "#,##0", 13: "#,##0", 14: "#,##0", 15: "#,##0", 16: "#,##0", 17: "dd/mm/yyyy", 18: "dd/mm/yyyy", 19: "0", 20: "0" });
      r.getCell(8).font = letra(9.5, TINTA, true);
      r.getCell(15).font = letra(9.5, TINTA, true);
      if (l.tipo_material !== "ENVASE") pintarFranja(r.getCell(21), franja(l));
      if ((l.dias_para_salir ?? 0) < 0) r.getCell(20).font = letra(9.5, ROJO, true);
    });
    const fin = 6 + Math.max(base.length, 1);
    totales(h, fin + 1, 7, fin, [12, 13, 14, 15, 16], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 8, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }

  /* ================= 3 · POR MATERIAL ================= */
  {
    const h = wb.addWorksheet("Por material", { properties: { tabColor: { argb: VERDE } } });
    const C = ["Código", "Material", "Tipo", "Familia", "Ubicaciones", "Estibas", "Cajas", "Unidades", "Vence primero", "Días p/salir", "Franja", "En riesgo (cajas)"];
    h.columns = [10, 36, 11, 14, 12, 10, 11, 12, 13, 11, 20, 14].map((w) => ({ width: w }));
    cabecera(h, "Por material", sub, C.length);
    encabezado(h, 6, C);
    const est = new Map<string, number>();
    for (const l of base) est.set(l.codigo, (est.get(l.codigo) ?? 0) + Number(l.total_estibas ?? 0));
    const mats = [...materiales].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    mats.forEach((m, i) => {
      const r = h.getRow(7 + i);
      r.values = [m.codigo, m.nombre, matPorSku.get(m.codigo)?.tipo_material ?? "", m.familia ?? "", m.sitios.length, est.get(m.codigo) ?? 0, m.cajas, m.unidades,
        aFecha(m.vence), m.diasSalir, rotFr(m.franja), m.enRiesgoCajas];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "#,##0", 8: "#,##0", 9: "dd/mm/yyyy", 10: "0", 12: "#,##0" });
      r.getCell(1).font = letra(9.5, TINTA, true);
      pintarFranja(r.getCell(11), m.franja);
    });
    const fin = 6 + Math.max(mats.length, 1);
    totales(h, fin + 1, 7, fin, [5, 6, 7, 8, 12], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }

  /* ================= 4 · POR UBICACIÓN ================= */
  {
    const h = wb.addWorksheet("Por ubicación", { properties: { tabColor: { argb: "FF2E6DA4" } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Capacidad (estibas)", "Estibas", "Ocupación", "Cajas", "Materiales", "Renglones"];
    h.columns = [14, 8, 9, 8, 12, 10, 11, 11, 11, 11].map((w) => ({ width: w }));
    cabecera(h, "Por ubicación", sub, C.length);
    encabezado(h, 6, C);
    const us = [...porUbi.values()].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    us.forEach((x, i) => {
      const r = h.getRow(7 + i);
      const occ = x.capacidad ? x.estibas / x.capacidad : null;
      r.values = [x.ubicacion, x.calle ?? "", x.modulo ?? "", x.lado ?? "", x.capacidad, x.estibas, occ, x.cajas, x.materiales.size, x.renglones];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "0%", 8: "#,##0", 9: "0", 10: "0" });
      r.getCell(1).font = letra(9.5, TINTA, true);
      if (occ != null && occ > 1) { r.getCell(7).fill = relleno(FR.pasado.fondo); r.getCell(7).font = letra(9.5, FR.pasado.tinta, true) }
    });
    const fin = 6 + Math.max(us.length, 1);
    totales(h, fin + 1, 7, fin, [6, 8, 10], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 5 · VALIDAR ================= */
  {
    const h = wb.addWorksheet("Validar", { properties: { tabColor: { argb: ROJO } } });
    const C = ["Qué", "Grave", "Ubicación", "Código", "Material", "Detalle", "Recorrido", "Revisado ✓"];
    h.columns = [22, 8, 14, 10, 32, 60, 14, 12].map((w) => ({ width: w }));
    cabecera(h, "Para validar", `${graves} grave(s) · ${ojos.length - graves} para mirar · ${sub}`, C.length);
    encabezado(h, 6, C);
    const orden2 = [...ojos].sort((a, b) => Number(b.grave) - Number(a.grave) || a.tipo.localeCompare(b.tipo) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    orden2.forEach((o, i) => {
      const r = h.getRow(7 + i);
      r.values = [o.tipo, o.grave ? "Sí" : "", o.ubicacion, o.codigo, o.material, o.detalle, o.recorrido, ""];
      filaDatos(r, C.length, i % 2 === 1, {});
      r.getCell(6).alignment = { wrapText: true, vertical: "middle" };
      if (o.detalle.length > 70) r.height = 32;
      if (o.grave) { r.getCell(1).font = letra(9.5, ROJO, true); r.getCell(2).font = letra(9.5, ROJO, true) }
      r.getCell(8).dataValidation = { type: "list", allowBlank: true, formulae: ['"✓,Pendiente"'] };
    });
    if (!orden2.length) { const c = h.getCell(7, 1); c.value = "✓ Nada para validar: la base del día está limpia."; c.font = letra(10, VERDE, true) }
    const fin = 6 + Math.max(orden2.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 6 · SIN CONTAR ================= */
  {
    const h = wb.addWorksheet("Sin contar", { properties: { tabColor: { argb: GRIS } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Familia", "Capacidad"];
    h.columns = [14, 8, 9, 8, 18, 12].map((w) => ({ width: w }));
    cabecera(h, "Sin contar ese día", `${sinContar.length} de ${activas} posiciones activas · ${sub}`, C.length);
    encabezado(h, 6, C);
    sinContar.forEach((u, i) => {
      const r = h.getRow(7 + i);
      r.values = [u.clave, u.calle, u.modulo, u.lado ?? "", u.familia ?? "", u.capacidad];
      filaDatos(r, C.length, i % 2 === 1, { 6: "#,##0" });
    });
    const fin = 6 + Math.max(sinContar.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* Cada hoja cabe a lo ancho de la página al imprimir. */
  for (const h of wb.worksheets) h.pageSetup = { ...h.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: h.name === "Resumen" ? 1 : 0,
    orientation: h.name === "Resumen" ? "portrait" : "landscape", margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  /* Una sola letra en todo el libro: Calibri. */
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => { c.font = { name: "Calibri", ...(c.font ?? {}) } }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return remendarFiltros(crudo, wb);
}

/**
 * LOS FILTROS, UNO POR HOJA. exceljs escribe el nombre _FilterDatabase de
 * cada hoja sin su ámbito, y con más de una hoja filtrada Excel dice
 * «encontramos un problema con parte del contenido» (lo mismo que se
 * arregló en el libro del sider). Se reescribe ese pedazo del XML.
 */
function remendarFiltros(zip: Buffer, wb: ExcelJS.Workbook): Buffer {
  try {
    const partes = unzipSync(new Uint8Array(zip));
    let xml = new TextDecoder().decode(partes["xl/workbook.xml"]);
    const trozos: string[] = [];
    wb.worksheets.forEach((h, i) => {
      if (typeof h.autoFilter !== "string") return;
      const [a, b] = h.autoFilter.split(":");
      const abs = (x: string) => x.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
      const ref = /[\s()]/.test(h.name) || /[^A-Za-z0-9_]/.test(h.name) ? `'${h.name}'` : h.name;
      trozos.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${ref}!${abs(a)}:${abs(b)}</definedName>`);
    });
    /* Los demás nombres (área de impresión, títulos que se repiten) se
       quedan; solo se cambian los de los filtros. */
    const otros = (xml.match(/<definedNames>([\s\S]*?)<\/definedNames>/)?.[1] ?? "")
      .replace(/<definedName[^>]*name="_xlnm\._FilterDatabase"[^>]*>[\s\S]*?<\/definedName>/g, "");
    const bloque = trozos.length || otros ? `<definedNames>${trozos.join("")}${otros}</definedNames>` : "";
    xml = xml.includes("<definedNames>")
      ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque)
      : xml.replace("</sheets>", `</sheets>${bloque}`);
    partes["xl/workbook.xml"] = new TextEncoder().encode(xml);
    return Buffer.from(zipSync(partes));
  } catch {
    return zip;
  }
}
