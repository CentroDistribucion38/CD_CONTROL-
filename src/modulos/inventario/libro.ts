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
  logo: Buffer | null;         // public/marca/logo-bavaria.png
};

/* ---------- La paleta: la de la app ---------- */
const TINTA = "FF12263A", GRIS = "FF5B6B7F", LINEA = "FFD5DCE5", FONDO = "FFF3F5F8", ORO = "FFFFC000", BLANCO = "FFFFFFFF";
const ROJO = "FFC8102E", VERDE = "FF1F7A45";
const FR: Record<Franja, { fondo: string; tinta: string }> = {
  vencido: { fondo: "FFF9D5DB", tinta: "FF8C0C1E" },
  pasado: { fondo: "FFFDE0DD", tinta: "FFB3181F" },
  semana: { fondo: "FFFFE6D1", tinta: "FFA4480C" },
  quince: { fondo: "FFFFF3C4", tinta: "FF7A5600" },
  mes: { fondo: "FFEAF4DA", tinta: "FF4E7A12" },
  ok: { fondo: "FFDCF2E4", tinta: "FF137A40" },
  sinfecha: { fondo: "FFECEFF3", tinta: "FF55606B" },
};
const rotFr = (f: Franja) => FRANJAS.find((x) => x.clave === f)!.rot;

const borde: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: LINEA } }, bottom: { style: "thin", color: { argb: LINEA } },
  left: { style: "thin", color: { argb: LINEA } }, right: { style: "thin", color: { argb: LINEA } },
};
const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fechaLarga = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const aFecha = (s: string | null) => (s ? new Date((s.length === 10 ? s + "T12:00:00" : s)) : null);
const col = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };

/** La franja de arriba de cada hoja: logo, título, subtítulo y la cinta. */
function cabecera(wb: ExcelJS.Workbook, h: ExcelJS.Worksheet, logoId: number | null, titulo: string, sub: string, ancho: number) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 8;
  for (let c = 1; c <= ancho; c++) h.getRow(1).getCell(c).fill = relleno(ORO);
  h.getRow(2).height = 34; h.getRow(3).height = 20; h.getRow(4).height = 8;
  if (logoId != null) h.addImage(logoId, { tl: { col: 0.15, row: 1.15 }, ext: { width: 150, height: 44 } });
  const t = h.getCell(2, 3); t.value = titulo;
  t.font = { name: "Calibri", size: 20, bold: true, color: { argb: TINTA } }; t.alignment = { vertical: "middle" };
  const s = h.getCell(3, 3); s.value = sub;
  s.font = { name: "Calibri", size: 11, color: { argb: GRIS } };
}

/** Encabezado de tabla: tinta con letra blanca, alto y centrado. */
function encabezado(h: ExcelJS.Worksheet, fila: number, titulos: string[]) {
  const r = h.getRow(fila); r.height = 30;
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1); c.value = t;
    c.font = { bold: true, color: { argb: BLANCO }, size: 10 };
    c.fill = relleno(TINTA); c.border = borde;
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

/** Rayado, bordes y formatos de una fila de datos. */
function filaDatos(r: ExcelJS.Row, n: number, par: boolean, fmts: Record<number, string>) {
  r.height = 18;
  for (let c = 1; c <= n; c++) {
    const cel = r.getCell(c);
    cel.border = borde; cel.font = { size: 10, color: { argb: TINTA } };
    cel.alignment = { vertical: "middle" };
    if (par) cel.fill = relleno(FONDO);
    if (fmts[c]) cel.numFmt = fmts[c];
  }
}

/** Totales que SIGUEN AL FILTRO (SUBTOTAL 109): filtras y la cifra cambia. */
function totales(h: ExcelJS.Worksheet, fila: number, desde: number, hasta: number, cols: number[], ancho: number, rotulo = "TOTAL (lo filtrado)") {
  const r = h.getRow(fila); r.height = 22;
  for (let c = 1; c <= ancho; c++) { const cel = r.getCell(c); cel.fill = relleno(ORO); cel.border = borde; cel.font = { bold: true, color: { argb: TINTA } } }
  r.getCell(1).value = rotulo;
  for (const c of cols) {
    const L = col(c);
    /* El resultado va calculado: así se ve bien aunque el programa no
       recalcule al abrir (vista previa del correo, LibreOffice). */
    let suma = 0;
    for (let f = desde; f <= hasta; f++) { const v = h.getRow(f).getCell(c).value; if (typeof v === "number") suma += v }
    r.getCell(c).value = { formula: `SUBTOTAL(109,${L}${desde}:${L}${hasta})`, result: suma };
    r.getCell(c).numFmt = "#,##0";
  }
}

