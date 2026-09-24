// src/modulos/inventario/libro.ts
import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";

// src/modulos/inventario/riesgo.ts
var FRANJAS = [
  { clave: "vencido", rot: "Ya vencido", corto: "Vencido", que: "pas\xF3 su fecha de vencimiento: no se puede despachar" },
  { clave: "pasado", rot: "Ya no alcanza a salir", corto: "Pas\xF3 de salida", que: "no llega al cliente con la vida \xFAtil m\xEDnima" },
  { clave: "semana", rot: "Sale esta semana", corto: "0\u20137 d\xEDas", que: "tiene que salir en los pr\xF3ximos 7 d\xEDas" },
  { clave: "quince", rot: "Sale en 8 a 15 d\xEDas", corto: "8\u201315 d\xEDas", que: "hay que programarlo" },
  { clave: "mes", rot: "Sale en 16 a 30 d\xEDas", corto: "16\u201330 d\xEDas", que: "vigilar" },
  { clave: "ok", rot: "Con margen", corto: "+30 d\xEDas", que: "m\xE1s de un mes para salir" },
  { clave: "sinfecha", rot: "Sin fecha", corto: "Sin fecha", que: "no se le puede calcular cu\xE1ndo sale" }
];
function franja(r) {
  if (r.dias_para_vencer != null && r.dias_para_vencer < 0) return "vencido";
  const d = r.dias_para_salir;
  if (d == null) return "sinfecha";
  if (d < 0) return "pasado";
  if (d <= 7) return "semana";
  if (d <= 15) return "quince";
  if (d <= 30) return "mes";
  return "ok";
}
var ORDEN = { vencido: 0, pasado: 1, semana: 2, quince: 3, mes: 4, ok: 5, sinfecha: 6 };
var peor = (a, b) => ORDEN[a] <= ORDEN[b] ? a : b;
var enRiesgo = (f) => ORDEN[f] <= ORDEN.mes;
var num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};
function medirRiesgo(lineas, conteos, uxcPorSku) {
  const cuando = new Map(conteos.map((c) => [c.id, c.enviado_en ?? c.fecha_analisis ?? ""]));
  const ultimoPorSitio = /* @__PURE__ */ new Map();
  for (const l of lineas) {
    const k = l.ubicacion_id ?? l.ubicacion ?? "\u2014";
    const actual = ultimoPorSitio.get(k);
    if (!actual || (cuando.get(l.conteo_id) ?? "") > (cuando.get(actual) ?? "")) ultimoPorSitio.set(k, l.conteo_id);
  }
  const foto = lineas.filter((l) => ultimoPorSitio.get(l.ubicacion_id ?? l.ubicacion ?? "\u2014") === l.conteo_id);
  const usados = new Set(foto.map((l) => l.conteo_id));
  const fechas = conteos.filter((c) => usados.has(c.id)).map((c) => c.fecha_analisis).filter(Boolean).sort();
  const vacia = () => ({ cajas: 0, unidades: 0, renglones: 0, materiales: 0, sinUxc: 0 });
  const franjas = Object.fromEntries(FRANJAS.map((f) => [f.clave, vacia()]));
  const porMat = /* @__PURE__ */ new Map();
  const matsPorFranja = /* @__PURE__ */ new Map();
  let totalCajas = 0, totalUnidades = 0;
  for (const l of foto) {
    if (l.tipo_material === "ENVASE") continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    const tc = num(l.total_cajas);
    const un = uxc ? tc * uxc : null;
    const f = franja(l);
    const fr = franjas[f];
    fr.cajas += tc;
    fr.renglones += 1;
    if (un != null) fr.unidades += un;
    else fr.sinUxc += 1;
    (matsPorFranja.get(f) ?? matsPorFranja.set(f, /* @__PURE__ */ new Set()).get(f)).add(l.codigo);
    totalCajas += tc;
    if (un != null) totalUnidades += un;
    const m = porMat.get(l.codigo) ?? {
      codigo: l.codigo,
      nombre: l.material,
      familia: l.familia,
      uxc,
      cajas: 0,
      unidades: uxc ? 0 : null,
      enRiesgoCajas: 0,
      enRiesgoUnidades: uxc ? 0 : null,
      franja: "ok",
      diasSalir: null,
      vence: null,
      sitios: []
    };
    m.cajas += tc;
    if (m.unidades != null && un != null) m.unidades += un;
    if (enRiesgo(f)) {
      m.enRiesgoCajas += tc;
      if (m.enRiesgoUnidades != null && un != null) m.enRiesgoUnidades += un;
    }
    m.franja = m.sitios.length ? peor(m.franja, f) : f;
    if (l.dias_para_salir != null && (m.diasSalir == null || l.dias_para_salir < m.diasSalir)) {
      m.diasSalir = l.dias_para_salir;
      m.vence = l.vencimiento;
    }
    m.sitios.push({
      id: l.id,
      ubicacion: l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicaci\xF3n",
      calle: l.calle,
      modulo: l.modulo,
      lado: l.lado,
      vencimiento: l.vencimiento,
      fabricacion: l.fabricacion,
      dias_para_vencer: l.dias_para_vencer,
      dias_para_salir: l.dias_para_salir,
      estibas: num(l.estibas),
      cajas: num(l.cajas),
      saldo: num(l.saldo),
      total_cajas: tc,
      unidades: un,
      franja: f,
      averia: !!l.averia,
      pnc: !!l.pnc,
      nota: l.nota,
      conto: l.conto,
      contado_en: l.contado_en,
      conteo: l.conteo
    });
    porMat.set(l.codigo, m);
  }
  for (const [f, s] of matsPorFranja) franjas[f].materiales = s.size;
  const materiales = [...porMat.values()].map((m) => ({
    ...m,
    sitios: m.sitios.sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || (a.dias_para_salir ?? 1e9) - (b.dias_para_salir ?? 1e9) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }))
  })).sort((a, b) => ORDEN[a.franja] - ORDEN[b.franja] || b.enRiesgoCajas - a.enRiesgoCajas || b.cajas - a.cajas);
  const semanas = Array.from({ length: 9 }, (_, i) => ({ rot: i === 0 ? "Pas\xF3" : i === 1 ? "Esta" : `S+${i - 1}`, cajas: 0, unidades: 0 }));
  for (const l of foto) {
    if (l.tipo_material === "ENVASE" || l.dias_para_salir == null) continue;
    const i = l.dias_para_salir < 0 || franja(l) === "vencido" ? 0 : Math.floor(l.dias_para_salir / 7) + 1;
    if (i > 8) continue;
    const uxc = uxcPorSku[l.codigo] ?? null;
    semanas[i].cajas += num(l.total_cajas);
    if (uxc) semanas[i].unidades += num(l.total_cajas) * uxc;
  }
  return {
    foto,
    franjas,
    materiales,
    semanas,
    totalCajas,
    totalUnidades,
    ubicaciones: new Set(foto.map((l) => l.ubicacion_id ?? l.ubicacion)).size,
    desde: fechas[0] ?? null,
    hasta: fechas.at(-1) ?? null,
    recorridos: usados.size
  };
}

