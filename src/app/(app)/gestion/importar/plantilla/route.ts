import ExcelJS from "exceljs";
import { misPermisos } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/**
 * LA PLANTILLA DE GESTIÓN para la carga masiva: un libro con una hoja LEEME, cuatro hojas para llenar
 * (TURNOS, PROCESOS, INDICADORES, RESULTADOS), una hoja EJEMPLO con una fábrica de ejemplo ya llena y una hoja
 * LISTAS (oculta) que alimenta los desplegables. Los encabezados se reconocen por NOMBRE: se pueden mover columnas.
 */
const TINTA = "FF12263A", AMARILLO = "FFFFC000", CREMA = "FFFBF1DD", GRIS = "FF5B6773", ROJO_F = "FFFDE7EB", VERDE_F = "FFE3F3EA";
const borde = { style: "thin" as const, color: { argb: "FFD5DAE0" } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };

type Col = { h: string; w: number; req?: boolean; nota: string; lista?: string; formato?: string };

function hoja(wb: ExcelJS.Workbook, nombre: string, cols: Col[], color: string, filas = 1000) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }], properties: { tabColor: { argb: color } } });
  ws.columns = cols.map((c) => ({ width: c.w }));
  const f = ws.getRow(1);
  f.height = 34;
  cols.forEach((c, i) => {
    const cell = f.getCell(i + 1);
    cell.value = c.req ? `${c.h} *` : c.h;
    cell.font = { bold: true, size: 11, color: { argb: c.req ? TINTA : "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.req ? AMARILLO : TINTA } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDES;
    cell.note = c.nota;
  });
  for (let r = 2; r <= filas + 1; r++) {
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.border = BORDES;
      if (c.formato) cell.numFmt = c.formato;
      if (c.lista) cell.dataValidation = { type: "list", allowBlank: true, formulae: [c.lista], showErrorMessage: true, errorStyle: "warning", errorTitle: "Valor fuera de la lista", error: "Ese valor no está en la lista; ¿seguro que quieres usarlo?" };
    });
  }
  return ws;
}

