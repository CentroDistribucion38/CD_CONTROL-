/**
 * EL LIBRO DE EXCEL — portada, base, seguimiento, evidencia y fotos.
 *
 * Vive aparte de la ruta a propósito: así se puede armar con datos de
 * prueba y ABRIR el archivo para ver si quedó bien, en vez de confiar en
 * que compila. Un .xlsx que compila y se ve mal es el caso normal, no la
 * excepción.
 *
 * Cómo bajar una foto entra POR PARÁMETRO (bajarFoto). La ruta le pasa
 * el storage de Supabase; la prueba le pasa archivos del disco. El libro
 * no sabe de dónde vienen y no tiene por qué saberlo.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { MESES_LARGO, type Viaje, type FilaSeguimiento } from "./comun";

const TINTA = "FF04203F";
const ACENTO = "FF0B7285";
const PAPEL = "FFF7F9FC";
const LINEA = "FFD5DCE5";
const ORO = "FFE9A81F";
const ROJO = "FFE4002B";
const VERDE = "FF0F7A4A";

/* Un techo a las fotos que se incrustan. Sin esto, exportar un año
   entero arma un archivo de cientos de megas que no abre en ninguna
   parte — y el que lo pidió no se enteraría hasta que falle. */
export const MAX_FOTOS = 180;
const MAX_BYTES_FOTO = 4 * 1024 * 1024;

const ORDEN_RANURA = ["costado_izq", "costado_der", "placa"] as const;
const NOMBRE_RANURA: Record<string, string> = {
  costado_izq: "Costado izquierdo",
  costado_der: "Costado derecho",
  placa: "Placa",
};

/* exceljs trae su propia declaración de Buffer, más vieja que la de
   @types/node 22 —le faltan resizable, detached y compañía—, así que los
   dos tipos no se reconocen entre sí aunque en tiempo de ejecución sean
   el mismo objeto. Se convierte en UN solo sitio, con el motivo escrito,
   en vez de repartir "any" por el archivo. */
type BufferDeExcel = Parameters<ExcelJS.Workbook["addImage"]>[0]["buffer"];
const paraExcel = (b: Buffer) => b as unknown as BufferDeExcel;

/* Que quepa a lo ANCHO al imprimir.
   Sin esto la página se corta en la columna que alcance: en la prueba, la
   hoja Seguimiento se partía justo antes de "% Certificación" —la columna
   que es el punto del informe— y en Fotos se quedaba fuera la foto de la
   placa. Se vio convirtiendo el archivo a PDF y mirándolo; en pantalla no
   se nota, y alguien lo iba a descubrir imprimiéndolo delante de otros.

   fitToHeight: 0 = a lo alto se usan las páginas que hagan falta. Lo que
   no puede pasar es que se corte de lado. */
function paraImprimir(h: ExcelJS.Worksheet, horizontal = false) {
  h.pageSetup = {
    orientation: horizontal ? "landscape" : "portrait",
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    horizontalCentered: true,
  };
}

export type FilaFoto = {
  certificacion_id: string;
  ranura: (typeof ORDEN_RANURA)[number];
  ruta: string;
};
export type FilaCert = {
  id: string; viaje_id: string; punta: "salida" | "llegada";
  lat: number; lng: number; precision_m: number | null;
  direccion: string | null; nota: string | null;
  hecha_por: string | null; hecha_en: string;
};

export type Insumos = {
  titulo: string;
  quien: string;
  viajes: Viaje[];
  seg: FilaSeguimiento[];
  certs: FilaCert[];
  fotos: FilaFoto[];
  nombres: Record<string, string>;
  /** null si no se pudo: el libro sigue, esa foto queda contada aparte. */
  bajarFoto: ((ruta: string) => Promise<Buffer | null>) | null;
};

export async function armarLibro(d: Insumos): Promise<{ wb: ExcelJS.Workbook; recortadas: number }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Sider Certificado";
  wb.created = new Date();

  let logoId: number | null = null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "marca", "logo-b.png"));
    logoId = wb.addImage({ buffer: paraExcel(buf), extension: "png" });
  } catch {
    /* Sin logo el archivo sale igual. Un export que falla porque falta
       una imagen decorativa es un export peor que uno sin logo. */
  }

  portada(wb, { ...d, logoId });
  hojaBase(wb, d.viajes, d.nombres);
  if (d.seg.length) hojaSeguimiento(wb, d.seg, d.titulo);
  hojaEvidencia(wb, d.viajes, d.certs, d.nombres);

  let recortadas = 0;
  if (d.bajarFoto) recortadas = await hojaFotos(wb, d.bajarFoto, d.viajes, d.certs, d.fotos);
  return { wb, recortadas };
}