// src/modulos/inventario/libro.ts
var COLORES_MARCA = { tinta: "12263A", banda: "FFC000" };
var hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
var aHex = (c) => "FF" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
var aclarar = (h, t) => aHex(hex(h).map((c) => 255 - (255 - c) * t));
var oscurecer = (h, k) => aHex(hex(h).map((c) => c * k));
var BLANCO = "FFFFFFFF";
var ROJO = "FFC6202A";
var VERDE = "FF1F7A45";
var ROSA = "FFFFF4F4";
var MENTA = "FFEFF8F2";
var TINTA = "";
var BANDA = "";
var GRIS = "";
var LINEA = "";
var FONDO = "";
var CAJA = "";
var PANEL = "";
var CABEZA = "";
var ENLACE = "";
function usarColores(c) {
  const ok = (x) => /^[0-9a-f]{6}$/i.test(x);
  const t = ok(c.tinta) ? c.tinta : COLORES_MARCA.tinta, b = ok(c.banda) ? c.banda : COLORES_MARCA.banda;
  TINTA = aHex(hex(t));
  BANDA = aHex(hex(b));
  GRIS = aclarar(t, 0.64);
  LINEA = aclarar(t, 0.12);
  FONDO = aclarar(t, 0.045);
  CAJA = aclarar(t, 0.035);
  PANEL = aclarar(t, 0.055);
  CABEZA = aclarar(t, 0.15);
  ENLACE = oscurecer(b, 0.54);
}
var FR = {
  vencido: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  pasado: { fondo: "FFFDE3E3", tinta: "FFC6202A" },
  semana: { fondo: "FFFDEBDB", tinta: "FFB4530A" },
  quince: { fondo: "FFFFF4D1", tinta: "FF8A6A00" },
  mes: { fondo: "FFF1F6DC", tinta: "FF5E7314" },
  ok: { fondo: "FFE3F2E8", tinta: "FF1F7A45" },
  sinfecha: { fondo: "FFF0F0EE", tinta: "FF6B6B66" }
};
var rotFr = (f) => FRANJAS.find((x) => x.clave === f).rot;
var NUM = "#,##0;\\-#,##0;\\\u2013";
var PCT = "0.0%;\\-0.0%;\\\u2013";
var raya = () => ({ style: "thin", color: { argb: LINEA } });
var relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
var fechaLarga = (s) => (/* @__PURE__ */ new Date(s + "T12:00:00")).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
var aFecha = (s) => s ? new Date(s.length === 10 ? s + "T12:00:00" : s) : null;
var col = (n) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
var letra = (size, color, bold = false, italic = false) => ({ name: "Calibri", size, bold, italic, color: { argb: color } });
var vinculo = (hoja, texto) => ({ formula: `HYPERLINK("#'${hoja}'!A1","${texto.replace(/"/g, '""')}")`, result: texto });
function cabecera(h, titulo, sub, ancho) {
  h.views = [{ showGridLines: false }];
  h.getRow(1).height = 6;
  for (let c = 1; c <= ancho; c++) h.getRow(1).getCell(c).fill = relleno(BANDA);
  h.getRow(2).height = 8;
  h.getRow(3).height = 26;
  h.getRow(4).height = 16;
  h.getRow(5).height = 16;
  const t = h.getCell(3, 1);
  t.value = titulo;
  t.font = letra(16, TINTA, true);
  t.alignment = { vertical: "middle" };
  const s = h.getCell(4, 1);
  s.value = sub;
  s.font = letra(9.5, GRIS);
  const v = h.getCell(5, 1);
  v.value = vinculo("Resumen", "\u2190 volver al resumen");
  v.font = letra(9.5, ENLACE, true);
}
function encabezado(h, fila, titulos) {
  const r = h.getRow(fila);
  r.height = 26;
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = letra(9, BLANCO, true);
    c.fill = relleno(TINTA);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}