export async function GET() {
  const permisos = await misPermisos();
  if (!permisos.puedeVer("/gestion/importar")) return new Response("Sin permiso", { status: 403 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "CONTROL · Gestión"; wb.created = new Date();

  /* ------------------------------------------------------------------ LEEME */
  const lm = wb.addWorksheet("LEEME", { properties: { tabColor: { argb: AMARILLO } }, views: [{ showGridLines: false }] });
  lm.columns = [{ width: 3 }, { width: 30 }, { width: 100 }];
  lm.mergeCells("B2:C2");
  lm.getCell("B2").value = "CONTROL · GESTIÓN — Plantilla de carga masiva";
  lm.getCell("B2").font = { bold: true, size: 20, color: { argb: TINTA } };
  lm.mergeCells("B3:C3");
  lm.getCell("B3").value = "Procesos, indicadores (KPI y PI), metas, umbrales, disparadores y resultados: todo en un solo archivo.";
  lm.getCell("B3").font = { size: 12, color: { argb: GRIS } };
  let r = 5;
  const titulo = (t: string) => { lm.mergeCells(`B${r}:C${r}`); const c = lm.getCell(`B${r}`); c.value = t; c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } }; lm.getRow(r).height = 22; r++; };
  const linea = (a: string, b: string, fondo?: string) => {
    const x = lm.getCell(`B${r}`), y = lm.getCell(`C${r}`);
    x.value = a; y.value = b; x.font = { bold: true, color: { argb: TINTA } }; y.font = { color: { argb: TINTA } };
    x.alignment = y.alignment = { vertical: "top", wrapText: true };
    if (fondo) { x.fill = y.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } }; }
    x.border = y.border = BORDES; r++;
  };
  titulo("CÓMO SE USA (en este orden)");
  linea("1 · TURNOS", "Opcional. Ya existen Turno 1 (06–14), Turno 2 (14–22) y Turno 3 (22–06). Cambia horas o agrega los que necesites.");
  linea("2 · PROCESOS", "Una fila por proceso (Recibo, Almacenamiento, Despacho…). Si un indicador nombra un proceso que no está, se crea solo.");
  linea("3 · INDICADORES", "Una fila por indicador. Los KPI son el resultado; los PI son indicadores de proceso que cuelgan de un KPI (escribe el código del KPI en «KPI padre»).");
  linea("4 · RESULTADOS", "Una fila por número: indicador, fecha, turno (si se captura por turno) y valor. Sirve para cargar el histórico.");
  linea("5 · SUBIR", "En CONTROL → Gestión → Importar. Antes de guardar te muestra la vista previa y los errores fila por fila: nada se guarda hasta que confirmes.");
  r++;
  titulo("REGLAS");
  linea("Columnas amarillas *", "Son obligatorias. En INDICADORES, si una fila tiene código y le falta un obligatorio, la celda se pinta de rojo.", CREMA);
  linea("Mismo código = actualiza", "Si el código del indicador ya existe se ACTUALIZA (meta, umbrales, etc.). Un proceso o turno se reconoce por su nombre.", CREMA);
  linea("Resultados repetidos", "Misma fecha + turno + indicador se REEMPLAZA con el valor nuevo: puedes corregir el Excel y volver a subirlo.", CREMA);
  linea("Semana y mes", "Si la frecuencia es Semana o Mes, la fecha se lleva al primer día de ese periodo y no lleva turno (captura «Valor único»).", CREMA);
  linea("Encabezados", "No cambies el texto de los encabezados (puedes mover las columnas de lugar). La hoja EJEMPLO y LISTAS no se importan.", CREMA);
  r++;
  titulo("EL SEMÁFORO — cómo se decide el color de cada resultado");
  linea("Rojo", "Si cumple la condición ROJA (por ejemplo «< 90»).");
  linea("Amarillo", "Si no es rojo y cumple la condición AMARILLA (por ejemplo «< 98»).");
  linea("Verde", "Si no es rojo ni amarillo y cumple la META (por ejemplo «≥ 98»).");
  linea("Sin umbrales", "Si no cumple la meta: amarillo cuando definiste un umbral rojo (está entre la meta y el rojo); rojo si no definiste ninguno.");
  r++;
  titulo("EL DISPARADOR — cuándo se abre solo");
  linea("Disparador activo", "Sí/No. Si es Sí, al cargar resultados se revisa si el indicador debe disparar.");
  linea("Dispara con", "«Rojo» = salta solo con resultados rojos. «Amarillo o rojo» = salta con alerta o crítico.");
  linea("Resultados seguidos", "Cuántos resultados MALOS seguidos hacen falta (1 a 30). Con 3, tienen que ser los 3 últimos. Habrá un solo disparador activo por indicador.");
  r++;
  titulo("COLUMNAS DE INDICADORES");
  const guia: [string, string][] = [
    ["Código *", "Único. Ej. KPI-001, PI-014. Es la llave: los PI y los RESULTADOS lo usan."],
    ["Nombre *", "Cómo se llama el indicador."],
    ["Tipo *", "KPI o PI."],
    ["KPI padre", "Solo para PI: código del KPI del que cuelga."],
    ["Proceso", "Proceso al que pertenece (de la hoja PROCESOS)."],
    ["Nivel de reunión", "1 o 2 (en qué reunión se revisa)."],
    ["Unidad / Decimales", "Ej. %, cajas, min · de 0 a 4 decimales."],
    ["Meta operador y valor *", "Ej. ≥ 98. Operadores: ≥ > ≤ < = (también vale escribir >= o <=)."],
    ["Amarillo / Rojo (opcional)", "Cada umbral lleva operador Y valor juntos, o los dos vacíos."],
    ["Frecuencia *", "Día, Semana o Mes."],
    ["Captura *", "«Por turno» (solo si es diario) o «Valor único»."],
    ["Turnos", "«Todos» o nombres separados por coma: Turno 1, Turno 3."],
    ["Responsable", "Quién responde por el indicador."],
    ["Orden", "Número para ordenar el tablero (opcional)."],
  ];
  guia.forEach(([a, b]) => linea(a, b));

  /* ------------------------------------------------------------------ LISTAS (oculta) */
  const li = wb.addWorksheet("LISTAS", { state: "hidden" });
  const listas: Record<string, string[]> = {
    A: ["KPI", "PI"], B: [">=", ">", "<=", "<", "="], C: ["Día", "Semana", "Mes"], D: ["Por turno", "Valor único"], E: ["Sí", "No"], F: ["1", "2"], G: ["Rojo", "Amarillo o rojo"],
  };
  Object.entries(listas).forEach(([col, vals]) => vals.forEach((v, i) => { li.getCell(`${col}${i + 1}`).value = col === "F" ? Number(v) : v; }));
  const L = (col: string) => `LISTAS!$${col}$1:$${col}$${listas[col].length}`;

  /* ------------------------------------------------------------------ TURNOS */
  const tu = hoja(wb, "TURNOS", [
    { h: "Turno", w: 22, req: true, nota: "Nombre del turno. Debe ser el mismo que uses en INDICADORES y RESULTADOS." },
    { h: "Hora inicio", w: 14, req: true, nota: "HH:MM (06:00).", formato: "hh:mm" },
    { h: "Hora fin", w: 14, req: true, nota: "HH:MM. Si termina al otro día, escribe la hora (06:00).", formato: "hh:mm" },
    { h: "Orden", w: 10, nota: "Para ordenar los turnos (1, 2, 3)." },
  ], "FF0B4EA2", 30);
  [["Turno 1", 6, 1], ["Turno 2", 14, 2], ["Turno 3", 22, 3]].forEach(([n, h, o], i) => {
    tu.getCell(i + 2, 1).value = n as string; tu.getCell(i + 2, 2).value = (h as number) / 24; tu.getCell(i + 2, 3).value = (((h as number) + 8) % 24) / 24; tu.getCell(i + 2, 4).value = o as number;
  });

  /* ------------------------------------------------------------------ PROCESOS */
  hoja(wb, "PROCESOS", [
    { h: "Proceso", w: 36, req: true, nota: "Nombre del proceso (Recibo, Almacenamiento, Despacho…)." },
    { h: "Orden", w: 10, nota: "Para ordenar el tablero." },
  ], "FF0F7A4A", 300);

  /* ------------------------------------------------------------------ INDICADORES */
  const ind = hoja(wb, "INDICADORES", [
    { h: "Código", w: 12, req: true, nota: "Único. Ej. KPI-001. Mismo código = actualiza." },
    { h: "Nombre", w: 40, req: true, nota: "Nombre del indicador." },
    { h: "Tipo", w: 9, req: true, nota: "KPI o PI.", lista: L("A") },
    { h: "KPI padre (si es PI)", w: 14, nota: "Solo PI: código del KPI.", lista: "$A$2:$A$1001" },
    { h: "Proceso", w: 24, nota: "Proceso (hoja PROCESOS). Si no existe se crea.", lista: "PROCESOS!$A$2:$A$300" },
    { h: "Nivel de reunión", w: 11, nota: "1 o 2.", lista: L("F") },
    { h: "Unidad", w: 9, nota: "%, cajas, min…" },
    { h: "Decimales", w: 10, nota: "0 a 4." },
    { h: "Meta operador", w: 10, req: true, nota: "≥ > ≤ < =  (escribe >= o <=).", lista: L("B") },
    { h: "Meta valor", w: 10, req: true, nota: "Número." },
    { h: "Amarillo operador", w: 10, nota: "Opcional; va junto con su valor.", lista: L("B") },
    { h: "Amarillo valor", w: 10, nota: "Número." },
    { h: "Rojo operador", w: 10, nota: "Opcional; va junto con su valor.", lista: L("B") },
    { h: "Rojo valor", w: 10, nota: "Número." },
    { h: "Frecuencia", w: 11, req: true, nota: "Día, Semana o Mes.", lista: L("C") },
    { h: "Captura", w: 13, req: true, nota: "Por turno (solo diario) o Valor único.", lista: L("D") },
    { h: "Turnos", w: 22, nota: "Todos, o nombres separados por coma." },
    { h: "Responsable", w: 22, nota: "Quién responde." },
    { h: "Disparador activo", w: 11, nota: "Sí / No (por defecto Sí).", lista: L("E") },
    { h: "Dispara con", w: 16, nota: "Rojo, o Amarillo o rojo.", lista: L("G") },
    { h: "Resultados seguidos", w: 11, nota: "1 a 30 resultados malos seguidos." },
    { h: "Orden", w: 8, nota: "Orden en el tablero." },
  ], "FFFFC000", 1000);
  const roja = { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: ROJO_F } };
  const falta = (ref: string, f: string) => ind.addConditionalFormatting({ ref, rules: [{ type: "expression", priority: 1, formulae: [f], style: { fill: roja } }] });
  falta("B2:C1001", 'AND($A2<>"",B2="")');
  falta("D2:D1001", 'AND($A2<>"",$C2="PI",$D2="")');
  falta("I2:J1001", 'AND($A2<>"",I2="")');
  falta("O2:P1001", 'AND($A2<>"",O2="")');

  /* ------------------------------------------------------------------ RESULTADOS */
  hoja(wb, "RESULTADOS", [
    { h: "Código indicador", w: 18, req: true, nota: "Código del indicador (hoja INDICADORES o uno que ya exista).", lista: "INDICADORES!$A$2:$A$1001" },
    { h: "Fecha", w: 14, req: true, nota: "dd/mm/aaaa. En semana o mes basta una fecha de ese periodo.", formato: "dd/mm/yyyy" },
    { h: "Turno", w: 16, nota: "Obligatorio si el indicador se captura por turno.", lista: "TURNOS!$A$2:$A$30" },
    { h: "Valor", w: 14, req: true, nota: "El número del resultado (98,5 o 98.5)." },
    { h: "Comentario", w: 50, nota: "Opcional." },
  ], "FFE4002B", 5000);

  /* ------------------------------------------------------------------ EJEMPLO */
  const ej = wb.addWorksheet("EJEMPLO", { properties: { tabColor: { argb: "FF8A96A3" } }, views: [{ showGridLines: false }] });
  ej.columns = Array.from({ length: 22 }, () => ({ width: 14 }));
  ej.getColumn(2).width = 38; ej.getColumn(5).width = 22;
  let e = 1;
  const rotulo = (t: string) => { ej.mergeCells(e, 1, e, 8); const c = ej.getCell(e, 1); c.value = t; c.font = { bold: true, size: 13, color: { argb: TINTA } }; e++; };
  const tabla = (head: string[], filas: (string | number | Date)[][]) => {
    head.forEach((h, i) => { const c = ej.getCell(e, i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA } }; c.alignment = { wrapText: true, vertical: "middle" }; c.border = BORDES; });
    ej.getRow(e).height = 30; e++;
    filas.forEach((f) => { f.forEach((v, i) => { const c = ej.getCell(e, i + 1); c.value = v; c.border = BORDES; c.alignment = { vertical: "top" }; if (v instanceof Date) c.numFmt = "dd/mm/yyyy"; }); e++; });
    e++;
  };
  ej.mergeCells("A1:H1"); ej.getCell("A1").value = "EJEMPLO — así se ve una carga ya llena (no se importa). Copia el formato a las hojas de verdad."; ej.getCell("A1").font = { bold: true, size: 14, color: { argb: TINTA } }; ej.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREMA } }; e = 3;
  rotulo("Hoja PROCESOS");
  tabla(["Proceso", "Orden"], [["Recibo y descargue", 1], ["Almacenamiento", 2], ["Despacho", 3], ["Seguridad", 4]]);
  rotulo("Hoja INDICADORES");
  const hI = ["Código", "Nombre", "Tipo", "KPI padre", "Proceso", "Nivel reunión", "Unidad", "Decimales", "Meta op.", "Meta valor", "Amarillo op.", "Amarillo valor", "Rojo op.", "Rojo valor", "Frecuencia", "Captura", "Turnos", "Responsable", "Disparador", "Dispara con", "Seguidos", "Orden"];
  tabla(hI, [
    ["KPI-001", "Cumplimiento del plan de despacho", "KPI", "", "Despacho", 1, "%", 1, ">=", 98, "<", 98, "<", 95, "Día", "Por turno", "Todos", "Jefe de despacho", "Sí", "Rojo", 2, 1],
    ["PI-001", "Camiones cargados en menos de 45 min", "PI", "KPI-001", "Despacho", 1, "%", 0, ">=", 90, "<", 90, "<", 80, "Día", "Por turno", "Turno 1, Turno 2", "Líder de muelle", "Sí", "Amarillo o rojo", 3, 2],
    ["KPI-002", "Exactitud del inventario", "KPI", "", "Almacenamiento", 2, "%", 2, ">=", 99.5, "", "", "<", 98, "Día", "Valor único", "", "Jefe de inventarios", "Sí", "Rojo", 1, 3],
    ["KPI-003", "Accidentes con tiempo perdido", "KPI", "", "Seguridad", 2, "casos", 0, "<=", 0, "", "", ">=", 1, "Mes", "Valor único", "", "HSE", "Sí", "Rojo", 1, 4],
  ]);
  rotulo("Hoja RESULTADOS");
  const d = (dia: number) => new Date(Date.UTC(2026, 9, dia));
  tabla(["Código indicador", "Fecha", "Turno", "Valor", "Comentario"], [
    ["KPI-001", d(1), "Turno 1", 98.5, ""], ["KPI-001", d(1), "Turno 2", 96.2, "Faltó montacargas"], ["KPI-001", d(1), "Turno 3", 93.8, ""],
    ["PI-001", d(1), "Turno 1", 92, ""], ["KPI-002", d(1), "", 99.7, ""], ["KPI-003", d(1), "", 0, "Resultado del mes"],
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-gestion-indicadores.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