/* ==================== Portada ==================== */
function portada(wb: ExcelJS.Workbook, d: {
  titulo: string; viajes: Viaje[]; seg: FilaSeguimiento[];
  logoId: number | null; quien: string;
}) {
  const h = wb.addWorksheet("Portada", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  h.columns = [{ width: 3 }, { width: 30 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 24 }];
  paraImprimir(h);

  // La banda oscura de arriba, con el logo encima.
  for (let r = 1; r <= 7; r++) {
    for (let c = 1; c <= 6; c++) {
      h.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
    }
  }
  if (d.logoId != null) {
    h.addImage(d.logoId, { tl: { col: 1.1, row: 1.2 }, ext: { width: 74, height: 74 } });
  }

  h.mergeCells("C2:F3");
  const t = h.getCell("C2");
  t.value = "SIDER CERTIFICADO";
  t.font = { name: "Calibri", size: 26, bold: true, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle" };

  h.mergeCells("C4:F5");
  const s = h.getCell("C4");
  s.value = d.titulo;
  s.font = { name: "Calibri", size: 13, color: { argb: "FF9FD3D9" } };
  s.alignment = { vertical: "middle" };

  const dentro = d.seg.filter((f) => f.aplica_sider);
  const recibido = dentro.reduce((a, f) => a + Number(f.hl_recibido), 0);
  const real = dentro.reduce((a, f) => a + Number(f.real_mtd), 0);
  const meta = d.seg[0]?.meta ?? 0.1;
  const hl = d.viajes.reduce((a, v) => a + Number(v.hl ?? 0), 0);
  const sider = d.viajes.reduce((a, v) => a + Number(v.sider ?? 0), 0);

  const cifras: [string, string | number, string][] = [
    ["Viajes certificados", d.viajes.length, "0"],
    ["Hectolitros", hl, "#,##0.00"],
    ["Sider", sider, "#,##0.00"],
    ["HL EER recibido (ZLDE)", recibido || "—", "#,##0.0"],
    ["% Certificación", recibido > 0 ? real / recibido : "—", "0.0%"],
    [`Meta`, meta, "0%"],
  ];
  let fila = 9;
  for (const [rot, val, fmt] of cifras) {
    const a = h.getCell(fila, 2), b = h.getCell(fila, 3);
    a.value = rot;
    a.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF5B6B7F" } };
    b.value = val;
    b.numFmt = fmt;
    b.font = { name: "Calibri", size: 14, bold: true, color: { argb: TINTA } };
    b.alignment = { horizontal: "left" };
    for (const c of [a, b]) {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPEL } };
      c.border = { bottom: { style: "thin", color: { argb: LINEA } } };
    }
    if (rot === "% Certificación" && typeof val === "number") {
      b.font = { name: "Calibri", size: 14, bold: true,
                 color: { argb: val >= meta ? VERDE : ROJO } };
    }
    fila++;
  }

  fila += 1;
  h.mergeCells(fila, 2, fila, 6);
  const q = h.getCell(fila, 2);
  q.value = "QUÉ HAY EN ESTE ARCHIVO";
  q.font = { name: "Calibri", size: 10, bold: true, color: { argb: ACENTO } };
  fila++;

  const explica = [
    ["Base de datos", "Un renglón por viaje. Las columnas en gris no se guardan: se calculan del material y las estibas."],
    ["Seguimiento", "El informe del mes. BU MTD es la meta en HL; el % es Real contra HL recibido."],
    ["Evidencia", "Dónde y cuándo se certificó cada punta, con coordenadas, precisión y quién lo hizo."],
    ["Fotos", "Las tres fotos por punta, incrustadas. Cada una viene sellada con placa, fecha, hora y coordenadas."],
  ];
  for (const [k, v] of explica) {
    const a = h.getCell(fila, 2), b = h.getCell(fila, 3);
    a.value = k;
    a.font = { name: "Calibri", size: 10, bold: true, color: { argb: TINTA } };
    /* Arriba las dos: por defecto una celda alinea abajo, y el rótulo
       quedaba un renglón más abajo que su propio texto. */
    a.alignment = { vertical: "top" };
    h.mergeCells(fila, 3, fila, 6);
    b.value = v;
    b.font = { name: "Calibri", size: 9.5, color: { argb: "FF5B6B7F" } };
    b.alignment = { wrapText: true, vertical: "top" };
    h.getRow(fila).height = 32;
    fila++;
  }

  fila += 1;
  h.mergeCells(fila, 2, fila, 6);
  const pie = h.getCell(fila, 2);
  pie.value =
    `Generado el ${new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}` +
    ` por ${d.quien} · CONTROL · CD38 Ag01 Barranquilla`;
  pie.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF93A3B6" } };
}