function filaDatos(r, n, par, fmts) {
  r.height = 18;
  for (let c = 1; c <= n; c++) {
    const cel = r.getCell(c);
    cel.border = { bottom: raya() };
    cel.font = letra(9.5, TINTA);
    cel.alignment = { vertical: "middle" };
    if (par) cel.fill = relleno(FONDO);
    if (fmts[c]) cel.numFmt = fmts[c];
  }
}
function totales(h, fila, desde, hasta, cols, ancho, rotulo = "TOTAL (lo filtrado)") {
  const r = h.getRow(fila);
  r.height = 22;
  for (let c = 1; c <= ancho; c++) {
    const cel = r.getCell(c);
    cel.fill = relleno(FONDO);
    cel.border = { top: { style: "medium", color: { argb: TINTA } } };
    cel.font = letra(9.5, TINTA, true);
    cel.alignment = { vertical: "middle" };
  }
  r.getCell(1).value = rotulo;
  for (const c of cols) {
    const L = col(c);
    let suma = 0;
    for (let f = desde; f <= hasta; f++) {
      const v = h.getRow(f).getCell(c).value;
      if (typeof v === "number") suma += v;
    }
    r.getCell(c).value = { formula: `SUBTOTAL(109,${L}${desde}:${L}${hasta})`, result: suma };
    r.getCell(c).numFmt = NUM;
  }
}
function pintarFranja(cel, f) {
  cel.fill = relleno(FR[f].fondo);
  cel.font = letra(9.5, FR[f].tinta, true);
}
var siNo = (b) => b ? "S\xED" : "";
async function armarLibroDia(d) {
  usarColores(d.colores ?? COLORES_MARCA);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL \xB7 Inventario";
  wb.created = /* @__PURE__ */ new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const logoId = d.logo ? wb.addImage({ buffer: d.logo, extension: "png" }) : null;
  const uxc = Object.fromEntries(d.materiales.map((m) => [m.sku, m.unidades_por_caja]));
  const { foto, franjas, materiales, totalCajas, totalUnidades, ubicaciones: nUbi } = medirRiesgo(d.lineas, d.conteos, uxc);
  const enFoto = new Set(foto.map((l) => l.id));
  const reemplazados = d.lineas.filter((l) => !enFoto.has(l.id));
  const matPorSku = new Map(d.materiales.map((m) => [m.sku, m]));
  const orden = (a, b) => (a.ubicacion_combinada ?? a.ubicacion ?? "").localeCompare(b.ubicacion_combinada ?? b.ubicacion ?? "", "es", { numeric: true }) || a.codigo.localeCompare(b.codigo);
  const base = [...foto].sort(orden);
  const titulo = `Inventario consolidado \xB7 ${d.bodega}`;
  const parcial = d.totalDelDia != null && d.totalDelDia > d.conteos.length;
  const sub = `${fechaLarga(d.fecha).replace(/^./, (c) => c.toUpperCase())}  \xB7  ` + (parcial ? `${d.conteos.length} de ${d.totalDelDia} FEFO del d\xEDa (escogidos: ${d.conteos.map((c) => c.codigo).join(", ")})` : `${d.conteos.length} FEFO enviado${d.conteos.length === 1 ? "" : "s"}`) + ` \xB7 export\xF3 ${d.quien}`;
  const ojos = [];
  const ub = (l) => l.ubicacion_combinada ?? l.ubicacion ?? "Sin ubicaci\xF3n";
  const vistos = /* @__PURE__ */ new Map();
  for (const l of base) {
    const k = `${ub(l)}|${l.codigo}|${l.vencimiento ?? ""}`;
    if (vistos.has(k)) ojos.push({ tipo: "Repetido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Mismo material y vencimiento anotado dos veces en la misma ubicaci\xF3n.", recorrido: l.conteo });
    vistos.set(k, l);
    const f = franja(l);
    if (l.tipo_material !== "ENVASE" && !l.vencimiento) ojos.push({ tipo: "Sin fecha", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "Producto sin fecha de vencimiento: no se puede saber cu\xE1ndo sale.", recorrido: l.conteo });
    if (f === "vencido") ojos.push({ tipo: "Vencido", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Venci\xF3 hace ${-(l.dias_para_vencer ?? 0)} d\xEDa(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    else if (f === "pasado") ojos.push({ tipo: "Pas\xF3 de salida", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Debi\xF3 salir hace ${-(l.dias_para_salir ?? 0)} d\xEDa(s). ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
    if (!matPorSku.has(l.codigo)) ojos.push({ tipo: "C\xF3digo fuera del maestro", grave: true, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El c\xF3digo no est\xE1 en el maestro de materiales.", recorrido: l.conteo });
    else if (l.tipo_material !== "ENVASE" && !uxc[l.codigo]) ojos.push({ tipo: "Sin unidades por caja", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: "El maestro no trae unidades por caja: no suma en unidades.", recorrido: l.conteo });
    if (l.averia || l.pnc) ojos.push({ tipo: l.averia ? "Aver\xEDa" : "PNC", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: l.nota ?? "Marcado en el conteo.", recorrido: l.conteo });
  }
  const porUbi = /* @__PURE__ */ new Map();
  for (const l of base) {
    const k = ub(l);
    const x = porUbi.get(k) ?? { ubicacion: k, calle: l.calle, modulo: l.modulo, lado: l.lado, capacidad: l.capacidad, estibas: 0, cajas: 0, renglones: 0, materiales: /* @__PURE__ */ new Set() };
    x.estibas += Number(l.total_estibas ?? 0);
    x.cajas += Number(l.total_cajas ?? 0);
    x.renglones += 1;
    x.materiales.add(l.codigo);
    porUbi.set(k, x);
  }
  for (const x of porUbi.values()) if (x.capacidad && x.estibas > x.capacidad)
    ojos.push({ tipo: "Sobre capacidad", grave: false, ubicacion: x.ubicacion, codigo: "", material: "", detalle: `Hay ${x.estibas} estibas y caben ${x.capacidad}.`, recorrido: "" });
  for (const l of reemplazados)
    ojos.push({ tipo: "Reemplazado", grave: false, ubicacion: ub(l), codigo: l.codigo, material: l.material, detalle: `Esa ubicaci\xF3n se volvi\xF3 a contar ese d\xEDa: vale el recorrido m\xE1s reciente. Aqu\xED dec\xEDa ${Number(l.total_cajas)} cajas.`, recorrido: l.conteo });
  const graves = ojos.filter((o) => o.grave).length;
  const contadas = new Set(foto.map((l) => l.ubicacion_id).filter(Boolean));
  const sinContar = d.ubicaciones.filter((u) => u.activa && !contadas.has(u.id)).sort((a, b) => a.clave.localeCompare(b.clave, "es", { numeric: true }));
  const activas = d.ubicaciones.filter((u) => u.activa).length;
  {
    const h = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: BANDA } } });
    h.columns = [2, 13.5, 11, 11.5, 11.5, 11, 11.5, 11, 11, 2].map((w) => ({ width: w }));
    h.views = [{ showGridLines: false }];
    const alto = (f2, v) => {
      h.getRow(f2).height = v;
    };
    const pon = (f2, c, v, fuente, extra = {}) => {
      const cel = h.getCell(f2, c);
      cel.value = v;
      cel.font = fuente;
      Object.assign(cel, extra);
      return cel;
    };
    const pintar = (f2, c1, c2, argb) => {
      for (let c = c1; c <= c2; c++) h.getCell(f2, c).fill = relleno(argb);
    };
    const unir = (f2, c1, c2) => {
      if (c2 > c1) h.mergeCells(f2, c1, f2, c2);
    };
    [6, 9.75, 33.75, 18, 13.5].forEach((v, i) => alto(i + 1, v));
    pintar(1, 1, 10, BANDA);
    if (logoId != null) h.addImage(logoId, { tl: { col: 1.05, row: 2.08 }, ext: { width: 42, height: 42 } });
    pon(3, 3, titulo, letra(22, TINTA, true), { alignment: { vertical: "middle" } });
    pon(4, 3, sub, letra(9.5, GRIS));
    unir(3, 8, 9);
    pon(3, 8, "UBICACIONES DEL ALMAC\xC9N", letra(7.5, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    unir(4, 8, 9);
    pon(4, 8, activas, letra(12, TINTA, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "top" } });
    const avance = activas ? nUbi / activas : 0, bloques = Math.max(avance > 0 ? 1 : 0, Math.round(avance * 18));
    [15.75, 43.5, 19.5, 12].forEach((v, i) => alto(6 + i, v));
    for (let f2 = 6; f2 <= 9; f2++) {
      pintar(f2, 2, 9, PANEL);
      h.getCell(f2, 2).border = { left: { style: "thick", color: { argb: BANDA } } };
    }
    pon(6, 2, "  AVANCE DEL CONTEO", letra(8.5, GRIS, true), { alignment: { vertical: "bottom" } });
    unir(7, 2, 4);
    pon(7, 2, avance, letra(40, TINTA, true), { numFmt: "0.0%", alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
    unir(8, 2, 4);
    pon(8, 2, `${nUbi.toLocaleString("es-CO")} de ${activas.toLocaleString("es-CO")} ubicaciones`, letra(10, GRIS, true), { alignment: { vertical: "bottom", indent: 1 } });
    unir(7, 5, 7);
    pon(7, 5, "\u2588".repeat(bloques) + "\u2591".repeat(18 - bloques), letra(20, BANDA), { alignment: { vertical: "middle" } });
    unir(8, 5, 7);
    pon(8, 5, `cada bloque \u2248 ${Math.max(1, Math.round(activas / 18))} ubicaciones`, letra(9, GRIS), { alignment: { vertical: "middle" } });
    unir(7, 8, 9);
    pon(7, 8, sinContar.length, letra(32, sinContar.length ? ROJO : VERDE, true), { numFmt: "#,##0", alignment: { horizontal: "right", vertical: "middle", indent: 1 } });
    unir(8, 8, 9);
    pon(8, 8, "SIN CONTAR  ", letra(9, GRIS, true), { alignment: { horizontal: "right", vertical: "bottom" } });
    const tarjetas = (f2, titulo2, cs) => {
      alto(f2 - 1, 13.5);
      alto(f2, 15.75);
      alto(f2 + 1, 18);
      alto(f2 + 2, 33.75);
      pon(f2, 2, titulo2, letra(8, TINTA, true));
      cs.forEach(([rot, v, fmt, raya2, color], i) => {
        const c0 = 2 + i * 2;
        unir(f2 + 1, c0, c0 + 1);
        unir(f2 + 2, c0, c0 + 1);
        pintar(f2 + 1, c0, c0 + 1, CAJA);
        pintar(f2 + 2, c0, c0 + 1, CAJA);
        const lados = { left: { style: "thick", color: { argb: raya2 } }, right: { style: "thick", color: { argb: BLANCO } } };
        pon(f2 + 1, c0, rot, letra(7.5, GRIS, true), { border: lados, alignment: { horizontal: "left", vertical: "bottom", indent: 1 } });
        pon(f2 + 2, c0, v, letra(22, color ?? TINTA, true), { numFmt: fmt, border: lados, alignment: { horizontal: "left", vertical: "middle", indent: 1 } });
      });
    };
    const estibas = base.reduce((a, l) => a + Number(l.total_estibas ?? 0), 0);
    tarjetas(11, "LO CONTADO", [["CAJAS", totalCajas, NUM, BANDA], ["UNIDADES", totalUnidades, NUM, BANDA], ["ESTIBAS", estibas, NUM, BANDA], ["RENGLONES", base.length, NUM, BANDA]]);
    const vencidas = franjas.vencido.cajas + franjas.pasado.cajas;
    const margen = totalCajas ? franjas.ok.cajas / totalCajas : 0;
    tarjetas(15, "PARA REVISAR", [
      ["MATERIALES", materiales.length, NUM, BANDA],
      ["VENCIDAS \xB7 CAJAS", vencidas, NUM, vencidas ? ROJO : VERDE, vencidas ? ROJO : VERDE],
      ["POR VALIDAR", graves, NUM, graves ? ROJO : VERDE, graves ? ROJO : VERDE],
      ["CON MARGEN", margen, PCT, VERDE, VERDE]
    ]);
    alto(18, 13.5);
    alto(19, 6);
    const cols = [[2, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9]];
    const fila = (f2, vals, tipo, fmts = []) => {
      alto(f2, tipo === "dato" ? 19.5 : 21.75);
      vals.forEach((v, i) => {
        const [a, b] = cols[i];
        unir(f2, a, b);
        const cel = h.getCell(f2, a);
        if (v !== void 0) cel.value = v;
        cel.font = tipo === "cabeza" ? letra(9, TINTA, true) : letra(9.5, TINTA, tipo === "total");
        if (fmts[i]) cel.numFmt = fmts[i];
        cel.alignment = { vertical: "middle", horizontal: i === 0 || tipo === "cabeza" && i === 6 ? "left" : "right", indent: 1 };
      });
      for (let c = 2; c <= 9; c++) {
        const cel = h.getCell(f2, c);
        if (tipo === "cabeza") cel.fill = relleno(CABEZA);
        else if (tipo === "total") {
          cel.fill = relleno(FONDO);
          cel.border = { top: { style: "medium", color: { argb: TINTA } } };
        } else cel.border = { bottom: raya() };
      }
    };
    alto(20, 19.5);
    pon(20, 2, "Riesgo de vencimiento", letra(11, TINTA, true));
    fila(21, ["Franja", "Cajas", "Unidades", "Materiales", "Ubicaciones", "% de cajas", ""], "cabeza");
    let f = 21;
    for (const x of FRANJAS) {
      f += 1;
      const s = franjas[x.clave], pc = totalCajas ? s.cajas / totalCajas : 0;
      fila(f, [x.rot, s.cajas, s.unidades, s.materiales, s.renglones, pc, pc > 0 ? "\u2588".repeat(Math.max(1, Math.round(pc * 8))) : ""], "dato", [, NUM, NUM, NUM, NUM, PCT]);
      pintarFranja(h.getCell(f, 2), x.clave);
      h.getCell(f, 8).font = letra(9.5, TINTA, true);
      const barra = h.getCell(f, 9);
      barra.font = letra(10, FR[x.clave].tinta);
      barra.alignment = { horizontal: "left", vertical: "middle" };
    }
    const d1 = 22, d2 = f;
    f += 1;
    fila(f, [
      "Total",
      { formula: `SUM(D${d1}:D${d2})`, result: totalCajas },
      { formula: `SUM(E${d1}:E${d2})`, result: totalUnidades },
      `${materiales.length} distintos`,
      void 0,
      { formula: `SUM(H${d1}:H${d2})`, result: totalCajas ? 1 : 0 },
      void 0
    ], "total", [, NUM, NUM, , , PCT]);
    h.getCell(f, 6).font = letra(8.5, GRIS);
    const filaTotal = f;
    f += 1;
    alto(f, 13.5);
    f += 1;
    alto(f, 19.5);
    pon(f, 2, "Recorridos que entran en la base", letra(11, TINTA, true));
    f += 1;
    fila(f, ["Recorrido", "Cont\xF3", "Enviado", "Renglones", "Ubicaciones", "Cajas", ""], "cabeza");
    for (const c of [3, 4]) h.getCell(f, c + 1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    const r1 = f + 1;
    for (const c of d.conteos) {
      f += 1;
      const env = aFecha(c.enviado_en);
      fila(f, [
        c.codigo,
        c.responsable ?? "\u2014",
        env ? env.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).replace(",", "") : "\u2014",
        c.renglones,
        c.ubicaciones,
        Number(c.total_cajas),
        ""
      ], "dato", [, , , NUM, NUM, NUM]);
      for (const k of [4, 5]) h.getCell(f, k).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    }
    const r2 = f, cajasRec = d.conteos.reduce((a, c) => a + Number(c.total_cajas), 0);
    f += 1;
    fila(f, [
      "Total",
      void 0,
      void 0,
      { formula: `SUM(F${r1}:F${r2})`, result: d.conteos.reduce((a, c) => a + c.renglones, 0) },
      { formula: `SUM(G${r1}:G${r2})`, result: d.conteos.reduce((a, c) => a + c.ubicaciones, 0) },
      { formula: `SUM(H${r1}:H${r2})`, result: cajasRec },
      void 0
    ], "total", [, , , NUM, NUM, NUM]);
    const filaRec = f;
    f += 1;
    alto(f, 21.75);
    unir(f, 2, 3);
    pon(f, 2, "Cuadre de cajas", letra(9, GRIS, true), { alignment: { vertical: "middle", indent: 1 } });
    unir(f, 4, 7);
    pon(f, 4, `${cajasRec.toLocaleString("es-CO")} en los recorridos  \u2212  ${totalCajas.toLocaleString("es-CO")} en el consolidado (lo que se volvi\xF3 a contar)`, letra(9, GRIS), { alignment: { vertical: "middle", wrapText: true } });
    const dif = cajasRec - totalCajas;
    pon(f, 8, { formula: `H${filaRec}-D${filaTotal}`, result: dif }, letra(10, dif ? ROJO : VERDE, true), { numFmt: NUM, alignment: { horizontal: "right", vertical: "middle", indent: 1 } });
    f += 1;
    alto(f, 12);
    f += 1;
    alto(f, 27.75);
    unir(f, 2, 9);
    pintar(f, 2, 9, graves ? ROSA : MENTA);
    pon(
      f,
      2,
      graves ? vinculo("Validar", `  \u26A0  ${graves} rengl\xF3n${graves === 1 ? "" : "es"} por validar  \u2192  abrir la hoja Validar`) : "  \u2713  Nada grave por validar",
      letra(10, graves ? ROJO : VERDE, true, false),
      { alignment: { vertical: "middle" }, border: { left: { style: "thick", color: { argb: graves ? ROJO : VERDE } } } }
    );
    if (graves) h.getCell(f, 2).font = { ...letra(10, ROJO, true), underline: true };
    f += 1;
    alto(f, 31.5);
    unir(f, 2, 9);
    pon(
      f,
      2,
      "La base toma, de cada ubicaci\xF3n, el \xDALTIMO recorrido del d\xEDa que pas\xF3 por ella: una calle caminada dos veces no se suma dos veces. El detalle est\xE1 en las hojas Base, Por material, Por ubicaci\xF3n y Sin contar.",
      letra(8, GRIS, false, true),
      { alignment: { wrapText: true, vertical: "top" } }
    );
    h.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true };
    h.pageSetup.printArea = `A1:J${f}`;
  }
  {
    const h = wb.addWorksheet("Base", { properties: { tabColor: { argb: TINTA } } });
    const C = [
      "Recorrido",
      "Cont\xF3",
      "Contado",
      "Calle",
      "M\xF3dulo",
      "Lado",
      "Ubicaci\xF3n",
      "C\xF3digo",
      "Material",
      "Tipo",
      "Familia",
      "Estibas",
      "Cajas sueltas",
      "Saldo",
      "Total cajas",
      "Unidades",
      "Fabricaci\xF3n",
      "Vencimiento",
      "D\xEDas p/vencer",
      "D\xEDas p/salir",
      "Franja",
      "Rota",
      "Aver\xEDa",
      "PNC",
      "Estado envase",
      "Nota"
    ];
    h.columns = [12, 18, 16, 7, 8, 7, 13, 10, 34, 11, 14, 9, 10, 8, 11, 12, 12, 12, 10, 10, 18, 6, 7, 6, 14, 30].map((w) => ({ width: w }));
    cabecera(h, "Base consolidada del d\xEDa", sub, C.length);
    encabezado(h, 6, C);
    base.forEach((l, i) => {
      const u = uxc[l.codigo];
      const r = h.getRow(7 + i);
      r.values = [
        l.conteo,
        l.conto ?? "",
        aFecha(l.contado_en),
        l.calle ?? "",
        l.modulo ?? "",
        l.lado ?? "",
        ub(l),
        l.codigo,
        l.material,
        l.tipo_material,
        l.familia ?? "",
        Number(l.estibas ?? 0),
        Number(l.cajas ?? 0),
        Number(l.saldo ?? 0),
        Number(l.total_cajas),
        u ? Number(l.total_cajas) * u : null,
        aFecha(l.fabricacion),
        aFecha(l.vencimiento),
        l.dias_para_vencer,
        l.dias_para_salir,
        rotFr(franja(l)),
        siNo(l.rotacion),
        siNo(l.averia),
        siNo(l.pnc),
        l.estado_envase ?? "",
        l.nota ?? ""
      ];
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
  {
    const h = wb.addWorksheet("Por material", { properties: { tabColor: { argb: VERDE } } });
    const C = ["C\xF3digo", "Material", "Tipo", "Familia", "Ubicaciones", "Estibas", "Cajas", "Unidades", "Vence primero", "D\xEDas p/salir", "Franja", "En riesgo (cajas)"];
    h.columns = [10, 36, 11, 14, 12, 10, 11, 12, 13, 11, 20, 14].map((w) => ({ width: w }));
    cabecera(h, "Por material", sub, C.length);
    encabezado(h, 6, C);
    const est = /* @__PURE__ */ new Map();
    for (const l of base) est.set(l.codigo, (est.get(l.codigo) ?? 0) + Number(l.total_estibas ?? 0));
    const mats = [...materiales].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
    mats.forEach((m, i) => {
      const r = h.getRow(7 + i);
      r.values = [
        m.codigo,
        m.nombre,
        matPorSku.get(m.codigo)?.tipo_material ?? "",
        m.familia ?? "",
        m.sitios.length,
        est.get(m.codigo) ?? 0,
        m.cajas,
        m.unidades,
        aFecha(m.vence),
        m.diasSalir,
        rotFr(m.franja),
        m.enRiesgoCajas
      ];
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
  {
    const h = wb.addWorksheet("Por ubicaci\xF3n", { properties: { tabColor: { argb: "FF2E6DA4" } } });
    const C = ["Ubicaci\xF3n", "Calle", "M\xF3dulo", "Lado", "Capacidad (estibas)", "Estibas", "Ocupaci\xF3n", "Cajas", "Materiales", "Renglones"];
    h.columns = [14, 8, 9, 8, 12, 10, 11, 11, 11, 11].map((w) => ({ width: w }));
    cabecera(h, "Por ubicaci\xF3n", sub, C.length);
    encabezado(h, 6, C);
    const us = [...porUbi.values()].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    us.forEach((x, i) => {
      const r = h.getRow(7 + i);
      const occ = x.capacidad ? x.estibas / x.capacidad : null;
      r.values = [x.ubicacion, x.calle ?? "", x.modulo ?? "", x.lado ?? "", x.capacidad, x.estibas, occ, x.cajas, x.materiales.size, x.renglones];
      filaDatos(r, C.length, i % 2 === 1, { 5: "#,##0", 6: "#,##0", 7: "0%", 8: "#,##0", 9: "0", 10: "0" });
      r.getCell(1).font = letra(9.5, TINTA, true);
      if (occ != null && occ > 1) {
        r.getCell(7).fill = relleno(FR.pasado.fondo);
        r.getCell(7).font = letra(9.5, FR.pasado.tinta, true);
      }
    });
    const fin = 6 + Math.max(us.length, 1);
    totales(h, fin + 1, 7, fin, [6, 8, 10], C.length);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }
  {
    const h = wb.addWorksheet("Validar", { properties: { tabColor: { argb: ROJO } } });
    const C = ["Qu\xE9", "Grave", "Ubicaci\xF3n", "C\xF3digo", "Material", "Detalle", "Recorrido", "Revisado \u2713"];
    h.columns = [22, 8, 14, 10, 32, 60, 14, 12].map((w) => ({ width: w }));
    cabecera(h, "Para validar", `${graves} grave(s) \xB7 ${ojos.length - graves} para mirar \xB7 ${sub}`, C.length);
    encabezado(h, 6, C);
    const orden2 = [...ojos].sort((a, b) => Number(b.grave) - Number(a.grave) || a.tipo.localeCompare(b.tipo) || a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }));
    orden2.forEach((o, i) => {
      const r = h.getRow(7 + i);
      r.values = [o.tipo, o.grave ? "S\xED" : "", o.ubicacion, o.codigo, o.material, o.detalle, o.recorrido, ""];
      filaDatos(r, C.length, i % 2 === 1, {});
      r.getCell(6).alignment = { wrapText: true, vertical: "middle" };
      if (o.detalle.length > 70) r.height = 32;
      if (o.grave) {
        r.getCell(1).font = letra(9.5, ROJO, true);
        r.getCell(2).font = letra(9.5, ROJO, true);
      }
      r.getCell(8).dataValidation = { type: "list", allowBlank: true, formulae: ['"\u2713,Pendiente"'] };
    });
    if (!orden2.length) {
      const c = h.getCell(7, 1);
      c.value = "\u2713 Nada para validar: la base del d\xEDa est\xE1 limpia.";
      c.font = letra(10, VERDE, true);
    }
    const fin = 6 + Math.max(orden2.length, 1);
    h.autoFilter = `A6:${col(C.length)}${fin}`;
    h.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  }
  {
    const h = wb.addWorksheet("Sin contar", { properties: { tabColor: { argb: GRIS } } });
    const C = ["Ubicaci\xF3n", "Calle", "M\xF3dulo", "Lado", "Familia", "Capacidad"];
    h.columns = [14, 8, 9, 8, 18, 12].map((w) => ({ width: w }));
    cabecera(h, "Sin contar ese d\xEDa", `${sinContar.length} de ${activas} posiciones activas \xB7 ${sub}`, C.length);
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
  for (const h of wb.worksheets) h.pageSetup = {
    ...h.pageSetup,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: h.name === "Resumen" ? 1 : 0,
    orientation: h.name === "Resumen" ? "portrait" : "landscape",
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
  for (const h of wb.worksheets) h.eachRow((r) => r.eachCell((c) => {
    c.font = { name: "Calibri", ...c.font ?? {} };
  }));
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  return remendarFiltros(crudo, wb);
}
function remendarFiltros(zip, wb) {
  try {
    const partes = unzipSync(new Uint8Array(zip));
    let xml = new TextDecoder().decode(partes["xl/workbook.xml"]);
    const trozos = [];
    wb.worksheets.forEach((h, i) => {
      if (typeof h.autoFilter !== "string") return;
      const [a, b] = h.autoFilter.split(":");
      const abs = (x) => x.replace(/([A-Z]+)(\d+)/, "$$$1$$$2");
      const ref = /[\s()]/.test(h.name) || /[^A-Za-z0-9_]/.test(h.name) ? `'${h.name}'` : h.name;
      trozos.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${ref}!${abs(a)}:${abs(b)}</definedName>`);
    });
    const otros = (xml.match(/<definedNames>([\s\S]*?)<\/definedNames>/)?.[1] ?? "").replace(/<definedName[^>]*name="_xlnm\._FilterDatabase"[^>]*>[\s\S]*?<\/definedName>/g, "");
    const bloque = trozos.length || otros ? `<definedNames>${trozos.join("")}${otros}</definedNames>` : "";
    xml = xml.includes("<definedNames>") ? xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, bloque) : xml.replace("</sheets>", `</sheets>${bloque}`);
    partes["xl/workbook.xml"] = new TextEncoder().encode(xml);
    return Buffer.from(zipSync(partes));
  } catch {
    return zip;
  }
}
export {
  COLORES_MARCA,
  armarLibroDia
};
