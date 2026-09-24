// src/modulos/acciones/libro.ts
import ExcelJS from "exceljs";
var TINTA = "FF04203F";
var ORO = "FFE9A81F";
var ROJO = "FFE4002B";
var GRIS = "FF5B6B7F";
var LINEA = "FFD5DCE5";
function titulo(h, fila, texto, ancho) {
  h.mergeCells(fila, 1, fila, ancho);
  const c = h.getCell(fila, 1);
  c.value = texto;
  c.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
  c.alignment = { vertical: "middle", indent: 1 };
  h.getRow(fila).height = 30;
}
function rotulo(c, texto) {
  c.value = texto;
  c.font = { name: "Calibri", size: 8, bold: true, color: { argb: GRIS } };
  c.alignment = { vertical: "middle", indent: 1 };
}
function cabecera(h, fila, cols) {
  const r = h.getRow(fila);
  cols.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  });
  r.height = 24;
}
function borde(c) {
  c.border = {
    top: { style: "hair", color: { argb: LINEA } },
    bottom: { style: "hair", color: { argb: LINEA } },
    left: { style: "hair", color: { argb: LINEA } },
    right: { style: "hair", color: { argb: LINEA } }
  };
}
var dFecha = (s) => s ? new Date(s) : null;
async function armarLibro(d) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "CONTROL \xB7 CD38 Ag01";
  libro.created = /* @__PURE__ */ new Date();
  const vivas = d.acciones.filter((a) => a.estado !== "anulada");
  const quien = (id) => id ? d.nombres[id] ?? "\u2014" : "sin asignar";
  const r = libro.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  r.columns = [
    { width: 3 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 22 }
  ];
  titulo(r, 2, "  ACCIONES CORRECTIVAS \xB7 CD38 Ag01 Barranquilla", 6);
  r.mergeCells(3, 2, 3, 6);
  const sub = r.getCell(3, 2);
  sub.value = `Generado el ${(/* @__PURE__ */ new Date()).toLocaleString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })}`;
  sub.font = { name: "Calibri", size: 9, color: { argb: GRIS } };
  const finDelDia = /* @__PURE__ */ new Date();
  finDelDia.setHours(23, 59, 59, 999);
  const vencidas = vivas.filter((a) => a.vencida).sort((a, b) => a.horas_restantes - b.horas_restantes);
  const criticas = vivas.filter((a) => a.viva && a.prioridad === "alta").length;
  const vencenHoy = vivas.filter(
    (a) => a.viva && !a.vencida && new Date(a.vence_en) <= finDelDia
  ).length;
  const verificadas = vivas.filter((a) => a.estado === "verificada").length;
  const efectivas = vivas.filter((a) => a.efectiva).length;
  const pct = verificadas ? Math.round(efectivas / verificadas * 100) : null;
  const KPI = [
    ["VENCIDAS", vencidas.length, vencidas.length ? `la m\xE1s vieja, ${Math.abs(Math.floor(vencidas[0]?.horas_restantes / 24))} d\xEDas` : "ninguna se pas\xF3 del plazo", vencidas.length > 0],
    ["CR\xCDTICAS ABIERTAS", criticas, "prioridad alta sin cerrar", criticas > 0],
    ["VENCEN HOY", vencenHoy, "antes de las 23:59", false],
    [
      "EFECTIVIDAD",
      pct != null ? `${pct}%` : "\u2014",
      pct != null ? `meta ${d.meta}% \xB7 sobre lo verificado` : "nada verificado todav\xEDa",
      pct != null && pct < d.meta
    ]
  ];
  KPI.forEach(([rot, num, pie, mal], i) => {
    const col = 2 + i;
    rotulo(r.getCell(5, col), rot);
    const c = r.getCell(6, col);
    c.value = num;
    c.font = { name: "Calibri", size: 26, bold: true, color: { argb: mal ? ROJO : TINTA } };
    c.alignment = { vertical: "middle", indent: 1 };
    const p = r.getCell(7, col);
    p.value = pie;
    p.font = { name: "Calibri", size: 8, color: { argb: GRIS } };
    p.alignment = { vertical: "top", indent: 1, wrapText: true };
    for (const f2 of [5, 6, 7]) {
      r.getCell(f2, col).border = {
        left: { style: "thick", color: { argb: mal ? ROJO : ORO } }
      };
    }
  });
  r.getRow(6).height = 34;
  r.getRow(7).height = 26;
  rotulo(r.getCell(9, 2), "CUMPLIMIENTO POR \xC1REA");
  cabecera(r, 10, ["", "\xC1rea", "Efectivas", "Verificadas", "%", ""]);
  let f = 11;
  for (const a of d.areas) {
    r.getCell(f, 2).value = a.area_nombre;
    r.getCell(f, 3).value = a.efectivas;
    r.getCell(f, 4).value = a.verificadas;
    const c = r.getCell(f, 5);
    c.value = a.pct != null ? a.pct / 100 : "\u2014";
    if (a.pct != null) c.numFmt = "0%";
    c.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: a.pct != null && a.pct < d.meta ? ROJO : TINTA }
    };
    const barra = r.getCell(f, 6);
    barra.value = a.pct != null ? "\u2588".repeat(Math.round(a.pct / 10)) : "";
    barra.font = {
      name: "Calibri",
      size: 9,
      color: { argb: a.pct != null && a.pct < d.meta ? ROJO : ORO }
    };
    for (let col = 2; col <= 6; col++) borde(r.getCell(f, col));
    f++;
  }
  f++;
  rotulo(r.getCell(f, 2), "VENCIDAS \xB7 HAY QUE HABLAR DE ESTAS");
  f++;
  cabecera(r, f, ["", "C\xF3digo", "Qu\xE9 es", "", "Responsable", "D\xEDas"]);
  f++;
  for (const a of vencidas.slice(0, 20)) {
    r.getCell(f, 2).value = a.codigo;
    r.mergeCells(f, 3, f, 4);
    r.getCell(f, 3).value = a.titulo;
    r.getCell(f, 5).value = quien(a.responsable);
    const c = r.getCell(f, 6);
    c.value = Math.abs(Math.floor(a.horas_restantes / 24));
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: ROJO } };
    for (let col = 2; col <= 6; col++) borde(r.getCell(f, col));
    f++;
  }
  if (!vencidas.length) {
    r.mergeCells(f, 2, f, 6);
    r.getCell(f, 2).value = "Ninguna vencida.";
    r.getCell(f, 2).font = { name: "Calibri", size: 10, color: { argb: GRIS } };
  }
  const h = libro.addWorksheet("Acciones", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const COLS = [
    ["C\xF3digo", 11],
    ["Tipo", 12],
    ["Qu\xE9 es", 44],
    ["Motivo", 24],
    ["\xC1rea", 16],
    ["Zona", 22],
    ["Prioridad", 10],
    ["Estado", 12],
    ["Reportada", 17],
    ["Vence", 17],
    ["D\xEDas", 7],
    ["Vencida", 9],
    ["Responsable", 18],
    ["Report\xF3", 18],
    ["Qu\xE9 se hizo", 40],
    ["Cerr\xF3", 18],
    ["Cerrada", 17],
    ["Efectiva", 9],
    ["Verific\xF3", 18],
    ["Nota de verificaci\xF3n", 34],
    ["Veces aqu\xED", 10],
    ["Fotos", 7],
    ["Causa ra\xEDz", 40]
  ];
  h.columns = COLS.map(([t, w]) => ({ header: t, width: w }));
  cabecera(h, 1, COLS.map(([t]) => t));
  vivas.forEach((a, i) => {
    const fila = h.getRow(i + 2);
    fila.values = [
      a.codigo,
      a.tipo === "preventiva" ? "Preventiva" : "Correctiva",
      a.titulo,
      a.motivo_nombre,
      a.area_nombre,
      a.zona ? `${a.zona_nombre} (${a.zona})` : a.ubicacion ?? "",
      a.prioridad,
      a.estado,
      dFecha(a.reportada_en),
      dFecha(a.vence_en),
      a.dias,
      a.vencida ? "S\xCD" : "",
      quien(a.responsable),
      quien(a.reportada_por),
      a.que_se_hizo ?? "",
      a.cerrada_por ? quien(a.cerrada_por) : "",
      dFecha(a.cerrada_en),
      a.efectiva == null ? "" : a.efectiva ? "S\xCD" : "NO",
      a.verificada_por ? quien(a.verificada_por) : "",
      a.nota_verificacion ?? "",
      a.veces_aqui || "",
      a.fotos || "",
      a.causa_raiz ?? ""
    ];
    fila.font = { name: "Calibri", size: 10 };
    fila.alignment = { vertical: "top", wrapText: false };
    for (const col of [9, 10, 17]) fila.getCell(col).numFmt = "dd/mm/yyyy hh:mm";
    if (a.vencida) {
      fila.getCell(12).font = { name: "Calibri", size: 10, bold: true, color: { argb: ROJO } };
      fila.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: ROJO } };
    }
    if (a.efectiva === false) {
      fila.getCell(18).font = { name: "Calibri", size: 10, bold: true, color: { argb: ROJO } };
    }
    for (let c = 1; c <= COLS.length; c++) borde(fila.getCell(c));
  });
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };
  const re = libro.addWorksheet("Reincidencia", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }]
  });
  re.columns = [
    { width: 3 },
    { width: 30 },
    { width: 26 },
    { width: 9 },
    { width: 11 },
    { width: 14 },
    { width: 30 }
  ];
  titulo(re, 1, "  D\xD3NDE SE REPITE LO MISMO", 7);
  re.mergeCells(2, 2, 2, 7);
  re.getCell(2, 2).value = `Mismo motivo, mismo sitio. A las ${d.tope} veces el sistema deja de aceptar otra correcci\xF3n y exige preventiva con causa ra\xEDz.`;
  re.getCell(2, 2).font = { name: "Calibri", size: 9, color: { argb: GRIS } };
  cabecera(re, 3, ["", "Motivo", "Zona", "Veces", "Abiertas", "\xDAltima", "Qu\xE9 toca"]);
  const mapa = /* @__PURE__ */ new Map();
  for (const a of vivas) {
    if (!a.zona) continue;
    const k = a.motivo + "|" + a.zona;
    const x = mapa.get(k) ?? {
      motivo: a.motivo_nombre,
      zona: a.zona_nombre ?? a.zona,
      n: 0,
      abiertas: 0,
      ultima: a.reportada_en
    };
    x.n += 1;
    if (a.viva) x.abiertas += 1;
    if (a.reportada_en > x.ultima) x.ultima = a.reportada_en;
    mapa.set(k, x);
  }
  const repiten = [...mapa.values()].filter((x) => x.n > 1).sort((a, b) => b.n - a.n);
  let fr = 4;
  for (const x of repiten) {
    const pasado = x.n >= d.tope;
    re.getCell(fr, 2).value = x.motivo;
    re.getCell(fr, 3).value = x.zona;
    const c = re.getCell(fr, 4);
    c.value = x.n;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: pasado ? ROJO : TINTA } };
    re.getCell(fr, 5).value = x.abiertas || "";
    const u = re.getCell(fr, 6);
    u.value = dFecha(x.ultima);
    u.numFmt = "dd/mm/yyyy";
    const q = re.getCell(fr, 7);
    q.value = pasado ? "Exige acci\xF3n preventiva" : `${d.tope - x.n} m\xE1s y exige preventiva`;
    q.font = {
      name: "Calibri",
      size: 9,
      bold: pasado,
      color: { argb: pasado ? ROJO : GRIS }
    };
    for (let col = 2; col <= 7; col++) borde(re.getCell(fr, col));
    fr++;
  }
  if (!repiten.length) {
    re.mergeCells(fr, 2, fr, 7);
    re.getCell(fr, 2).value = "Ning\xFAn motivo ha vuelto a salir en la misma zona.";
    re.getCell(fr, 2).font = { name: "Calibri", size: 10, color: { argb: GRIS } };
  }
  return libro.xlsx.writeBuffer();
}
export {
  armarLibro
};