/* ==================== Encabezado de tabla ==================== */
function encabeza(h: ExcelJS.Worksheet, fila: number, cols: string[], grises: number[] = []) {
  const r = h.getRow(fila);
  cols.forEach((c, i) => {
    const cel = r.getCell(i + 1);
    cel.value = c;
    cel.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: grises.includes(i) ? "FF5B6B7F" : TINTA },
    };
    cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cel.border = { bottom: { style: "thin", color: { argb: LINEA } } };
  });
  r.height = 26;
}

/* ==================== La base de datos ==================== */
function hojaBase(wb: ExcelJS.Workbook, viajes: Viaje[], nombres: Record<string, string>) {
  const h = wb.addWorksheet("Base de datos", { views: [{ state: "frozen", ySplit: 1 }] });
  // Veintidós columnas: apaisada o no cabe ni con reducción.
  paraImprimir(h, true);
  /* Las derivadas van con encabezado gris: en la hoja original eran
     fórmulas, y quien abra esto tiene que poder distinguir lo que
     alguien escribió de lo que salió de una cuenta. */
  encabeza(h, 1, [
    "Placa", "CD Origen", "CD Destino", "Material", "SKU", "Tipo envase",
    "Estibas", "Sider", "Cajas", "Unidades", "HL",
    "Fecha", "Mes", "Semana", "Año",
    "Estado", "Salida", "Fotos salida", "Llegada", "Fotos llegada",
    "Quién certificó", "Observación",
  ], [7, 8, 9, 10, 12, 13, 14]);

  h.columns = [
    { width: 11 }, { width: 20 }, { width: 14 }, { width: 30 }, { width: 10 }, { width: 12 },
    { width: 9 }, { width: 9 }, { width: 11 }, { width: 12 }, { width: 11 },
    { width: 12 }, { width: 12 }, { width: 8 }, { width: 7 },
    { width: 12 }, { width: 18 }, { width: 11 }, { width: 18 }, { width: 12 },
    { width: 16 }, { width: 40 },
  ];

  viajes.forEach((v, i) => {
    const f = h.getRow(i + 2);
    f.values = [
      v.placa, v.cd_origen, v.cd_destino, v.descripcion, v.sku, v.tipo_envase ?? "",
      Number(v.estibas), Number(v.sider),
      v.cajas == null ? "" : Number(v.cajas),
      v.unidades == null ? "" : Number(v.unidades),
      v.hl == null ? "" : Number(v.hl),
      new Date(v.fecha), MESES_LARGO[v.num_mes - 1], v.semana, v.anio,
      v.estado === "en_transito" ? "en tránsito" : v.estado,
      v.salida_en ? new Date(v.salida_en) : "", `${v.fotos_salida}/3`,
      v.llegada_en ? new Date(v.llegada_en) : "", `${v.fotos_llegada}/3`,
      v.creado_por ? nombres[v.creado_por] ?? "—" : "—",
      v.observacion ?? "",
    ];
    for (const c of [7, 8]) f.getCell(c).numFmt = "#,##0.00";
    for (const c of [9, 10]) f.getCell(c).numFmt = "#,##0";
    f.getCell(11).numFmt = "#,##0.00";
    f.getCell(12).numFmt = "dd/mm/yyyy";
    f.getCell(17).numFmt = "dd/mm/yyyy hh:mm";
    f.getCell(19).numFmt = "dd/mm/yyyy hh:mm";
    if (i % 2) {
      for (let c = 1; c <= 22; c++) {
        f.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPEL } };
      }
    }
    /* Una punta sin sus tres fotos se marca: es lo primero que alguien
       busca cuando revisa un mes. */
    if (v.fotos_salida < 3) f.getCell(18).font = { bold: true, color: { argb: ROJO } };
    if (v.estado === "recibido" && v.fotos_llegada < 3) {
      f.getCell(20).font = { bold: true, color: { argb: ROJO } };
    }
    if (v.faltan_factores) {
      for (const c of [9, 10, 11]) {
        f.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E6" } };
      }
    }
  });

  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 22 } };
  if (viajes.length) {
    const t = h.getRow(viajes.length + 3);
    t.getCell(1).value = "Total";
    t.getCell(7).value = { formula: `SUM(G2:G${viajes.length + 1})` };
    t.getCell(8).value = { formula: `SUM(H2:H${viajes.length + 1})` };
    t.getCell(9).value = { formula: `SUM(I2:I${viajes.length + 1})` };
    t.getCell(10).value = { formula: `SUM(J2:J${viajes.length + 1})` };
    t.getCell(11).value = { formula: `SUM(K2:K${viajes.length + 1})` };
    for (let c = 1; c <= 11; c++) {
      t.getCell(c).font = { bold: true, color: { argb: TINTA } };
      t.getCell(c).border = { top: { style: "medium", color: { argb: TINTA } } };
    }
    for (const c of [7, 8, 11]) t.getCell(c).numFmt = "#,##0.00";
    for (const c of [9, 10]) t.getCell(c).numFmt = "#,##0";
  }
}