function pintarFranja(cel: ExcelJS.Cell, f: Franja) {
  cel.fill = relleno(FR[f].fondo);
  cel.font = { size: 10, bold: true, color: { argb: FR[f].tinta } };
}

const siNo = (b: boolean | null | undefined) => (b ? "Sí" : "");

export async function armarLibroDia(d: InsumosDia): Promise<Buffer> {
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
  const sub = `${fechaLarga(d.fecha).replace(/^./, (c) => c.toUpperCase())} · ${d.conteos.length} recorrido${d.conteos.length === 1 ? "" : "s"} enviado${d.conteos.length === 1 ? "" : "s"} · exportó ${d.quien}`;

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

  /* ================= 1 · RESUMEN ================= */
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: ORO } } });
    h.columns = [3, 22, 14, 14, 14, 14, 14, 14, 14].map((w) => ({ width: w }));
    cabecera(wb, h, logoId, titulo, sub, 9);
    /* LAS CIFRAS: ocho tarjetas en dos filas. */
    const tarjetas: [string, number | string, string][] = [
      ["CAJAS", totalCajas, "#,##0"], ["UNIDADES", totalUnidades, "#,##0"],
      ["ESTIBAS", base.reduce((a, l) => a + Number(l.total_estibas ?? 0), 0), "#,##0"], ["RENGLONES", base.length, "#,##0"],
      ["UBICACIONES", nUbi, "#,##0"], ["MATERIALES", materiales.length, "#,##0"],
      ["SIN CONTAR", `${sinContar.length} de ${activas}`, "@"], ["POR VALIDAR", graves, "#,##0"],
    ];
    tarjetas.forEach(([rot, v, fmt], i) => {
      const fila = 6 + Math.floor(i / 4) * 3, c0 = 2 + (i % 4) * 2;
      h.mergeCells(fila, c0, fila, c0 + 1); h.mergeCells(fila + 1, c0, fila + 1, c0 + 1);
      const a = h.getCell(fila, c0), b = h.getCell(fila + 1, c0);
      const mal = rot === "POR VALIDAR" && Number(v) > 0;
      a.value = rot; a.font = { size: 9, bold: true, color: { argb: GRIS } }; a.alignment = { vertical: "bottom", indent: 1 };
      b.value = v; b.numFmt = fmt; b.font = { size: 20, bold: true, color: { argb: mal ? ROJO : TINTA } }; b.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      for (const cel of [a, b, h.getCell(fila, c0 + 1), h.getCell(fila + 1, c0 + 1)]) cel.fill = relleno(FONDO);
      a.border = { left: { style: "thick", color: { argb: mal ? ROJO : ORO } } }; b.border = { left: { style: "thick", color: { argb: mal ? ROJO : ORO } } };
      h.getRow(fila + 1).height = 32; h.getRow(fila).height = 18;
    });
    /* LAS FRANJAS */
    let f = 13;
    const t = h.getCell(f, 2); t.value = "Riesgo de vencimiento"; t.font = { size: 13, bold: true, color: { argb: TINTA } };
    f += 1; encabezadoDesde(h, f, 2, ["Franja", "Cajas", "Unidades", "Materiales", "Ubicaciones", "% de cajas"]);
    for (const x of FRANJAS) {
      f += 1; const s = franjas[x.clave];
      const vals = [x.rot, s.cajas, s.unidades, s.materiales, s.renglones, totalCajas ? s.cajas / totalCajas : 0];
      vals.forEach((v, i) => { const cel = h.getCell(f, 2 + i); cel.value = v; cel.border = borde; cel.font = { size: 10, color: { argb: TINTA } };
        cel.numFmt = i === 5 ? "0.0%" : i ? "#,##0" : "@" });
      pintarFranja(h.getCell(f, 2), x.clave);
    }
    /* LOS RECORRIDOS */
    f += 2; const t2 = h.getCell(f, 2); t2.value = "Recorridos que entran en la base"; t2.font = { size: 13, bold: true, color: { argb: TINTA } };
    f += 1; encabezadoDesde(h, f, 2, ["Recorrido", "Contó", "Enviado", "Renglones", "Ubicaciones", "Cajas"]);
    for (const c of d.conteos) {
      f += 1;
      const vals: (string | number | Date | null)[] = [c.codigo, c.responsable ?? "—", aFecha(c.enviado_en), c.renglones, c.ubicaciones, Number(c.total_cajas)];
      vals.forEach((v, i) => { const cel = h.getCell(f, 2 + i); cel.value = v; cel.border = borde; cel.font = { size: 10, color: { argb: TINTA } };
        if (i === 2) cel.numFmt = "dd/mm/yyyy hh:mm"; else if (i >= 3) cel.numFmt = "#,##0" });
    }
    /* LA VALIDACIÓN EN UNA LÍNEA */
    f += 2;
    const v = h.getCell(f, 2);
    v.value = graves ? `⚠ ${graves} renglón(es) por validar: mira la hoja «Validar».` : "✓ Nada grave por validar.";
    v.font = { size: 12, bold: true, color: { argb: graves ? ROJO : VERDE } };
    f += 1;
    const n = h.getCell(f, 2);
    n.value = "La base toma, de cada ubicación, el ÚLTIMO recorrido del día que pasó por ella: una calle caminada dos veces no se suma dos veces.";
    n.font = { size: 9, italic: true, color: { argb: GRIS } };
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  /* ================= 2 · BASE ================= */
  {
    const h = wb.addWorksheet("Base", { properties: { tabColor: { argb: TINTA } } });
    const C = ["Recorrido", "Contó", "Contado", "Calle", "Módulo", "Lado", "Ubicación", "Código", "Material", "Tipo", "Familia",
      "Estibas", "Cajas sueltas", "Saldo", "Total cajas", "Unidades", "Fabricación", "Vencimiento", "Días p/vencer", "Días p/salir",
      "Franja", "Rota", "Avería", "PNC", "Estado envase", "Nota"];
    h.columns = [12, 18, 16, 7, 8, 7, 13, 10, 34, 11, 14, 9, 10, 8, 11, 12, 12, 12, 10, 10, 18, 6, 7, 6, 14, 30].map((w) => ({ width: w }));
    cabecera(wb, h, logoId, "Base consolidada del día", sub, C.length);
    encabezado(h, 6, C);
    base.forEach((l, i) => {
      const u = uxc[l.codigo];
      const r = h.getRow(7 + i);
      r.values = [l.conteo, l.conto ?? "", aFecha(l.contado_en), l.calle ?? "", l.modulo ?? "", l.lado ?? "", ub(l), l.codigo, l.material,
        l.tipo_material, l.familia ?? "", Number(l.estibas ?? 0), Number(l.cajas ?? 0), Number(l.saldo ?? 0), Number(l.total_cajas),
        u ? Number(l.total_cajas) * u : null, aFecha(l.fabricacion), aFecha(l.vencimiento), l.dias_para_vencer, l.dias_para_salir,
        rotFr(franja(l)), siNo(l.rotacion), siNo(l.averia), siNo(l.pnc), l.estado_envase ?? "", l.nota ?? ""];
      filaDatos(r, C.length, i % 2 === 1, { 3: "dd/mm/yy hh:mm", 12: "#,##0", 13: "#,##0", 14: "#,##0", 15: "#,##0", 16: "#,##0", 17: "dd/mm/yyyy", 18: "dd/mm/yyyy", 19: "0", 20: "0" });
      r.getCell(8).font = { size: 10, bold: true, color: { argb: TINTA } };
      r.getCell(15).font = { size: 10, bold: true, color: { argb: TINTA } };
      if (l.tipo_material !== "ENVASE") pintarFranja(r.getCell(21), franja(l));
      if ((l.dias_para_salir ?? 0) < 0) r.getCell(20).font = { size: 10, bold: true, color: { argb: ROJO } };
    });
    const fin = 6 + Math.max(base.length, 1);
    totales(h, fin + 1, 7, fin, [12, 13, 14, 15, 16], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", xSplit: 8, ySplit: 6, showGridLines: false }];
    h.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" };
  }

  /* ================= 3 · POR MATERIAL ================= */
  {
    const h = wb.addWorksheet("Por material", { properties: { tabColor: { argb: "FF1F7A45" } } });
    const C = ["Código", "Material", "Tipo", "Familia", "Ubicaciones", "Estibas", "Cajas", "Unidades", "Vence primero", "Días p/salir", "Franja", "En riesgo (cajas)"];
    h.columns = [10, 36, 11, 14, 12, 10, 11, 12, 13, 11, 20, 14].map((w) => ({ width: w }));
    cabecera(wb, h, logoId, "Por material", sub, C.length);
    encabezado(h, 6, C);
    const est = new Map<string, number>();
    for (const l of base) est.set(l.codigo, (est.get(l.codigo) ?? 0) + Number(l.total_estibas ?? 0));
    const mats = [...materiales].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    mats.forEach((m, i) => {
      const r = h.getRow(7 + i);
      r.values = [m.codigo, m.nombre, matPorSku.get(m.codigo)?.tipo_material ?? "", m.familia ?? "", m.sitios.length, est.get(m.codigo) ?? 0, m.cajas, m.unidades,
        aFecha(m.vence), m.diasSalir, rotFr(m.franja), m.enRiesgoCajas];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "#,##0", 8: "#,##0", 9: "dd/mm/yyyy", 10: "0", 12: "#,##0" });
      r.getCell(1).font = { size: 10, bold: true, color: { argb: TINTA } };
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
    cabecera(wb, h, logoId, "Por ubicación", sub, C.length);
    encabezado(h, 6, C);
    const us = [...porUbi.values()].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    us.forEach((x, i) => {
      const r = h.getRow(7 + i);
      const occ = x.capacidad ? x.estibas / x.capacidad : null;
      r.values = [x.ubicacion, x.calle ?? "", x.modulo ?? "", x.lado ?? "", x.capacidad, x.estibas, occ, x.cajas, x.materiales.size, x.renglones];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "0%", 8: "#,##0", 9: "0", 10: "0" });
      r.getCell(1).font = { size: 10, bold: true, color: { argb: TINTA } };
      if (occ != null && occ > 1) { r.getCell(7).fill = relleno(FR.pasado.fondo); r.getCell(7).font = { size: 10, bold: true, color: { argb: FR.pasado.tinta } } }
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
    cabecera(wb, h, logoId, "Para validar", `${graves} grave(s) · ${ojos.length - graves} para mirar · ${sub}`, C.length);
    encabezado(h, 6, C);
    const orden2 = [...ojos].sort((a, b) => Number(b.grave) - Number(a.grave) || a.tipo.localeCompare(b.tipo) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    orden2.forEach((o, i) => {
      const r = h.getRow(7 + i);
      r.values = [o.tipo, o.grave ? "Sí" : "", o.ubicacion, o.codigo, o.material, o.detalle, o.recorrido, ""];
      filaDatos(r, C.length, i % 2 === 1, {});
      r.getCell(6).alignment = { wrapText: true, vertical: "middle" };
      if (o.detalle.length > 70) r.height = 32;
      if (o.grave) { r.getCell(1).font = { size: 10, bold: true, color: { argb: ROJO } }; r.getCell(2).font = { size: 10, bold: true, color: { argb: ROJO } } }
      r.getCell(8).dataValidation = { type: "list", allowBlank: true, formulae: ['"✓,Pendiente"'] };
    });
    if (!orden2.length) { const c = h.getCell(7, 1); c.value = "✓ Nada para validar: la base del día está limpia."; c.font = { bold: true, color: { argb: VERDE } } }
    const fin = 6 + Math.max(orden2.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }

  /* ================= 6 · SIN CONTAR ================= */
  {
    const h = wb.addWorksheet("Sin contar", { properties: { tabColor: { argb: GRIS } } });
    const C = ["Ubicación", "Calle", "Módulo", "Lado", "Familia", "Capacidad"];
    h.columns = [14, 8, 9, 8, 18, 12].map((w) => ({ width: w }));
    cabecera(wb, h, logoId, "Sin contar ese día", `${sinContar.length} de ${activas} posiciones activas · ${sub}`, C.length);
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
  for (const h of wb.worksheets) h.pageSetup = { ...h.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    orientation: h.name === "Resumen" ? "portrait" : "landscape", margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  /* Una sola letra en todo el libro: Calibri. */
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => { c.font = { name: "Calibri", ...(c.font ?? {}) } }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return remendarFiltros(crudo, wb);
}

function encabezadoDesde(h: ExcelJS.Worksheet, fila: number, desde: number, titulos: string[]) {
  const r = h.getRow(fila); r.height = 24;
  titulos.forEach((t, i) => {
    const c = r.getCell(desde + i); c.value = t;
    c.font = { bold: true, color: { argb: BLANCO }, size: 10 }; c.fill = relleno(TINTA); c.border = borde;
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
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
    const bloque = trozos.length ? `<definedNames>${trozos.join("")}</definedNames>` : "";
    xml = xml.includes("<definedNames>")
      ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque)
      : xml.replace("</sheets>", `</sheets>${bloque}`);
    partes["xl/workbook.xml"] = new TextEncoder().encode(xml);
    return Buffer.from(zipSync(partes));
  } catch {
    return zip;
  }
}
