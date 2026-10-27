import ExcelJS from "exceljs";
import { misPermisos } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/**
 * LA PLANTILLA DE LA HOJA «BAJA», con la fecha del día y con diseño.
 *
 * Mismas 14 columnas y mismo orden que el Excel que baja de SAP, para que lo que se escribe aquí se suba tal cual en
 * Casco → Registrar → Baja. Lo que se lee es el NOMBRE de cada encabezado (no se le puede agregar nada, ni un asterisco):
 * por eso lo que hay que escribir se marca con COLOR, no con signos. Encima de los encabezados van dos filas de título
 * (la lectura busca los encabezados sola en las primeras 20 filas).
 *   Gris   = ya viene puesto (fecha de hoy, centro, almacén, posición, unidad, importe).
 *   Amarillo = lo que se escribe (documento, material, descripción, cantidad en NEGATIVO, texto, clase).
 */
const NEGRO = "FF111111", AMARILLO = "FFFFC400", CREMA = "FFFFF6D6", GRIS = "FFEDEDED", GRIS_T = "FF5B5B5B", ROJO = "FFD71920", LINEA = "FFBDBDBD";
const borde = { style: "thin" as const, color: { argb: LINEA } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };

const COLS: { h: string; w: number; escribe: boolean; fmt?: string }[] = [
  { h: "Fe.contabilización", w: 18, escribe: false, fmt: "dd/mm/yyyy" },
  { h: "Fecha de entrada", w: 16, escribe: false, fmt: "dd/mm/yyyy" },
  { h: "Centro", w: 9, escribe: false },
  { h: "Almacén", w: 11, escribe: false },
  { h: "Posición", w: 10, escribe: false },
  { h: "Documento material", w: 20, escribe: true },
  { h: "Material", w: 12, escribe: true },
  { h: "Texto breve de material", w: 36, escribe: true },
  { h: "Cantidad", w: 13, escribe: true, fmt: "#,##0;[Red]-#,##0" },
  { h: "Unidad medida base", w: 14, escribe: false },
  { h: "Importe ML", w: 12, escribe: false, fmt: "#,##0.00" },
  { h: "Texto cab.documento", w: 32, escribe: true },
  { h: "Nombre del usuario", w: 18, escribe: true },
  { h: "Clase de movimiento", w: 14, escribe: true },
];
const FILAS = 60;
const ENC = 4; // fila de los encabezados

export async function GET(req: Request) {
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/inventario/casco/registrar")) return new Response("Sin permiso", { status: 403 });

  const pedida = new URL(req.url).searchParams.get("fecha") ?? "";
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date());
  const [a, m, d] = hoy.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  const largo = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Casco de vidrio"; wb.created = new Date();
  const ws = wb.addWorksheet("Baja", { views: [{ state: "frozen", ySplit: ENC, showGridLines: false }], properties: { tabColor: { argb: AMARILLO } } });
  ws.columns = COLS.map((c) => ({ width: c.w }));
  const n = COLS.length;

  // Banda negra de título: el día y para qué sirve.
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = `BAJA · plantilla del ${largo}`;
  t.font = { bold: true, size: 18, color: { argb: AMARILLO } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEGRO } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 36;
  ws.mergeCells(2, 1, 2, n);
  const s = ws.getCell(2, 1);
  s.value = "Escribe solo en las columnas AMARILLAS: Documento, Material, Cantidad en NEGATIVO (unidades) y Texto cab.documento. Lo gris ya viene puesto; cambia el Almacén si la baja es de AG22. Súbela tal cual en Casco → Registrar → Baja.";
  s.font = { size: 11, color: { argb: "FFFFFFFF" } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEGRO } };
  s.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  ws.getRow(2).height = 32;
  for (let c = 1; c <= n; c++) ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO } };
  ws.getRow(3).height = 4;

  // Encabezados: negro los que ya vienen puestos, amarillo los que se escriben.
  const e = ws.getRow(ENC);
  e.height = 30;
  COLS.forEach((c, i) => {
    const cell = e.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, size: 11, color: { argb: c.escribe ? NEGRO : "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.escribe ? AMARILLO : "FF3A3A3A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDES;
  });

  // Filas: gris lo fijo, crema lo que se escribe.
  for (let r = 0; r < FILAS; r++) {
    const fila = ws.getRow(ENC + 1 + r);
    fila.height = 20;
    COLS.forEach((c, i) => {
      const cell = fila.getCell(i + 1);
      cell.border = BORDES;
      cell.font = { size: 11, color: { argb: c.escribe ? NEGRO : GRIS_T } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.escribe ? CREMA : GRIS } };
      cell.alignment = { vertical: "middle", horizontal: i === 8 || i === 10 ? "right" : "left" };
      if (c.fmt) cell.numFmt = c.fmt;
    });
    fila.getCell(1).value = dia; fila.getCell(2).value = dia;
    fila.getCell(3).value = "AG01"; fila.getCell(4).value = "AG18"; fila.getCell(5).value = "0";
    fila.getCell(10).value = "UN"; fila.getCell(11).value = 0;
    // «Material» y «Documento» se guardan como texto: el Excel no les quita ceros ni los pasa a notación científica.
    fila.getCell(6).numFmt = "@"; fila.getCell(7).numFmt = "@";
    fila.getCell(4).dataValidation = { type: "list", allowBlank: true, formulae: ['"AG18,AG22,AG17,AG16"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "Almacén", error: "Ese almacén no es de la lista (AG18, AG22, AG17, AG16). ¿Seguro?" };
    fila.getCell(9).dataValidation = { type: "decimal", operator: "lessThan", formulae: [0], allowBlank: true, showErrorMessage: true, errorStyle: "warning", errorTitle: "Cantidad", error: "Una baja es una salida: la cantidad va en NEGATIVO (por ejemplo -1200)." };
    fila.getCell(12).dataValidation = { type: "list", allowBlank: true, formulae: ['"BAJA SORTING DISTRIBUCION,BAJA PRESORTING,BAJA SORTING JG,BAJA LAVADO,BAJA EXTRASUCIO,BAJA ROTURA DE MAQUINA"'], showErrorMessage: true, errorStyle: "warning", errorTitle: "Texto", error: "Ese texto no es de la lista; puedes usarlo, pero él decide a dónde va la fila." };
  }
  ws.autoFilter = { from: { row: ENC, column: 1 }, to: { row: ENC + FILAS, column: n } };
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Baja_plantilla_${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