/* ==================== El seguimiento ==================== */
function hojaSeguimiento(wb: ExcelJS.Workbook, seg: FilaSeguimiento[], titulo: string) {
  const h = wb.addWorksheet("Seguimiento", { views: [{ showGridLines: false }] });
  h.columns = [{ width: 26 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 16 }];
  paraImprimir(h);

  h.mergeCells("A1:F1");
  const t = h.getCell("A1");
  t.value = `SIDER CERTIFICADO · ${titulo.toUpperCase()}`;
  t.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  h.getRow(1).height = 26;

  encabeza(h, 2, ["Centro de Origen", "HL EER Recibido", "BU MTD", "Real MTD", "Viajes", "% Certificación"]);

  const dentro = seg.filter((f) => f.aplica_sider && !f.fuera_del_maestro);
  const meta = seg[0]?.meta ?? 0.1;

  dentro.forEach((s, i) => {
    const f = h.getRow(i + 3);
    const p = s.pct_certificacion == null ? null : Number(s.pct_certificacion);
    f.values = [
      s.cd_origen, Number(s.hl_recibido), Number(s.bu_mtd), Number(s.real_mtd),
      Number(s.viajes) || "", p ?? "",
    ];
    f.getCell(2).numFmt = "#,##0.0";
    f.getCell(3).numFmt = "#,##0";
    f.getCell(4).numFmt = "#,##0";
    f.getCell(6).numFmt = "0.0%";
    f.getCell(6).font = {
      bold: true,
      color: { argb: p == null ? "FF93A3B6" : p >= meta ? VERDE : ROJO },
    };
    for (let c = 1; c <= 6; c++) {
      f.getCell(c).border = { bottom: { style: "hair", color: { argb: LINEA } } };
      if (i % 2) f.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPEL } };
    }
  });

  const fin = dentro.length + 3;
  const t2 = h.getRow(fin);
  t2.getCell(1).value = "Total general";
  t2.getCell(2).value = { formula: `SUM(B3:B${fin - 1})` };
  t2.getCell(3).value = { formula: `SUM(C3:C${fin - 1})` };
  t2.getCell(4).value = { formula: `SUM(D3:D${fin - 1})` };
  t2.getCell(5).value = { formula: `SUM(E3:E${fin - 1})` };
  /* La fórmula y no el número: quien abra esto puede filtrar, corregir
     una fila y ver el total moverse. Un número pegado no se mueve, y es
     justo lo que hace que una hoja deje de cuadrar con su propia base. */
  t2.getCell(6).value = { formula: `IF(B${fin}=0,"",D${fin}/B${fin})` };
  t2.getCell(2).numFmt = "#,##0.0";
  t2.getCell(3).numFmt = "#,##0";
  t2.getCell(4).numFmt = "#,##0";
  t2.getCell(6).numFmt = "0.0%";
  for (let c = 1; c <= 6; c++) {
    t2.getCell(c).font = { bold: true, color: { argb: TINTA } };
    t2.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF0D5" } };
    t2.getCell(c).border = { top: { style: "medium", color: { argb: ORO } } };
  }

  let fila = fin + 2;
  const nota = (txt: string) => {
    h.mergeCells(fila, 1, fila, 6);
    const c = h.getCell(fila, 1);
    c.value = txt;
    c.font = { name: "Calibri", size: 9, color: { argb: "FF5B6B7F" } };
    c.alignment = { wrapText: true, vertical: "top" };
    h.getRow(fila).height = 26;
    fila++;
  };
  nota(`BU MTD = HL EER Recibido × ${Math.round(meta * 100)}%. % Certificación = Real MTD ÷ HL EER Recibido (no contra el BU).`);

  const fuera = seg.filter((f) => !f.aplica_sider);
  if (fuera.length) {
    nota(
      `Fuera del total, por estar marcados "no aplica sider" en el maestro: ` +
      fuera.map((f) => `${f.cd_origen} (${Number(f.hl_recibido).toFixed(1)} HL)`).join(" · ")
    );
  }
  const huerfanos = seg.filter((f) => f.fuera_del_maestro);
  if (huerfanos.length) {
    nota(
      `Nombres que vienen de ZLDE y no están en el maestro, así que no entran en ningún total: ` +
      huerfanos.map((f) => `${f.cd_origen} (${Number(f.hl_recibido).toFixed(1)} HL)`).join(" · ")
    );
  }
}

/* ==================== La evidencia en texto ==================== */
function hojaEvidencia(
  wb: ExcelJS.Workbook, viajes: Viaje[], certs: FilaCert[], nombres: Record<string, string>
) {
  const h = wb.addWorksheet("Evidencia", { views: [{ state: "frozen", ySplit: 1 }] });
  paraImprimir(h, true);
  encabeza(h, 1, [
    "Placa", "Punta", "Cuándo", "Dirección", "Latitud", "Longitud",
    "Precisión (m)", "Quién", "Nota", "Ver en el mapa",
  ]);
  h.columns = [
    { width: 11 }, { width: 10 }, { width: 19 }, { width: 44 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 30 }, { width: 18 },
  ];

  const porViaje = new Map(viajes.map((v) => [v.id, v]));
  const orden = { salida: 0, llegada: 1 };
  const lista = certs
    .filter((c) => porViaje.has(c.viaje_id))
    .sort((a, b) => {
      const pa = porViaje.get(a.viaje_id)!.placa, pb = porViaje.get(b.viaje_id)!.placa;
      return pa === pb ? orden[a.punta] - orden[b.punta] : pa.localeCompare(pb);
    });

  lista.forEach((c, i) => {
    const f = h.getRow(i + 2);
    f.values = [
      porViaje.get(c.viaje_id)!.placa,
      c.punta === "salida" ? "Salida" : "Llegada",
      new Date(c.hecha_en),
      c.direccion ?? "",
      Number(c.lat), Number(c.lng),
      c.precision_m == null ? "" : Number(c.precision_m),
      c.hecha_por ? nombres[c.hecha_por] ?? "—" : "—",
      c.nota ?? "",
      { text: "abrir mapa", hyperlink: `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=17/${c.lat}/${c.lng}` },
    ];
    f.getCell(3).numFmt = "dd/mm/yyyy hh:mm:ss";
    for (const c2 of [5, 6]) f.getCell(c2).numFmt = "0.0000000";
    f.getCell(7).numFmt = "#,##0";
    f.getCell(10).font = { color: { argb: ACENTO }, underline: true };
    /* Una ubicación con cuadras de error no es evidencia de nada, y sin
       marcarla nadie va a ir a mirar el número. */
    if (c.precision_m != null && Number(c.precision_m) > 200) {
      f.getCell(7).font = { bold: true, color: { argb: ROJO } };
    }
    if (i % 2) {
      for (let k = 1; k <= 10; k++) {
        f.getCell(k).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPEL } };
      }
    }
  });
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
}

/* ==================== Las fotos, incrustadas ==================== */
async function hojaFotos(
  wb: ExcelJS.Workbook,
  bajarFoto: (ruta: string) => Promise<Buffer | null>,
  viajes: Viaje[], certs: FilaCert[], fotos: FilaFoto[]
): Promise<number> {
  const h = wb.addWorksheet("Fotos", { views: [{ showGridLines: false }] });
  h.columns = [{ width: 26 }, { width: 30 }, { width: 30 }, { width: 30 }];
  paraImprimir(h);

  const porViaje = new Map(viajes.map((v) => [v.id, v]));
  const porCert = new Map(certs.map((c) => [c.id, c]));
  const orden = { salida: 0, llegada: 1 };

  const bloques = certs
    .filter((c) => porViaje.has(c.viaje_id))
    .sort((a, b) => {
      const pa = porViaje.get(a.viaje_id)!.placa, pb = porViaje.get(b.viaje_id)!.placa;
      return pa === pb ? orden[a.punta] - orden[b.punta] : pa.localeCompare(pb);
    });

  let fila = 1;
  let puestas = 0;
  let recortadas = 0;

  for (const c of bloques) {
    const v = porViaje.get(c.viaje_id)!;
    const suyas = fotos
      .filter((f) => f.certificacion_id === c.id)
      .sort((a, b) => ORDEN_RANURA.indexOf(a.ranura) - ORDEN_RANURA.indexOf(b.ranura));
    if (!suyas.length) continue;

    // Título del bloque
    h.mergeCells(fila, 1, fila, 4);
    const t = h.getCell(fila, 1);
    t.value = `${v.placa} · ${c.punta === "salida" ? "SALIDA" : "LLEGADA"} · ${v.cd_origen}` +
              ` · ${new Date(c.hecha_en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`;
    t.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } };
    t.alignment = { vertical: "middle", indent: 1 };
    h.getRow(fila).height = 22;
    fila++;

    h.mergeCells(fila, 1, fila, 4);
    const d = h.getCell(fila, 1);
    d.value = `${c.direccion ?? "sin dirección"}  ·  ${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}` +
              (c.precision_m != null ? `  ·  ±${Math.round(Number(c.precision_m))} m` : "");
    d.font = { name: "Calibri", size: 9, color: { argb: "FF5B6B7F" } };
    d.alignment = { indent: 1 };
    fila++;

    // Los rótulos de las tres ranuras
    const filaRot = fila;
    suyas.forEach((f, i) => {
      const cel = h.getCell(filaRot, i + 2);
      cel.value = NOMBRE_RANURA[f.ranura];
      cel.font = { name: "Calibri", size: 9, bold: true, color: { argb: ACENTO } };
      cel.alignment = { horizontal: "center" };
    });
    fila++;

    // Y la banda donde van las imágenes
    const filaImg = fila;
    h.getRow(filaImg).height = 132;

    for (let i = 0; i < suyas.length; i++) {
      if (puestas >= MAX_FOTOS) { recortadas++; continue; }
      const f = suyas[i];
      try {
        const buf = await bajarFoto(f.ruta);
        if (!buf) { recortadas++; continue; }
        if (buf.byteLength > MAX_BYTES_FOTO) { recortadas++; continue; }
        const id = wb.addImage({ buffer: paraExcel(buf), extension: "jpeg" });
        h.addImage(id, {
          tl: { col: i + 1.05, row: filaImg - 1 + 0.05 },
          ext: { width: 200, height: 150 },
        });
        puestas++;
      } catch {
        recortadas++;
      }
    }
    fila += 2;
  }

  if (!puestas) {
    h.getCell(1, 1).value = "Ninguno de estos viajes tiene fotos guardadas todavía.";
    h.getCell(1, 1).font = { name: "Calibri", size: 11, color: { argb: "FF5B6B7F" } };
  } else if (recortadas) {
    h.mergeCells(fila, 1, fila, 4);
    const a = h.getCell(fila, 1);
    a.value =
      `Se incrustaron ${puestas} fotos y quedaron ${recortadas} por fuera ` +
      `(el techo es ${MAX_FOTOS} por archivo, para que el .xlsx siga abriéndose). ` +
      `Filtra por mes y vuelve a exportar para verlas todas.`;
    a.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF8A6100" } };
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E6" } };
    a.alignment = { wrapText: true, vertical: "top" };
    h.getRow(fila).height = 30;
  }
  return recortadas;
}
